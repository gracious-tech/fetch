// @vitest-environment jsdom

import {fake_collection} from './test_utils'

import {describe, it, vi, beforeEach, afterEach, type Mock} from 'vitest'
import {PassageReference} from '@gracious.tech/fetch-client'

import type {FetchClient, GetResourcesItem} from '@gracious.tech/fetch-client'


// Don't actually index translations
const index_all_books = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@gracious.tech/fetch-search', async original => ({
    ...await original<typeof import('@gracious.tech/fetch-search')>(),
    BibleIndex: class {
        index_all_books = index_all_books
        search = vi.fn(() => Promise.resolve([]))
    },
}))

// Record messages to parent frame
vi.mock('./post', () => ({post_message: vi.fn()}))


// Let pending watchers and promises settle
function flush(){
    return new Promise(resolve => {setTimeout(resolve)})
}


// Fresh state/content modules with watches enabled for the given translations and their books
async function load(trans:[string, ...string[]], books:Record<string, string[]>, book='gen'){
    vi.resetModules()
    const {state} = await import('./state')
    const {content} = await import('./content')
    const {post_message} = await import('./post')
    const {apply_search_param, enable_watches} = await import('./watches')

    // Fake collection and client (not reactive so must set before enabling watches)
    const collection = fake_collection(books)
    content.collection = collection
    content.translations = Object.fromEntries(
        Object.keys(books).map(id => [id, {} as GetResourcesItem]))
    const client = {
        fetch_crossref: vi.fn(() => Promise.resolve('crossref')),
        fetch_notes: vi.fn(() => Promise.resolve('notes')),
        fetch_glosses: vi.fn(() => Promise.resolve('glosses')),
    }
    content.client = client as unknown as FetchClient
    state.trans = trans
    state.book = book

    // Capture the message listener so can call it directly
    let on_message:(event:{data:unknown})=>void = () => undefined
    vi.spyOn(self, 'addEventListener').mockImplementation((type, listener) => {
        if (type === 'message'){
            on_message = listener as unknown as typeof on_message
        }
    })
    enable_watches()
    await flush()
    return {state, content, collection, client, post_message, apply_search_param, on_message}
}


