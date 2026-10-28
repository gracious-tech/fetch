
import {existsSync, readFileSync, rmSync} from 'node:fs'
import {join} from 'node:path'

import {afterEach, describe, it, vi} from 'vitest'
import {last_verse} from '@gracious.tech/bible-references'

import {download_glosses, gbt_source_dir, sources_to_dist} from './gbt.js'
import {books_ordered} from '../parts/bible.js'
import {make_zip, stub_fetch, use_temp_cwd, write_files} from '../parts/test_utils.js'


// Read a JSON file written by the module under test
function read(path:string):unknown{
    return JSON.parse(readFileSync(path, 'utf8'))
}


describe('download_glosses', () => {

    use_temp_cwd()
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    const url = 'https://github.com/globalbibletools/data/archive/refs/heads/main.zip'
    const lang = (english:string) => ({local: english, english, pop: 1, direction: 'ltr'})

    it("Extracts book files into a dir per language with generated meta", async ({expect}) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        write_files({'sources/languages.json': {
            languages: {eng: lang("English"), ind: lang("Indonesian"), arb: lang("Arabic")},
            language2to3: {en: 'eng'},
            macro_to_individual: {},
        }})
        stub_fetch({[url]: make_zip({
            'README.md': '',
            'data-main/notes.json': '',
            'data-main/test/01-Gen.json': '',
            'data-main/hbo+grc/01-Gen.json': 'original',
            'data-main/idn/01-Gen.json': 'ind',
            'data-main/are/01-Gen.json': 'arb',
            'data-main/en/01-Gen.json': 'eng gen',
            'data-main/eng/40-Mat.json': 'eng mat',
            'data-main/xyz/01-Gen.json': '',
            'data-main/eng/99-Xyz.json': '',
        })})
        await download_glosses()

        // Files extracted to own ids (originals in a special dir)
        const dir = gbt_source_dir
        expect(readFileSync(join(dir, '.original', 'json', 'gen.json'), 'utf8')).toBe('original')
        expect(readFileSync(join(dir, 'ind_gbt', 'json', 'gen.json'), 'utf8')).toBe('ind')
        expect(readFileSync(join(dir, 'arb_gbt', 'json', 'gen.json'), 'utf8')).toBe('arb')
        expect(readFileSync(join(dir, 'eng_gbt', 'json', 'gen.json'), 'utf8')).toBe('eng gen')
        expect(readFileSync(join(dir, 'eng_gbt', 'json', 'mat.json'), 'utf8')).toBe('eng mat')
        expect(existsSync(join(dir, 'test'))).toBe(false)
        expect(existsSync(join(dir, '.original', 'meta.json'))).toBe(false)

        // Meta generated from language data (keeping the GBT id)
        expect(read(join(dir, 'arb_gbt', 'meta.json'))).toMatchObject({
            name: {english: "Global Bible Tools glosses (Arabic)", english_abbrev: 'GBTA'},
            ids: {gbt: 'are'},
            source: {service: 'gbt', url},
        })

        // Unknown languages and books reported
        expect(error).toHaveBeenCalledWith('Skipping unknown glosses language (xyz)')
        expect(error).toHaveBeenCalledWith('Unexpected book "xyz" for glosses language eng')
    })

})


