
import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

import {afterEach, beforeEach, describe, it, vi} from 'vitest'

import {make_zip, use_temp_cwd} from '../../parts/test_utils.js'
import {load_tokens} from './sources.js'
import {detect_parallels, detect_quotations} from './textual.js'
import {detect_bsb} from './bsb.js'
import {interpret_links} from './judged.js'
import {distribute, link_strength} from './distribute.js'
import {algorithmic_links, crossref_process} from './index.js'
import {build_pool, load_results, make_slices, merge_outputs, passage_text, print_status,
    save_results} from './judge/campaign.js'

import type {Judged} from './judged.js'
import type {MasterLink} from './types.js'
import type {SlicePair} from './judge/campaign.js'


// A throwaway repo root, so the pipeline reads fixtures instead of the real official collection
// NOTE Hoisted (with the mock below) as the modules resolve their paths when first imported
const root = await vi.hoisted(async () => {
    const {mkdtempSync} = await import('node:fs')
    const {tmpdir} = await import('node:os')
    const {join} = await import('node:path')
    return mkdtempSync(join(tmpdir(), 'fetch-crossref-test-'))
})
vi.mock('../../parts/utils.js', async original => ({
    ...await original<typeof import('../../parts/utils.js')>(),
    PKG_PATH: join(root, 'collector'),
}))


// Fixture locations within the throwaway root
const BIBLES = join(root, 'collection_official', 'dist', 'bibles')
const ZIP = join(root, 'collection_official', 'sources', 'crossref', 'cross_references.zip')
const JUDGE = join(root, 'collector', 'src', 'data', 'crossref', 'judge')
const RESULTS = join(JUDGE, 'results.json')
const STATE = join(JUDGE, 'state')


// Write a file (JSON-encoding anything that isn't a string or buffer), creating its dir
function put(path:string, contents:unknown):void{
    mkdirSync(dirname(path), {recursive: true})
    writeFileSync(path, typeof contents === 'string' || Buffer.isBuffer(contents)
        ? contents : JSON.stringify(contents))
}


// Distinct Greek and Hebrew content words (never stopwords), e.g. g(1, 2) -> "ΨΩΑ ΨΩΒ"
const GREEK = 'ΑΒΓΔΕΖΘΙΚΛΜΝΞΠΡΣΤΥΦΧ'
const HEBREW = 'אבגדהוזחטיכלמנסעפצקר'
const g = (...nums:number[]) => nums.map(n => `ΨΩ${GREEK[n]!}`).join(' ')
const h = (...nums:number[]) => nums.map(n => `שת${HEBREW[n]!}`).join(' ')


// Build a USX book from its chapters' verse texts (each chapter opens with a heading)
function usx(book:string, chapters:string[][]):string{
    const code = book.toUpperCase()
    let out = `<?xml version="1.0" encoding="utf-8"?><usx version="3.0">`
        + `<book code="${code}" style="id"></book>`
    chapters.forEach((verses, ci) => {
        const ch = ci + 1
        out += `<chapter number="${ch}" style="c" sid="${code} ${ch}"/>`
            + `<para style="s1">Heading</para><para style="p">`
        verses.forEach((text, vi) => {
            const sid = `${code} ${ch}:${vi + 1}`
            out += `<verse number="${vi + 1}" style="v" sid="${sid}"/>${text} <verse eid="${sid}"/>`
        })
        out += `</para><chapter eid="${code} ${ch}"/>`
    })
    return out + '</usx>'
}


// Build a BSB txt book from its chapters' verses (each verse a list of items)
function bsb(chapters:unknown[][][]):unknown{
    return {contents: [[], ...chapters.map(verses => [[], ...verses])]}
}


