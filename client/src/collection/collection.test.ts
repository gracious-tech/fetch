
import {describe, it} from 'vitest'

import {FetchCollection} from './collection.js'
import {RequestHandler} from '../assets/request.js'

import type {DistManifest, DistManifestItem, MetaRestrictions} from '../assets/shared_types.js'


const open:MetaRestrictions = {forbid_limitless: false, forbid_commercial: false,
    forbid_derivatives: false, forbid_attributionless: false, forbid_other: false}


// A resource with the given books and licenses
function resource(books_ot:true|string[], books_nt:true|string[],
        licenses:DistManifestItem['copyright']['licenses']):DistManifestItem{
    return {name: {local: '', local_abbrev: '', english: 'X', english_abbrev: 'X'}, year: 2000,
        books_ot, books_nt, direction: 'ltr', tags: [],
        copyright: {attribution: '', attribution_url: '', licenses}}
}


// Construct directly (as the client does after sanitizing) from a single manifest
function collection(bibles:Record<string, DistManifestItem>){
    const manifest:DistManifest = {bibles, glosses: {}, notes: {},
        languages: {eng: {local: 'English', english: 'English', pop: 1, direction: 'ltr'}},
        language2to3: {}, languages_most_spoken: [], books_ordered: [], book_names_english: {},
        licenses: {open: {name: 'Open', restrictions: open}}}
    return new FetchCollection({commercial: true, attributionless: false, limitless: false,
        derivatives: false}, new RequestHandler(false), [['https://x/', manifest]])
}


describe('FetchCollection', () => {

    it("Resolves standard and custom licenses, dropping unknown ones", ({expect}) => {
        const c = collection({eng_a: resource(true, true, [
            {license: 'open', url: 'https://open'},
            {license: 'unknown', url: 'https://unknown'},
            {license: {...open, forbid_other: true}, url: 'https://custom'},
        ])})
        expect(c.bibles.get_resource('eng_a')!.licenses.map(l => [l.id, l.name])).toEqual([
            ['open', 'Open'], [null, 'Custom license']])
    })

    it("Excludes resources with no license compatible with the usage", ({expect}) => {
        const c = collection({eng_nc: resource(true, true,
            [{license: {...open, forbid_commercial: true}, url: ''}])})
        expect(c.bibles.has_resource('eng_nc')).toBe(false)
    })

    it("Expands whole testaments into book lists", ({expect}) => {
        const c = collection({
            eng_ot: resource(true, ['mat'], [{license: 'open', url: ''}]),
            eng_nt: resource(['gen'], true, [{license: 'open', url: ''}]),
        })
        expect(c.bibles.get_books('eng_ot')).toHaveLength(40)
        expect(c.bibles.get_books('eng_nt')).toHaveLength(28)
    })
})
