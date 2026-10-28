
import {existsSync, readFileSync} from 'node:fs'

import {describe, it, vi} from 'vitest'

import {build_descriptions, update_descriptions} from './descriptions.js'
import {read_unpublished, clear_unpublished} from './unpublished.js'
import {use_temp_cwd, write_files} from './test_utils.js'

import type {TranslationSourceMeta} from './types'


// Source meta with only the fields relevant to descriptions
function meta(extra:Partial<TranslationSourceMeta>):TranslationSourceMeta{
    return {
        name: {local: '', local_abbrev: '', english: 'X', english_abbrev: 'X'},
        year: 2000,
        direction: 'ltr',
        copyright: {attribution: '', attribution_url: '', licenses: []},
        tags: [],
        ids: {},
        source: {service: 'manual', format: 'usx', url: null, updated: '2000-01-01', revision: 0},
        ...extra,
    }
}


describe('build_descriptions()', () => {

    it("Groups by language and keeps only the parts present", ({expect}) => {
        const result = build_descriptions({
            spa_b: meta({description: "English b", description_local: "Local b"}),
            eng_a: meta({provenance: "ASV"}),
            eng_c: meta({description: "English c", provenance: "ASV"}),
        })
        expect(result).toEqual({
            eng: {eng_a: {provenance: "ASV"}, eng_c: {english: "English c", provenance: "ASV"}},
            spa: {spa_b: {english: "English b", local: "Local b"}},
        })
    })

    it("Skips translations with nothing to say", ({expect}) => {
        expect(build_descriptions({eng_a: meta({}), eng_b: meta({tags: ['niche']})})).toEqual({})
    })

})


describe('update_descriptions()', () => {

    use_temp_cwd()

    // Write source meta for each translation id
    function write_metas(metas:Record<string, Partial<TranslationSourceMeta>>){
        write_files(Object.fromEntries(Object.entries(metas).map(
            ([id, extra]) => [`sources/bibles/${id}/meta.json`, meta(extra)])))
    }

    it("Writes per-language files and only flags changes", ({expect}) => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        write_metas({eng_a: {description: "A"}, spa_b: {provenance: "RV"}, fra_c: {}})

        update_descriptions(['eng_a', 'spa_b', 'fra_c'])
        expect(JSON.parse(readFileSync('dist/descriptions/bibles/eng.json', 'utf-8')))
            .toEqual({eng_a: {english: "A"}})
        expect(existsSync('dist/descriptions/bibles/fra.json')).toBe(false)
        expect(read_unpublished()).toEqual(['descriptions/bibles'])

        // Unchanged output isn't flagged
        clear_unpublished()
        update_descriptions(['eng_a', 'spa_b', 'fra_c'])
        expect(read_unpublished()).toEqual([])
    })

    it("Removes files for languages without descriptions anymore", ({expect}) => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        write_metas({eng_a: {description: "A"}})
        write_files({'dist/descriptions/bibles/spa.json': {spa_b: {english: "B"}}})

        update_descriptions(['eng_a'])
        expect(existsSync('dist/descriptions/bibles/spa.json')).toBe(false)
        expect(read_unpublished()).toEqual(['descriptions/bibles'])

        // Only a removal still flags as changed
        clear_unpublished()
        write_files({'dist/descriptions/bibles/spa.json': {spa_b: {english: "B"}}})
        update_descriptions(['eng_a'])
        expect(read_unpublished()).toEqual(['descriptions/bibles'])
    })

})
