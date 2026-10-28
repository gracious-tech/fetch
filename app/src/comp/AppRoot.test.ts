
import {mount_app} from '@/services/test_utils'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {PassageReference} from '@gracious.tech/fetch-client'

import {state, safe_hsl} from '@/services/state'
import AppRoot from './AppRoot.vue'


// Replace children with stubs, as they have their own tests
const stubs = {NavPanel: true, StudyInfo: true, BibleContent: true, AppToolbar: true,
    TransDialog: true, SettingsDialog: true, AboutDialog: true}


// Mount the app root and let it render
async function mount_root(){
    const wrapper = mount_app(AppRoot, {global: {stubs}})
    await flushPromises()
    return wrapper
}

// Dispatch a touch event with a single touch at the given page Y position
function touch(el:Element, type:string, pageY?:number){
    const event = new Event(type, {bubbles: true, cancelable: true})
    Object.defineProperty(event, 'touches', {value: [{pageY}]})
    el.dispatchEvent(event)
    return event
}


describe('AppRoot', () => {

    beforeEach(() => {
        Object.assign(state, {trans: ['eng_a'], wide: true, study: null, dark: null, hue: 290,
            saturation: 70, show_trans_dialog: false, show_style_dialog: false,
            show_about_dialog: false})
    })
    afterEach(() => {
        document.body.innerHTML = ''
        vi.unstubAllEnvs()
    })

    it("Widens with number of translations shown", async ({expect}) => {
        state.trans = ['eng_a', 'spa_b']
        const wrapper = await mount_root()
        expect((wrapper.find('.v-application').element as HTMLElement).style.maxWidth)
            .toBe('2000px')
        wrapper.unmount()
    })

    it("Shows nav as sidebar when wide and drawer when narrow", async ({expect}) => {
        const wrapper = await mount_root()
        expect(wrapper.find('nav-panel-stub.sidebar').exists()).toBe(true)
        expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false)
        state.wide = false
        await flushPromises()
        expect(wrapper.find('nav-panel-stub.sidebar').exists()).toBe(false)
        expect(wrapper.find('.v-navigation-drawer').exists()).toBe(true)
        wrapper.unmount()
    })

    it("Shows dialogs only when requested", async ({expect}) => {
        const wrapper = await mount_root()
        const dialogs = ['trans-dialog-stub', 'settings-dialog-stub', 'about-dialog-stub']
        expect(dialogs.map(d => wrapper.find(d).exists())).toEqual([false, false, false])
        Object.assign(state, {show_trans_dialog: true, show_style_dialog: true,
            show_about_dialog: true})
        await flushPromises()
        expect(dialogs.map(d => wrapper.find(d).exists())).toEqual([true, true, true])
        wrapper.unmount()
    })

    it("Applies theme color and dark mode", async ({expect}) => {
        const wrapper = await mount_root()
        // NOTE Compare as normalised by jsdom (which doesn't convert hsl accurately)
        const as_css = (color:string) => {
            const probe = document.createElement('div')
            probe.style.backgroundColor = color
            return probe.style.backgroundColor
        }
        const html = document.documentElement
        expect(html.style.backgroundColor).toBe(as_css(safe_hsl.value))
        state.hue = 0
        state.saturation = 20
        await flushPromises()
        expect(safe_hsl.value).toBe('hsl(0, 20%, 60%)')
        expect(html.style.backgroundColor).toBe(as_css(safe_hsl.value))

        // Vuetify theme follows dark setting
        const app = wrapper.find('.v-application')
        state.dark = true
        await flushPromises()
        expect(app.classes()).toContain('v-theme--dark')
        state.dark = false
        await flushPromises()
        expect(app.classes()).toContain('v-theme--light')
        wrapper.unmount()
    })

    it("Shows study pane which can be resized by mouse", async ({expect}) => {
        const wrapper = await mount_root()
        expect(wrapper.find('.study').exists()).toBe(false)
        state.study = new PassageReference('jhn', 3, 16)
        await flushPromises()
        const study = wrapper.find('.study').element as HTMLElement
        const app = wrapper.find('.v-application')

        // Moving does nothing until resize started
        await app.trigger('mousemove', {clientY: 300})
        expect(study.style.minHeight).toBe('')

        // Height is from bottom of screen to pointer, less half the resize bar (768 tall)
        await wrapper.find('.resize').trigger('mousedown')
        await app.trigger('mousemove', {clientY: 300})
        expect(study.style.minHeight).toBe('460px')

        // Clamped to a min and max height
        await app.trigger('mousemove', {clientY: 760})
        expect(study.style.minHeight).toBe('100px')
        await app.trigger('mousemove', {clientY: 0})
        expect(study.style.minHeight).toBe('568px')

        // Stops once released
        await app.trigger('mouseup')
        await app.trigger('mousemove', {clientY: 300})
        expect(study.style.minHeight).toBe('568px')

        // Also stops when leaving the app
        await wrapper.find('.resize').trigger('mousedown')
        await app.trigger('mouseleave')
        await app.trigger('mousemove', {clientY: 300})
        expect(study.style.minHeight).toBe('568px')
        wrapper.unmount()
    })

    it("Resizes study pane by touch without scrolling page", async ({expect}) => {
        state.study = new PassageReference('jhn', 3, 16)
        const wrapper = await mount_root()
        const study = wrapper.find('.study').element as HTMLElement
        const app = wrapper.find('.v-application').element
        touch(wrapper.find('.resize').element, 'touchstart')
        const event = touch(app, 'touchmove', 400)
        expect(study.style.minHeight).toBe('360px')
        expect(event.defaultPrevented).toBe(true)
        touch(app, 'touchend')
        touch(app, 'touchmove', 300)
        expect(study.style.minHeight).toBe('360px')
        wrapper.unmount()
    })

    it("Registers service worker in production only", async ({expect}) => {
        const register = vi.fn(() => Promise.resolve())
        Object.defineProperty(navigator, 'serviceWorker', {value: {register},
            configurable: true})
        const dev = await mount_root()
        expect(register).not.toHaveBeenCalled()
        dev.unmount()
        vi.stubEnv('PROD', true)
        const prod = await mount_root()
        expect(register).toHaveBeenCalledWith('/sw.js')
        prod.unmount()
    })
})