// Write the original-language and BSB fixtures the detectors read
function write_texts():void{

    // Septuagint: a quotable verse, a near miss, a stopword-only verse and a very common phrase
    put(join(BIBLES, 'grc_bre', 'usx', 'deu.usx'), usx('deu', [[
        g(0, 1, 2, 3, 4, 5),
        `${g(6, 7, 8)} ${g(9)} ${g(10, 11)}`,
        'ΚΑΙ ΔΕ Ο Η ΤΟ ΤΟΥ',
        `${g(6, 7)} ${g(12)}`,
    ]]))
    // NOTE Postings count per occurrence, so one verse repeating a bigram makes it very common
    put(join(BIBLES, 'grc_bre', 'usx', 'gen.usx'),
        usx('gen', [[Array.from({length: 2001}, () => g(13, 14)).join(' ')]]))

    // Greek NT: a quotation, a short verse, a near miss, a stopword run and the common phrase
    put(join(BIBLES, 'grc_sr', 'usx', 'mat.usx'), usx('mat', [[
        `${g(15)}, ${g(0, 1, 2, 3, 4, 5)} — ${g(16)}`,
        g(0, 1),
        `${g(6, 7, 8)} ${g(17, 18, 19)}`,
        `ΚΑΙ ΔΕ Ο Η ΤΟ ΤΟΥ ${g(15)}`,
        `${g(13, 14)} ${g(15, 16, 17, 18)}`,
    ]]))

    // Hebrew OT: a three-verse retelling, a lone matching verse, a near miss and a refrain
    const story = [h(0, 1, 2, 3, 4, 5), h(6, 7, 8, 9, 10, 11), h(12, 13, 14, 15, 16, 17)]
    const lone = h(1, 3, 5, 7, 9, 11)
    put(join(BIBLES, 'hbo_wlc', 'usx', '2sa.usx'), usx('2sa', [
        [...story, h(0, 1), h(18, 19, 0, 2, 4, 6), h(18, 19, 0, 2, 4, 6)],
        [lone, `${h(2, 4, 6)} ${h(8, 10, 12)}`],
    ]))
    put(join(BIBLES, 'hbo_wlc', 'usx', '1ch.usx'), usx('1ch', [
        story,
        [`${h(2, 4, 6)} ${h(14, 16, 18)}`],
        [lone],
    ]))

    // BSB: footnotes citing and alluding to other passages, among items that must be ignored
    const verse = (text:string, ...notes:string[]) =>
        [text, ...notes.map(contents => ({type: 'note', contents})), ' ']
    put(join(BIBLES, 'eng_bsb', 'txt', 'gen.json'), bsb([
        [verse("In the beginning."), verse("Formless and void."), verse("Let there be light.")],
        [verse("The heavens were completed.")],
    ]))
    put(join(BIBLES, 'eng_bsb', 'txt', 'deu.json'), bsb([[
        verse("Man does not live on bread alone.", "1:1 Cited in Matthew 1:1"),
        // NOTE Not adjacent to the first citation, else the two merge into one ranged link
        verse("Second.", "1:2 Cited in Matthew 1:4; see also Matthew 1:4"),
        ["Third.", null, {type: 'heading', contents: "Heading"}, {type: 'note'}],
        verse("Fourth."),
    ]]))
    put(join(BIBLES, 'eng_bsb', 'txt', 'mat.json'), bsb([[
        verse("It is written.", "1:1 See also Genesis 1:1"), verse("Two."), verse("Three."),
        verse("Four."), verse("Five."),
    ]]))
    put(join(BIBLES, 'eng_bsb', 'txt', '2sa.json'), bsb([
        ['a', 'b', 'c', 'd', 'e', 'f'].map(text => verse(text)), [verse('g'), verse('h')]]))
    put(join(BIBLES, 'eng_bsb', 'txt', '1ch.json'), bsb([
        ['a', 'b', 'c'].map(text => verse(text)), [verse('d')], [verse('e')]]))
}


// Write the raw OpenBible archive from "from<TAB>to" rows
function write_openbible(rows:string[]):void{
    put(ZIP, make_zip({'cross_references.txt':
        ['From Verse\tTo Verse\tVotes', ...rows.map(row => `${row}\t5`)].join('\n') + '\n'}))
}


// A link's key, as used by the results record
const link_key = (pair:MasterLink) => pair.map(span => span.join(',')).join('>')

// The links the detectors find in the fixtures
const QUOTE = 'deu,1,1,1,1>mat,1,1,1,1'
const QUOTE_AND_ALLUSION = 'deu,1,2,1,2>mat,1,4,1,4'
const ALLUSION = 'gen,1,1,1,1>mat,1,1,1,1'
const PARALLEL = '2sa,1,1,1,3>1ch,1,1,1,3'


