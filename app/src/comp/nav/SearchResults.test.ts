
import {mount_app} from '@/services/test_utils'

import {afterEach, beforeEach, describe, it} from 'vitest'
import {enableAutoUnmount} from '@vue/test-utils'
import {PassageReference} from '@gracious.tech/fetch-client'

import {state} from '@/services/state'
import {content} from '@/services/content'
import SearchResults from './SearchResults.vue'

import type {FetchCollection} from '@gracious.tech/fetch-client'


enableAutoUnmount(afterEach)


// A search result for the given verse
function result(book:string, chapter:number, verse:number){
    return {ref: new PassageReference(book, chapter, verse), contents: `${book} text`}
}


describe('SearchResults', () => {

    beforeEach(() => {
        content.collection = {bibles: {reference_to_string: (ref:PassageReference) =>
            ref.toString()}} as unknown as FetchCollection
        state.search_filter = null
        state.search = 'love'
    })

    it("Shows a light placeholder while loading", ({expect}) => {
        state.search_results = null
        expect(mount_app(SearchResults).text()).toBe('. . .')
    })

    it("Lists each filtered result", ({expect}) => {
        state.search_results = [result('gen', 1, 1), result('jhn', 3, 16)]
        state.search_filter = 'nt'
        const wrapper = mount_app(SearchResults)
        expect(wrapper.findAll('.v-card')).toHaveLength(1)
        expect(wrapper.text()).toContain('jhn text')
    })

    it("Offers to remove the filter when it hides all results", async ({expect}) => {
        state.search_results = [result('gen', 1, 1)]
        state.search_filter = 'nt'
        const wrapper = mount_app(SearchResults)
        expect(wrapper.text()).toContain('No results (some hidden)')
        await wrapper.find('button').trigger('click')
        expect(state.search_filter).toBe(null)
        expect(wrapper.findAll('.v-card')).toHaveLength(1)
    })

    it("Offers to show books when there are no results", async ({expect}) => {
        state.search_results = []
        const wrapper = mount_app(SearchResults)
        expect(wrapper.text()).toContain('No results')
        expect(wrapper.text()).not.toContain('hidden')
        await wrapper.find('button').trigger('click')
        expect(state.search).toBe('')
    })
})
