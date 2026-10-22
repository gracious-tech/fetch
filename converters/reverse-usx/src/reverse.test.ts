
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

import {describe, it} from 'vitest'

import {reverse_usx} from './reverse.js'
import {strip_subverses} from './strip_subverses.js'
import {eng_psa_max} from './systems.js'


const samples_dir = join(__dirname, '..', 'samples')


function norm_whitespace(string:string){
    return string.split('\n').map(l => l.trimEnd()).join('\n').replace(/\n+/g, '\n').trim()
}


/**
 * @vitest-environment jsdom
 */
describe("reverse_usx", () => {

    it("Renumbers Psalms correctly", async ({expect}) => {
        const psa = readFileSync(join(samples_dir, 'psa.usx'), {encoding: 'utf8'})
        const psa_done = readFileSync(join(samples_dir, 'psa_done.usx'), {encoding: 'utf8'})
        expect(norm_whitespace(reverse_usx(psa))).toEqual(norm_whitespace(psa_done))
    })

    it("Renumbers Joel correctly", async ({expect}) => {
        const jol = readFileSync(join(samples_dir, 'jol.usx'), {encoding: 'utf8'})
        const jol_done = readFileSync(join(samples_dir, 'jol_done.usx'), {encoding: 'utf8'})
        expect(norm_whitespace(reverse_usx(jol))).toEqual(norm_whitespace(jol_done))
    })

    it("Renumbers Malachi correctly", async ({expect}) => {
        const mal = readFileSync(join(samples_dir, 'mal.usx'), {encoding: 'utf8'})
        const mal_done = readFileSync(join(samples_dir, 'mal_done.usx'), {encoding: 'utf8'})
        expect(norm_whitespace(reverse_usx(mal))).toEqual(norm_whitespace(mal_done))
    })

    it("Renumbers Romans correctly", async ({expect}) => {
        const rom = readFileSync(join(samples_dir, 'rom.usx'), {encoding: 'utf8'})
        const rom_done = readFileSync(join(samples_dir, 'rom_done.usx'), {encoding: 'utf8'})
        expect(norm_whitespace(reverse_usx(rom))).toEqual(norm_whitespace(rom_done))
    })

})


// Generate a synthetic USX book with the given number of verses per chapter
function make_usx(book:string, counts:number[]){
    let out = `<usx version="3.0">\n<book code="${book}" style="id">Test</book>\n`
    for (let ch = 1; ch <= counts.length; ch++){
        out += `<chapter number="${ch}" style="c" sid="${book} ${ch}"/>\n<para style="p">`
        for (let v = 1; v <= counts[ch - 1]!; v++){
            out += `<verse number="${v}" style="v" sid="${book} ${ch}:${v}"/>`
                + `text ${ch}:${v}<verse eid="${book} ${ch}:${v}"/> `
        }
        out += `</para>\n<chapter eid="${book} ${ch}"/>\n`
    }
    return out + '</usx>\n'
}


// Get the number of verses per chapter of a USX string
function profile_usx(xml:string){
    const counts:number[] = []
    for (const match of xml.matchAll(/sid="[A-Z0-9]{3} (\d+):(\d+)"/g)){
        const ch = parseInt(match[1]!)
        counts[ch - 1] = Math.max(counts[ch - 1] ?? 0, parseInt(match[2]!))
    }
    return counts
}


