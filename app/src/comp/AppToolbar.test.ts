
import {fake_collection, mount_app} from '@/services/test_utils'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {flushPromises} from '@vue/test-utils'

import {state} from '@/services/state'
import {content} from '@/services/content'
import {post_message} from '@/services/post'
import AppToolbar from './AppToolbar.vue'

import type {GetResourcesItem} from '@gracious.tech/fetch-client'


// Record messages to parent frame
vi.mock('@/services/post', () => ({post_message: vi.fn()}))


// Find a menu item by its text
function menu_item(text:string){
    return [...document.querySelectorAll<HTMLElement>('.v-list-item')]
        .find(b => b.textContent?.includes(text))
}


describe('AppToolbar', () => {

    beforeEach(() => {
        content.collection = fake_collection({eng_a: ['gen', 'oba'], spa_b: ['gen']})
        content.translations = {
            eng_a: {name_abbrev: 'A'} as GetResourcesItem,
            spa_b: {name_abbrev: 'B'} as GetResourcesItem,
        }
        Object.assign(state, {trans: ['eng_a', 'spa_b'], book: 'gen', chapter: 3, wide: true,
            back: false, status: '', button1_icon: '', show_nav: false,
            show_style_dialog: false, show_about_dialog: false})
    })
    afterEach(() => {
        document.body.innerHTML = ''
        vi.mocked(post_message).mockClear()
    })

    it("Shows chapter, status and translation abbreviations", ({expect}) => {
        state.status = "Custom status"
        const wrapper = mount_app(AppToolbar)
        expect(wrapper.find('.ch_display').text()).toBe("Genesis 3")
        expect(wrapper.find('.status').text()).toBe("Custom status")
        expect(wrapper.text()).toContain("A / B")
        // No back or custom button unless configured
        expect(wrapper.find('svg[viewBox="0 0 48 48"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it("Opens the translation dialog", async ({expect}) => {
        const wrapper = mount_app(AppToolbar)
        await wrapper.findAll('button').find(b => b.text() === "A / B")!.trigger('click')
        expect(state.show_trans_dialog).toBe(true)
        state.show_trans_dialog = false
        wrapper.unmount()
    })

    it("Shows abbreviated location on narrow screens which opens nav", async ({expect}) => {
        state.wide = false
        state.book = 'oba'
        const wrapper = mount_app(AppToolbar)
        expect(wrapper.find('.ch_display').exists()).toBe(false)
        // Single chapter books don't show the chapter number
        expect(wrapper.find('.loc').text()).toBe("Obad")
        await wrapper.find('.loc').trigger('click')
        expect(state.show_nav).toBe(true)
        wrapper.unmount()
    })

    it("Navigates to back url if given one", async ({expect}) => {
        state.back = 'https://example.com/'
        const wrapper = mount_app(AppToolbar)
        const assign = vi.fn()
        // NOTE jsdom's location can't be spied on, so briefly swap `self` (restoring shared stubs)
        vi.stubGlobal('self', {location: {assign}})
        await wrapper.find('button').trigger('click')
        vi.stubGlobal('self', window)
        expect(assign).toHaveBeenCalledWith('https://example.com/')
        expect(post_message).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it("Tells parent to go back if no back url", async ({expect}) => {
        state.back = true
        const wrapper = mount_app(AppToolbar)
        await wrapper.find('button').trigger('click')
        expect(post_message).toHaveBeenCalledWith('back')
        wrapper.unmount()
    })

    it("Shows a custom button that messages the parent", async ({expect}) => {
        state.button1_icon = 'M0 0h48v48H0z'
        state.button1_color = 'red'
        const wrapper = mount_app(AppToolbar)
        const path = wrapper.find('svg[viewBox="0 0 48 48"] path')
        expect(path.attributes('d')).toBe('M0 0h48v48H0z')
        expect(path.attributes('fill')).toBe('red')
        await wrapper.find('svg[viewBox="0 0 48 48"]').trigger('click')
        expect(post_message).toHaveBeenCalledWith('button1')
        wrapper.unmount()
    })

    it("Falls back to current color for custom button", ({expect}) => {
        state.button1_icon = 'M0 0'
        state.button1_color = ''
        const wrapper = mount_app(AppToolbar)
        expect(wrapper.find('svg[viewBox="0 0 48 48"] path').attributes('fill'))
            .toBe('currentColor')
        wrapper.unmount()
    })

    it("Opens settings and about from the menu", async ({expect}) => {
        const wrapper = mount_app(AppToolbar)
        // NOTE Vuetify only binds the menu's parent activator after mounting settles
        const open_menu = async () => {
            await new Promise(resolve => {setTimeout(resolve)})
            await wrapper.findAll('button').at(-1)!.trigger('click')
            await flushPromises()
        }
        await open_menu()
        menu_item("Settings")!.click()
        expect(state.show_style_dialog).toBe(true)
        await open_menu()
        menu_item("About")!.click()
        expect(state.show_about_dialog).toBe(true)
        wrapper.unmount()
    })
})