// Fresh fixtures for every test (and silence the progress output)
beforeEach(() => {
    rmSync(join(root, 'collection_official'), {recursive: true, force: true})
    rmSync(join(root, 'collector'), {recursive: true, force: true})
    write_texts()
    mkdirSync(JUDGE, {recursive: true})  // Part of the source tree, so always present for real
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
    vi.restoreAllMocks()
})


describe('load_tokens', () => {

    it("Loads normalised words per verse, skipping headings and missing books", ({expect}) => {
        const tokens = load_tokens('grc_sr', ['mat', 'mrk'])
        expect(Object.keys(tokens)).toEqual(['mat'])
        expect(tokens['mat']!.verses[1]![2]).toEqual(['ΨΩΑ', 'ΨΩΒ'])
        // Punctuation is dropped (even when it stands alone as a word)
        expect(tokens['mat']!.verses[1]![1]).toHaveLength(8)
    })

    it("Quietly ignores text before the first verse", ({expect}) => {
        put(join(BIBLES, 'grc_sr', 'usx', 'jhn.usx'), usx('jhn', [[g(0, 1)]])
            .replace('<para style="s1">', `<para style="p">${g(2)}</para><para style="s1">`))
        expect(load_tokens('grc_sr', ['jhn'])['jhn']!.verses[1]![1]).toEqual(['ΨΩΑ', 'ΨΩΒ'])
        expect(console.warn).not.toHaveBeenCalled()
    })
})


describe('detectors', () => {

    it("Detects a quotation by a long run of shared content words", ({expect}) => {
        expect(detect_quotations()).toEqual([[['deu', 1, 1, 1, 1], ['mat', 1, 1, 1, 1]]])
    })

    it("Detects parallels once per pair, ignoring refrains within a chapter", ({expect}) => {
        expect(detect_parallels().map(link_key)).toEqual([
            '2sa,1,1,1,1>1ch,1,1,1,1', '2sa,1,2,1,2>1ch,1,2,1,2', '2sa,1,3,1,3>1ch,1,3,1,3',
            '2sa,2,1,2,1>1ch,3,1,3,1',
        ])
    })

    it("Reads quotations and allusions from BSB footnotes", ({expect}) => {
        const found = detect_bsb()
        expect(found.quotation).toEqual([
            [['deu', 1, 1, 1, 1], ['mat', 1, 1, 1, 1]], [['deu', 1, 2, 1, 2], ['mat', 1, 4, 1, 4]]])
        expect(found.allusion).toEqual([
            [['deu', 1, 2, 1, 2], ['mat', 1, 4, 1, 4]], [['gen', 1, 1, 1, 1], ['mat', 1, 1, 1, 1]]])
    })

    it("Combines them, deduplicated, keeping only sustained parallels", ({expect}) => {
        const links = algorithmic_links()
        expect(links.algo_quotation.map(link_key)).toEqual([QUOTE, QUOTE_AND_ALLUSION])
        expect(links.algo_parallel.map(link_key)).toEqual([PARALLEL])
        expect(links.algo_allusion.map(link_key)).toEqual([QUOTE_AND_ALLUSION, ALLUSION])
    })
})


describe('interpret_links', () => {

    it("Prefers recorded judgments, publishing strong themes as relevant", ({expect}) => {
        put(RESULTS, {
            [QUOTE]: {category: 'allusion', point: "", salience: 5},
            [ALLUSION]: {category: 'none', point: "", salience: 0},
            'gen,1,2,1,2>mat,1,3,1,3': {category: 'theme', point: "", salience: 3},
            'gen,1,3,1,3>mat,1,4,1,4': {category: 'mention', point: "", salience: 2},
        } satisfies Judged)
        const links = interpret_links(
            {quotation: [[['deu', 1, 1, 1, 1], ['mat', 1, 1, 1, 1]],
                [['deu', 1, 2, 1, 2], ['mat', 1, 4, 1, 4]]],
            allusion: [[['deu', 1, 2, 1, 2], ['mat', 1, 4, 1, 4]],
                [['gen', 1, 1, 1, 1], ['mat', 1, 1, 1, 1]]]})
        expect(links.map(link => [link.key, link.category, link.salience])).toEqual([
            [QUOTE, 'allusion', 5],
            [QUOTE_AND_ALLUSION, 'quotation', 4],
            ['gen,1,2,1,2>mat,1,3,1,3', 'relevant', 3],
        ])
    })

    it("Warns and keeps detector links when nothing has been judged", ({expect}) => {
        const links = interpret_links({parallel: [[['2sa', 1, 1, 1, 3], ['1ch', 1, 1, 1, 3]]]})
        expect(links.map(link => [link.key, link.category, link.salience]))
            .toEqual([[PARALLEL, 'parallel', 4]])
        expect(console.warn).toHaveBeenCalled()
    })
})


