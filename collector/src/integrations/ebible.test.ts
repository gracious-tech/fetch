
import {existsSync, readFileSync} from 'node:fs'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {discover, get_remote_versions} from './ebible.js'
import {stub_fetch, use_temp_cwd, write_files} from '../parts/test_utils.js'

import type {TranslationSourceMeta} from '../parts/types.js'


// Only a few known languages (real data comes from a generated sources/languages.json)
vi.mock('../parts/languages.js', () => ({
    get_language_data: () => ({
        normalise: (code:string) => ({en: 'eng', eng: 'eng', spa: 'spa'})[code] ?? null,
    }),
}))


const CSV_URL = 'https://ebible.org/Scriptures/translations.csv'
const COLUMNS = ['translationId', 'FCBHID', 'title', 'description', 'shortTitle', 'languageCode',
    'textDirection', 'Copyright', 'UpdateDate', 'swordName']
const CC_PAGE = '<a href="https://creativecommons.org/licenses/by4.0/">CC</a> <a>usfm.zip</a>'


// Details page url for an eBible id
const page = (id:string) => `https://ebible.org/Scriptures/details.php?id=${id}`


// A CSV row (as a column->value object) with the given overrides
function row(id:string, overrides:Record<string, string> = {}):Record<string, string>{
    return {
        translationId: id, FCBHID: `SPA${id.toUpperCase()}`, title: `Título ${id}`,
        description: 'Desc', shortTitle: `Spanish Ëxample ${id}`, languageCode: 'spa',
        textDirection: 'ltr', Copyright: 'Copyright 2001 Org', UpdateDate: '2024-01-02',
        swordName: '', ...overrides,
    }
}


// Serve a CSV of the given rows (with BOM) plus detail pages
function serve(rows:Record<string, string>[], pages:Record<string, string> = {}){
    const csv = '﻿' + [COLUMNS.join(','),
        ...rows.map(r => COLUMNS.map(c => `"${r[c] ?? ''}"`).join(','))].join('\n')
    return stub_fetch({[CSV_URL]: csv, ...pages})
}


// Read a generated meta file
function read_meta(id:string):TranslationSourceMeta{
    return JSON.parse(readFileSync(`sources/bibles/${id}/meta.json`, 'utf8')) as
        TranslationSourceMeta
}


// A minimal valid meta file for a translation
function meta(ids:TranslationSourceMeta['ids']):TranslationSourceMeta{
    return {
        name: {local: '', local_abbrev: '', english: 'X', english_abbrev: 'X'},
        year: 2000, direction: 'ltr', tags: [], ids,
        copyright: {attribution: '', attribution_url: '', licenses: []},
        source: {service: 'manual', format: 'usfm', updated: '', revision: 0, url: null},
    }
}


beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('get_remote_versions', () => {

    it("Returns update dates, skipping malformed rows", async ({expect}) => {
        serve([row('a'), row('b', {UpdateDate: '2024'})])
        const versions = await get_remote_versions()
        expect([...versions]).toEqual([['a', {updated: '2024-01-02'}]])
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('INVALID eBible row 3'))
    })
})


describe('discover', () => {

    use_temp_cwd()

    it("Creates meta for a new translation", async ({expect}) => {
        serve([row('abc', {textDirection: 'rtl'})], {[page('abc')]: CC_PAGE})
        await discover([])
        expect(read_meta('spa_abc')).toEqual({
            name: {local: 'Título abc', local_abbrev: '', english: 'Spanish Example abc',
                english_abbrev: 'SE'},
            year: 2001,
            direction: 'rtl',
            copyright: {
                licenses: [{license: 'cc-by', url: 'https://creativecommons.org/licenses/by/4.0/'}],
                attribution: 'Copyright 2001 Org',
                attribution_url: page('abc'),
            },
            ids: {ebible: 'abc'},
            source: {service: 'ebible', format: 'usfm',
                url: 'https://ebible.org/Scriptures/abc_usfm.zip', updated: '2024-01-02',
                revision: 0},
            tags: [],
        })
        expect(console.info).toHaveBeenCalledWith('EBIBLE new: 1')
    })

    it("Uses the title as English name for English translations", async ({expect}) => {
        serve([row('kjv', {languageCode: 'en', FCBHID: 'ENGTWF', title: 'King James'})],
            {[page('kjv')]: 'Public Domain usfm.zip'})
        await discover([])
        const meta = read_meta('eng_wft')
        expect(meta.name.english).toBe('King James')
        expect(meta.copyright.licenses).toEqual([{license: 'public', url: page('kjv')}])
    })

    it("Skips other, ignored and existing translations", async ({expect}) => {
        // Only the CSV is requested as no detail pages are needed
        const fetch = serve([row('a'), row('eng-kjv'), row('b')])
        await discover(['b'], 'b')
        await discover(['b'], 'eng-kjv')
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(console.info).toHaveBeenCalledWith('EBIBLE existing: 1')
        expect(console.info).toHaveBeenCalledWith('EBIBLE ignored: 1')
    })

    it("Falls back on eBible's id when language or id is invalid", async ({expect}) => {
        serve([row('x', {languageCode: 'zzz', FCBHID: 'ZZZ'})], {[page('x')]: CC_PAGE})
        await discover([])
        expect(console.error).toHaveBeenCalledWith(`INVALID Id _zzz ${page('x')}`)
        expect(read_meta('_zzz').ids.ebible).toBe('x')
    })

    it("Handles missing licenses and USFM", async ({expect}) => {
        serve([row('daf'), row('a'), row('b'), row('c')], {
            [page('daf')]: 'Restricted',
            [page('a')]: 'Restricted',
            [page('b')]: CC_PAGE.replace('usfm.zip', ''),
            [page('c')]: 'Restricted usfm.zip',
        })
        await discover([])
        expect(console.error).toHaveBeenCalledTimes(1)
        expect(console.error).toHaveBeenCalledWith(`INVALID No USFM available ${page('b')}`)
        expect(console.info).toHaveBeenCalledWith('EBIBLE ignored: 2')
        expect(read_meta('spa_c').copyright.licenses).toEqual([])
        expect(existsSync('sources/bibles/spa_daf')).toBe(false)
    })

    it("Adds the eBible id to a translation discovered via another service", async ({expect}) => {
        write_files({
            'sources/bibles/spa_a/meta.json': meta({dbl: 'x'}),
            'sources/bibles/spa_b/meta.json': meta({ebible: 'other'}),
        })
        serve([row('a'), row('b')], {[page('a')]: CC_PAGE, [page('b')]: CC_PAGE})
        await discover([])
        expect(read_meta('spa_a').ids).toEqual({dbl: 'x', ebible: 'a'})
        expect(read_meta('spa_b').ids).toEqual({ebible: 'other'})
        expect(console.error).toHaveBeenCalledWith(
            'INVALID Matched b to spa_b but it already has other')
    })
})

