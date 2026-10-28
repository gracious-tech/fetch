
import {fake_collection, mount_app} from '@/services/test_utils'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {nextTick} from 'vue'

import BibleContent from './BibleContent.vue'
import {state} from '@/services/state'
import {content} from '@/services/content'

import type {VueWrapper} from '@vue/test-utils'


// ContentInstance needs IntersectionObserver when given content
vi.stubGlobal('IntersectionObserver', class {
    observe(){ /* noop */ }
    disconnect(){ /* noop */ }
})


describe('BibleContent', () => {

    let wrapper:VueWrapper|null = null

    beforeEach(() => {
        content.collection = fake_collection({eng_a: ['gen']})
        content.translations = {}
        Object.assign(state, {trans: ['eng_a'], book: 'gen', chapter: 1, verse: 1,
            offline: false, content: '', content_verses: []})
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
    })

    it("Shows a loading spinner until content is available", async ({expect}) => {
        wrapper = mount_app(BibleContent)
        expect(wrapper.find('div.loading svg').exists()).toBe(true)
        expect(wrapper.find('.content').exists()).toBe(false)
        state.content = '<p>In the beginning</p>'
        await nextTick()
        expect(wrapper.find('div.loading').exists()).toBe(false)
        expect(wrapper.find('.content').text()).toContain('In the beginning')
    })

    it("Shows parallel verse content", async ({expect}) => {
        state.content_verses = [[{id: 1, chapter: 1, verse: 1, content: '<p>A1</p>'}]]
        wrapper = mount_app(BibleContent)
        await nextTick()
        expect(wrapper.find('.content .verse').text()).toBe('A1')
    })

    it("Offers a retry when offline, which reloads the same translations", async ({expect}) => {
        state.offline = true
        state.content = '<p>Stale</p>'
        wrapper = mount_app(BibleContent)
        expect(wrapper.find('.offline').exists()).toBe(true)
        expect(wrapper.find('.content').exists()).toBe(false)
        const original = state.trans
        await wrapper.find('.offline button').trigger('click')
        // A new but equal array so watchers trigger a reload
        expect(state.trans).not.toBe(original)
        expect(state.trans).toEqual(['eng_a'])
    })
})
