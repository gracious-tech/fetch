
import {describe, it} from 'vitest'
import {books_ordered} from '@gracious.tech/bible-references'

import {BibleCollection} from './bibles.js'
import {RequestHandler} from '../assets/request.js'

import type {RuntimeManifestItem, UsageConfig} from '../assets/types.js'
import type {DistTranslationExtra} from '../assets/shared_types.js'


// Permissive usage config (all false means "don't require this permission", so nothing filtered)
const usage:UsageConfig = {commercial: false, attributionless: false, limitless: false, derivatives: false}


// Build a minimal fake resource entry for tests
function make_item(overrides:Partial<RuntimeManifestItem> & {endpoint:string}):RuntimeManifestItem{
    return {
        name: {local: '', local_abbrev: '', english: 'Test', english_abbrev: 'TST'},
        year: 2000,
        books_ot: [],
        books_nt: [],
        books_ot_list: [],
        books_nt_list: [],
        direction: 'ltr',
        tags: [],
        copyright: {
            attribution: 'Owner',
            attribution_url: 'https://example.com/license',
            licenses: [{
                id: 'test',
                name: 'Test License',
                restrictions: {
                    forbid_limitless: false,
                    forbid_commercial: false,
                    forbid_derivatives: false,
                    forbid_attributionless: false,
                    forbid_other: false,
                },
                url: 'https://example.com/license',
            }],
        },
        ...overrides,
    }
}


// Build a collection with an OT-only, an NT-only, and a full-Bible resource for testing composites
function make_collection(){
    const ot_id = 'hbo_wlc'
    const nt_id = 'grc_sblgnt'
    const full_id = 'eng_bsb'

    const items:Record<string, RuntimeManifestItem> = {
        [ot_id]: make_item({
            endpoint: 'https://ot.example/',
            direction: 'rtl',
            books_ot: true,
            books_ot_list: books_ordered.slice(0, 39),
            name: {local: 'עברית', local_abbrev: 'עברית', english: 'Hebrew OT', english_abbrev: 'WLC'},
            copyright: {
                attribution: 'OT Owner',
                attribution_url: 'https://ot.example/license',
                licenses: [],
            },
        }),
        [nt_id]: make_item({
            endpoint: 'https://nt.example/',
            direction: 'ltr',
            books_nt: true,
            books_nt_list: books_ordered.slice(39),
            name: {local: 'Ελληνικά', local_abbrev: 'Ελληνικά', english: 'Greek NT',
                english_abbrev: 'SBLGNT'},
            copyright: {
                attribution: 'NT Owner',
                attribution_url: 'https://nt.example/license',
                licenses: [],
            },
        }),
        [full_id]: make_item({
            endpoint: 'https://full.example/',
            books_ot: true,
            books_nt: true,
            books_ot_list: books_ordered.slice(0, 39),
            books_nt_list: books_ordered.slice(39),
            name: {local: '', local_abbrev: '', english: 'Berean Standard Bible',
                english_abbrev: 'BSB'},
        }),
    }

    const languages = {
        hbo: {local: 'עברית', english: 'Hebrew', pop: null, direction: 'rtl' as const},
        grc: {local: 'Ελληνικά', english: 'Greek', pop: null, direction: 'ltr' as const},
        eng: {local: 'English', english: 'English', pop: 1000, direction: 'ltr' as const},
    }

    const collection = new BibleCollection(items, new RequestHandler(false), languages, {}, [], usage)
    return {collection, ot_id, nt_id, full_id, composite: `${ot_id}|${nt_id}`}
}


describe('has_resource', () => {

    it("Recognises a valid composite id", ({expect}) => {
        const {collection, composite} = make_collection()
        expect(collection.has_resource(composite)).toBe(true)
    })

    it("Rejects a composite id with a missing half", ({expect}) => {
        const {collection, ot_id} = make_collection()
        expect(collection.has_resource(`${ot_id}|nonexistent`)).toBe(false)
    })

    it("Rejects a composite id with the wrong number of parts", ({expect}) => {
        const {collection} = make_collection()
        expect(collection.has_resource('a|b|c')).toBe(false)
    })

    it("Still recognises normal (non-composite) ids", ({expect}) => {
        const {collection, full_id} = make_collection()
        expect(collection.has_resource(full_id)).toBe(true)
        expect(collection.has_resource('nonexistent')).toBe(false)
    })

})


