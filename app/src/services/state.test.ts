// @vitest-environment jsdom

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {PassageReference} from '@gracious.tech/fetch-client'


// Fresh import of the state module for the given URL hash (state is initialised on import)
async function load(hash='', legacy=false){
    vi.resetModules()
    self.location.hash = hash
    // Stub screen width media query (jsdom lacks matchMedia), capturing its change listener
    let listener:(event:{matches:boolean})=>void = () => undefined
    const query = legacy
        ? {matches: false, addListener: (fn:typeof listener) => {listener = fn}}
        : {matches: true, addEventListener: (_:string, fn:typeof listener) => {listener = fn}}
    vi.stubGlobal('matchMedia', () => query)
    const module = await import('./state')
    return {...module, change_width: (matches:boolean) => listener({matches})}
}


// Get a stored setting (keys are prefixed with the parent's origin)
function stored(key:string){
    return localStorage.getItem(`${self.location.origin} ${key}`)
}


// Let Vue run its pending watchers
function flush(){
    return new Promise(resolve => {setTimeout(resolve)})
}


describe('state', () => {

    beforeEach(() => {
        localStorage.clear()
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    describe('initial state', () => {

        it("Uses defaults when nothing configured", async ({expect}) => {
            const {state, initial_search_param} = await load()
            expect(initial_search_param).toBe(null)
            expect(state).toMatchObject({dark: null, status: '', hue: 290, saturation: 70,
                back: false, button1_icon: '', button1_color: 'currentColor', study_notes: true,
                trans: [], show_headings: true, font_size: 'regular', search_history: [],
                read_history: [], wide: true})
        })

        it("Reads config from the URL fragment", async ({expect}) => {
            const {state, initial_search_param} = await load('#dark=true&status=Hi&hue=10'
                + '&saturation=20&back=https://x&button1_icon=i&button1_color=red'
                + '&study_notes=false&trans=eng_a,spa_b&search=gen1')
            expect(initial_search_param).toBe('gen1')
            expect(state).toMatchObject({dark: true, status: 'Hi', hue: 10, saturation: 20,
                back: 'https://x', button1_icon: 'i', button1_color: 'red', study_notes: false,
                trans: ['eng_a', 'spa_b']})
            expect((await load('#back=true')).state.back).toBe(true)
        })

        it("Restores settings from local storage", async ({expect}) => {
            const prefix = self.location.origin
            localStorage.setItem(`${prefix} dark`, 'false')
            localStorage.setItem(`${prefix} trans`, 'eng_x')
            localStorage.setItem(`${prefix} show_headings`, 'false')
            localStorage.setItem(`${prefix} font_size`, 'large')
            localStorage.setItem(`${prefix} search_history`, 'a\n\nb')
            const {state} = await load()
            expect(state).toMatchObject({dark: false, trans: ['eng_x'], show_headings: false,
                font_size: 'large', search_history: ['a', 'b']})
        })

        it("Tracks screen width (including legacy Safari listener)", async ({expect}) => {
            for (const legacy of [false, true]){
                const {state, change_width} = await load('', legacy)
                change_width(false)
                expect(state.wide).toBe(false)
                change_width(true)
                expect(state.wide).toBe(true)
            }
        })
    })

    describe('local_storage', () => {

        it("Survives storage being unavailable", async ({expect}) => {
            const {local_storage} = await load()
            vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new Error()
            })
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error()
            })
            expect(local_storage.getItem('x')).toBe(null)
            expect(() => local_storage.setItem('x', 'y')).not.toThrow()
        })
    })

    describe('computes', () => {

        it("Derives languages, density and dialog width", async ({expect}) => {
            const {state, langs, density, dialog_max_width} = await load('#trans=eng_a,spa_b')
            expect(langs.value).toEqual(['eng', 'spa'])
            expect(density.value).toBe('default')
            expect(dialog_max_width.value).toBe('800px')
            state.wide = false
            expect(density.value).toBe('compact')
            expect(dialog_max_width.value).toBe('')
        })

        it("Clamps theme color to safe values", async ({expect}) => {
            const {state, safe_hsl} = await load()
            expect(safe_hsl.value).toBe('hsl(290, 70%, 60%)')
            state.hue = 500
            state.saturation = 5
            expect(safe_hsl.value).toBe('hsl(360, 20%, 60%)')
        })

        it("Filters search results", async ({expect}) => {
            const {state, filtered_results} = await load()
            expect(filtered_results.value).toEqual([])
            const gen = {ref: new PassageReference('gen', 1, 1), contents: ''}
            const exo = {ref: new PassageReference('exo', 1, 1), contents: ''}
            const jhn = {ref: new PassageReference('jhn', 1, 1), contents: ''}
            state.search_results = [gen, exo, jhn]
            expect(filtered_results.value).toHaveLength(3)
            state.search_filter = 'ot'
            expect(filtered_results.value.map(r => r.ref.book)).toEqual(['gen', 'exo'])
            state.search_filter = 'nt'
            expect(filtered_results.value.map(r => r.ref.book)).toEqual(['jhn'])
            state.search_filter = 'book'
            state.book = 'exo'
            expect(filtered_results.value.map(r => r.ref.book)).toEqual(['exo'])
        })
    })

    describe('methods', () => {

        it("Changes passage within the current book", async ({expect}) => {
            const {state, change_passage} = await load()
            state.book = 'jhn'
            change_passage(3, 16)
            expect(state).toMatchObject({chapter: 3, verse: 16})
            expect(state.passage?.to_serialized()).toBe('jhn3:16')
            change_passage(4)
            expect(state).toMatchObject({chapter: 4, verse: 1})
            expect(state.passage?.to_serialized()).toBe('jhn4')
        })

        it("Changes to a ref using a new object each time", async ({expect}) => {
            const {state, change_to_ref} = await load()
            const ref = new PassageReference('rom', 8, 28)
            change_to_ref(ref)
            expect(state).toMatchObject({book: 'rom', chapter: 8, verse: 28})
            expect(state.passage).not.toBe(ref)
            expect(state.passage?.to_serialized()).toBe('rom8:28')
        })

        it("Goes to a search result and records history", async ({expect}) => {
            const {state, go_to_search_result} = await load()
            state.search_history = [...Array(10).keys()].map(i => `q${i}`)
            state.read_history = ['jhn3:16']
            state.show_nav = true
            state.search = ' q5 '
            go_to_search_result({ref: new PassageReference('jhn', 3, 16), contents: ''})
            expect(state.show_nav).toBe(false)
            expect(state.book).toBe('jhn')
            expect(state.search_history[0]).toBe('q5')
            expect(state.search_history).toHaveLength(10)
            expect(state.search_history.filter(q => q === 'q5')).toHaveLength(1)
            expect(state.read_history).toEqual(['jhn3:16'])
        })

        it("Keeps the most recent 8 reads", async ({expect}) => {
            const {state, add_to_read_history} = await load()
            for (let i = 1; i <= 10; i++){
                add_to_read_history(new PassageReference('psa', i))
            }
            expect(state.read_history).toHaveLength(8)
            expect(state.read_history[0]).toBe('psa10')
        })
    })

    describe('watches', () => {

        it("Saves settings to local storage when they change", async ({expect}) => {
            const {state} = await load()
            state.trans = ['eng_a', 'spa_b']
            state.book = 'jhn'
            state.chapter = 3
            state.dark = true
            state.show_headings = false
            state.show_chapters = false
            state.show_verses = false
            state.show_notes = false
            state.show_redletter = false
            state.font_size = 'large'
            state.hebrew_ltr = false
            state.original_chars = false
            state.search_history = ['a', 'b']
            state.read_history = ['jhn3']
            await flush()
            expect(stored('trans')).toBe('eng_a,spa_b')
            expect(stored('search')).toBe('jhn3')
            expect(stored('dark')).toBe('true')
            const flags = ['show_headings', 'show_chapters', 'show_verses', 'show_notes',
                'show_redletter', 'hebrew_ltr', 'original_chars']
            for (const key of flags){
                expect(stored(key)).toBe('false')
            }
            expect(stored('font_size')).toBe('large')
            expect(stored('search_history')).toBe('a\nb')
            expect(stored('read_history')).toBe('jhn3')
        })
    })
})