describe('watches', () => {

    let cache_match:Mock<(url:string)=>Promise<Response|undefined>>
    let fetch:Mock<(url:string)=>Promise<Response>>
    beforeEach(() => {
        // Stub service worker cache, where only `*_cached` translations are already cached
        cache_match = vi.fn((url:string) =>
            Promise.resolve(url.includes('_cached/') ? new Response() : undefined))
        vi.stubGlobal('caches', {open: () => Promise.resolve({match: cache_match})})
        fetch = vi.fn((_url:string) => Promise.resolve(new Response()))
        vi.stubGlobal('fetch', fetch)
        index_all_books.mockClear()
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('translation changes', () => {

        it("Loads book names, index and caches secondary translations", async ({expect}) => {
            const {state, content, collection} = await load(
                ['spa_a', 'eng_b', 'fra_c', 'eng_cached'],
                {spa_a: ['gen', 'exo'], eng_b: ['gen'], fra_c: ['gen'], eng_cached: ['gen']})
            const extras = collection.bibles.fetch_translation_extras
            expect(extras.mock.calls.map(c => c[0 as number])).toEqual(['spa_a', 'fra_c'])
            expect(state.book_names['exo']).toBe('spa_a exo')
            expect(state.book_abbrev['exo']).toBe('exo.')
            expect(index_all_books).toHaveBeenCalledOnce()
            expect(await content.index).toBeDefined()
            // Only fetches uncached secondary books
            expect(cache_match).toHaveBeenCalledTimes(3)
            expect(fetch.mock.calls.map(c => c[0])).toEqual(
                ['https://x/eng_b/gen.json', 'https://x/fra_c/gen.json'])
        })

        it("Skips fetching names for English translation", async ({expect}) => {
            const {state, collection} = await load(['eng_a'], {eng_a: ['gen']})
            expect(collection.bibles.fetch_translation_extras).not.toHaveBeenCalled()
            expect(state.book_names['gen']).toBe('eng_a gen')
        })

        it("Clears search and reports to parent", async ({expect}) => {
            const {state, post_message} = await load(['eng_a'], {eng_a: ['gen'], eng_b: ['gen']})
            state.search = 'x'
            state.trans = ['eng_b']
            await flush()
            expect(state.search).toBe('')
            expect(post_message).toHaveBeenCalledWith('translation')
        })
    })

    describe('content loading', () => {

        it("Loads whole book and study data for a single translation", async ({expect}) => {
            const {state, client} = await load(['eng_a'], {eng_a: ['gen']})
            expect(state.content).toBe('<p>eng_a whole</p>')
            expect(state.content_verses).toEqual([])
            expect(state.glosses_id).toBe('eng_gbt')
            expect(client.fetch_notes).toHaveBeenCalledWith('eng_tyndale', 'gen')
            expect(state).toMatchObject({crossref: 'crossref', notes: 'notes', glosses: 'glosses'})
        })

        it("Loads verses with attribution for multiple translations", async ({expect}) => {
            const {state} = await load(['eng_a', 'eng_b'], {eng_a: ['gen'], eng_b: ['exo']})
            expect(state.content).toBe('')
            expect(state.content_verses).toEqual([[
                {id: 1, chapter: 1, verse: 1, content: 'eng_a v1'},
                {id: 0, chapter: 0, verse: 0, content: 'eng_a attribution'},
            ], []])
        })

        it("Changes to a valid book if primary translation lacks it", async ({expect}) => {
            const {state} = await load(['eng_a'], {eng_a: ['exo', 'lev']}, 'gen')
            expect(state.book).toBe('exo')
            expect(state.content).toBe('<p>eng_a whole</p>')
        })

        it("Flags offline if a book fails to load", async ({expect}) => {
            const {state, client} = await load(['eng_a', 'fail_b'],
                {eng_a: ['gen'], fail_b: ['gen']})
            expect(state.offline).toBe(true)
            expect(state.content_verses).toEqual([])
            expect(client.fetch_crossref).not.toHaveBeenCalled()
        })
    })

    describe('parent messages', () => {

        it("Applies valid updates from parent", async ({expect}) => {
            const {state, on_message} = await load(['eng_a'], {eng_a: ['gen'], spa_b: ['gen']})
            on_message({data: {type: 'update', dark: true, status: 's', hue: 1, saturation: 2,
                back: 'url', button1_icon: 'i', button1_color: 'c', study_notes: false,
                trans: 'spa_b,bad', search: 'love'}})
            expect(state).toMatchObject({dark: true, status: 's', hue: 1, saturation: 2,
                back: 'url', button1_icon: 'i', button1_color: 'c', study_notes: false,
                trans: ['spa_b'], search: 'love'})
            on_message({data: {type: 'update', dark: null, back: false}})
            expect(state.dark).toBe(null)
            expect(state.back).toBe(false)
        })

        it("Ignores invalid updates and other messages", async ({expect}) => {
            const {state, on_message} = await load(['eng_a'], {eng_a: ['gen']})
            const before = JSON.stringify(state)
            on_message({data: 'update'})
            on_message({data: {type: 'other', status: 's'}})
            on_message({data: {type: 'update', dark: 'yes', status: 1, hue: '1', saturation: '1',
                back: 1, button1_icon: 1, button1_color: 1, study_notes: 'no', trans: 1,
                search: 1}})
            expect(JSON.stringify(state)).toBe(before)
        })
    })

    describe('apply_search_param', () => {

        it("Goes to a reference or else searches for the value", async ({expect}) => {
            const {state, apply_search_param} = await load(['eng_a'], {eng_a: ['gen', 'jhn']})
            apply_search_param('jhn 3:16')
            expect(state).toMatchObject({book: 'jhn', chapter: 3, verse: 16, search: ''})
            expect(state.passage).toBeInstanceOf(PassageReference)
            apply_search_param('love')
            expect(state.search).toBe('love')
        })
    })

    describe('reporting and searching', () => {

        it("Reports verse and dark changes to parent", async ({expect}) => {
            const {state, post_message} = await load(['eng_a'], {eng_a: ['gen']})
            state.verse = 5
            await flush()
            expect(post_message).toHaveBeenCalledWith('verse')
            state.dark = true
            await flush()
            expect(post_message).toHaveBeenCalledWith('dark')
        })

        it("Searches translation or originals when search changes", async ({expect}) => {
            const {state, content} = await load(['eng_a'], {eng_a: ['gen']})
            state.search = 'love'
            await flush()
            expect(state.search_results).toEqual([])
            content.search_orig_nt = Promise.resolve({search: () => []} as never)
            state.search_orig = {ot: false, words: [{word: 'w', original: 'o', strongs: 'G1'}]}
            await flush()
            expect(state.search_results).toEqual([])
            // Clearing search leaves results loading
            state.search_orig = null
            state.search = ''
            await flush()
            expect(state.search_results).toBe(null)
        })
    })
})

