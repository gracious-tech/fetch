
import {mount_app} from '@/services/test_utils'

import {afterEach, beforeEach, describe, it} from 'vitest'
import {nextTick} from 'vue'
import {enableAutoUnmount} from '@vue/test-utils'
import {PassageReference} from '@gracious.tech/fetch-client'

import {state} from '@/services/state'
import {content} from '@/services/content'
import SearchResultsItem from './SearchResultsItem.vue'

import type {FetchCollection} from '@gracious.tech/fetch-client'


enableAutoUnmount(afterEach)


// Mount a result for the given passage
function mount_result(ref:PassageReference){
    return mount_app(SearchResultsItem,
        {props: {result: {ref, contents: '<b>matched</b> text'}}})
}


describe('SearchResultsItem', () => {

    beforeEach(() => {
        content.collection = {bibles: {reference_to_string: (ref:PassageReference) =>
            ref.toString()}} as unknown as FetchCollection
        state.trans = ['eng_a']
        state.hebrew_ltr = false
    })

    it("Shows the reference and highlighted contents", ({expect}) => {
        const wrapper = mount_result(new PassageReference('jhn', 3, 16))
        expect(wrapper.find('.v-card-title').text()).toBe('John 3:16')
        expect(wrapper.find('.scripture').html()).toContain('<b>matched</b> text')
    })

    it("Sets direction by testament and Hebrew setting", async ({expect}) => {
        expect(mount_result(new PassageReference('jhn', 3, 16)).find('.scripture').classes())
            .toContain('orig-ltr')
        const ot = mount_result(new PassageReference('gen', 1, 1))
        expect(ot.find('.scripture').classes()).toContain('orig-rtl')
        state.hebrew_ltr = true
        await nextTick()
        expect(ot.find('.scripture').classes()).toContain('orig-ltr')
    })

    it("Goes to the result and saves the search when clicked", async ({expect}) => {
        state.search = ' love '
        state.search_history = ['other', 'love']
        state.show_nav = true
        await mount_result(new PassageReference('jhn', 3, 16)).find('.v-card').trigger('click')
        expect(state.passage?.to_serialized()).toBe('jhn3:16')
        expect(state.show_nav).toBe(false)
        expect(state.search_history).toEqual(['love', 'other'])
    })
})
