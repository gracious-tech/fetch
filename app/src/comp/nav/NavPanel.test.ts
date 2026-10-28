
import {mount_app} from '@/services/test_utils'

import {afterEach, describe, it} from 'vitest'
import {enableAutoUnmount} from '@vue/test-utils'

import {state} from '@/services/state'
import NavPanel from './NavPanel.vue'


enableAutoUnmount(afterEach)


describe('NavPanel', () => {

    // Children are tested separately, so only check which are shown
    const stubs = {SearchToolbar: true, SearchResults: true, BookMenu: true}

    it("Shows the book menu when not searching", ({expect}) => {
        state.search_results = null
        const wrapper = mount_app(NavPanel, {global: {stubs}})
        expect(wrapper.find('search-toolbar-stub').exists()).toBe(true)
        expect(wrapper.find('book-menu-stub').exists()).toBe(true)
        expect(wrapper.find('search-results-stub').exists()).toBe(false)
    })

    it("Shows search results instead of books when searching", ({expect}) => {
        state.search_results = []
        const wrapper = mount_app(NavPanel, {global: {stubs}})
        expect(wrapper.find('search-results-stub').exists()).toBe(true)
        expect(wrapper.find('book-menu-stub').exists()).toBe(false)
    })
})
