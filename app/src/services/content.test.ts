// @vitest-environment jsdom

import {fake_collection} from './test_utils'

import {describe, it, vi, beforeEach} from 'vitest'
import {PassageReference} from '@gracious.tech/fetch-client'

import {content, search_translation, search_orig, update_trans} from './content'
import {state} from './state'

import type {BibleIndex} from '@gracious.tech/fetch-search'
import type {GetResourcesItem, SearchWords} from '@gracious.tech/fetch-client'


// A fake original-language search that matches the given verses (first word highlighted)
function fake_search(refs:string[]){
    const search = vi.fn((..._tokens:string[]) => refs.map(ref =>
        ({verse: PassageReference.from_serialized(ref), word_indexes: [0]})))
    return {search, words: Promise.resolve({search} as unknown as SearchWords)}
}


describe('content', () => {

    let collection:ReturnType<typeof fake_collection>
    beforeEach(() => {
        collection = fake_collection({eng_a: ['gen'], spa_b: ['gen']})
        content.collection = collection
        content.translations = {eng_a: {} as GetResourcesItem, spa_b: {} as GetResourcesItem}
        state.trans = ['eng_a']
    })

    describe('search_translation', () => {

        it("Searches the index once ready", async ({expect}) => {
            const results = [{ref: new PassageReference('gen', 1, 1), contents: ''}]
            const search = vi.fn(() => Promise.resolve(results))
            content.index = Promise.resolve({search} as unknown as BibleIndex)
            state.search = 'beginning'
            await search_translation()
            expect(search).toHaveBeenCalledWith('beginning')
            expect(state.search_results).toEqual(results)
        })
    })

    describe('search_orig', () => {

        it("Clears results if not searching originals", async ({expect}) => {
            state.search_orig = null
            await search_orig()
            expect(state.search_results).toEqual([])
        })

        it("Shows matching verses with glosses, highlighting matched words", async ({expect}) => {
            const {search, words} = fake_search(['gen1:1', 'gen1:2'])
            content.search_orig_ot = words
            state.search_orig = {ot: true, words: [{word: 'w', original: 'o', strongs: 'H1'}]}
            state.original_chars = true
            await search_orig()
            expect(search).toHaveBeenCalledWith('H1')
            // Book only fetched once for multiple results
            expect(collection.bibles.fetch_book).toHaveBeenCalledOnce()
            expect(state.search_results).toHaveLength(2)
            expect(state.search_results![0]!.ref.to_serialized()).toBe('gen1:1')
            expect(state.search_results![0]!.contents).toBe(
                `<div class='orig'><mark>בְּ</mark> ר</div><div> eng_a gen1:1 </div>`)
        })

        it("Searches NT and can show gloss words instead of original", async ({expect}) => {
            const {search, words} = fake_search(['jhn1:1'])
            content.search_orig_nt = words
            state.search_orig = {ot: false, words: [{word: 'w', original: 'o', strongs: 'G1'}]}
            state.search_orig_mode = 'original'
            state.original_chars = false
            await search_orig()
            expect(search).toHaveBeenCalledWith('o')
            expect(state.search_results![0]!.contents).toContain(
                `<mark>In &lt;the&gt;</mark> beginning`)
        })
    })

    describe('update_trans', () => {

        it("Keeps only valid translations", ({expect}) => {
            update_trans(['spa_b', 'bad', 'eng_a'])
            expect(state.trans).toEqual(['spa_b', 'eng_a'])
        })

        it("Falls back to preferred translation if none valid", ({expect}) => {
            state.trans = ['spa_b']
            update_trans(['bad'])
            expect(state.trans).toEqual(['eng_a'])
        })
    })
})