describe('has_book', () => {

    it("Routes an OT book to the OT half and an NT book to the NT half", ({expect}) => {
        const {collection, composite} = make_collection()
        expect(collection.has_book(composite, 'gen')).toBe(true)
        expect(collection.has_book(composite, 'mat')).toBe(true)
    })

    it("Confirms the OT-only resource alone does not have NT books", ({expect}) => {
        const {collection, ot_id} = make_collection()
        expect(collection.has_book(ot_id, 'mat')).toBe(false)
    })

})


describe('get_book_url', () => {

    it("Resolves an OT book to the OT resource's endpoint and real id", ({expect}) => {
        const {collection, composite} = make_collection()
        expect(collection.get_book_url(composite, 'gen', 'usx'))
            .toBe('https://ot.example/bibles/hbo_wlc/usx/gen.usx')
    })

    it("Resolves an NT book to the NT resource's endpoint and real id", ({expect}) => {
        const {collection, composite} = make_collection()
        expect(collection.get_book_url(composite, 'mat', 'usx'))
            .toBe('https://nt.example/bibles/grc_sblgnt/usx/mat.usx')
    })

})


describe('fetch_book', () => {

    it("Uses the correct resource's copyright per testament", async ({expect}) => {
        const {collection, composite} = make_collection()
        collection.requester.request = async () => '<usx/>'

        const ot_book = await collection.fetch_book(composite, 'gen', 'usx')
        expect(ot_book._copyright?.attribution_url).toBe('https://ot.example/license')

        const nt_book = await collection.fetch_book(composite, 'mat', 'usx')
        expect(nt_book._copyright?.attribution_url).toBe('https://nt.example/license')
    })

})


describe('fetch_translation_extras', () => {

    it("Merges book names/headings/sections per testament and uses the NT half's wj_markup",
            async ({expect}) => {
        const {collection, ot_id, nt_id, composite} = make_collection()

        const make_extra = (book:string, wj_markup:boolean):DistTranslationExtra => ({
            book_names: {[book]: {normal: book.toUpperCase(), long: book, abbrev: book}},
            chapter_headings: {[book]: ['', 'Heading 1']},
            sections: {[book]: []},
            wj_markup,
        })

        collection.requester.request = async (url:string) => {
            if (url.includes(ot_id)){
                return JSON.stringify(make_extra('gen', false))
            }
            return JSON.stringify(make_extra('mat', true))
        }

        const extras = await collection.fetch_translation_extras(composite)
        expect(extras.wj_markup).toBe(true)
        expect(extras.get_book_name('gen').normal).toBe('GEN')
        expect(extras.get_book_name('mat').normal).toBe('MAT')
        expect(collection._local_book_names[ot_id]?.['gen']?.normal).toBe('GEN')
        expect(collection._local_book_names[nt_id]?.['mat']?.normal).toBe('MAT')
        expect(collection._local_book_names[composite]?.['gen']?.normal).toBe('GEN')
    })

})


describe('get_books', () => {

    it("Combines all 66 books in canonical order for a composite id", ({expect}) => {
        const {collection, composite} = make_collection()
        const list = collection.get_books(composite)
        expect(list.length).toBe(66)
        expect(list.map(item => item.id)).toEqual(books_ordered)
        expect(list.every(item => item.available)).toBe(true)
    })

})


describe('get_completion', () => {

    it("Combines OT completion from the OT half and NT completion from the NT half", ({expect}) => {
        const {collection, composite} = make_collection()
        const completion = collection.get_completion(composite)
        expect(completion.ot.available.length).toBe(39)
        expect(completion.nt.available.length).toBe(27)
    })

})


