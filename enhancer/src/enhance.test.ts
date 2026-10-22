// @vitest-environment jsdom

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {FetchClient, PassageReference} from '@gracious.tech/fetch-client'

import {BibleEnhancer} from './enhance.js'
import * as index from './index.js'
import {serve_collection} from './test_utils.js'


// Whether the stubbed device can hover
let can_hover = true

beforeEach(() => {
    document.body.innerHTML = ''
    document.body.className = ''
    can_hover = true
    vi.stubGlobal('matchMedia', () => ({matches: can_hover}))
    serve_collection()
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
})


// An enhancer using the test collection
function enhancer(options:ConstructorParameters<typeof BibleEnhancer>[0]={}){
    return new BibleEnhancer({client: new FetchClient({endpoints: ['https://x/']}), ...options})
}

// Wait for pending async work (fetches and DOM updates) to settle
const settle = () => new Promise(resolve => {
    setTimeout(resolve, 20)
})

const john_3_16 = new PassageReference('jhn', 3, 16)


describe('BibleEnhancer setup', () => {

    it("Adds the theme and a hidden app iframe", ({expect}) => {
        enhancer({translations: ['eng_test'], app_args: {dark: 'true'}})
        expect(document.body.classList.contains('fb-enhancer-theme')).toBe(true)
        const iframe = document.querySelector('.fb-enhancer-app iframe') as HTMLIFrameElement
        expect(iframe.src).toBe('https://app.fetch.bible/#back=true&trans=eng_test&dark=true')
        expect(index.BibleEnhancer).toBe(BibleEnhancer)
    })

    it("Can skip the default theme and use another app and a default client", ({expect}) => {
        const e = new BibleEnhancer({default_theme: false, app_origin: 'https://app'})
        expect(document.body.classList.contains('fb-enhancer-theme')).toBe(false)
        expect(e._app_iframe.src).toBe('https://app/#back=true&trans=&')
        expect(e.client).toBeInstanceOf(FetchClient)
    })
})


describe('showing and hiding the app', () => {

    it("Shows the app at a passage and pushes history", ({expect}) => {
        const before = vi.fn()
        const e = enhancer({translations: ['eng_test'], before_history_push: before})
        const post = vi.spyOn(e._app_iframe.contentWindow!, 'postMessage')
        const push = vi.spyOn(window.history, 'pushState')
        e.show_app(john_3_16)
        expect(e._app_div.classList.contains('fb-show')).toBe(true)
        expect(post).toHaveBeenCalledWith({type: 'update', trans: 'eng_test',
            search: 'jhn3:16'}, 'https://app.fetch.bible')
        expect(before).toHaveBeenCalledOnce()
        expect(push).toHaveBeenCalledWith({fetch_enhancer_app: true}, '')
    })

    it("Hides the app, going back if it pushed history", ({expect}) => {
        const e = enhancer()
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
        e.show_app(john_3_16)
        e.hide_app()
        expect(e._app_div.classList.contains('fb-show')).toBe(false)
        expect(back).toHaveBeenCalledOnce()
        window.history.replaceState(null, '')
        e.hide_app()
        expect(back).toHaveBeenCalledOnce()
    })

    it("Doesn't touch history when disabled", ({expect}) => {
        const e = enhancer({history: false})
        const push = vi.spyOn(window.history, 'pushState')
        e.show_app(john_3_16)
        expect(push).not.toHaveBeenCalled()
    })

    it("Hides when clicked, when the app says back, and on navigation", ({expect}) => {
        const e = enhancer({history: false})
        const shown = () => e._app_div.classList.contains('fb-show')
        e.show_app(john_3_16)
        e._app_div.click()
        expect(shown()).toBe(false)

        e.show_app(john_3_16)
        self.dispatchEvent(new MessageEvent('message', {origin: 'https://evil',
            data: {type: 'back'}}))
        expect(shown()).toBe(true)  // Ignored as not from the app
        self.dispatchEvent(new MessageEvent('message', {origin: 'https://app.fetch.bible',
            data: {type: 'other'}}))
        expect(shown()).toBe(true)
        self.dispatchEvent(new MessageEvent('message', {origin: 'https://app.fetch.bible',
            data: {type: 'back'}}))
        expect(shown()).toBe(false)

        e.show_app(john_3_16)
        self.dispatchEvent(new PopStateEvent('popstate'))
        expect(shown()).toBe(false)
    })
})