describe('distribute', () => {

    use_temp_cwd()

    it("Writes a file per minimum strength, with and without relevant links", ({expect}) => {
        distribute([
            {key: 'a', pair: [['deu', 1, 1, 1, 1], ['mat', 1, 1, 1, 1]], category: 'quotation',
                salience: 5},
            {key: 'b', pair: [['gen', 1, 1, 1, 2], ['mat', 1, 2, 1, 2]], category: 'relevant',
                salience: 3},
        ])
        const read = (name:string):unknown =>
            JSON.parse(readFileSync(join('dist', 'crossref', 'categorised', name), 'utf8'))
        const quotation = {very_high: [[['deu', 1, 1], ['mat', 1, 1]]]}
        expect(read('very_high.json')).toEqual({quotation})
        expect(read('medium_plus.json')).toEqual(
            {quotation, relevant: {medium: [[['gen', 1, 1, 1, 2], ['mat', 1, 2]]]}})
        expect(read('medium_plus_no_relevant.json')).toEqual({quotation})
        expect(readdirSync(join('dist', 'crossref', 'categorised'))).toHaveLength(6)
        expect(readFileSync('unpublished.txt', 'utf8')).toBe('crossref/categorised\n')
    })

    it("Refuses to publish a link that is too weak", ({expect}) => {
        expect(link_strength(4)).toBe('high')
        expect(() => link_strength(2)).toThrow('too low')
    })

    it("Generates the published files from the detectors and judgments", ({expect}) => {
        put(RESULTS, {[QUOTE]: {category: 'quotation', point: "", salience: 5}} satisfies Judged)
        crossref_process()
        const data = JSON.parse(readFileSync(
            join('dist', 'crossref', 'categorised', 'high_plus.json'), 'utf8')) as unknown
        expect(data).toEqual({
            quotation: {very_high: [[['deu', 1, 1], ['mat', 1, 1]]],
                high: [[['deu', 1, 2], ['mat', 1, 4]]]},
            parallel: {high: [[['2sa', 1, 1, 1, 3], ['1ch', 1, 1, 1, 3]]]},
            allusion: {high: [[['gen', 1, 1], ['mat', 1, 1]]]},
        })
        expect(console.info).toHaveBeenCalledWith(
            'crossref: 4 links (2 quotation, 1 parallel, 1 allusion)')
    })
})


