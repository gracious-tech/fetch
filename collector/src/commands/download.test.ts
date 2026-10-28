
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {download_source} from './download.js'
import {dbl_zip_download_url, get_remote_versions as dbl_remote_versions}
    from '../integrations/dbl.js'
import {get_remote_versions as ebible_remote_versions} from '../integrations/ebible.js'
import {make_zip, stub_fetch, use_temp_cwd, write_files} from '../parts/test_utils.js'
import {test_meta, usx3_jude} from './test_utils.js'

import type {TranslationSourceMeta} from '../parts/types.js'


// Never hit real services
vi.mock('../integrations/dbl.js', () => ({
    dbl_zip_download_url: vi.fn((url:string) => Promise.resolve(`${url}/signed`)),
    get_remote_versions: vi.fn(),
}))
vi.mock('../integrations/ebible.js', () => ({get_remote_versions: vi.fn()}))


// A valid USX book file (any book code)
function usx(code:string){
    return usx3_jude.replaceAll('JUD', code)
}


// A valid USFM book file
function usfm(code:string){
    return `\\id ${code}\n\\c 1\n\\p\n\\v 1 Text\n`
}


// Write a translation's meta (and optionally an already-downloaded book)
function add_trans(id:string, meta:TranslationSourceMeta, downloaded=false){
    write_files({[`sources/bibles/${id}/meta.json`]: meta})
    if (downloaded){
        write_files({[`sources/bibles/${id}/${meta.source.format}/jud.${meta.source.format}`]:
            'old'})
    }
}


// Read a translation's meta
function read_meta(id:string){
    return JSON.parse(readFileSync(`sources/bibles/${id}/meta.json`, 'utf8')) as
        TranslationSourceMeta
}


// List the extracted format files of a translation
function extracted(id:string, format:string){
    return readdirSync(`sources/bibles/${id}/${format}`).sort()
}


