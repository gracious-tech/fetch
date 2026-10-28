
import {mount_app} from '@/services/test_utils'

import {afterEach, describe, it, vi} from 'vitest'
import {enableAutoUnmount} from '@vue/test-utils'

import {state} from '@/services/state'
import {content} from '@/services/content'
import BookMenuRecent from './BookMenuRecent.vue'

import type {FetchCollection, PassageReference} from '@gracious.tech/fetch-client'


enableAutoUnmount(afterEach)


describe('BookMenuRecent', () => {

    it("Shows an abbreviated title and navigates to the reference", async ({expect}) => {
        const reference_to_string = vi.fn((ref:PassageReference) => `Short ${ref.book}`)
        content.collection = {bibles: {reference_to_string}} as unknown as FetchCollection
        state.trans = ['eng_a']
        state.show_nav = true

        const wrapper = mount_app(BookMenuRecent, {props: {reference: 'rom8:28'}})
        expect(wrapper.text()).toBe('Short rom')
        expect(reference_to_string).toHaveBeenCalledWith(expect.anything(), 'eng_a', true)

        await wrapper.find('.v-chip').trigger('click')
        expect(state.passage?.to_serialized()).toBe('rom8:28')
        expect(state.show_nav).toBe(false)
    })
})