describe("reverse_usx versification systems", () => {

    // Each case gives the variant book's verse counts and the expected eng counts after
    const cases:[string, string, number[], number[]][] = [
        // Russian Synodal style 1SA (1SA 20:43 merged into 20:42, ch 24 shifted via org)
        ['rsc', '1SA',
            [28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30, 24, 43,
                15, 23, 28, 23, 44, 25, 12, 25, 11, 31, 13],
            [28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30, 24, 42,
                15, 23, 29, 22, 44, 25, 12, 25, 11, 31, 13]],
        // Russian Synodal style HOS (14:1 becomes 13:16)
        ['rsc', 'HOS',
            [11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 15, 10],
            [11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 16, 9]],
        // Vulgate style 1KI ch 22 (22:44 merged into 22:43)
        ['vul', '1KI',
            [53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46, 21, 43,
                29, 54],
            [53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46, 21, 43,
                29, 53]],
        // Byzantine style JHN ch 1 (1:38 split into 1:38-39)
        ['byz', 'JHN',
            [52, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31,
                25],
            [51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31,
                25]],
        // Hungarian style LUK (23:56 split into 56-57)
        ['hun', 'LUK',
            [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47,
                38, 71, 57, 53],
            [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47,
                38, 71, 56, 53]],
        // Serbian style JOB (chapters 38-41 boundaries shifted)
        ['srp', 'JOB',
            [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29,
                34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 38, 38, 28,
                25, 17],
            [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29,
                34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24,
                34, 17]],
        // Masoretic style JER (org plus 31:1 as 30:25)
        ['mt', 'JER',
            [19, 37, 25, 31, 31, 30, 34, 23, 25, 25, 23, 17, 27, 22, 21, 21, 27, 23, 15, 18,
                14, 30, 40, 10, 38, 24, 22, 17, 32, 25, 39, 44, 26, 22, 19, 32, 21, 28, 18, 16,
                18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34],
            [19, 37, 25, 31, 31, 30, 34, 22, 26, 25, 23, 17, 27, 22, 21, 21, 27, 23, 15, 18,
                14, 30, 40, 10, 38, 24, 22, 17, 32, 24, 40, 44, 26, 22, 19, 32, 21, 28, 18, 16,
                18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34]],
        // nld_nbg style HOS (eng 2:1 placed at end of ch1 as 1:12)
        ['nld', 'HOS', [12, 22], [11, 23]],
        // nld_nbg style NEH (eng 7:73 split across the 7/8 boundary; its 2nd half is 8:1)
        ['nld', 'NEH', [5, 5, 5, 5, 5, 5, 72, 19], [5, 5, 5, 5, 5, 5, 73, 18]],
        // nld_nbg style ROM (7:25 split into 7:25-26)
        ['nld', 'ROM', [5, 5, 5, 5, 5, 5, 26], [5, 5, 5, 5, 5, 5, 25]],
        // spa_rv/ita_db style JOB (Serbian 38/39 boundary only; ch41 keeps its full eng 34 verses)
        ['srp-partial', 'JOB',
            [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29,
                34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 38, 38, 19,
                34, 17],
            [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29,
                34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24,
                34, 17]],
    ]

    for (const [system, book, input_counts, expected_counts] of cases){
        it(`Renumbers ${system} style ${book} correctly`, async ({expect}) => {
            const result = reverse_usx(make_usx(book, input_counts))
            expect(profile_usx(result)).toEqual(expected_counts)
        })
    }

    it("Merges pes_pbs single-verse splits (EXO 29:36, 2CH 14:7)", async ({expect}) => {
        // EXO 29 has 47 verses (eng 46) because the source splits eng 29:36 into 36-37
        const exo = Array<number>(29).fill(2)
        exo[28] = 47
        expect(profile_usx(reverse_usx(make_usx('EXO', exo)))[28]).toEqual(46)
        // 2CH 14 has 16 verses (eng 15) because the source splits eng 14:7 into 7-8
        const two_ch = Array<number>(14).fill(2)
        two_ch[13] = 16
        expect(profile_usx(reverse_usx(make_usx('2CH', two_ch)))[13]).toEqual(15)
    })

    it("Folds rus_syn Septuagint-plus endings into the preceding verse", async ({expect}) => {
        // JOS 24 has 36 verses (eng 33); the LXX-plus 34-36 fold into 24:33
        const jos = Array<number>(24).fill(2)
        jos[23] = 36
        expect(profile_usx(reverse_usx(make_usx('JOS', jos)))[23]).toEqual(33)
        // PRO 4 has 29 verses (eng 27) and PRO 13 has 26 (eng 25); both LXX-plus, folded down
        const pro = Array<number>(13).fill(2)
        pro[3] = 29
        pro[12] = 26
        const pro_res = profile_usx(reverse_usx(make_usx('PRO', pro)))
        expect(pro_res[3]).toEqual(27)
        expect(pro_res[12]).toEqual(25)
    })

    it("Applies spa_rv/ita_db single-chapter split and boundary rules", async ({expect}) => {
        // Build a book sized to the highest chapter mentioned, fill chapters with 2 verses except
        // the given ones, reverse, and assert the resulting per-chapter counts
        const check = (book:string, counts_map:Record<number, number>,
                expected_map:Record<number, number>) => {
            const max_ch = Math.max(...Object.keys(counts_map).map(Number))
            const counts = Array<number>(max_ch).fill(2)
            for (const [ch, n] of Object.entries(counts_map)){
                counts[+ch - 1] = n
            }
            const res = profile_usx(reverse_usx(make_usx(book, counts)))
            for (const [ch, n] of Object.entries(expected_map)){
                expect(res[+ch - 1]).toEqual(n)
            }
        }
        check('1CH', {21: 31, 22: 19}, {21: 30, 22: 19})  // spa_rv splits 21:15
        check('1CH', {21: 31, 22: 18}, {21: 30, 22: 19})  // cmn_cuvmp* boundary eng 22:1 as 21:31
        check('2CH', {16: 15}, {16: 14})  // spa_rv splits 16:14
        check('JDG', {14: 21}, {14: 20})  // spa_rv splits 14:18
        check('GAL', {3: 30}, {3: 29})  // ita_db splits 3:28
        check('GEN', {35: 30}, {35: 29})  // ita_db splits 35:22
        check('COL', {3: 26, 4: 17}, {3: 25, 4: 18})  // ita_db boundary eng 4:1 as 3:26
        check('EXO', {35: 36, 36: 37}, {35: 35, 36: 38})  // ita_db boundary eng 36:1 as 35:36
        check('NUM', {12: 15, 13: 34}, {12: 16, 13: 33})  // ita_db boundary eng 12:16 as 13:1
        check('1CH', {19: 20}, {19: 19})  // bis_obb splits 19:19
        check('2CH', {12: 17}, {12: 16})  // cab_sblg splits 12:15
        check('2SA', {2: 33}, {2: 32})  // ukr splits 2:4
        check('ISA', {9: 22}, {9: 21})  // ukr splits 9:21
        check('NUM', {23: 31}, {23: 30})  // ukr splits 23:17
        // ukr LEV: eng 6:1-7 numbered as 5:20-26 with eng 6:5 split into 5:24-25 (ch5=27); reversed
        // ch5 returns to 19 and the moved verses land in ch6 (here ch6 source=23 → eng 6:8-30)
        check('LEV', {5: 27, 6: 23}, {5: 19, 6: 30})
    })

    it("Removes inconsistently-counted Psalm superscriptions", async ({expect}) => {
        // A psalter that counts the Hebrew title as verse 1 for SOME titled psalms but not others.
        // Psalm 3 gets a 1-verse title (eng+1), psalm 51 a 2-verse title (eng+2); every other psalm
        // already matches eng and must be left untouched.
        const variant = [...eng_psa_max]
        variant[2] = eng_psa_max[2]! + 1   // psalm 3
        variant[50] = eng_psa_max[50]! + 2  // psalm 51
        const result = reverse_usx(make_usx('PSA', variant))
        expect(profile_usx(result)).toEqual([...eng_psa_max])
    })

})


