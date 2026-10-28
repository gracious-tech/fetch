
import {mkdirSync, readFileSync} from 'node:fs'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {Languages, gen_language_data, get_language_data} from './languages.js'
import {read_json} from './utils.js'
import {stub_fetch, use_temp_cwd, write_files} from './test_utils.js'

import type {MetaLanguage} from './shared_types'


// Wrap read_json so a test can feed it bad CLDR data
vi.mock('./utils.js', async original => {
    const actual = await original<typeof import('./utils.js')>()
    return {...actual, read_json: vi.fn(actual.read_json)}
})


const ISO_URL = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab'
const ISO_HEADER = 'Id\tPart2b\tPart2t\tPart1\tScope\tLanguage_Type\tRef_Name\tComment'

// ISO 639-3 rows (id, 2 letter code, scope, type, name) covering the CLDR edge cases
const ISO_ROWS = [
    ['ara', 'ar', 'M', 'L', "Arabic"],  // Macro with CLDR rtl layout
    ['arb', '', 'I', 'L', "Standard Arabic"],  // Its individual, with no direction data
    ['eng', 'en', 'I', 'L', "English"],  // CLDR data only under the 2 letter code
    ['zho', 'zh', 'M', 'L', "Chinese"],
    ['cmn', '', 'I', 'L', "Mandarin Chinese"],  // Overridden
    ['aka', 'ak', 'M', 'L', "Akan"],  // Macro that CLDR merges several individuals into
    ['twi', 'tw', 'I', 'L', "Twi"],
    ['fat', '', 'I', 'L', "Fanti"],
    ['aym', 'ay', 'M', 'L', "Aymara"],  // No CLDR layout, script from 2 letter likely subtags
    ['ayr', '', 'I', 'L', "Central Aymara"],
    ['tig', '', 'I', 'L', "Tigre"],  // CLDR locale lacks a name for itself
    ['hbo', '', 'I', 'H', "Ancient Hebrew"],  // Not living, rtl from likely script
    ['awk', '', 'I', 'E', "Awabakal"],  // Not living, local name overridden
    ['aaa', '', 'I', 'L', "Ghotuo label"],  // English name only in population data
    ['zzz', '', 'I', 'L', "Fake"],  // No data anywhere
].map(([three, two, scope, type, name]) => [three, '', '', two, scope, type, name, ''].join('\t'))


describe('gen_language_data', () => {

    use_temp_cwd()

    beforeEach(() => {
        mkdirSync('sources')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("Combines ISO, CLDR and population data", async ({expect}) => {
        stub_fetch({[ISO_URL]: [ISO_HEADER, ...ISO_ROWS].join('\r\n') + '\r\n'})
        await gen_language_data()
        const data = JSON.parse(readFileSync('sources/languages.json', 'utf8')) as {
            languages:Record<string, MetaLanguage>
            language2to3:Record<string, string>
            macro_to_individual:Record<string, string>
        }
        const {languages} = data

        // Names
        expect(languages['eng']).toMatchObject({local: "English", english: "English"})
        expect(languages['eng']!.pop).toBeGreaterThan(0)
        expect(languages['tig']).toMatchObject({english: "Tigre"})
        expect(languages['tig']!.local).not.toBe("Tigre")
        expect(languages['aaa']).toMatchObject({english: "Ghotuo", local: "Otwa"})
        expect(languages['zzz']).toEqual({english: "Fake", local: "Fake", pop: 0,
            direction: 'ltr'})

        // Overrides and non-living languages
        expect(languages['cmn']).toMatchObject({english: "Chinese", local: "中文"})
        expect(languages['awk']).toMatchObject({local: "Awabakal", pop: null})
        expect(languages['hbo']).toMatchObject({pop: null, direction: 'rtl'})

        // Directions (incl. inherited from macrolanguage)
        expect(languages['ara']!.direction).toBe('rtl')
        expect(languages['arb']!.direction).toBe('rtl')
        expect(languages['aym']!.direction).toBe('ltr')

        // Macrolanguages map to their single individual language (but not Akan which has two)
        expect(data.macro_to_individual).toEqual({ara: 'arb', zho: 'cmn', aym: 'ayr', nor: 'nob'})
        expect(data.language2to3).toEqual({ar: 'arb', en: 'eng', zh: 'cmn', ak: 'aka',
            tw: 'twi', ay: 'ayr', no: 'nob'})
    })

    it("Rejects an unexpected ISO header", async ({expect}) => {
        stub_fetch({[ISO_URL]: 'Id\tName\n'})
        await expect(gen_language_data()).rejects.toThrow("Unexpected ISO 639-3 header")
    })

    it("Rejects an invalid ISO row", async ({expect}) => {
        stub_fetch({[ISO_URL]: `${ISO_HEADER}\nEN\t\t\t\tI\tL\tEnglish\t`})
        await expect(gen_language_data()).rejects.toThrow(/iso-639-3\.tab row 2/)
    })

    it("Rejects CLDR data without English names", async ({expect}) => {
        vi.mocked(read_json).mockReturnValueOnce({main: {}})
        await expect(gen_language_data()).rejects.toThrow("No English language names")
    })
})


describe('Languages', () => {

    const languages = new Languages({
        languages: {
            eng: {local: "English", english: "English", pop: 1, direction: 'ltr'},
            arb: {local: "العربية", english: "Arabic", pop: 1, direction: 'rtl'},
        },
        language2to3: {en: 'eng', ar: 'ara'},
        macro_to_individual: {ara: 'arb'},
    })

    it("Normalises codes to known individual languages", ({expect}) => {
        expect(languages.normalise('EN-us')).toBe('eng')
        expect(languages.normalise('eng')).toBe('eng')
        expect(languages.normalise('ar')).toBe('arb')
        expect(languages.normalise('ara')).toBe('arb')
        expect(languages.normalise('xx')).toBe(null)
    })
})


describe('get_language_data', () => {

    use_temp_cwd()

    it("Reads language data from the sources dir", ({expect}) => {
        write_files({'sources/languages.json':
            {languages: {}, language2to3: {}, macro_to_individual: {}}})
        expect(get_language_data().normalise('en')).toBe(null)
    })
})