describe('get_resources / get_languages', () => {

    it("Never surface composite ids since they aren't real manifest entries", ({expect}) => {
        const {collection, composite} = make_collection()
        const resources = collection.get_resources()
        expect(resources.some(item => item.id === composite)).toBe(false)
    })

})


// Build a collection with a language that has resources in two scripts
function make_script_collection(){
    const full = {books_ot: true, books_nt: true, books_ot_list: books_ordered.slice(0, 39),
        books_nt_list: books_ordered.slice(39)} as const
    const items:Record<string, RuntimeManifestItem> = {
        cmn_hans: make_item({endpoint: 'https://hans.example/', script: 'Hans', year: 2010, ...full}),
        cmn_hant: make_item({endpoint: 'https://hant.example/', script: 'Hant', year: 2000, ...full}),
        eng_bsb: make_item({endpoint: 'https://eng.example/', ...full}),
        san_deva: make_item({endpoint: 'https://deva.example/', script: 'Deva', ...full}),
        san_latn: make_item({endpoint: 'https://latn.example/', script: 'Latn', ...full}),
        san_beng: make_item({endpoint: 'https://beng.example/', script: 'Beng', ...full}),
    }
    const languages = {
        cmn: {local: '中文', english: 'Chinese', pop: 1000, direction: 'ltr' as const},
        eng: {local: 'English', english: 'English', pop: 1000, direction: 'ltr' as const},
        san: {local: 'संस्कृत भाषा', english: 'Sanskrit', pop: 1000, direction: 'ltr' as const},
    }
    return new BibleCollection(items, new RequestHandler(false), languages, {zh: 'cmn'}, [], usage)
}


describe('scripts', () => {

    it("Lists each script separately only when asked", ({expect}) => {
        const collection = make_script_collection()
        expect(collection.get_languages().map(l => l.code)).toEqual(['eng', 'san', 'cmn'])
        const split = collection.get_languages({split_scripts: true, object: true})
        expect(Object.keys(split).sort()).toEqual(['cmn-Hans', 'cmn-Hant', 'eng', 'san'])
        expect(split['cmn-Hant']!.name_english).toBe("Chinese (Traditional)")
        expect(split['cmn-Hant']!.name_local).toBe("中文 (繁體)")
        expect(split['cmn-Hant']!.id).toBe('cmn-Hant')
        expect(split['cmn-Hant']!.code).toBe('cmn')
        expect(split['eng']!.id).toBe('eng')
        expect(split['eng']!.script).toBe(undefined)
    })

    it("Ignores script for languages that aren't split into two", ({expect}) => {
        const collection = make_script_collection()
        expect(collection.get_language('eng', 'Latn')!.name_english).toBe("English")
        expect(collection.get_language('san', 'Deva')!.script).toBe(undefined)
    })

    it("Filters resources by script", ({expect}) => {
        const collection = make_script_collection()
        const ids = collection.get_resources({language: 'cmn', script: 'Hant'}).map(r => r.id)
        expect(ids).toEqual(['cmn_hant'])
    })

    it("Prefers resources in the script implied by the user's language tag", ({expect}) => {
        const collection = make_script_collection()
        expect(collection.get_preferred_resource(['zh-TW']).id).toBe('cmn_hant')
        expect(collection.get_preferred_resource(['zh-CN']).id).toBe('cmn_hans')
        expect(collection.get_preferred_resource(['zh-Hant']).id).toBe('cmn_hant')
        // 3 char codes imply a script too
        expect(collection.get_preferred_resource(['cmn']).id).toBe('cmn_hans')
    })

    it("Prefers a recommended resource only within the preferred script", ({expect}) => {
        const collection = make_script_collection()
        collection._items['cmn_hans']!.tags = ['recommended']
        expect(collection.get_preferred_resource(['zh-TW']).id).toBe('cmn_hant')
        expect(collection.get_preferred_resource(['zh']).id).toBe('cmn_hans')
    })

})
