
import {mkdirSync} from 'node:fs'

import {books_ordered} from '@gracious.tech/bible-references'
import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {report_items, report_invalid_meta, report_invalid_books, report_incomplete,
    report_unprocessed} from './report.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'

import type {TranslationSourceMeta} from '../parts/types'


// A valid translation source meta, with overrides
function meta(overrides:Partial<TranslationSourceMeta>={}):TranslationSourceMeta{
    return {
        name: {local: "Local", local_abbrev: "LOC", english: "English", english_abbrev: "ENG"},
        year: 2000,
        direction: 'ltr',
        copyright: {attribution: "Someone", attribution_url: 'https://ebible.org/abc',
            licenses: [{license: 'cc-by', url: ''}]},
        tags: [],
        ids: {ebible: 'abc'},
        source: {service: 'ebible', format: 'usfm', updated: '2000-01-01', revision: 0,
            url: 'https://ebible.org/abc.zip'},
        ...overrides,
    }
}


// Write source book files for a translation (books with `.invalid` suffix allowed)
function write_books(id:string, format:'usx'|'usfm', files:string[]){
    write_files(Object.fromEntries(files.map(f => [`sources/bibles/${id}/${format}/${f}`, ''])))
}


// Capture console output, returning the lines logged to each stream
function capture(){
    const out = {info: [] as string[], error: [] as string[]}
    vi.spyOn(console, 'info').mockImplementation((msg:string) => out.info.push(msg))
    vi.spyOn(console, 'error').mockImplementation((msg:string) => out.error.push(msg))
    return out
}


