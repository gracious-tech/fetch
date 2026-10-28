
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {update_dist} from './process.js'
import {convert} from '../parts/usfmtc.js'
import {update_manifest} from '../parts/manifest.js'
import {add_unpublished} from '../parts/unpublished.js'
import {build_extra_overlay} from '../parts/extra_overlay.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'
import {test_meta, usx3_book, usx3_jude, usx3_bad_romans} from './test_utils.js'


// Avoid Python and collection-wide steps (tested separately)
vi.mock('../parts/usfmtc.js', () => ({convert: vi.fn()}))
vi.mock('../parts/manifest.js', () => ({update_manifest: vi.fn()}))
vi.mock('../parts/unpublished.js', () => ({add_unpublished: vi.fn()}))
vi.mock('../parts/extra_overlay.js', () => ({build_extra_overlay: vi.fn()}))


const usfm_jude = '\\id JUD\n\\c 1\n\\p\n\\v 1 Verse 1.\n'
const formats = {usx: 'usx', usfm: 'usfm', html: 'json', txt: 'json', typst: 'json'}


// Paths of every dist format file for a book
function dist_paths(id:string, book:string){
    return Object.entries(formats).map(([dir, ext]) => `dist/bibles/${id}/${dir}/${book}.${ext}`)
}


// Read a translation's source meta
function read_meta(id:string){
    return JSON.parse(readFileSync(`sources/bibles/${id}/meta.json`, 'utf8')) as
        ReturnType<typeof test_meta>
}


