
import {createHmac} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {dbl_headers, dbl_zip_download_url, discover, get_remote_versions} from './dbl.js'
import {stub_fetch, use_temp_cwd, write_files} from '../parts/test_utils.js'

import type {TranslationSourceMeta} from '../parts/types.js'


// Only a few known languages (real data comes from a generated sources/languages.json)
vi.mock('../parts/languages.js', () => ({
    get_language_data: () => ({
        normalise: (code:string) => ({en: 'eng', eng: 'eng', spa: 'spa', cnq: 'cnq'})[code] ?? null,
    }),
}))


const API = 'https://api.library.bible/v1'
const LIST_URL = `${API}/content-entries?is_open_access=true&medium=text`
    + '&include_full_details=true&limit=500&offset='


// Stub fetch to serve the given url->JSON routes, else 404
function serve(routes:Record<string, unknown>){
    return stub_fetch(Object.fromEntries(
        Object.entries(routes).map(([url, data]) => [url, JSON.stringify(data)])))
}


// A valid DBL content entry with the given overrides
function entry(uid:string, overrides:Record<string, unknown> = {}){
    return {
        uid,
        name: `Name ${uid}`,
        medium: 'text',
        language: {isoCode: 'spa', scriptDirection: 'LTR'},
        providedByOrg: {uid: 'org', name: 'Some Org'},
        copyrightStatement: 'https://creativecommons.org/licenses/by/4.0/',
        dateUpdated: '2024-05-06T00:00:00',
        nameAbbreviation: uid.slice(0, 3).toUpperCase(),
        revision: 3,
        ...overrides,
    }
}