describe('report commands', () => {

    use_temp_cwd()
    let out:ReturnType<typeof capture>
    beforeEach(() => {
        out = capture()
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('report_items', () => {

        it("Outputs id, year, license and source url for each translation", ({expect}) => {
            const custom = {forbid_limitless: false, forbid_commercial: true,
                forbid_derivatives: false, forbid_attributionless: false, forbid_other: false}
            write_files({
                'sources/bibles/eng_a/meta.json': meta(),
                'sources/bibles/eng_b/meta.json': meta({ids: {dbl: 'xyz'}, year: null,
                    source: {...meta().source, service: 'dbl'},
                    copyright: {...meta().copyright, licenses: [{license: custom, url: ''}]}}),
                'sources/bibles/eng_c/meta.json': meta({ids: {},
                    source: {...meta().source, service: 'manual'},
                    copyright: {...meta().copyright, licenses: []}}),
            })
            report_items()
            const lines = out.info.map(l => l.trim().split(/ +/))
            expect(lines).toContainEqual(['eng_a', '2000', 'cc-by',
                'https://ebible.org/Scriptures/details.php?id=abc'])
            expect(lines).toContainEqual(['eng_b', 'null', 'custom',
                'https://app.thedigitalbiblelibrary.org/entry?id=xyz'])
            expect(lines).toContainEqual(['eng_c', '2000', 'none'])
        })
    })

    describe('report_invalid_meta', () => {

        it("Reports nothing for valid meta", ({expect}) => {
            write_files({'sources/bibles/eng_a/meta.json': meta()})
            report_invalid_meta()
            expect(out.error).toEqual([])
        })

        it("Reports missing fields", ({expect}) => {
            write_files({'sources/bibles/eng_a/meta.json': meta({year: null})})
            report_invalid_meta()
            expect(out.error).toEqual([
                'MISSING META [year]: ' + ['sources', 'bibles', 'eng_a', 'meta.json'].join('/')])
        })

        it("Reports attribution and source urls that don't match the service id", ({expect}) => {
            write_files({
                'sources/bibles/eng_a/meta.json': meta({ids: {ebible: 'other'}}),
                'sources/bibles/eng_b/meta.json': meta({ids: {dbl: 'xyz'},
                    copyright: {...meta().copyright,
                        attribution_url: 'https://app.thedigitalbiblelibrary.org/xyz'},
                    source: {...meta().source, service: 'dbl',
                        url: ['https://dbl/xyz', 'https://dbl/abc']}}),
            })
            report_invalid_meta()
            expect(out.error).toEqual(['WRONG ATTRIBUTION: eng_a', 'WRONG ID IN SOURCE URL: eng_a'])
        })

        it("Ignores attribution urls not from the service", ({expect}) => {
            write_files({'sources/bibles/eng_a/meta.json': meta({
                copyright: {...meta().copyright, attribution_url: 'https://example.com'}})})
            report_invalid_meta()
            expect(out.error).toEqual([])
        })

        it("Skips id checks for other services", ({expect}) => {
            write_files({'sources/bibles/eng_a/meta.json': meta({ids: {door43: 'x'},
                source: {...meta().source, service: 'door43'}})})
            report_invalid_meta()
            expect(out.error).toEqual([])
        })
    })

    describe('report_invalid_books', () => {

        beforeEach(() => {
            write_books('eng_a', 'usx', ['gen.usx', 'exo.usx.invalid', 'lev.usx.invalid'])
            write_books('eng_b', 'usfm', ['gen.usfm.invalid'])
            write_books('eng_c', 'usfm', ['gen.usfm'])
        })

        it("Reports translations with invalid books", ({expect}) => {
            report_invalid_books()
            expect(out.error).toEqual(['eng_a         2  exo,lev', 'eng_b         1  gen'])
        })

        it("Reports translations without any valid books", ({expect}) => {
            report_invalid_books(true)
            expect(out.error).toEqual(['NO BOOKS: eng_b'])
        })
    })

    describe('report_incomplete', () => {

        it("Reports translations missing only a few books of a testament", ({expect}) => {
            const ot = books_ordered.slice(0, 39)
            const nt = books_ordered.slice(39)
            // Missing 1 OT book (plus an invalid file), NT entirely missing so ignored
            write_books('eng_a', 'usx', [...ot.slice(1).map(b => `${b}.usx`), 'gen.usx.invalid'])
            // Complete
            write_books('eng_b', 'usfm', books_ordered.map(b => `${b}.usfm`))
            // Missing 2 NT books, OT entirely missing so ignored
            write_books('eng_c', 'usfm', nt.slice(2).map(b => `${b}.usfm`))
            report_incomplete()
            expect(out.error).toEqual([
                'OT  1   NT  0      INV.  1   eng_a        gen',
                'OT  0   NT  2      INV.  0   eng_c        mat,mrk',
            ])
        })
    })

    describe('report_unprocessed', () => {

        // Write dist files for a translation's formats
        function write_dist(id:string, counts:Record<string, string[]>){
            for (const [format, books] of Object.entries(counts)){
                mkdirSync(`dist/bibles/${id}/${format}`, {recursive: true})
                write_files(Object.fromEntries(
                    books.map(b => [`dist/bibles/${id}/${format}/${b}.json`, ''])))
            }
        }

        beforeEach(() => {
            // Fully processed
            write_books('eng_a', 'usfm', ['gen.usfm'])
            write_dist('eng_a', {usfm: ['gen'], usx: ['gen'], html: ['gen'], txt: ['gen']})
            // Converted to usfm/usx but not html/txt
            write_books('eng_b', 'usx', ['gen.usx', 'exo.usx', 'lev.usx.invalid'])
            write_dist('eng_b', {usfm: ['gen', 'exo'], usx: ['gen', 'exo'], html: ['gen'],
                txt: ['gen']})
            // Failed to convert to usx
            write_books('eng_c', 'usfm', ['gen.usfm'])
            write_dist('eng_c', {usfm: ['gen'], usx: [], html: [], txt: []})
        })

        it("Reports all translations not fully processed", ({expect}) => {
            report_unprocessed()
            expect(out.error).toEqual([
                ' 1 /  2  eng_b     sources/bibles/eng_b/usx/exo.usx',
                ' 0 /  1  eng_c     sources/bibles/eng_c/usfm/gen.usfm',
            ])
            expect(out.info).toEqual(['\nTotal: 2'])
        })

        it("Reports only usfm/usx conversion failures", ({expect}) => {
            report_unprocessed('usfmx')
            expect(out.error).toEqual([' 0 /  1  eng_c     sources/bibles/eng_c/usfm/gen.usfm'])
        })

        it("Reports only other format failures", ({expect}) => {
            report_unprocessed('other')
            expect(out.error).toEqual([' 1 /  2  eng_b     sources/bibles/eng_b/usx/exo.usx'])
            expect(out.info).toEqual(['\nTotal: 1'])
        })
    })
})

