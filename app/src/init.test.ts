
import {fake_collection} from '@/services/test_utils'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {flushPromises} from '@vue/test-utils'

import type {FetchCollection, SearchWords} from '@gracious.tech/fetch-client'


// Record calls made once collection loaded
vi.mock('@/services/watches', () => ({enable_watches: vi.fn(), apply_search_param: vi.fn()}))
vi.mock('@/services/post', () => ({post_message: vi.fn()}))

// Replace the real UI with one that shows the theme Vuetify was set up with
vi.mock('./comp/AppRoot.vue', async () => {
    const {defineComponent, h} = await import('vue')
    const {useTheme} = await import('vuetify')
    return {default: defineComponent({
        setup(){
            const theme = useTheme()
            return () => h('div', {class: 'root'}, theme.global.name.value)
        },
    })}
})


// Load a fresh app (and state) for the given URL hash, with the collection loaded on demand
async function load_app(hash:string){
    self.location.hash = hash
    const {content} = await import('@/services/content')
    const collection = fake_collection({eng_a: ['gen']})
    Object.assign(collection.bibles, {
        get_resources: vi.fn(() => ({eng_a: {id: 'eng_a'}})),
        get_languages: vi.fn(() => ({eng: {code: 'eng'}})),
    })
    let resolve_collection = (_value:FetchCollection) => {/* replaced below */}
    vi.spyOn(content.client, 'fetch_collection').mockReturnValue(
        new Promise(resolve => {resolve_collection = resolve}))
    const fetch_search = vi.spyOn(content.client, 'fetch_search')
        .mockResolvedValue({} as SearchWords)
    await import('./init')
    // Resolve the collection and let the app mount
    const loaded = async () => {
        resolve_collection(collection)
        await flushPromises()
    }
    return {content, collection, fetch_search, loaded}
}


describe('init', () => {

    beforeEach(() => {
        vi.resetModules()
        document.body.innerHTML = '<div id="app"></div>'
    })
    afterEach(() => {
        vi.clearAllMocks()
    })

    it("Mounts app once collection loaded", async ({expect}) => {
        const {content, collection, fetch_search, loaded} =
            await load_app('#trans=bad,eng_a&dark=false')
        const {enable_watches, apply_search_param} = await import('@/services/watches')
        const {post_message} = await import('@/services/post')
        const {state} = await import('@/services/state')

        // Not mounted until collection loads
        await flushPromises()
        expect(document.querySelector('.root')).toBeNull()
        await loaded()

        // Content initialised and invalid translations dropped
        expect(content.collection).toBe(collection)
        expect(content.translations).toEqual({eng_a: {id: 'eng_a'}})
        expect(content.languages).toEqual({eng: {code: 'eng'}})
        expect(fetch_search).toHaveBeenCalledWith('ot_gbt', 'strongs')
        expect(fetch_search).toHaveBeenCalledWith('nt_gbt', 'strongs')
        expect(state.trans).toEqual(['eng_a'])

        // Ready and mounted, with theme set from dark param
        expect(enable_watches).toHaveBeenCalled()
        expect(apply_search_param).not.toHaveBeenCalled()
        expect(post_message).toHaveBeenCalledWith('ready')
        expect(document.querySelector('.root')!.textContent).toBe('light')
    })

    it("Applies initial search and follows system theme by default", async ({expect}) => {
        const {loaded} = await load_app('#search=gen1')
        const {enable_watches, apply_search_param} = await import('@/services/watches')
        await loaded()
        expect(apply_search_param).toHaveBeenCalledWith('gen1')
        // Search applied after watches enabled, as translation load clears search
        expect(vi.mocked(apply_search_param).mock.invocationCallOrder[0])
            .toBeGreaterThan(vi.mocked(enable_watches).mock.invocationCallOrder[0]!)
        // matchMedia is stubbed to prefer dark
        expect(document.querySelector('.root')!.textContent).toBe('dark')
    })
})