describe('hover boxes', () => {

    it("Fill with each translation's passage (or a dash if missing)", async ({expect}) => {
        const e = enhancer({translations: ['eng_test', 'missing', 'spa_test']})
        const div = document.createElement('div')
        await e._set_hover_contents(div, john_3_16)
        expect(div.innerHTML).toContain('ENG 3:16')
        expect(div.innerHTML).toContain('SPA 3:16')
        expect(div.querySelectorAll('.fb-attribution')).toHaveLength(2)
        await e._set_hover_contents(div, new PassageReference('gen', 1, 1))
        expect(div.innerHTML).toBe('<p>—</p><div class="fb-attribution">TST</div>'
            + '<p>—</p><div class="fb-attribution">PRB</div>')
    })

    it("Default to the preferred translation", async ({expect}) => {
        const e = enhancer()
        await e._set_hover_contents(document.createElement('div'), john_3_16)
        expect(e._translations).toEqual(['eng_test'])
    })

    it("Appear on hover, then fade out, unless hovered again", async ({expect}) => {
        const e = enhancer({translations: ['eng_test'], history: false})
        const link = document.createElement('a')
        document.body.appendChild(link)
        await e.enhance_element(link, john_3_16)
        await settle()
        vi.useFakeTimers()
        const box = () => document.querySelector<HTMLDivElement>('.fb-enhancer-hover')

        // A stale box from another reference is removed when hovering
        const stale = document.createElement('div')
        stale.classList.add('fb-enhancer-hover')
        document.body.appendChild(stale)
        vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000)
        link.dispatchEvent(new MouseEvent('mouseenter', {clientX: 10}))
        expect(document.body.contains(stale)).toBe(false)
        expect(box()!.innerHTML).toContain('ENG 3:16')
        expect(box()!.style.left).toBe('14px')  // Right of cursor

        // Leaving starts removal, but returning to the link or the box cancels it
        link.dispatchEvent(new MouseEvent('mouseleave'))
        expect(box()!.style.opacity).toBe('0')
        link.dispatchEvent(new MouseEvent('mouseleave'))  // No second timeout
        link.dispatchEvent(new MouseEvent('mouseenter'))
        expect(box()!.style.opacity).toBe('1')
        box()!.dispatchEvent(new MouseEvent('mouseleave'))
        box()!.dispatchEvent(new MouseEvent('mouseenter'))
        vi.advanceTimersByTime(500)
        expect(box()).not.toBeNull()

        // Kept within the page near the right edge
        box()!.remove()
        link.dispatchEvent(new MouseEvent('mouseenter', {clientX: 990}))
        expect(box()!.style.left).toBe('646px')

        // Removed once faded out
        box()!.dispatchEvent(new MouseEvent('mouseleave'))
        vi.advanceTimersByTime(500)
        expect(box()).toBeNull()

        // Already detached boxes are left alone when the timeout fires
        link.dispatchEvent(new MouseEvent('mouseenter'))
        const hover_box = box()!
        link.dispatchEvent(new MouseEvent('mouseleave'))
        hover_box.remove()
        vi.advanceTimersByTime(500)
        expect(box()).toBeNull()
    })

    it("Open the app when the link or box is clicked", async ({expect}) => {
        const e = enhancer({history: false})
        const show = vi.spyOn(e, 'show_app')
        const link = document.createElement('a')
        await e.enhance_element(link, john_3_16)
        const click = new MouseEvent('click', {cancelable: true})
        link.dispatchEvent(click)
        expect(click.defaultPrevented).toBe(true)
        e._hover_divs[0]![0].click()
        expect(show).toHaveBeenCalledTimes(2)
    })

    it("Aren't used on touch devices", async ({expect}) => {
        can_hover = false
        const e = enhancer()
        await e.enhance_element(document.createElement('a'), john_3_16)
        expect(e._hover_divs).toEqual([])
    })

    it("Refresh when the translation changes", async ({expect}) => {
        const e = enhancer({translations: ['eng_test']})
        await e.enhance_element(document.createElement('a'), john_3_16)
        e.change_translation('spa_test')
        await settle()
        expect(e._translations).toEqual(['spa_test'])
        expect(e._hover_divs[0]![0].innerHTML).toContain('SPA 3:16')
    })
})


describe('discover_bible_references', () => {

    it("Links references to the app", async ({expect}) => {
        const e = enhancer({app_args: {x: '1'}})
        document.body.innerHTML += '<p>See John 3:16</p>'
        await e.discover_bible_references()
        const link = document.querySelector('a.fb-enhancer-link') as HTMLAnchorElement
        expect(link.href).toBe('https://app.fetch.bible/#trans=eng_test&search=jhn3:16&x=1')
        expect(link.target).toBe('_blank')
    })

    it("Loads local names for non-English translations", async ({expect}) => {
        const fetch = serve_collection()
        const e = enhancer({translations: ['spa_test', 'eng_test', 'missing']})
        const root = document.createElement('div')
        root.innerHTML = '<p>Juan 3:16</p>'
        await e.discover_bible_references(root)
        expect(fetch).toHaveBeenCalledWith('https://x/bibles/spa_test/extra.json',
            {mode: 'cors'})
        expect(root.querySelector('a')!.textContent).toBe('Juan 3:16')
    })

    it("Re-enhances links an SPA re-rendered, but not ones still enhanced", async ({expect}) => {
        const e = enhancer({translations: ['eng_test']})
        const enhance = vi.spyOn(e, 'enhance_element')
        const root = document.createElement('div')
        root.innerHTML = '<a class="fb-enhancer-link" href="https://app#search=jhn3:16">x</a>'
            + '<a class="fb-enhancer-link" href="https://app#search=nonsense">y</a>'
            + '<a class="fb-enhancer-link" href="https://app">z</a>'
        const enhanced = document.createElement('a')
        enhanced.className = 'fb-enhancer-link'
        // @ts-expect-error Custom property set by enhance_element
        enhanced['_fetch_enhanced'] = true
        root.appendChild(enhanced)
        await e.discover_bible_references(root, () => true)
        expect(enhance).toHaveBeenCalledOnce()
        expect(enhance.mock.calls[0]![1].toString()).toBe('John 3:16')
    })
})
