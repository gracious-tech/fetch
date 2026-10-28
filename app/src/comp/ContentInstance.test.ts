
import {fake_collection, mount_app} from '@/services/test_utils'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {nextTick} from 'vue'
import {PassageReference} from '@gracious.tech/bible-references'

import ContentInstance from './ContentInstance.vue'
import {state} from '@/services/state'
import {content} from '@/services/content'

import type {VueWrapper} from '@vue/test-utils'
import type {GetResourcesItem} from '@gracious.tech/fetch-client'


// Fake IntersectionObserver that records instances so tests can trigger entries
class FakeObserver {
    static instances:FakeObserver[] = []
    callback:(entries:Partial<IntersectionObserverEntry>[]) => void
    observed:Element[] = []
    disconnect = vi.fn()
    constructor(callback:(entries:Partial<IntersectionObserverEntry>[]) => void){
        this.callback = callback
        FakeObserver.instances.push(this)
    }
    observe(element:Element){
        this.observed.push(element)
    }
}
vi.stubGlobal('IntersectionObserver', FakeObserver)


// Genesis 1-2 html with verse markers and chapter headings
const html = '<h3 data-c="1">1</h3><p><sup data-v="1:1">1</sup>In the beginning '
    + '<sup data-v="1:2">2</sup>Formless <sup data-v="1:4">4</sup>Light</p>'
    + '<h3 data-c="2">2</h3><p><sup data-v="2:1">1</sup>Finished <sup data-v="2:2">2</sup>Rest</p>'


// Positions of elements (relative to viewport), keyed by data-v/data-c value
let positions:Record<string, number> = {}
const scroll = vi.fn()


// Mount and wait for post-flush watchers to run
async function mount_instance(){
    const wrapper = mount_app(ContentInstance)
    await nextTick()
    return wrapper
}


// The last created observer
function last_observer(){
    return FakeObserver.instances.at(-1)!
}


// Swipe via touch events
async function touch(wrapper:VueWrapper, type:string, points:{pageX:number, pageY:number}[]){
    await wrapper.find('.content').trigger(type, {touches: points})
}


// Ids of verse spans with the given class
function highlighted(clas:string){
    return [...document.querySelectorAll<HTMLElement>(`span.${clas}`)].map(s => s.dataset['v'])
}


