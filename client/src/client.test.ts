
import {describe, it, vi, afterEach} from 'vitest'

import {FetchClient} from './client.js'
import * as index from './index.js'


// Restrictions for an open and a non-commercial license
const open = {forbid_limitless: false, forbid_commercial: false, forbid_derivatives: false,
    forbid_attributionless: false, forbid_other: false}
const nc = {...open, forbid_commercial: true}


// A manifest resource entry
function resource(english:string, license='open'){
    return {
        name: {local: '', local_abbrev: '', english, english_abbrev: english.slice(0, 3)},
        year: 2020, books_ot: ['gen'], books_nt: true, direction: 'ltr', tags: [],
        copyright: {attribution: 'Owner', attribution_url: 'https://owner',
            licenses: [{license, url: 'https://license'}]},
    }
}


// A manifest with the given bibles
function manifest(bibles:Record<string, unknown>, extra:Record<string, unknown>={}){
    return JSON.stringify({
        bibles,
        glosses: {eng_gloss: resource('Glosses')},
        notes: {eng_notes: resource('Notes')},
        languages: {eng: {local: 'English', english: 'English', pop: 1, direction: 'ltr'}},
        language2to3: {en: 'eng'},
        languages_most_spoken: ['eng'],
        books_ordered: [],
        book_names_english: {},
        licenses: {open: {name: 'Open', restrictions: open}, nc: {name: 'NC', restrictions: nc}},
        ...extra,
    })
}


// Stub fetch to serve the given url -> body map (404 otherwise), recording requested urls
function serve(files:Record<string, string>){
    const urls:string[] = []
    vi.stubGlobal('fetch', vi.fn((url:string) => {
        urls.push(url)
        const body = files[url]
        return Promise.resolve(body === undefined ? new Response('', {status: 404})
            : new Response(body))
    }))
    return urls
}


afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('FetchClient.fetch_collection', () => {

    it("Defaults to the official endpoint", async ({expect}) => {
        const urls = serve({'https://v1.fetch.bible/manifest.json': manifest({eng_a: resource('A')})})
        const client = new FetchClient()
        const collection = await client.fetch_collection()
        expect(urls).toEqual(['https://v1.fetch.bible/manifest.json'])
        expect(client.collection).toBe(collection)
        expect(collection.bibles.get_resource('eng_a')!.name).toBe('A')
    })

    it("Merges endpoints with the first having priority", async ({expect}) => {
        serve({
            'https://one/manifest.json': manifest({eng_a: resource('One A')}),
            'https://two/manifest.json': manifest({eng_a: resource('Two A'),
                eng_b: resource('Two B')}),
        })
        const collection = await new FetchClient({endpoints: ['https://one/', 'https://two/']})
            .fetch_collection()
        expect(collection.bibles.get_resource('eng_a')!.name).toBe('One A')
        expect(collection.bibles.get_book_url('eng_a', 'gen')).toBe(
            'https://one/bibles/eng_a/html/gen.json')
        expect(collection.bibles.get_book_url('eng_b', 'gen')).toBe(
            'https://two/bibles/eng_b/html/gen.json')
    })

    it("Excludes resources whose licenses don't allow the intended usage", async ({expect}) => {
        serve({'https://x/manifest.json': manifest({eng_open: resource('Open'),
            eng_nc: resource('NC', 'nc')})})
        const commercial = await new FetchClient({endpoints: ['https://x/'],
            usage: {commercial: true}}).fetch_collection()
        expect(commercial.bibles.has_resource('eng_open')).toBe(true)
        expect(commercial.bibles.has_resource('eng_nc')).toBe(false)
    })

    it("Survives invalid manifest entries", async ({expect}) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        serve({'https://x/manifest.json': manifest({eng_a: resource('A'), eng_bad: {}},
            {languages: {eng: {english: 'English'}}})})
        const collection = await new FetchClient({endpoints: ['https://x/']}).fetch_collection()
        expect(collection.bibles.get_languages().map(l => l.name_local)).toEqual(['English'])
        expect(collection.bibles.has_resource('eng_bad')).toBe(false)
        expect(warn).toHaveBeenCalledOnce()
    })

    it("Fetches glosses and notes through their collections", async ({expect}) => {
        serve({
            'https://x/manifest.json': manifest({eng_a: resource('A')}),
            'https://x/glosses/eng_gloss/json/gen.json': JSON.stringify({contents: []}),
            'https://x/notes/eng_notes/txt/gen.json': JSON.stringify({book: 'gen', verses: {},
                ranges: []}),
            'https://x/notes/eng_notes/html/gen.json': JSON.stringify({book: 'gen', verses: {},
                ranges: []}),
        })
        const collection = await new FetchClient({endpoints: ['https://x/']}).fetch_collection()
        expect((await collection.glosses.fetch_glosses('eng_gloss', 'gen')).get_words(1, 1))
            .toEqual([])
        expect((await collection.notes.fetch_notes('eng_notes', 'gen', 'txt'))
            .get_verse_notes(1, 1)).toBe('')
        expect((await collection.notes.fetch_notes('eng_notes', 'gen')).get_verse_notes(1, 1))
            .toBe('')
        expect(() => collection.glosses.get_book_url('eng_gloss', 'xyz')).toThrow('not valid')
    })
})


