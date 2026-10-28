
import {existsSync, readFileSync} from 'node:fs'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {discover} from './door43.js'
import {stub_fetch, use_temp_cwd, write_files} from '../parts/test_utils.js'

import type {TranslationSourceMeta} from '../parts/types.js'


// Only a few known languages (real data comes from a generated sources/languages.json)
vi.mock('../parts/languages.js', () => ({
    get_language_data: () => ({
        normalise: (code:string) => ({en: 'eng', fr: 'fra', hbo: 'hbo'})[code] ?? null,
    }),
}))


const USFM_ZIP = {format: 'application/zip; type=bundle content=text/usfm',
    modified: '2022-03-04T05:06:07Z', url: 'https://cdn.door43.org/x.zip'}


// A catalog resource with the given overrides
function resource(identifier:string, overrides:Record<string, unknown> = {}){
    return {creator: 'Door43', formats: [USFM_ZIP], identifier, rights: 'CC BY-SA 4.0',
        title: `Title ${identifier}`, issued: '2019-01-01', ...overrides}
}


// Serve the three subject catalogs (Bible gets the given languages, others are empty)
function serve(bible:unknown[], aligned:unknown[] = []){
    const url = (subject:string) => `https://api.door43.org/v3/subjects/${subject}.json`
    return stub_fetch({
        [url('Bible')]: JSON.stringify(bible),
        [url('Aligned_Bible')]: JSON.stringify(aligned),
        [url('Hebrew_Old_Testament')]: '[]',
    })
}


// Read a generated meta file
function read_meta(id:string):TranslationSourceMeta{
    return JSON.parse(readFileSync(`sources/bibles/${id}/meta.json`, 'utf8')) as
        TranslationSourceMeta
}


beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('discover', () => {

    use_temp_cwd()

    it("Creates meta for new translations", async ({expect}) => {
        serve([{language: 'en', direction: 'ltr', title: 'English', resources: [resource('ult')]}],
            [{language: 'hbo', direction: 'rtl', title: 'Hebrew', resources: [
                resource('uhb', {rights: 'Public Domain'})]}])
        await discover([])
        expect(read_meta('eng_ult')).toEqual({
            name: {local: '', local_abbrev: '', english: 'Title ult', english_abbrev: 'ULT'},
            year: 2019,
            direction: 'ltr',
            copyright: {
                attribution: '© 2019 Door43',
                attribution_url: 'https://git.door43.org/Door43-Catalog/en_ult',
                licenses: [{license: 'cc-by-sa',
                    url: 'https://creativecommons.org/licenses/by-sa/4.0/'}],
            },
            ids: {door43: 'en_ult'},
            source: {service: 'door43', format: 'usfm', url: USFM_ZIP.url, updated: '2022-03-04',
                revision: 0},
            tags: [],
        })
        const hebrew = read_meta('hbo_uhb')
        expect(hebrew.direction).toBe('rtl')
        expect(hebrew.copyright.licenses).toEqual([{license: 'public',
            url: 'https://git.door43.org/Door43-Catalog/hbo_uhb/src/branch/master/LICENSE.md'}])
        expect(console.info).toHaveBeenCalledWith('New: 2')
    })

    it("Only records unrecognised licenses as unlicensed", async ({expect}) => {
        serve([{language: 'en', direction: 'ltr', title: 'English', resources: [
            resource('a', {rights: 'Custom'}),
            resource('b', {rights: 'CC BY'}),
            resource('c', {rights: 'CC XX 4.0'}),
        ]}])
        await discover([])
        for (const id of ['a', 'b', 'c']){
            expect(read_meta(`eng_${id}`).copyright.licenses).toEqual([])
        }
    })

    it("Skips unknown languages, ignored, restricted and unknown formats", async ({expect}) => {
        serve([
            {language: 'zz', direction: 'ltr', title: 'Unknown', resources: [resource('x')]},
            {language: 'fr', direction: 'ltr', title: 'French', resources: [
                resource('f10'),
                resource('a', {rights: 'Free Translate 2.0 International Public License'}),
                resource('b', {formats: [{...USFM_ZIP, format: 'application/pdf'}]}),
            ]},
        ])
        await discover([])
        expect(existsSync('sources')).toBe(false)
        expect(console.error).toHaveBeenCalledWith('IGNORED language zz (unknown code)')
        expect(console.warn).toHaveBeenCalledWith('IGNORED fra_f10/fr_f10 (in ignore list)')
        expect(console.warn).toHaveBeenCalledWith('IGNORED fra_a/fr_a (restricted license)')
        expect(console.error).toHaveBeenCalledWith('IGNORED fra_b/fr_b (unknown format)')
    })

    it("Handles existing translations and specific ids", async ({expect}) => {
        write_files({'sources/bibles/eng_b/meta.json': {
            name: {local: '', local_abbrev: '', english: 'X', english_abbrev: 'X'},
            year: 2000, direction: 'ltr', tags: [], ids: {ebible: 'x'},
            copyright: {attribution: '', attribution_url: '', licenses: []},
            source: {service: 'manual', format: 'usfm', updated: '', revision: 0, url: null},
        }})
        serve([{language: 'en', direction: 'ltr', title: 'English',
            resources: [resource('a'), resource('b'), resource('c')]}])
        await discover(['en_a'], 'en_b')
        expect(read_meta('eng_b').ids).toEqual({ebible: 'x', door43: 'en_b'})
        await discover(['en_a'], 'en_a')
        expect(console.info).toHaveBeenCalledWith('Existing: 1')
        expect(existsSync('sources/bibles/eng_c')).toBe(false)
    })
})