describe('download_source', () => {

    use_temp_cwd()

    // Collect logs for asserting on
    let logs:string[] = []
    beforeEach(() => {
        logs = []
        for (const level of ['info', 'warn', 'error'] as const){
            vi.spyOn(console, level).mockImplementation(msg => {
                logs.push(String(msg))
            })
        }
        write_files({'sources/bibles/.keep': ''})
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it("Reports when no translations match", async ({expect}) => {
        add_trans('a', test_meta('usx'))
        await download_source(false, 'missing')
        expect(logs).toContain("No translations identified")
    })

    it("Extracts only valid protestant-canon books from a committed zip", async ({expect}) => {
        add_trans('a', test_meta('usx'))
        writeFileSync('sources/bibles/a/source.zip', make_zip({
            'release/JUD.usx': usx('JUD'),
            'release/TOB.usx': usx('TOB'),  // Apocrypha
            'release/LICENSE.usx': 'not usx',  // Lacks <usx
            'release/NOCODE.usx': '<usx version="3.0"><book style="id"/></usx>',
            'release/REV.USX': '<usx><book code="REV"/><chapter number="1"/><chapter number="2"/>'
                + '<verse number="1"/></usx>',  // Chapter 1 has no verses
            'release/metadata.xml': '<usx><book code="GEN"/></usx>',  // .usx exists so ignored
            'release/readme.txt': 'ignored',
        }))
        await download_source(false)
        expect(extracted('a', 'usx')).toEqual(['jud.usx', 'rev.usx.invalid'])
        expect(logs).toContain("Valid format but couldn't identify book: release/NOCODE.usx")
        // Meta not rewritten as nothing changed
        expect(readFileSync('sources/bibles/a/meta.json', 'utf8')).not.toContain('\n')
    })

    it("Falls back to .xml files for USX and detects chapter 1 from verses", async ({expect}) => {
        add_trans('a', test_meta('usx'))
        writeFileSync('sources/bibles/a/source.zip', make_zip({
            'JUD.xml': usx('JUD'),
            // Chapter 1 marker missing but has verses before chapter 2
            'PHM.xml': '<usx><book code="PHM"/><verse number="1"/><chapter number="2"/></usx>',
        }))
        await download_source(false)
        expect(extracted('a', 'usx')).toEqual(['jud.usx', 'phm.usx'])
    })

    it("Corrects declared format from zip contents, using .sfm files", async ({expect}) => {
        add_trans('a', test_meta('usx'))
        mkdirSync('sources/bibles/a/usx')  // Empty so counts as not downloaded yet
        writeFileSync('sources/bibles/a/source.zip', make_zip({
            '65JUD.SFM': usfm('JUD'),
            '57PHM.SFM': '\\id PHM\n\\c 1\n\\p\n\\c 2\n\\v 1 Wrong chapter\n',
            'NOID.SFM': '\\c 1\n\\v 1 Text\n',
        }))
        await download_source(false)
        expect(existsSync('sources/bibles/a/usx')).toBe(false)
        expect(extracted('a', 'usfm')).toEqual(['jud.usfm', 'phm.usfm.invalid'])
        expect(read_meta('a').source.format).toBe('usfm')
        expect(logs).toContain('Correcting source format for a: usx → usfm')
    })

    it("Prefers .usfm files over .sfm", async ({expect}) => {
        add_trans('a', test_meta('usfm'))
        writeFileSync('sources/bibles/a/source.zip', make_zip({
            'JUD.usfm': usfm('JUD'),
            'PHM.sfm': usfm('PHM'),
        }))
        await download_source(false)
        expect(extracted('a', 'usfm')).toEqual(['jud.usfm'])
    })

    it("Downloads and merges multiple zips (later overriding earlier)", async ({expect}) => {
        add_trans('a', test_meta('usx', 'door43',
            {source: {...test_meta('usx').source, service: 'door43',
                url: ['https://x/1.zip', 'https://x/2.zip']}}))
        stub_fetch({
            'https://x/1.zip': make_zip({'JUD.usx': usx('JUD'), 'PHM.usx': usx('PHM')}),
            'https://x/2.zip': make_zip({'PHM.usx': usx('PHM').replace('Verse 1.', 'New')}),
        })
        await download_source(false)
        expect(extracted('a', 'usx')).toEqual(['jud.usx', 'phm.usx'])
        expect(readFileSync('sources/bibles/a/usx/phm.usx', 'utf8')).toContain('New')
        expect(existsSync('sources/bibles/a/source1.zip')).toBe(true)
    })

    it("Gets a signed url for DBL downloads", async ({expect}) => {
        add_trans('a', test_meta('usx', 'dbl', {ids: {dbl: 'abc'},
            source: {...test_meta('usx').source, service: 'dbl', url: 'https://dbl/abc'}}))
        stub_fetch({'https://dbl/abc/signed': make_zip({'JUD.usx': usx('JUD')})})
        await download_source(false)
        expect(dbl_zip_download_url).toHaveBeenCalledWith('https://dbl/abc')
        expect(extracted('a', 'usx')).toEqual(['jud.usx'])
    })

    it("Logs failures and continues with other translations", async ({expect}) => {
        const meta = (url:string) => test_meta('usx', 'ebible',
            {source: {...test_meta('usx').source, service: 'ebible', url}})
        add_trans('a', meta('https://x/missing.zip'))
        add_trans('b', meta('https://x/b.zip'))
        stub_fetch({'https://x/b.zip': make_zip({'JUD.usx': usx('JUD')})})
        await download_source(false)
        expect(logs).toContain('FAILED to update source for: a')
        expect(extracted('b', 'usx')).toEqual(['jud.usx'])
    })

    it("Never re-downloads without recheck", async ({expect}) => {
        add_trans('a', test_meta('usx'), true)
        await download_source(false)
        expect(logs).toContain("No translations identified")
        expect(ebible_remote_versions).not.toHaveBeenCalled()
    })

    it("Always re-fetches manual/door43 sources on recheck", async ({expect}) => {
        add_trans('a', test_meta('usx'), true)
        writeFileSync('sources/bibles/a/source.zip', make_zip({'PHM.usx': usx('PHM')}))
        await download_source(true)
        expect(extracted('a', 'usx')).toEqual(['phm.usx'])
        expect(ebible_remote_versions).not.toHaveBeenCalled()
        expect(dbl_remote_versions).not.toHaveBeenCalled()
    })

    it("Re-downloads eBible/DBL only when a newer version is listed", async ({expect}) => {
        const meta = (service:'ebible'|'dbl', id?:string) => test_meta('usx', service, {
            ids: id ? {[service]: id} : {},
            source: {...test_meta('usx').source, service, url: `https://x/${id ?? 'none'}.zip`},
        })
        add_trans('eb_new', meta('ebible', 'eb_new'), true)
        add_trans('eb_same', meta('ebible', 'eb_same'), true)
        add_trans('eb_gone', meta('ebible', 'eb_gone'), true)
        add_trans('eb_no_id', meta('ebible'), true)
        add_trans('eb_fresh', meta('ebible', 'eb_fresh'))
        add_trans('dbl_new', meta('dbl', 'dbl_new'), true)
        add_trans('dbl_rev', meta('dbl', 'dbl_rev'), true)
        add_trans('dbl_gone', meta('dbl', 'dbl_gone'), true)
        vi.mocked(ebible_remote_versions).mockResolvedValue(new Map([
            ['eb_new', {updated: '2024-01-01'}],
            ['eb_same', {updated: '2020-01-01'}],
        ]))
        vi.mocked(dbl_remote_versions).mockResolvedValue(new Map([
            ['dbl_new', {updated: '2024-01-01', revision: 3}],
            ['dbl_rev', {updated: '2020-01-01', revision: 1}],
        ]))
        const zip = make_zip({'PHM.usx': usx('PHM')})
        const fetch = stub_fetch(Object.fromEntries(
            ['eb_new', 'eb_fresh', 'dbl_new/signed', 'dbl_rev/signed']
                .map(id => [`https://x/${id}.zip`.replace('/signed.zip', '.zip/signed'), zip])))

        await download_source(true)

        // Only new/changed versions (or not yet downloaded) were fetched
        expect(fetch.mock.calls.map(c => c[0]).sort()).toEqual([
            'https://x/dbl_new.zip/signed', 'https://x/dbl_rev.zip/signed',
            'https://x/eb_fresh.zip', 'https://x/eb_new.zip',
        ])
        for (const id of ['eb_same', 'eb_gone', 'eb_no_id', 'dbl_gone']){
            expect(extracted(id, 'usx')).toEqual(['jud.usx'])
        }
        expect(logs).toContain('Skipping eb_gone: source no longer listed by ebible '
            + '(keeping existing files)')
        expect(logs).toContain('Skipping dbl_gone: source no longer listed by dbl '
            + '(keeping existing files)')
        expect(logs).toContain('Re-downloading eb_new: source updated (2020-01-01 → 2024-01-01)')

        // Downloaded versions recorded in meta
        expect(read_meta('eb_new').source).toMatchObject({updated: '2024-01-01', revision: 0})
        expect(read_meta('dbl_new').source).toMatchObject({updated: '2024-01-01', revision: 3})
        expect(read_meta('dbl_rev').source).toMatchObject({updated: '2020-01-01', revision: 1})
        expect(read_meta('eb_fresh').source.updated).toBe('2020-01-01')
    })

    it("Only queries services that have downloaded translations", async ({expect}) => {
        add_trans('a', test_meta('usx', 'dbl', {ids: {dbl: 'a'}}), true)
        vi.mocked(dbl_remote_versions).mockResolvedValue(new Map())
        await download_source(true)
        expect(dbl_remote_versions).toHaveBeenCalled()
        expect(ebible_remote_versions).not.toHaveBeenCalled()
    })
})
