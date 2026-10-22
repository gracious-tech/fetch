
import {describe, it, vi, beforeAll, afterAll} from 'vitest'
import {FetchClient} from '@gracious.tech/fetch-client'

import {BibleIndex} from './main.js'
import {strip_objects_from_txt, strip_tags_and_commentary} from './strip.js'

import type {FetchCollection} from '@gracious.tech/fetch-client'


// John 1 verses used for both txt and html formats
const verses = ['', 'In the beginning was the Word', 'The same was in the beginning with God',
    'All things were made by the Word', 'In him was light', 'The light shines, light upon light',
    'A light again']


// Serve a single-translation collection with John in txt and html formats
function serve(){
    const open = {forbid_limitless: false, forbid_commercial: false, forbid_derivatives: false,
        forbid_attributionless: false, forbid_other: false}
    const files:Record<string, string> = {
        'https://x/manifest.json': JSON.stringify({
            bibles: {eng_test: {
                name: {local: '', local_abbrev: '', english: 'Test', english_abbrev: 'TST'},
                year: 2000, books_ot: [], books_nt: ['jhn'], direction: 'ltr', tags: [],
                copyright: {attribution: 'Owner', attribution_url: '',
                    licenses: [{license: 'open', url: ''}]},
            }},
            glosses: {}, notes: {}, language2to3: {}, languages_most_spoken: [],
            books_ordered: [], book_names_english: {},
            languages: {eng: {local: 'English', english: 'English', pop: 1, direction: 'ltr'}},
            licenses: {open: {name: 'Open', restrictions: open}},
        }),
        'https://x/bibles/eng_test/txt/jhn.json': JSON.stringify({book: 'jhn', contents: [[],
            verses.map((text, i) => i ? [{type: 'heading', contents: 'Heading', level: 1},
                text, {type: 'note', contents: 'note'}] : [])]}),
        'https://x/bibles/eng_test/html/jhn.json': JSON.stringify({book: 'jhn', contents: [[],
            verses.map((text, i) => i ? ['<p>', `<sup data-v="1:${i}">${i}</sup>${text}`
                + '<span class="fb-note"><span>beginning note</span></span>', '</p>']
                : ['', '', ''])]}),
    }
    vi.stubGlobal('fetch', (url:string) => Promise.resolve(url in files
        ? new Response(files[url]) : new Response('', {status: 404})))
}


let collection:FetchCollection
beforeAll(async () => {
    serve()
    collection = await new FetchClient({endpoints: ['https://x/']}).fetch_collection()
})
afterAll(() => {
    vi.unstubAllGlobals()
})


// Index John in the given format
async function indexed(format:'txt'|'html'){
    const index = new BibleIndex(collection, 'eng_test', format)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await index.index_all_books()
    return index
}


describe('BibleIndex', () => {

    it("Finds keywords, grouping consecutive verses and highlighting matches", async ({expect}) => {
        const index = await indexed('txt')
        const results = await index.search('beginning')
        expect(results.map(r => r.ref.toString())).toEqual(['John 1:1-2'])
        expect(results[0]!.contents).toBe('In the _beginning_ was the Word '
            + 'The same was in the _beginning_ with God')
    })

    it("Can return ungrouped results with a custom marker", async ({expect}) => {
        const index = await indexed('txt')
        const results = await index.search('beginning', false, '*')
        expect(results.map(r => r.ref.toString()).sort()).toEqual(['John 1:1', 'John 1:2'])
        expect(results[0]!.contents).toContain('*beginning*')
    })

    it("Keeps non-adjacent verses separate", async ({expect}) => {
        const index = await indexed('txt')
        const results = await index.search('word')
        expect(results.map(r => r.ref.toString()).sort()).toEqual(['John 1:1', 'John 1:3'])
    })

    it("Groups verses that are ranked out of order", async ({expect}) => {
        const index = await indexed('txt')
        expect((await index.search('light')).map(r => r.ref.toString())).toEqual(['John 1:4-6'])
    })

    it("Sorts results by number of matches", async ({expect}) => {
        const index = await indexed('txt')
        const results = await index.search('light', false)
        expect(results.map(r => r.ref.toString())[0]).toBe('John 1:5')
        expect(results).toHaveLength(3)
    })

    it("Returns no results when nothing matches", async ({expect}) => {
        const index = await indexed('txt')
        expect(await index.search('zebra')).toEqual([])
    })

    it("Puts explicitly referenced passages first", async ({expect}) => {
        const index = await indexed('txt')
        const results = await index.search('John 1:3 beginning')
        expect(results.map(r => r.ref.toString())).toEqual(['John 1:3', 'John 1:1-2'])
        expect(results[0]!.contents).toBe('All things were made by the Word')
    })

    it("Ignores references to books the Bible doesn't have", async ({expect}) => {
        const index = await indexed('txt')
        expect(await index.search('Genesis 1:1')).toEqual([])
    })

    it("Indexes HTML without tags, verse numbers or notes", async ({expect}) => {
        const index = await indexed('html')
        const results = await index.search('beginning')
        expect(results.map(r => r.ref.toString())).toEqual(['John 1:1-2'])
        expect(results[0]!.contents).toContain('<mark>beginning</mark>')
        expect(results[0]!.contents).not.toContain('note')
        const passage = await index.search('John 1:4')
        expect(passage[0]!.contents.trim()).toBe('In him was light')
    })
})


describe('strip helpers', () => {

    it("Strips tags, verse numbers, headings and notes from HTML", ({expect}) => {
        expect(strip_tags_and_commentary('<h3>Head</h3><p><sup data-v="1:1">1</sup>Text'
            + '<span class="fb-note"><span>note</span></span> more</p>'))
            .toBe('  Text more ')
    })

    it("Keeps only the text of txt content", ({expect}) => {
        expect(strip_objects_from_txt(['a ', {type: 'heading', contents: 'H', level: 1}, 'b']))
            .toBe('a b')
    })
})
