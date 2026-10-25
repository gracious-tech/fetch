
import {describe, it} from 'vitest'

import {build_descriptions} from './descriptions.js'

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