describe('judge campaign', () => {

    // Raw OpenBible rows: per-verse rows that fold into ranges, plus rows that must be dropped
    const rows = [
        'Gen.1.1\tMatt.1.3', 'Gen.1.2\tMatt.1.3',  // Folds into gen 1:1-2 > mat 1:3
        'Matt.1.4\tGen.1.3-Gen.2.1',  // Stored earlier-passage first
        'Gen.1.3\tMatt.1.4-Matt.1.5',
        'Lev.27.34-Num.1.1\tGen.1.1',  // Crosses books, and has no BSB text
        'Gen.1.1\tRev.1.1',  // No BSB text
        'Foo.1.1\tGen.1.1', 'Gen.1.1\tFoo.1.1', 'Gen.1.1', 'Gen.1\tGen.1.1', '',  // Unparseable
    ]
    const FOLDED = 'gen,1,1,1,2>mat,1,3,1,3'
    const CROSS_CHAPTER = 'gen,1,3,2,1>mat,1,4,1,4'
    const RANGE = 'gen,1,3,1,3>mat,1,4,1,5'

    beforeEach(() => {
        write_openbible(rows)
    })

    it("Pools the folded OpenBible pairs with our own detectors' links", async ({expect}) => {
        expect([...(await build_pool()).keys()].sort()).toEqual([
            PARALLEL, QUOTE, QUOTE_AND_ALLUSION, ALLUSION, CROSS_CHAPTER, RANGE, FOLDED].sort())
    })

    it("Gives the BSB text of a passage, or nothing when the book is missing", ({expect}) => {
        expect(passage_text(['gen', 1, 1, 1, 2])).toBe("In the beginning. Formless and void.")
        expect(passage_text(['rev', 1, 1, 1, 1])).toBe('')
    })

    it("Saves results in canonical order and loads them back", ({expect}) => {
        expect(load_results()).toEqual({})
        const judgment = {category: 'none', point: "", salience: 0} as const
        save_results({[RANGE]: judgment, [QUOTE]: judgment, [CROSS_CHAPTER]: judgment,
            [FOLDED]: judgment})
        expect(Object.keys(load_results())).toEqual([FOLDED, RANGE, CROSS_CHAPTER, QUOTE])
    })

    it("Writes slices of pending pairs with their texts and the prompt", async ({expect}) => {
        put(RESULTS, {[QUOTE]: {category: 'quotation', point: "", salience: 5}} satisfies Judged)
        expect(await make_slices(5, 4)).toBe(2)
        expect(readFileSync(join(STATE, 'prompt.txt'), 'utf8')).toContain('slice_N.json')
        const slices = [0, 1].flatMap(i => JSON.parse(
            readFileSync(join(STATE, `slice_${i}.json`), 'utf8')) as SlicePair[])
        expect(slices).toHaveLength(6)
        const refs = new Map(slices.map(pair => [pair.key, pair.ref_a]))
        expect(refs.get(QUOTE)).toBe(undefined)
        expect(refs.get(ALLUSION)).toBe('gen 1:1')
        expect(refs.get(FOLDED)).toBe('gen 1:1-2')
        expect(refs.get(CROSS_CHAPTER)).toBe('gen 1:3-2:1')
        expect(slices.find(pair => pair.key === FOLDED)).toMatchObject(
            {text_a: "In the beginning. Formless and void.", ref_b: 'mat 1:3', text_b: "Three."})
    })

    it("Merges valid judgments and rejects the rest", async ({expect}) => {
        // Nothing to merge before any wave has run
        merge_outputs()
        expect(load_results()).toEqual({})

        // One slice with an output holding good and bad lines, plus an output without a slice
        await make_slices(1)
        const good = {key: FOLDED, category: 'relevant', point: "Light", salience: 4}
        put(join(STATE, 'out_0.jsonl'), [
            JSON.stringify(good),
            '',
            '{"key": "truncat',
            'null',
            JSON.stringify({...good, key: 'gen,9,9,9,9>mat,9,9,9,9'}),
            JSON.stringify({...good, key: RANGE, category: 'other'}),
            JSON.stringify({...good, key: RANGE, salience: 9}),
        ].join('\n'))
        put(join(STATE, 'out_7.jsonl'), JSON.stringify(good))

        // Slicing again merges the leftover outputs first
        await make_slices(1, 2)
        expect(load_results()).toEqual({[FOLDED]: {category: 'relevant', point: "Light",
            salience: 4}})
        expect(console.error).toHaveBeenCalledWith(
            'judge campaign: discarding orphaned output out_7.jsonl (no slice file)')
        expect(console.info).toHaveBeenCalledWith(
            'judge campaign: merged 1 judgments (5 invalid entries rejected)')
        expect(existsSync(join(STATE, 'out_0.jsonl'))).toBe(false)
        expect(readdirSync(STATE).sort()).toEqual(['prompt.txt', 'slice_0.json'])
    })

    it("Prints progress with a tally per category", async ({expect}) => {
        put(RESULTS, {
            [QUOTE]: {category: 'quotation', point: "", salience: 5},
            [FOLDED]: {category: 'none', point: "", salience: 0},
            [RANGE]: {category: 'none', point: "", salience: 0},
        } satisfies Judged)
        await print_status()
        expect(vi.mocked(console.info).mock.calls.map(call => call[0] as string)).toEqual(
            ['judged 3 of 7 (42.9%)', '  none: 2', '  quotation: 1'])
    })
})