describe('sources_to_dist', () => {

    use_temp_cwd()

    type Word = {id:string, text:string, grammar:string, lemma:string}
    type Gloss = {id:string, gloss:string|null}

    // Generate chapters for a book from standard versification, with a word per verse
    function chapters<T>(book:string, word:(ch:number, v:number)=>T){
        return last_verse[book]!.map((verses, ch) => ({verses: [...Array(verses).keys()].map(
            v => ({words: [word(ch + 1, v + 1)]}))}))
    }

    // Write original language data for every book (allowing overrides)
    function write_originals(overrides:Record<string, unknown> = {}){
        const files:Record<string, unknown> = {}
        for (const book of books_ordered){
            files[join(gbt_source_dir, '.original', 'json', `${book}.json`)] = {
                chapters: chapters<Word>(book, (ch, v) => ({id: `${ch}.${v}`, text: 'λόγος,',
                    grammar: 'N', lemma: book === 'gen' && ch === 1 && v === 1 ? 'H????' : 'G1'})),
            }
        }
        for (const [book, data] of Object.entries(overrides)){
            const path = join(gbt_source_dir, '.original', 'json', `${book}.json`)
            if (data === null){
                delete files[path]
            } else {
                files[path] = data
            }
        }
        write_files(files)
    }

    // Write glosses for a book
    function write_glosses(book:string, data:unknown){
        write_files({[join(gbt_source_dir, 'eng_gbt', 'json', `${book}.json`)]: data})
    }

    // Generate glosses for a book, using the given function for each verse
    function glosses(book:string, gloss:(ch:number, v:number)=>string|null = () => 'word'){
        return {chapters: chapters<Gloss>(book, (ch, v) => ({id: `${ch}.${v}`,
            gloss: gloss(ch, v)}))}
    }

    it("Throws if original data is missing a book", async ({expect}) => {
        write_originals({gen: null})
        await expect(sources_to_dist()).rejects.toThrow("Missing book for original data?")
    })

    it("Combines glosses with original words and saves books mostly glossed", async ({expect}) => {

        // Originals and glosses that lack 3JN 1:15 and REV 12:18
        const rm_verse = (data:{chapters:{verses:unknown[]}[]}, ch:number) => {
            data.chapters[ch - 1]!.verses.pop()
            return data
        }
        write_originals({
            '3jn': rm_verse({chapters: chapters<Word>('3jn', () =>
                ({id: '', text: 'ἀγάπη', grammar: '', lemma: 'G26'}))}, 1),
            rev: rm_verse({chapters: chapters<Word>('rev', () =>
                ({id: '', text: 'ἀγάπη', grammar: '', lemma: 'G26'}))}, 12),
        })
        write_glosses('3jn', rm_verse(glosses('3jn'), 1))
        write_glosses('rev', rm_verse(glosses('rev'), 12))
        write_glosses('jud', glosses('jud', (ch, v) => v === 1 ? null : ' word '))
        write_glosses('oba', glosses('oba', () => null))
        await sources_to_dist()

        // Glosses paired with words, missing glosses as empty strings
        const jud = read('dist/glosses/eng_gbt/json/jud.json') as {contents:string[][][][]}
        expect(jud.contents[0]).toEqual([])
        expect(jud.contents[1]![0]).toEqual([])
        expect(jud.contents[1]![1]).toEqual([['λόγος,', '']])
        expect(jud.contents[1]![3]).toEqual([['λόγος,', 'word']])
        expect(jud.contents[1]).toHaveLength(last_verse['jud']![0]! + 1)

        // Optional verses inserted as empty
        const tjn = read('dist/glosses/eng_gbt/json/3jn.json') as {contents:string[][][][]}
        expect(tjn.contents[1]![15]).toEqual([])
        const rev = read('dist/glosses/eng_gbt/json/rev.json') as {contents:string[][][][]}
        expect(rev.contents[12]![18]).toEqual([])

        // Books not sufficiently glossed are not saved
        expect(existsSync('dist/glosses/eng_gbt/json/oba.json')).toBe(false)

        // Search data split by testament (unknown strongs made empty)
        const ot_strongs = read('dist/search/ot_gbt/strongs.json') as
            {id:string, books:Record<string, string[][]>}
        expect(ot_strongs.id).toBe('ot_gbt')
        expect(ot_strongs.books['gen']![1]!.slice(0, 3)).toEqual(['', '', 'G1'])
        expect(ot_strongs.books['mat']).toBeUndefined()
        const nt_original = read('dist/search/nt_gbt/original.json') as
            {id:string, books:Record<string, string[][]>}
        expect(nt_original.id).toBe('nt_gbt')
        expect(nt_original.books['jud']![1]![1]).toBe('ΛΟΓΟΣ')
        expect(nt_original.books['3jn']![1]![1]).toBe('ΑΓΑΠΗ')
        expect(nt_original.books['3jn']![1]![15]).toBe('')
    })

    it("Throws for unknown books and books without original data", async ({expect}) => {
        write_originals({oba: null, xyz: {chapters: []}})
        write_glosses('xyz', {chapters: []})
        await expect(sources_to_dist()).rejects
            .toThrow('Unknown book "xyz" in GBT data (eng_gbt xyz.json)')
        rmSync(join(gbt_source_dir, 'eng_gbt'), {recursive: true})
        write_glosses('oba', glosses('oba'))
        await expect(sources_to_dist()).rejects
            .toThrow('No original language data for oba (eng_gbt)')
    })

    it("Throws if glosses don't match expected structure", async ({expect}) => {
        write_originals({jud: {chapters: chapters<Word>('jud', (ch, v) =>
            ({id: '', text: v === 2 ? ' ' : 'λόγος', grammar: '', lemma: ''}))}})
        const cases:[string, unknown, string][] = [
            ['3jn', {chapters: []}, 'Different number of chapters for eng_gbt 3jn'],
            ['rev', {chapters: []}, 'Different number of chapters for eng_gbt rev'],
            ['jud', {chapters: [{verses: []}]}, 'Chapter has 0 verses but expected 25'],
            ['jud', {chapters: [{verses: [{words: []}, ...glosses('jud').chapters[0]!.verses
                .slice(1)]}]}, 'GBT data has different number of words in verse'],
            ['jud', glosses('jud'), 'Missing word data'],
        ]
        for (const [book, data, error] of cases){
            rmSync(join(gbt_source_dir, 'eng_gbt'), {recursive: true, force: true})
            write_glosses(book, data)
            await expect(sources_to_dist()).rejects.toThrow(error)
        }
    })

})