describe('FetchClient direct fetches', () => {

    const client = new FetchClient({endpoints: ['https://a/'], data_endpoint: 'https://data/',
        remember_fetches: false})

    it("Fetches books in each format from the data endpoint", async ({expect}) => {
        const urls = serve({
            'https://data/bibles/eng_a/html/gen.json': JSON.stringify({contents: [[], [['', 'x',
                '']]]}),
            'https://data/bibles/eng_a/txt/gen.json': JSON.stringify({contents: [[], [[], ['y']]]}),
            'https://data/bibles/eng_a/usx/gen.usx': '<usx/>',
            'https://data/bibles/eng_a/usfm/gen.usfm': '\\id GEN',
        })
        expect((await client.fetch_book('eng_a', 'gen')).get_whole()).toBe('x')
        expect((await client.fetch_book('eng_a', 'gen', 'txt')).get_whole()).toBe('y')
        expect((await client.fetch_book('eng_a', 'gen', 'usx')).get_whole()).toBe('<usx/>')
        expect((await client.fetch_book('eng_a', 'gen', 'usfm')).get_whole()).toBe('\\id GEN')
        expect(urls).toHaveLength(4)
    })

    it("Fetches extras, glosses, notes, crossrefs, sections and search data", async ({expect}) => {
        serve({
            'https://data/bibles/eng_a/extra.json': JSON.stringify({book_names: {}, wj_markup: true,
                chapter_headings: {}, sections: {}}),
            'https://data/glosses/eng_g/json/jhn.json': JSON.stringify({contents: []}),
            'https://data/notes/eng_n/html/jhn.json': JSON.stringify({book: 'jhn', verses: {},
                ranges: []}),
            'https://data/notes/eng_n/txt/jhn.json': JSON.stringify({book: 'jhn', verses: {},
                ranges: []}),
            'https://data/crossref/medium/jhn.json': JSON.stringify({1: {1: [['gen', 1, 1]]}}),
            'https://data/crossref/small/jhn.json': JSON.stringify({}),
            'https://data/sections/sections.json': JSON.stringify({model: 'm', generated: 'g',
                sections: {}}),
            'https://data/search/nt/strongs.json': JSON.stringify({id: 'nt', source: 's', url: 'u',
                books: {}}),
        })
        expect((await client.fetch_translation_extras('eng_a')).wj_markup).toBe(true)
        expect((await client.fetch_glosses('eng_g', 'jhn')).get_words(1, 1)).toEqual([])
        expect((await client.fetch_notes('eng_n', 'jhn')).get_verse_notes(1, 1)).toBe('')
        expect((await client.fetch_notes('eng_n', 'jhn', 'txt')).get_verse_notes(1, 1)).toBe('')
        expect((await client.fetch_crossref('jhn')).get_refs(1, 1)).toHaveLength(1)
        expect((await client.fetch_crossref('jhn', 'small')).get_refs(1, 1)).toEqual([])
        expect((await client.fetch_sections()).model).toBe('m')
        expect((await client.fetch_search('nt', 'strongs')).id).toBe('nt')
    })

    it("Uses the first endpoint for data by default", async ({expect}) => {
        const urls = serve({'https://a/sections/sections.json': JSON.stringify({model: 'm',
            generated: 'g', sections: {}})})
        await new FetchClient({endpoints: ['https://a/']}).fetch_sections()
        expect(urls).toEqual(['https://a/sections/sections.json'])
    })
})


describe('index exports', () => {

    it("Exports the public API", ({expect}) => {
        expect(index.FetchClient).toBe(FetchClient)
        expect(typeof index.wrap_verse_parts).toBe('function')
        expect(typeof index.PassageReference).toBe('function')
        expect(index.substantial_poetry).toContain('psa')
        expect(new index.FetchNetworkError('x').name).toBe('FetchNetworkError')
    })
})
