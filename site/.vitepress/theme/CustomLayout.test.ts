
import {afterEach, describe, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'

import type {Component} from 'vue'

import CustomLayout from './CustomLayout.vue'


// Shared mock state (hoisted so mock factories can use it)
const mocks = vi.hoisted(() => ({
    router: {} as {onAfterRouteChanged?:(to:string) => void},
    discover: vi.fn(),
    enhancer_options: [] as Record<string, unknown>[],
    render_doc: true,
}))

vi.mock('vitepress', () => ({useRouter: () => mocks.router}))

// Default layout renders a doc container only when the page has one
vi.mock('vitepress/theme', () => ({default: {Layout: defineComponent({
    setup: () => () => mocks.render_doc ? h('div', {class: 'vp-doc'}, "John 3:16") : h('div'),
})}}))

vi.mock('@gracious.tech/fetch-client', () => ({FetchClient: class {
    constructor(public options:unknown){}
}}))

vi.mock('@gracious.tech/fetch-enhancer', () => ({BibleEnhancer: class {
    discover_bible_references = mocks.discover
    constructor(options:Record<string, unknown>){
        mocks.enhancer_options.push(options)
    }
}}))


// Mount attached to the document (so the doc container can be found)
function mount_layout(){
    return mount(CustomLayout, {attachTo: document.body})
}


describe('CustomLayout', () => {

    afterEach(() => {
        document.body.innerHTML = ''
        mocks.discover.mockClear()
        mocks.enhancer_options.length = 0
        mocks.render_doc = true
        delete mocks.router.onAfterRouteChanged
        vi.unstubAllEnvs()
    })

    it("Creates an enhancer for the dev endpoints and exposes it", ({expect}) => {
        mount_layout()
        expect(mocks.enhancer_options[0]).toMatchObject({
            client: {options: {endpoints: ['http://localhost:8430/']}},
            app_origin: 'http://localhost:8431',
            translations: ['eng_bsb', 'grc_sr'],
        })
        expect((self as unknown as {fetch_enhancer:unknown}).fetch_enhancer)
            .toBeInstanceOf(Object)
    })

    it("Uses the live collection and app in production", async ({expect}) => {
        vi.stubEnv('PROD', true)
        vi.resetModules()
        const layout = (await import('./CustomLayout.vue') as {default:Component}).default
        mount(layout, {attachTo: document.body})
        expect(mocks.enhancer_options[0]).toMatchObject({
            client: {options: {endpoints: ['https://v1.fetch.bible/']}},
            app_origin: 'https://app.fetch.bible',
        })
    })

    it("Enhances the page's doc on mount and after each route change", ({expect}) => {
        mount_layout()
        const doc = document.querySelector('.vp-doc')
        expect(mocks.discover).toHaveBeenCalledWith(doc)
        mocks.router.onAfterRouteChanged!('/next/')
        expect(mocks.discover).toHaveBeenCalledTimes(2)
    })

    it("Skips enhancing when there's no doc container", ({expect}) => {
        mocks.render_doc = false
        mount_layout()
        mocks.router.onAfterRouteChanged!('/home/')
        expect(mocks.discover).not.toHaveBeenCalled()
    })

    it("Stores scroll position before the enhancer pushes history", ({expect}) => {
        const replace = vi.spyOn(history, 'replaceState')
        mount_layout()
        const before_push = mocks.enhancer_options[0]!['before_history_push'] as () => void
        before_push()
        expect(replace).toHaveBeenCalledWith({scrollPosition: window.scrollY}, '')
        replace.mockRestore()
    })
})
