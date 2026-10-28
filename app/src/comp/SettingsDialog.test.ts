
import {mount_app} from '@/services/test_utils'

import {describe, it, beforeEach, afterEach} from 'vitest'
import {flushPromises} from '@vue/test-utils'

import {state} from '@/services/state'
import SettingsDialog from './SettingsDialog.vue'


// Find a switch's input by its label
function switch_input(label:string){
    return [...document.querySelectorAll('.v-switch')]
        .find(s => s.textContent?.includes(label))!.querySelector('input')!
}


describe('SettingsDialog', () => {

    beforeEach(() => {
        Object.assign(state, {show_style_dialog: true, dark: null, font_size: 'regular',
            show_headings: true, show_chapters: true, show_verses: true, show_notes: true,
            show_redletter: true})
    })
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it("Follows the system theme until set", async ({expect}) => {
        const wrapper = mount_app(SettingsDialog)
        await flushPromises()
        // matchMedia is stubbed to prefer dark
        const theme = document.querySelector<HTMLInputElement>('.v-switch.theme input')!
        expect(theme.checked).toBe(true)
        theme.click()
        expect(state.dark).toBe(false)
        wrapper.unmount()
    })

    it("Uses the explicit theme once set", async ({expect}) => {
        state.dark = false
        const wrapper = mount_app(SettingsDialog)
        await flushPromises()
        expect(document.querySelector<HTMLInputElement>('.v-switch.theme input')!.checked)
            .toBe(false)
        wrapper.unmount()
    })

    it("Changes font size", async ({expect}) => {
        const wrapper = mount_app(SettingsDialog)
        await flushPromises()
        ;[...document.querySelectorAll<HTMLButtonElement>('.v-btn-toggle button')]
            .find(b => b.textContent === "Large")!.click()
        expect(state.font_size).toBe('large')
        wrapper.unmount()
    })

    it("Toggles display options", async ({expect}) => {
        const wrapper = mount_app(SettingsDialog)
        await flushPromises()
        const options = {
            "Show headings": 'show_headings',
            "Show chapter dividers": 'show_chapters',
            "Show verse numbers": 'show_verses',
            "Show footnotes": 'show_notes',
            "Show words of Jesus in red": 'show_redletter',
        } as const
        for (const [label, prop] of Object.entries(options)){
            switch_input(label).click()
            expect(state[prop]).toBe(false)
        }
        wrapper.unmount()
    })

    it("Closes", async ({expect}) => {
        const wrapper = mount_app(SettingsDialog)
        await flushPromises()
        document.querySelector<HTMLButtonElement>('.v-toolbar button')!.click()
        expect(state.show_style_dialog).toBe(false)
        wrapper.unmount()
    })
})