describe('update_dist', () => {

    use_temp_cwd()

    // Collect warnings for asserting on
    let warnings:string[] = []
    let errors:unknown[] = []
    beforeEach(() => {
        warnings = []
        errors = []
        vi.spyOn(console, 'warn').mockImplementation(msg => {
            warnings.push(String(msg))
        })
        vi.spyOn(console, 'error').mockImplementation(msg => {
            errors.push(msg)
        })
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        // Fake usfmtc: USFM converts to full Jude, USX converts back to marker text
        vi.mocked(convert).mockImplementation((text, informat) =>
            Promise.resolve(informat === 'usfm' ? usx3_jude : `USFM(${text.length})`))
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it("Converts USX3 and USFM sources into every dist format", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
            'sources/bibles/usfm_test/meta.json': test_meta('usfm'),
            'sources/bibles/usfm_test/usfm/jud.usfm': usfm_jude,
        })
        await update_dist()

        for (const id of ['usx_test', 'usfm_test']){
            for (const path of dist_paths(id, 'jud')){
                expect(existsSync(path)).toBe(true)
            }
            const extra = JSON.parse(readFileSync(`dist/bibles/${id}/extra.json`, 'utf8')) as
                {book_names:Record<string, unknown>}
            expect(extra.book_names['jud']).toBeDefined()
            expect(add_unpublished).toHaveBeenCalledWith([`bibles/${id}`])
            expect(read_meta(id).partial).toBeUndefined()
        }

        // USX3 is used as-is and USFM source copied unchanged as nothing was re-versed
        expect(convert).toHaveBeenCalledTimes(2)
        expect(convert).toHaveBeenCalledWith(usfm_jude, 'usfm', 'usx', true)
        expect(convert).toHaveBeenCalledWith(expect.any(String), 'usx', 'usfm')
        expect(readFileSync('dist/bibles/usfm_test/usfm/jud.usfm', 'utf8')).toBe(usfm_jude)
        expect(readFileSync('dist/bibles/usx_test/usfm/jud.usfm', 'utf8')).toMatch(/^USFM/)

        expect(build_extra_overlay).toHaveBeenCalledOnce()
        expect(update_manifest).toHaveBeenCalledOnce()
    })

    it("Converts older USX and re-derives USFM when re-versed", async ({expect}) => {
        // Habakkuk 3:20 gets folded into 3:19 by reverse_usx
        vi.mocked(convert).mockImplementation((text, informat) =>
            Promise.resolve(informat === 'usfm' ? usx3_book('HAB', [1, 1, 20]) : 'DERIVED'))
        write_files({
            'sources/bibles/old_usx/meta.json': test_meta('usx'),
            'sources/bibles/old_usx/usx/jud.usx': '<usx version="2.0"></usx>',
            'sources/bibles/usfm_test/meta.json': test_meta('usfm'),
            'sources/bibles/usfm_test/usfm/hab.usfm': '\\id HAB',
        })
        // Older USX is converted (fake returns the Jude USFM conversion for usx input too)
        vi.mocked(convert).mockImplementationOnce(() => Promise.resolve(usx3_jude))
        await update_dist()
        expect(convert).toHaveBeenCalledWith('<usx version="2.0"></usx>', 'usx', 'usx', true)
        expect(readFileSync('dist/bibles/usfm_test/usfm/hab.usfm', 'utf8')).toBe('DERIVED')
        expect(readFileSync('dist/bibles/usfm_test/usx/hab.usx', 'utf8'))
            .not.toContain('HAB 3:20')
    })

    it("Converts USX lacking a version", async ({expect}) => {
        vi.mocked(convert).mockResolvedValue(usx3_jude)
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': '<usx></usx>',
        })
        await update_dist()
        expect(convert).toHaveBeenCalledWith('<usx></usx>', 'usx', 'usx', true)
    })

    it("Ignores translations without source", async ({expect}) => {
        write_files({'sources/bibles/no_src/meta.json': test_meta('usx')})
        await update_dist()
        expect(warnings).toContain('IGNORED no_src (no source)')
        expect(existsSync('dist/bibles/no_src')).toBe(false)
    })

    it("Logs and continues past translations that fail entirely", async ({expect}) => {
        write_files({
            'sources/bibles/bad_meta/meta.json': {},
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
        })
        await update_dist()
        expect(errors).toContain('FAILED update dist assets for: bad_meta')
        expect(add_unpublished).toHaveBeenCalledExactlyOnceWith(['bibles/usx_test'])
        expect(existsSync('dist/bibles/usx_test/extra.json')).toBe(true)
    })

    it("Logs non-Error failures as-is", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
        })
        vi.mocked(add_unpublished).mockImplementationOnce(() => {
            throw 'not an error'
        })
        await update_dist()
        expect(errors).toContain('not an error')
    })

    it("Only processes given translation, forcing a fresh conversion", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
            'sources/bibles/other/meta.json': test_meta('usx'),
            'sources/bibles/other/usx/jud.usx': usx3_jude,
            'dist/bibles/usx_test/leftover.txt': '',
        })
        await update_dist('usx_test')
        expect(existsSync('dist/bibles/usx_test/leftover.txt')).toBe(false)
        expect(existsSync('dist/bibles/usx_test/txt/jud.json')).toBe(true)
        expect(existsSync('dist/bibles/other')).toBe(false)
    })

    it("Skips existing books and extra data when nothing changed", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
        })
        await update_dist()
        writeFileSync('dist/bibles/usx_test/txt/jud.json', 'untouched')
        writeFileSync('dist/bibles/usx_test/extra.json', 'untouched')
        await update_dist()
        expect(readFileSync('dist/bibles/usx_test/txt/jud.json', 'utf8')).toBe('untouched')
        expect(readFileSync('dist/bibles/usx_test/extra.json', 'utf8')).toBe('untouched')
    })

    it("Rebuilds extra data if missing even when no books changed", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
        })
        await update_dist()
        rmSync('dist/bibles/usx_test/extra.json')
        await update_dist()
        expect(existsSync('dist/bibles/usx_test/extra.json')).toBe(true)
    })

    it("Removes dist files of books no longer valid in source", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
            'sources/bibles/usx_test/usx/rev.usx.invalid': usx3_jude,
            'dist/bibles/usx_test/html/rev.json': '{}',
            'dist/bibles/usx_test/extra.json': '{}',
        })
        await update_dist()
        expect(existsSync('dist/bibles/usx_test/html/rev.json')).toBe(false)
        expect(readFileSync('dist/bibles/usx_test/extra.json', 'utf8')).not.toBe('{}')
    })

    it("Drops books that fail to re-verse (and the translation if none left)", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/rom.usx': usx3_bad_romans,
        })
        await update_dist()
        expect(warnings).toContain('[usx_test/rom] Failed to re-verse — dropping book')
        expect(warnings).toContain('IGNORED usx_test (no valid books)')
        expect(existsSync('dist/bibles/usx_test')).toBe(false)
    })

    it("Drops books without verse text", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
            'sources/bibles/usx_test/usx/3jn.usx': usx3_book('3JN', [0]),
        })
        await update_dist()
        expect(warnings).toContain("[usx_test/3jn] INVALID BOOK: failed to convert '3jn'")
        expect(warnings).toContain('[usx_test/3jn] Book has no verse text')
        for (const path of dist_paths('usx_test', '3jn')){
            expect(existsSync(path)).toBe(false)
        }
        expect(existsSync('dist/bibles/usx_test/txt/jud.json')).toBe(true)
    })

    it("Logs non-Error conversion failures as-is", async ({expect}) => {
        write_files({
            'sources/bibles/usfm_test/meta.json': test_meta('usfm'),
            'sources/bibles/usfm_test/usfm/jud.usfm': usfm_jude,
        })
        vi.mocked(convert).mockImplementationOnce(() => Promise.reject('broken'))
        await update_dist()
        expect(warnings).toContain('[usfm_test/jud] broken')
    })

    it("Records partial books (in order) in meta, clearing once complete", async ({expect}) => {
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/hag.usx': usx3_book('HAG', [5]),
            'sources/bibles/usx_test/usx/jas.usx': usx3_book('JAS', [5]),
        })
        await update_dist()
        expect(read_meta('usx_test').partial).toEqual(['hag', 'jas'])

        // Unchanged partial list doesn't rewrite meta
        writeFileSync('sources/bibles/usx_test/meta.json', JSON.stringify(
            test_meta('usx', 'manual', {partial: ['hag', 'jas']}), null, 1))
        await update_dist('usx_test')
        expect(readFileSync('sources/bibles/usx_test/meta.json', 'utf8')).toContain('\n "name"')

        // Complete books clear the partial list
        write_files({
            'sources/bibles/usx_test/usx/hag.usx': usx3_book('HAG', [5, 5]),
            'sources/bibles/usx_test/usx/jas.usx': usx3_book('JAS', [5, 5, 5, 5, 5]),
        })
        await update_dist('usx_test')
        expect(read_meta('usx_test').partial).toBeUndefined()
    })
})