// A 16 char hex uid from a short number
function uid(n:number){
    return n.toString(16).padStart(16, '0')
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
    vi.stubEnv('DBL_API_KEY', 'KEY')
    vi.stubEnv('DBL_API_SECRET', 'SECRET')
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('dbl_headers', () => {

    it("Requires key and secret", ({expect}) => {
        vi.stubEnv('DBL_API_SECRET', '')
        expect(() => dbl_headers(`${API}/x`)).toThrow('DBL_API_KEY and DBL_API_SECRET')
        vi.unstubAllEnvs()
        delete process.env['DBL_API_KEY']
        delete process.env['DBL_API_SECRET']
        expect(() => dbl_headers(`${API}/x`)).toThrow('DBL_API_KEY and DBL_API_SECRET')
    })

    it("Signs the path and date with lowercased credentials", ({expect}) => {
        const headers = dbl_headers(`${API}/content-entries?a=1`, 'POST')
        const signing = `POST /v1/content-entries\n\n${headers['Date']!}\nsecret`
        const sig = createHmac('sha1', 'key').update(signing).digest('hex')
        expect(headers['X-DBL-Authorization']).toBe(`version=v1,token=key,signature=${sig}`)
        expect(headers['Accept']).toBe('application/json')
    })
})


describe('dbl_zip_download_url', () => {

    it("Resolves the presigned url", async ({expect}) => {
        serve({[`${API}/zip`]: {presignedURL: 'https://s3/x.zip'}})
        expect(await dbl_zip_download_url(`${API}/zip`)).toBe('https://s3/x.zip')
    })
})


describe('get_remote_versions', () => {

    it("Paginates and skips invalid entries", async ({expect}) => {
        const page1 = [...Array(500).keys()].map(i => entry(uid(i + 1)))
        page1[0] = {...entry(uid(1)), revision: -1}  // Invalid but has uid
        serve({
            [LIST_URL + '0']: {items: page1},
            [LIST_URL + '500']: {items: [entry(uid(1000), {revision: 7}), {bad: true}]},
        })
        const versions = await get_remote_versions()
        expect(versions.size).toBe(500)
        expect(versions.has(uid(1))).toBe(false)
        expect(versions.get(uid(1000))).toEqual({updated: '2024-05-06', revision: 7})
        const errors = vi.mocked(console.error).mock.calls.map(c => String(c[0]))
        expect(errors[0]).toContain(`INVALID DBL entry ${uid(1)}`)
        expect(errors[1]).toContain('INVALID DBL entry #501')
    })
})


describe('discover', () => {

    use_temp_cwd()

    // Serve a single page of entries plus any other routes
    function serve_entries(items:unknown[], routes:Record<string, unknown> = {}){
        return serve({[LIST_URL + '0']: {items}, ...routes})
    }

    // License agreement url for an entry
    const agreement = (id:string) => `${API}/license-agreements?content_entry_uid=${id}`

    it("Filters non-text, eBible, ignored, existing and unknown languages", async ({expect}) => {
        serve_entries([
            entry(uid(1), {medium: 'audio'}),
            entry(uid(2), {providedByOrg: {uid: 'x', name: 'eBible.org'}}),
            entry('69ffe7eecd894e52'),
            entry(uid(3)),
            entry(uid(4), {language: {isoCode: 'zzz'}}),
            entry(uid(5), {language: null}),
        ])
        const existing = [uid(3)]
        await discover(existing)
        expect(existsSync('sources/bibles')).toBe(false)
        expect(console.error).toHaveBeenCalledWith('INVALID zzz (unknown language)')
        expect(console.error).toHaveBeenCalledWith('INVALID  (unknown language)')
        expect(console.info).toHaveBeenCalledWith('DBL new: 0')
        expect(console.info).toHaveBeenCalledWith('DBL existing: 1')
        expect(console.info).toHaveBeenCalledWith('DBL ignored: 3')
        expect(console.info).toHaveBeenCalledWith('DBL total: 4')
    })

    it("Creates meta for a new translation", async ({expect}) => {
        serve_entries([entry(uid(1), {
            name: 'Biblia', nameLocal: 'La Biblia', nameAbbreviation: 'SPA-BLB',
            nameAbbreviationLocal: 'BLB', language: {isoCode: 'spa', scriptDirection: 'RTL'},
            providedByOrg: {uid: '545d2cb05f032bce5404dab8', name: 'Wycliffe'},
            primaryLicensorOrg: {uid: 'y', name: 'Licensor'},
            dateFirstSubmitted: '2015-01-01T00:00:00', dateTranslationFinished: '2010',
        })])
        const existing:string[] = []
        await discover(existing)
        expect(existing).toEqual([uid(1)])
        expect(read_meta('spa_wft')).toEqual({
            name: {local: 'La Biblia', local_abbrev: 'BLB', english: 'Biblia',
                english_abbrev: 'BLB'},
            year: 2010,
            direction: 'rtl',
            copyright: {
                licenses: [{license: 'cc-by', url: 'https://creativecommons.org/licenses/by/4.0/'}],
                attribution: 'Licensor',
                attribution_url: `https://app.library.bible/content/${uid(1)}`,
            },
            ids: {dbl: uid(1)},
            source: {service: 'dbl', format: 'usx', url: `${API}/content-entries/${uid(1)}/zip`,
                updated: '2024-05-06', revision: 3},
            tags: [],
        })
    })

    it("Falls back on minimal details when fields are missing", async ({expect}) => {
        serve_entries([entry(uid(1), {
            language: {isoCode: 'cug'}, providedByOrg: null, nameAbbreviation: null,
            copyrightStatement: 'Public Domain',
        })])
        await discover([])
        const meta = read_meta('cnq_a')
        expect(meta.year).toBe(9999)
        expect(meta.direction).toBe('ltr')
        expect(meta.name.local).toBe('')
        expect(meta.copyright.attribution).toBe('')
        expect(meta.copyright.licenses).toEqual(
            [{license: 'public', url: `https://app.library.bible/content/${uid(1)}`}])
    })

    it("Only discovers a specific id when given", async ({expect}) => {
        serve_entries([entry(uid(1), {nameAbbreviation: 'A'}),
            entry(uid(2), {nameAbbreviation: 'B'})])
        await discover([], uid(2))
        expect(read_meta('spa_b').ids.dbl).toBe(uid(2))
        expect(existsSync('sources/bibles/spa_a')).toBe(false)
    })

    it("Strips the language code from abbreviations", async ({expect}) => {
        serve_entries([entry(uid(1), {nameAbbreviation: 'SPARV'})])
        await discover([])
        expect(read_meta('spa_rv').name.english_abbrev).toBe('RV')
    })

    it("Adds the dbl id to a translation discovered via another service", async ({expect}) => {
        write_files({'sources/bibles/spa_x/meta.json': meta({ebible: 'spax'})})
        serve_entries([entry(uid(1), {nameAbbreviation: 'X'})])
        await discover([])
        expect(read_meta('spa_x').ids).toEqual({ebible: 'spax', dbl: uid(1)})
        expect(console.info).toHaveBeenCalledWith('DBL existing: 1')
    })

    it("Makes ids unique when they clash with other DBL translations", async ({expect}) => {
        write_files({'sources/bibles/spa_x/meta.json': meta({dbl: uid(9)})})
        serve_entries([
            entry(uid(1), {nameAbbreviation: 'X'}),
            // No license in statement so awaits a lookup before writing its meta (claimed only)
            entry(uid(2), {nameAbbreviation: 'Y', copyrightStatement: null,
                providedByOrg: {uid: '019217aaaebdd5e7e372cf90', name: 'TLF'}}),
            entry(uid(3), {nameAbbreviation: 'Z', providedByOrg: {uid: '019217aaaebdd5e7e372cf90',
                name: 'TLF'}}),
        ], {[agreement(uid(2))]: {items: []}})
        await discover([])
        expect(read_meta('spa_x_x').ids.dbl).toBe(uid(1))
        expect(read_meta('spa_tlf').ids.dbl).toBe(uid(2))
        expect(read_meta('spa_tlf_z').ids.dbl).toBe(uid(3))
    })

    it("Looks up license via agreement's template if not in statement", async ({expect}) => {
        const fetch = serve_entries([
            entry(uid(1), {copyrightStatement: null, nameAbbreviation: 'A'}),
            entry(uid(2), {copyrightStatement: 'All rights reserved', nameAbbreviation: 'B'}),
            entry(uid(3), {copyrightStatement: null, nameAbbreviation: 'C'}),
            entry(uid(4), {copyrightStatement: null, nameAbbreviation: 'D'}),
            entry(uid(5), {copyrightStatement: null, nameAbbreviation: 'E'}),
        ], {
            [agreement(uid(1))]: {items: [{licenseTemplateRevisionID: 101}]},
            [agreement(uid(2))]: {items: [{licenseTemplateRevisionID: 101}]},
            [agreement(uid(3))]: {items: []},
            [agreement(uid(4))]: {items: [{licenseTemplateRevisionID: 2162}]},
            [agreement(uid(5))]: {items: [{licenseTemplateRevisionID: 102}]},
            [`${API}/license-template-revisions/101`]:
                {summary: 'See https://creativecommons.org/licenses/by-sa/4.0/'},
            [`${API}/license-template-revisions/102`]: {externalURL: null},
        })
        await discover([])
        const cc_by_sa = [{license: 'cc-by-sa',
            url: 'https://creativecommons.org/licenses/by-sa/4.0/'}]
        expect(read_meta('spa_a').copyright.licenses).toEqual(cc_by_sa)
        expect(read_meta('spa_b').copyright.licenses).toEqual(cc_by_sa)
        expect(read_meta('spa_c').copyright.licenses).toEqual([])
        expect(read_meta('spa_d').copyright.licenses).toEqual(cc_by_sa)
        expect(read_meta('spa_e').copyright.licenses).toEqual([])
        // Template revision only fetched once despite two entries using it
        const template_requests = fetch.mock.calls.filter(
            c => c[0] === `${API}/license-template-revisions/101`)
        expect(template_requests).toHaveLength(1)
    })

    it("Fails when a template revision is inaccessible and unknown", async ({expect}) => {
        serve_entries([entry(uid(1), {copyrightStatement: null})], {
            [agreement(uid(1))]: {items: [{licenseTemplateRevisionID: 103}]},
        })
        await expect(discover([])).rejects.toThrow('License template revision 103 not accessible')
    })
})

