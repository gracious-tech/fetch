
import {readFileSync} from 'node:fs'

import {describe, it, vi, beforeEach} from 'vitest'

import {build_extra_overlay} from './extra_overlay.js'
import {use_temp_cwd, write_files} from './test_utils.js'

import type {BookNames, DistTranslationExtra, TxtContent} from './shared_types'
import type {TranslationSourceMeta} from './types'


// Book name fields given for a book (any omitted are empty) and whether it has a section heading
interface BookSpec {
    names?:Partial<BookNames>
    heading?:string
}


// Write a translation's dist txt/usx output and (optionally) its source meta
function translation(id:string, books:Record<string, BookSpec>,
        meta?:Partial<TranslationSourceMeta>){
    const files:Record<string, unknown> = {}
    for (const [book, spec] of Object.entries(books)){
        const verse2:TxtContent[] = spec.heading
            ? [{type: 'heading', contents: spec.heading, level: 2}, "b"] : ["b"]
        files[`dist/bibles/${id}/txt/${book}.json`] = {
            book,
            name: {normal: '', long: '', abbrev: '', ...spec.names},
            contents: [[], [[], ["a"], verse2]],
        }
        files[`dist/bibles/${id}/usx/${book}.usx`] = '<usx/>'
    }
    if (meta){
        files[`sources/bibles/${id}/meta.json`] = {
            name: {local: "Local", local_abbrev: "LOC", english: "", english_abbrev: ""},
            year: 2000,
            direction: 'ltr',
            copyright: {attribution: "Someone", attribution_url: '', licenses: []},
            tags: [],
            ids: {},
            source: {service: 'manual', format: 'usx', url: null, updated: '2000-01-01',
                revision: 0},
            ...meta,
        }
    }
    write_files(files)
}

// Read a translation's generated extra.json
function read_extra(id:string):DistTranslationExtra{
    return JSON.parse(readFileSync(`dist/bibles/${id}/extra.json`, 'utf8')) as DistTranslationExtra
}


describe('build_extra_overlay', () => {

    use_temp_cwd()

    beforeEach(() => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
    })

    it("Does nothing when there are no translations", ({expect}) => {
        build_extra_overlay()
        expect(console.info).not.toHaveBeenCalled()
    })

    it("Fills each gap from the best same-language-and-script donor", ({expect}) => {
        translation('spa_target', {gen: {}, exo: {names: {normal: "Éxodo"}}}, {year: 2020})
        // Recommended donor is preferred even though older, but lacks gen's abbrev and headings
        translation('spa_rec', {gen: {names: {normal: "Génesis", long: "Libro de Génesis"}}},
            {year: 1900, tags: ['recommended']})
        // Then most recent of the rest (which lacks gen entirely)
        translation('spa_new', {exo: {names: {abbrev: "Ex"}, heading: "Nueva"}}, {year: 2010})
        translation('spa_old', {gen: {names: {normal: "Old", abbrev: "Gn"}, heading: "Vieja"}},
            {year: 1950})
        // A different script is never a donor
        translation('spa_other', {gen: {names: {abbrev: "X"}, heading: "Otra"}},
            {script: 'Cyrl'})
        // Without meta (and so a year) it ranks last
        translation('spa_nometa', {gen: {names: {abbrev: "N"}}})

        build_extra_overlay()
        const extra = read_extra('spa_target')
        expect(extra.book_names).toEqual({
            gen: {normal: "Génesis", long: "Libro de Génesis", abbrev: "Gn"},
            exo: {normal: "Éxodo", long: '', abbrev: "Ex"},
        })
        // Sections and chapter headings come together from the same donor
        expect(extra.sections['gen']).toEqual([{start_chapter: 1, start_verse: 1, end_chapter: 1,
            end_verse: 2, heading: null}])
        expect(extra.chapter_headings['gen']).toEqual(['', "Vieja"])
        expect(extra.chapter_headings['exo']).toEqual(['', "Nueva"])
        expect(console.info).toHaveBeenCalledWith(
            expect.stringMatching(/^Filled \d+ book name field\(s\) and \d+ book heading/))
    })

    it("Prefers the most recent donor when none are recommended", ({expect}) => {
        translation('fra_a', {gen: {}})
        translation('fra_b', {gen: {names: {normal: "B"}}}, {year: 1990})
        translation('fra_c', {gen: {names: {normal: "C"}}}, {year: 2000})
        translation('fra_d', {gen: {names: {normal: "D"}}}, {year: 1995})
        build_extra_overlay()
        expect(read_extra('fra_a').book_names['gen']!.normal).toBe("C")
    })

    it("Skips translations without converted books", ({expect}) => {
        write_files({'dist/bibles/deu_empty/usfm/gen.usfm': ''})
        translation('deu_a', {gen: {names: {normal: "Genesis"}}})
        build_extra_overlay()
        expect(read_extra('deu_a').book_names['gen']!.normal).toBe("Genesis")
        expect(() => read_extra('deu_empty')).toThrow()
    })

    it("Forces English book names and abbreviations to the canonical set", ({expect}) => {
        translation('eng_a', {
            gen: {names: {normal: "Genesis", abbrev: "GEN"}},
            exo: {names: {normal: "The Exodus"}},
        }, {})
        translation('eng_b', {
            gen: {names: {normal: "First Book", long: "The First Book", abbrev: "Gn"}},
            exo: {names: {abbrev: "X"}},
        }, {})
        build_extra_overlay()
        // Only 'long' is borrowed (the rest are canonical regardless)
        expect(read_extra('eng_a').book_names).toEqual({
            gen: {normal: "Genesis", long: "The First Book", abbrev: "Gen"},
            exo: {normal: "Exodus", long: '', abbrev: "Exo"},
        })
        expect(console.info).toHaveBeenCalledWith(
            "Applied 7 canonical English name field(s) across 2 translation(s)")
    })
})