// Build a single-chapter USX book from a list of verse number strings (e.g. ['1', '6a', '6b-11'])
function make_subverse_usx(numbers:string[]){
    let out = '<usx version="3.0">\n<book code="MAT" style="id">Test</book>\n'
    out += '<chapter number="1" style="c" sid="MAT 1"/>\n<para style="p">'
    for (const num of numbers){
        out += `<verse number="${num}" style="v" sid="MAT 1:${num}"/>`
            + `text ${num}<verse eid="MAT 1:${num}"/> `
    }
    out += '</para>\n<chapter eid="MAT 1"/>\n</usx>\n'
    return out
}


// Extract the ordered list of remaining verse number attributes from a USX string
function verse_numbers(xml:string){
    return [...xml.matchAll(/<verse number="([^"]+)"/g)].map(m => m[1]!)
}


/**
 * @vitest-environment jsdom
 */
describe("strip_subverses", () => {

    it("Merges a simple sub-verse split (1a 1b -> 1)", async ({expect}) => {
        const result = strip_subverses(make_subverse_usx(['1a', '1b', '2']))
        expect(verse_numbers(result)).toEqual(['1', '2'])
        // 1b's text must survive (appended to verse 1)
        expect(result).toContain('text 1a')
        expect(result).toContain('text 1b')
    })

    it("Renumbers a sub-verse-start range (6a 6b-11 -> 6 7-11)", async ({expect}) => {
        const result = strip_subverses(make_subverse_usx(['5', '6a', '6b-11', '12']))
        expect(verse_numbers(result)).toEqual(['5', '6', '7-11', '12'])
    })

    it("Handles a range that begins mid-verse (1a 1b-2 -> 1 2)", async ({expect}) => {
        const result = strip_subverses(make_subverse_usx(['1a', '1b-2', '3']))
        expect(verse_numbers(result)).toEqual(['1', '2', '3'])
    })

    it("Collapses multi-letter sub-verses (17a 17b 17c -> 17)", async ({expect}) => {
        const result = strip_subverses(make_subverse_usx(['16', '17a', '17b', '17c', '18']))
        expect(verse_numbers(result)).toEqual(['16', '17', '18'])
    })

    it("Leaves a clean integer file untouched (byte-for-byte)", async ({expect}) => {
        const clean = make_subverse_usx(['1', '2', '3'])
        expect(strip_subverses(clean)).toEqual(clean)
    })

    it("Repoints paragraph vids onto the merged/renumbered verse", async ({expect}) => {
        // A continuation para carrying vid="MAT 1:1b" must follow 1b's text into verse 1
        let xml = '<usx version="3.0">\n<book code="MAT" style="id">Test</book>\n'
        xml += '<chapter number="1" style="c" sid="MAT 1"/>\n'
        xml += '<para style="p"><verse number="1a" style="v" sid="MAT 1:1a"/>partA</para>\n'
        xml += '<para style="p" vid="MAT 1:1a">more A<verse eid="MAT 1:1a"/></para>\n'
        xml += '<para style="p"><verse number="1b" style="v" sid="MAT 1:1b"/>partB</para>\n'
        xml += '<para style="p" vid="MAT 1:1b">more B<verse eid="MAT 1:1b"/></para>\n'
        xml += '<chapter eid="MAT 1"/>\n</usx>\n'
        const result = strip_subverses(xml)
        expect(verse_numbers(result)).toEqual(['1'])
        // No vid may reference the removed sub-verse id
        expect(result).not.toContain('MAT 1:1a')
        expect(result).not.toContain('MAT 1:1b')
        expect(result).toContain('vid="MAT 1:1"')
    })

    it("Leaves plain out-of-order verses untouched (real reorders stay detectable)",
            async ({expect}) => {
        // bjr_wbt-style reorder: 30 appears before 28. These are plain integers, not sub-verses, so
        // strip_subverses must not merge them — the file should be returned unchanged
        const reordered = make_subverse_usx(['26', '27', '30', '28', '29', '31'])
        // No alpha markers present, so it is a no-op passthrough
        expect(strip_subverses(reordered)).toEqual(reordered)
    })

})
