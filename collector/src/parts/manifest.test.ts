
import {existsSync, readFileSync} from 'node:fs'

import {describe, it, vi, beforeEach} from 'vitest'

import {_missing_meta, _missing_meta_fields, update_manifest} from './manifest.js'
import {books_ordered} from './bible.js'
import {use_temp_cwd, write_files} from './test_utils.js'

import type {DistManifest} from './shared_types'
import type {TranslationSourceMeta} from './types'


// Valid source meta, with the given overrides
function meta(extra:Partial<TranslationSourceMeta>={}){
    return {
        name: {local: "Local", local_abbrev: "LOC", english: "English", english_abbrev: "ENG"},
        year: 2000,
        direction: 'ltr',
        copyright: {attribution: "Someone", attribution_url: '',
            licenses: [{license: 'cc-by', url: ''}]},
        tags: [],
        ids: {},
        source: {service: 'manual', format: 'usx', url: null, updated: '2000-01-01', revision: 0},
        ...extra,
    }
}

// Dist files for the given books in each of the given formats (empty but valid txt)
function dist_books(dir:string, books:readonly string[], formats=['html', 'txt']){
    const files:Record<string, unknown> = {}
    for (const format of formats){
        for (const book of books){
            files[`${dir}/${format}/${book}.json`] =
                {book, name: {normal: '', long: '', abbrev: ''}, contents: []}
        }
    }
    return files
}


describe('_missing_meta_fields', () => {

    it("Lists every missing required field", ({expect}) => {
        const name = {local: '', local_abbrev: '', english: '', english_abbrev: ''}
        const copyright = {attribution: '', attribution_url: '', licenses: []}
        expect(_missing_meta_fields({year: null, copyright, name}))
            .toEqual(['year', 'licenses', 'name', 'abbrev'])
        expect(_missing_meta({year: null, copyright, name})).toBe(true)
    })

    it("Accepts either a local or English name and abbreviation", ({expect}) => {
        const licenses = [{license: 'x', url: ''}]
        const copyright = {attribution: '', attribution_url: '', licenses}
        expect(_missing_meta_fields({year: 1, copyright,
            name: {local: "L", local_abbrev: '', english: '', english_abbrev: "E"}})).toEqual([])
        expect(_missing_meta({year: 1, copyright,
            name: {local: '', local_abbrev: "L", english: "E", english_abbrev: ''}})).toBe(false)
    })
})


describe('update_manifest', () => {

    use_temp_cwd()

    beforeEach(() => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    it("Includes only complete, processed resources", async ({expect}) => {
        write_files({
            'sources/languages.json': {
                languages: {
                    eng: {local: "English", english: "English", pop: 1, direction: 'ltr'},
                    spa: {local: "Español", english: "Spanish", pop: 1, direction: 'ltr'},
                    fra: {local: "Français", english: "French", pop: 1, direction: 'ltr'},
                },
                language2to3: {en: 'eng', es: 'spa', fr: 'fra'},
                macro_to_individual: {},
            },
            // Whole Bible with optional props
            'sources/bibles/eng_full/meta.json': meta({partial: ['gen'], script: 'Latn',
                region: 'US', description: "Full"}),
            ...dist_books('dist/bibles/eng_full', books_ordered),
            // Only books present in every format count
            'sources/bibles/spa_part/meta.json': meta(),
            ...dist_books('dist/bibles/spa_part', ['gen', 'mat'], ['html']),
            ...dist_books('dist/bibles/spa_part', ['gen'], ['txt']),
            // Not processed yet
            'sources/bibles/fra_nodist/meta.json': meta(),
            // Missing a year
            'sources/bibles/fra_noyear/meta.json': meta({year: null}),
            ...dist_books('dist/bibles/fra_noyear', ['gen']),
            // No books in common across formats
            'sources/bibles/fra_nobooks/meta.json': meta(),
            ...dist_books('dist/bibles/fra_nobooks', ['gen'], ['html']),
            ...dist_books('dist/bibles/fra_nobooks', ['exo'], ['txt']),
            // Glosses (skipping the special originals dir)
            'sources/glosses/gbt/.original/json/gen.json': {},
            'sources/glosses/gbt/eng_gbt/meta.json':
                {...meta(), source: {...meta().source, service: 'gbt', format: null}},
            ...dist_books('dist/glosses/eng_gbt', books_ordered.slice(39), ['json']),
            // Notes
            'sources/notes/tyndale/eng_tyndale/meta.json':
                {...meta(), source: {...meta().source, format: null}},
            ...dist_books('dist/notes/eng_tyndale', ['gen'], ['json']),
            // Manifest at its old location
            'dist/bibles/manifest.json': {},
        })

        await update_manifest()
        const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8')) as DistManifest

        expect(Object.keys(manifest.bibles).sort()).toEqual(['eng_full', 'spa_part'])
        expect(manifest.bibles['eng_full']).toMatchObject(
            {books_ot: true, books_nt: true, partial: ['gen'], script: 'Latn', region: 'US'})
        expect(manifest.bibles['spa_part']).toMatchObject({books_ot: ['gen'], books_nt: []})
        expect(manifest.bibles['spa_part']).not.toHaveProperty('partial')
        expect(manifest.bibles['spa_part']).not.toHaveProperty('script')
        expect(manifest.glosses['eng_gbt']).toMatchObject({books_ot: [], books_nt: true})
        expect(manifest.notes['eng_tyndale']).toMatchObject({books_ot: ['gen'], books_nt: []})

        // Only languages that have a resource
        expect(Object.keys(manifest.languages).sort()).toEqual(['eng', 'spa'])
        expect(manifest.language2to3).toEqual({en: 'eng', es: 'spa'})

        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/fra_noyear .*year/))
        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/fra_nobooks .*no books/))
        expect(existsSync('dist/bibles/manifest.json')).toBe(false)

        // Descriptions are generated for the included Bibles
        expect(JSON.parse(readFileSync('dist/descriptions/bibles/eng.json', 'utf8')))
            .toEqual({eng_full: {english: "Full"}})
    })
})