describe('ContentInstance', () => {

    let wrapper:VueWrapper|null = null

    beforeEach(() => {
        content.collection = fake_collection({eng_a: ['gen'], eng_b: ['gen']})
        content.translations = {eng_b: {direction: 'rtl'} as GetResourcesItem}
        Object.assign(state, {trans: ['eng_a'], book: 'gen', chapter: 1, verse: 1, passage: null,
            study: null, content: '', content_verses: [], show_headings: true,
            show_chapters: true, show_verses: true, show_notes: true, show_redletter: true,
            font_size: 'regular'})
        FakeObserver.instances = []
        positions = {}
        scroll.mockClear()
        HTMLElement.prototype.scroll = scroll
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
            function(this:HTMLElement){
                const key = this.dataset['v'] ?? this.dataset['c'] ?? ''
                return {top: positions[key] ?? 0} as DOMRect
            })
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        vi.restoreAllMocks()
    })

    it("Applies classes for display settings", async ({expect}) => {
        Object.assign(state, {show_headings: false, show_chapters: false, show_verses: false,
            show_notes: false, show_redletter: false, font_size: 'large', book: 'psa'})
        wrapper = await mount_instance()
        const classes = wrapper.find('.content').classes()
        expect(classes).toEqual(expect.arrayContaining(['fetch-bible', 'no-headings',
            'no-chapters', 'no-verses', 'no-notes', 'no-red-letter', 'no-select',
            'no-initial-indent', 'size-large']))
    })

    it("Omits classes for enabled settings", async ({expect}) => {
        wrapper = await mount_instance()
        const classes = wrapper.find('.content').classes()
        expect(classes).not.toContain('no-headings')
        expect(classes).not.toContain('no-initial-indent')
        expect(classes).toContain('size-regular')
    })

    it("Disables swipe indicators at book boundaries", async ({expect}) => {
        wrapper = await mount_instance()
        expect(wrapper.find('.prev_ch').classes()).toContain('disabled')
        expect(wrapper.find('.next_ch').classes()).not.toContain('disabled')
        expect(wrapper.find('.next_ch').text()).toBe('2')
        state.chapter = 50
        await nextTick()
        expect(wrapper.find('.prev_ch').classes()).not.toContain('disabled')
        expect(wrapper.find('.next_ch').classes()).toContain('disabled')
    })

    it("Renders a single translation as html", async ({expect}) => {
        state.content = html
        wrapper = await mount_instance()
        expect(wrapper.find('.single').text()).toContain('In the beginning')
        // Verse contents wrapped in spans
        expect(wrapper.find('span[data-v="1:2"]').element.textContent).toBe('Formless ')
    })

    it("Renders parallel translations per verse with their direction", async ({expect}) => {
        state.trans = ['eng_a', 'eng_b']
        state.content_verses = [
            [{id: 1, chapter: 1, verse: 1, content: '<p>A1</p>'},
                {id: 2, chapter: 1, verse: 2, content: '<p>A2</p>'}],
            [{id: 1, chapter: 1, verse: 1, content: '<p>B1</p>'}],
        ]
        wrapper = await mount_instance()
        const verses = wrapper.findAll('.verse')
        expect(verses).toHaveLength(2)
        expect(verses[0]!.findAll('.verse_trans').map(t => t.text())).toEqual(['A1', 'B1'])
        expect(verses[0]!.findAll('.verse_trans').map(t => t.classes()))
            .toEqual([['verse_trans', 'ltr'], ['verse_trans', 'rtl']])
        // Missing verse in second translation renders empty
        expect(verses[1]!.findAll('.verse_trans')[1]!.text()).toBe('')
    })

    it("Shows a loading state with no content (no DOM work done)", async ({expect}) => {
        wrapper = await mount_instance()
        expect(wrapper.find('.single').exists()).toBe(false)
        expect(FakeObserver.instances).toHaveLength(0)
        expect(scroll).not.toHaveBeenCalled()
    })

    describe("Scrolling to the current verse", () => {

        it("Scrolls to the verse with a buffer for the toolbar", async ({expect}) => {
            Object.assign(state, {content: html, chapter: 1, verse: 2})
            positions = {'1:2': 500}
            wrapper = await mount_instance()
            expect(scroll).toHaveBeenCalledWith({top: 440})
        })

        it("Uses the chapter heading for the first verse", async ({expect}) => {
            Object.assign(state, {content: html, chapter: 2, verse: 1})
            positions = {'2': 300, '2:1': 900}
            wrapper = await mount_instance()
            expect(scroll).toHaveBeenCalledWith({top: 240})
        })

        it("Falls back to the previous verse if verse missing", async ({expect}) => {
            Object.assign(state, {content: html, chapter: 1, verse: 5})
            positions = {'1:4': 700}
            wrapper = await mount_instance()
            expect(scroll).toHaveBeenCalledWith({top: 640})
        })

        it("Falls back to the chapter if neither verse nor previous exist", async ({expect}) => {
            Object.assign(state, {content: html, chapter: 1, verse: 6})
            positions = {'1': 100}
            wrapper = await mount_instance()
            expect(scroll).toHaveBeenCalledWith({top: 40})
        })

        it("Never scrolls above the top", async ({expect}) => {
            Object.assign(state, {content: html, chapter: 1, verse: 2})
            positions = {'1:2': 10}
            wrapper = await mount_instance()
            expect(scroll).toHaveBeenCalledWith({top: 0})
        })

        it("Doesn't scroll when nothing to scroll to", async ({expect}) => {
            // Chapter 3 has no heading and its verse 1 has no previous verse rendered
            Object.assign(state, {content: html, chapter: 3, verse: 1})
            wrapper = await mount_instance()
            expect(scroll).not.toHaveBeenCalled()
        })

        it("Doesn't scroll when first verse of book is missing", async ({expect}) => {
            // Gen 1:1 has no previous verse to fall back on
            Object.assign(state, {content: '<p>No markers</p>', chapter: 1, verse: 1})
            wrapper = await mount_instance()
            expect(scroll).not.toHaveBeenCalled()
        })
    })

    describe("Selecting verses to study", () => {

        it("Selects a clicked verse, and deselects it if clicked again", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            await wrapper.find('sup[data-v="1:2"]').trigger('click')
            expect(state.study?.to_serialized()).toBe('gen1:2')
            await nextTick()
            expect(highlighted('hl-study')).toEqual(['1:2'])
            await wrapper.find('sup[data-v="1:2"]').trigger('click')
            expect(state.study).toBe(null)
            await nextTick()
            expect(highlighted('hl-study')).toEqual([])
        })

        it("Switches selection to a different verse", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            await wrapper.find('sup[data-v="1:2"]').trigger('click')
            await wrapper.find('sup[data-v="2:1"]').trigger('click')
            expect(state.study?.to_serialized()).toBe('gen2:1')
        })

        it("Ignores clicks on non-verse elements", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            await wrapper.find('h3').trigger('click')
            expect(state.study).toBe(null)
        })

        it("Ignores clicks on non-element targets", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            // Text nodes can be the target of synthetic events
            const text_node = wrapper.find('span[data-v="1:1"]').element.firstChild!
            text_node.dispatchEvent(new MouseEvent('click', {bubbles: true}))
            expect(state.study).toBe(null)
        })

        it("Doesn't highlight a study verse from another book", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            state.study = new PassageReference('exo', 1, 2)
            await nextTick()
            expect(highlighted('hl-study')).toEqual([])
        })

        it("Highlights existing study verse on load (then passage over it)", async ({expect}) => {
            Object.assign(state, {content: html, study: new PassageReference('gen', 1, 4),
                passage: new PassageReference(
                    {book: 'gen', start_chapter: 2, start_verse: 1, end_verse: 2})})
            wrapper = await mount_instance()
            expect(highlighted('hl-study')).toEqual(['1:4'])
            expect(highlighted('hl-passage')).toEqual(['2:1', '2:2'])
        })
    })

    describe("Highlighting the passage", () => {

        it("Scrolls to and highlights a new passage", async ({expect}) => {
            state.content = html
            positions = {'2:2': 400}
            wrapper = await mount_instance()
            scroll.mockClear()
            state.passage = new PassageReference('gen', 2, 2)
            await nextTick()
            expect(scroll).toHaveBeenCalledWith({top: 340})
            expect(highlighted('hl-passage')).toEqual(['2:2'])
        })

        it("Clears highlight when passage removed", async ({expect}) => {
            Object.assign(state, {content: html, passage: new PassageReference('gen', 1, 2)})
            wrapper = await mount_instance()
            expect(highlighted('hl-passage')).toEqual(['1:2'])
            scroll.mockClear()
            state.passage = null
            await nextTick()
            expect(highlighted('hl-passage')).toEqual([])
            expect(scroll).not.toHaveBeenCalled()
        })

        it("Doesn't highlight whole chapters or other books", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            state.passage =
                new PassageReference({book: 'gen', start_chapter: 1, end_chapter: 2})
            await nextTick()
            expect(highlighted('hl-passage')).toEqual([])
            state.passage = new PassageReference('exo', 1, 2)
            await nextTick()
            expect(highlighted('hl-passage')).toEqual([])
        })
    })

    describe("Tracking position while scrolling", () => {

        it("Observes each verse once and updates chapter/verse on entering", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            const observer = last_observer()
            expect(observer.observed.map(e => (e as HTMLElement).dataset['v']))
                .toEqual(['1:1', '1:2', '1:4', '2:1', '2:2'])
            const verse = (v:string) => document.querySelector(`sup[data-v="${v}"]`)!
            observer.callback([
                {isIntersecting: false, target: verse('1:1')},
                {isIntersecting: true, target: verse('2:2')},
                {isIntersecting: true, target: verse('1:4')},
            ])
            expect([state.chapter, state.verse]).toEqual([2, 2])
        })

        it("Disconnects the old observer when content changes", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            const first = last_observer()
            state.content = html.replace('Light', 'Lights')
            expect(first.disconnect).toHaveBeenCalled()
            await nextTick()
            expect(FakeObserver.instances).toHaveLength(2)
        })

        it("Disconnects the observer on unmount", async ({expect}) => {
            state.content = html
            wrapper = await mount_instance()
            wrapper.unmount()
            wrapper = null
            expect(last_observer().disconnect).toHaveBeenCalled()
        })

        it("Copes with content changing before any observer exists", async ({expect}) => {
            wrapper = await mount_instance()
            state.content = html
            await nextTick()
            expect(FakeObserver.instances).toHaveLength(1)
        })
    })

    describe("Swiping between chapters", () => {

        beforeEach(() => {
            Object.assign(state, {content: html, chapter: 2})
        })

        it("Goes to next chapter when swiping left", async ({expect}) => {
            wrapper = await mount_instance()
            await touch(wrapper, 'touchstart', [{pageX: 300, pageY: 100}])
            await touch(wrapper, 'touchmove', [{pageX: 200, pageY: 120}])
            const next = wrapper.find<HTMLElement>('.next_ch').element
            // Distance of 100 reduced by vertical movement of 20
            expect(next.style.right).toBe('32px')
            expect(next.style.opacity).toBe('0.9')
            await touch(wrapper, 'touchend', [])
            expect([state.chapter, state.verse]).toEqual([3, 1])
            expect(state.passage?.to_serialized()).toBe('gen3')
            // Indicators reset and animate back
            expect(next.style.right).toBe('-48px')
            expect(next.style.transition).toContain('opacity')
        })

        it("Goes to previous chapter when swiping right", async ({expect}) => {
            wrapper = await mount_instance()
            await touch(wrapper, 'touchstart', [{pageX: 100, pageY: 100}])
            await touch(wrapper, 'touchmove', [{pageX: 200, pageY: 90}])
            const prev = wrapper.find<HTMLElement>('.prev_ch').element
            expect(prev.style.left).toBe('42px')
            expect(prev.style.transition).toBe('')
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(1)
        })

        it("Ignores short swipes", async ({expect}) => {
            wrapper = await mount_instance()
            await touch(wrapper, 'touchstart', [{pageX: 300, pageY: 100}])
            await touch(wrapper, 'touchmove', [{pageX: 260, pageY: 100}])
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(2)
        })

        it("Doesn't go past first or last chapter", async ({expect}) => {
            wrapper = await mount_instance()
            state.chapter = 50
            await touch(wrapper, 'touchstart', [{pageX: 300, pageY: 100}])
            await touch(wrapper, 'touchmove', [{pageX: 100, pageY: 100}])
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(50)
            state.chapter = 1
            await touch(wrapper, 'touchstart', [{pageX: 100, pageY: 100}])
            await touch(wrapper, 'touchmove', [{pageX: 300, pageY: 100}])
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(1)
        })

        it("Cancels swipe after too much vertical movement", async ({expect}) => {
            wrapper = await mount_instance()
            await touch(wrapper, 'touchstart', [{pageX: 300, pageY: 100}])
            await touch(wrapper, 'touchmove', [{pageX: 100, pageY: 300}])
            // Further movement ignored until next touch start
            await touch(wrapper, 'touchmove', [{pageX: 50, pageY: 100}])
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(2)
        })

        it("Cancels swipe if text selection changes", async ({expect}) => {
            wrapper = await mount_instance()
            await touch(wrapper, 'touchstart', [{pageX: 300, pageY: 100}])
            window.getSelection()!.selectAllChildren(wrapper.find('h3').element)
            await touch(wrapper, 'touchmove', [{pageX: 100, pageY: 100}])
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(2)
            window.getSelection()!.removeAllRanges()
        })

        it("Ignores multi-touch starts and moves without touches", async ({expect}) => {
            wrapper = await mount_instance()
            await touch(wrapper, 'touchstart',
                [{pageX: 300, pageY: 100}, {pageX: 10, pageY: 10}])
            await touch(wrapper, 'touchmove', [])
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(2)
        })

        it("Cancels swipe when touch is cancelled", async ({expect}) => {
            wrapper = await mount_instance()
            await touch(wrapper, 'touchstart', [{pageX: 300, pageY: 100}])
            await touch(wrapper, 'touchmove', [{pageX: 100, pageY: 100}])
            await touch(wrapper, 'touchcancel', [])
            await touch(wrapper, 'touchend', [])
            expect(state.chapter).toBe(2)
            expect(wrapper.find<HTMLElement>('.prev_ch').element.style.opacity).toBe('0')
        })
    })
})
