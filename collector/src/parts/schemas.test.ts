
import {readFileSync} from 'node:fs'

import {describe, it} from 'vitest'

import {LICENSES} from './license.js'
import {translation_source_meta, validate_manifest, write_translation_meta} from './schemas.js'
import {use_temp_cwd} from './test_utils.js'

import type {DistManifest, DistManifestItem} from './shared_types'
import type {TranslationSourceMeta} from './types'


// A valid manifest item for the given books (true = all books of that testament)
function item(books_ot:true|string[]=['gen'], books_nt:true|string[]=true):DistManifestItem{
    return {
        name: {local: "Local", local_abbrev: "LOC", english: "English", english_abbrev: "ENG"},
        year: 2000,
        books_ot,
        books_nt,
        copyright: {attribution: "Someone", attribution_url: '',
            licenses: [{license: 'cc-by', url: ''}]},
        direction: 'ltr',
        tags: [],
    }
}

// A valid manifest containing the given bibles
function manifest(bibles:Record<string, DistManifestItem>):DistManifest{
    return {
        bibles,
        glosses: {},
        notes: {},
        languages: {eng: {local: "English", english: "English", pop: 1, direction: 'ltr'}},
        language2to3: {en: 'eng'},
        languages_most_spoken: ['eng'],
        books_ordered: ['gen', 'exo', 'mat'],
        book_names_english: {gen: "Genesis", exo: "Exodus", mat: "Matthew"},
        licenses: {'cc-by': LICENSES['cc-by']!},
    }
}


describe('validate_manifest', () => {

    it("Returns a valid manifest", ({expect}) => {
        const data = manifest({eng_one: item(), eng_two: {...item([], ['mat']), partial: ['mat']}})
        expect(validate_manifest(data, 'test')).toEqual(data)
    })

    it("Accepts custom license restrictions that aren't in the standard list", ({expect}) => {
        const custom = item()
        custom.copyright.licenses = [{license: LICENSES['cc-by']!.restrictions, url: ''}]
        expect(() => validate_manifest(manifest({eng_one: custom}), 'test')).not.toThrow()
    })

    it("Rejects data that doesn't match the manifest structure", ({expect}) => {
        expect(() => validate_manifest({bibles: {}}, 'test')).toThrow()
        expect(() => validate_manifest(null, 'test')).toThrow()
    })

    it("Reports every cross-reference problem at once", ({expect}) => {
        const unnamed = item()
        unnamed.name = {local: '', local_abbrev: '', english: '', english_abbrev: ''}
        const unlicensed = item(['gen', 'rev'], true)
        unlicensed.copyright.licenses = []
        const unknown_license = {...item(), partial: ['lev']}
        unknown_license.copyright = {...unknown_license.copyright,
            licenses: [{license: 'cc-unknown', url: ''}]}
        const data = manifest({
            xyz_one: item(),
            eng_unnamed: unnamed,
            eng_empty: item([], []),
            eng_unlicensed: unlicensed,
            eng_license: unknown_license,
        })
        data.glosses = {eng_gloss: item([], [])}

        let message = ''
        try {
            validate_manifest(data, 'test')
        } catch (error){
            message = (error as Error).message
        }
        expect(message.split('\n')).toEqual([
            "Invalid manifest from test:",
            'bibles/xyz_one: language "xyz" missing from languages',
            "bibles/eng_unnamed: no name",
            "bibles/eng_unnamed: no abbreviation",
            "bibles/eng_empty: no books",
            'bibles/eng_unlicensed: unknown book "rev"',
            "bibles/eng_unlicensed: no licenses",
            'bibles/eng_license: unknown book "lev"',
            'bibles/eng_license: unknown license "cc-unknown"',
            "glosses/eng_gloss: no books",
        ])
    })
})


describe('translation_source_meta', () => {

    // A valid source meta with the given extra props
    function source_meta(extra:Record<string, unknown>):Record<string, unknown>{
        return {
            name: {local: "Local", local_abbrev: "LOC", english: "English", english_abbrev: "ENG"},
            year: 2000,
            direction: 'ltr',
            copyright: {attribution: "Someone", attribution_url: '', licenses: []},
            tags: [],
            ids: {},
            source: {service: 'manual', format: 'usx', url: null, updated: '2000-01-01',
                revision: 0},
            ...extra,
        }
    }

    it('accepts provenance and a description of up to 100 chars', ({expect}) => {
        const meta = source_meta({provenance: "ASV", description: 'x'.repeat(100)})
        expect(translation_source_meta.safeParse(meta).success).toBe(true)
    })

    it('accepts one literal tag but not several', ({expect}) => {
        expect(translation_source_meta.safeParse(source_meta({tags: ['niche', 'literal3']}))
            .success).toBe(true)
        expect(translation_source_meta.safeParse(source_meta({tags: ['literal1', 'literal2']}))
            .success).toBe(false)
    })

    it('accepts one NT source tag but not both byz and alex', ({expect}) => {
        expect(translation_source_meta.safeParse(source_meta({tags: ['byz', 'literal2']})).success)
            .toBe(true)
        expect(translation_source_meta.safeParse(source_meta({tags: ['byz', 'alex']})).success)
            .toBe(false)
    })

    it('rejects an empty or over-long description', ({expect}) => {
        expect(translation_source_meta.safeParse(source_meta({description: ''})).success)
            .toBe(false)
        expect(translation_source_meta.safeParse(source_meta({description: 'x'.repeat(101)}))
            .success).toBe(false)
    })
})


describe('write_translation_meta', () => {

    use_temp_cwd()

    const meta:TranslationSourceMeta = {
        name: {local: "Local", local_abbrev: "LOC", english: "English", english_abbrev: "ENG"},
        year: 2000,
        direction: 'ltr',
        copyright: {attribution: "Someone", attribution_url: '', licenses: []},
        tags: [],
        ids: {},
        source: {service: 'manual', format: 'usx', url: null, updated: '2000-01-01', revision: 0},
    }

    it("Writes valid meta indented", ({expect}) => {
        write_translation_meta('meta.json', meta)
        expect(readFileSync('meta.json', 'utf8')).toBe(JSON.stringify(meta, undefined, 4))
    })

    it("Refuses to write invalid meta", ({expect}) => {
        expect(() => write_translation_meta('meta.json', {...meta, year: 1.5}))
            .toThrow("Invalid data from meta.json")
    })
})

