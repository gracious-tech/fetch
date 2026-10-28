
import {mount_app} from '@/services/test_utils'

import {afterEach, beforeEach, describe, it} from 'vitest'
import {nextTick} from 'vue'
import {enableAutoUnmount} from '@vue/test-utils'
import {PassageReference} from '@gracious.tech/fetch-client'

import {state} from '@/services/state'
import SearchToolbar from './SearchToolbar.vue'

import type {VueWrapper} from '@vue/test-utils'
import type {VCombobox} from 'vuetify/components'


enableAutoUnmount(afterEach)


// Mount the toolbar and get its combobox component
function mount_toolbar(){
    const wrapper = mount_app(SearchToolbar)
    const combobox = wrapper.findComponent({name: 'VCombobox'}) as
        VueWrapper<InstanceType<typeof VCombobox>>
    return {wrapper, combobox}
}


describe('SearchToolbar', () => {

    beforeEach(() => {
        state.search = ''
        state.search_orig = null
        state.search_filter = null
        state.search_results = null
        state.search_history = []
        state.original_chars = true
        state.book = 'jhn'
        state.wide = true
        state.show_nav = true
    })

    it("Shows a search icon until something is searched", async ({expect}) => {
        const {wrapper} = mount_toolbar()
        expect(wrapper.find('.placeholder').exists()).toBe(true)
        state.search = 'love'
        await nextTick()
        expect(wrapper.find('.placeholder').exists()).toBe(false)
    })

    it("Updates the search as the user types", async ({expect}) => {
        const {combobox} = mount_toolbar()
        await combobox.setValue('love')
        expect(state.search).toBe('love')
        expect(combobox.props('modelValue')).toBe('love')
    })

    it("Clears the search", async ({expect}) => {
        state.search = 'love'
        const {wrapper} = mount_toolbar()
        await wrapper.find('.v-field button').trigger('click')
        expect(state.search).toBe('')
        expect(state.search_orig).toBe(null)
    })

    it("Goes to the first result when enter pressed (if any)", async ({expect}) => {
        state.search = 'love'
        const {wrapper} = mount_toolbar()
        await wrapper.find('input').trigger('keydown', {key: 'Enter'})
        expect(state.show_nav).toBe(true)

        state.search_results = [{ref: new PassageReference('jhn', 3, 16), contents: ''}]
        await wrapper.find('input').trigger('keydown', {key: 'Enter'})
        expect(state.passage?.to_serialized()).toBe('jhn3:16')
        expect(state.show_nav).toBe(false)
        expect(state.search_history).toEqual(['love'])
    })

    it("Filters by testament or current book, and can unset the filter", async ({expect}) => {
        const {wrapper} = mount_toolbar()
        const buttons = wrapper.findAll('.filter button')
        expect(buttons.map(b => b.text())).toEqual(['Old', 'New', 'John'])
        await buttons[1]!.trigger('click')
        expect(state.search_filter).toBe('nt')
        await buttons[1]!.trigger('click')
        expect(state.search_filter).toBe(null)
    })

    it("Can close the nav on narrow screens only", async ({expect}) => {
        expect(mount_toolbar().wrapper.findAll('.v-toolbar__content > .v-btn')).toHaveLength(0)
        state.wide = false
        const {wrapper} = mount_toolbar()
        await wrapper.find('.v-toolbar__content > .v-btn').trigger('click')
        expect(state.show_nav).toBe(false)
    })

    describe('original language search', () => {

        beforeEach(() => {
            state.search_orig = {ot: false, words: [
                {word: 'love', original: 'ἀγάπη', strongs: 'G26'},
                {word: 'God', original: 'θεός', strongs: 'G2316'},
            ]}
        })

        it("Shows words as read-only chips (original or transliterated)", async ({expect}) => {
            const {wrapper, combobox} = mount_toolbar()
            expect(combobox.props('modelValue')).toEqual(['ἀγάπη', 'θεός'])
            expect(wrapper.findAll('.v-field .v-chip').map(c => c.text()))
                .toEqual(['ἀγάπη', 'θεός'])
            state.original_chars = false
            await nextTick()
            expect(combobox.props('modelValue')).toEqual(['love', 'God'])

            // Can't edit words directly
            await combobox.setValue('typed')
            expect(state.search).toBe('')
            expect(state.search_orig?.words).toHaveLength(2)
        })

        it("Removes clicked words, ending the search when none left", async ({expect}) => {
            const {wrapper} = mount_toolbar()
            await wrapper.findAll('.v-field .v-chip')[0]!.trigger('click')
            expect(state.search_orig?.words.map(w => w.word)).toEqual(['God'])
            await wrapper.findAll('.v-field .v-chip')[0]!.trigger('click')
            expect(state.search_orig).toBe(null)
        })
    })
})
