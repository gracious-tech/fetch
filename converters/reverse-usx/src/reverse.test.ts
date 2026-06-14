
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

import {describe, it} from 'vitest'

import {reverse_usx} from './reverse.js'


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
    ]

    for (const [system, book, input_counts, expected_counts] of cases){
        it(`Renumbers ${system} style ${book} correctly`, async ({expect}) => {
            const result = reverse_usx(make_usx(book, input_counts))
            expect(profile_usx(result)).toEqual(expected_counts)
        })
    }

})
