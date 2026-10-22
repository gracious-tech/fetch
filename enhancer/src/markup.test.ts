// @vitest-environment jsdom

import {describe, it, beforeAll, afterAll, vi} from 'vitest'
import {FetchClient} from '@gracious.tech/fetch-client'

import {default_filter, markup_references} from './markup.js'
import {serve_collection} from './test_utils.js'

import type {FetchCollection} from '@gracious.tech/fetch-client'


let collection:FetchCollection
beforeAll(async () => {
    serve_collection()
    collection = await new FetchClient({endpoints: ['https://x/']}).fetch_collection()
})
afterAll(() => {
    vi.unstubAllGlobals()
})


// Render HTML in a fresh root element
function root(html:string){
    const div = document.createElement('div')
    div.innerHTML = html
    document.body.appendChild(div)
    return div
}


describe('markup_references', () => {

    it("Turns references into links, skipping headings, links and comments", async ({expect}) => {
        const div = root('<h2>John 3:16</h2><p>See John 3:16 and Jn 3:17.</p>'
            + '<a>John 3:18</a><!-- John 3:19 -->')
        const items = await markup_references(collection, div)
        expect(items.map(item => item.ref.toString())).toEqual(['John 3:16', 'John 3:17'])
        expect(div.innerHTML).toBe('<h2>John 3:16</h2><p>See <a class="fb-enhancer-link">'
            + 'John 3:16</a> and <a class="fb-enhancer-link">Jn 3:17</a>.</p>'
            + '<a>John 3:18</a><!-- John 3:19 -->')
        expect(items[0]!.element.tagName).toBe('A')
    })

    it("Groups the ranges of one reference together", async ({expect}) => {
        const div = root('<p>Read John 3:1,5 and John 3:16.</p>')
        const items = await markup_references(collection, div)
        expect(items.map(item => item.ref.toString())).toEqual(['John 3:1', 'John 3:5',
            'John 3:16'])
        const multi = div.querySelector('.fb-enhancer-multi')!
        expect(multi.textContent).toBe('John 3:1,5')
        expect(multi.querySelectorAll('a')).toHaveLength(2)
    })

    it("Uses translations' local names and a custom filter", async ({expect}) => {
        await collection.bibles.fetch_translation_extras('spa_test')
        const div = root('<p>Juan 3:16</p><div class="skip">Juan 3:17</div>')
        const items = await markup_references(collection, div, ['spa_test'], false,
            element => !element.classList.contains('skip'))
        expect(items.map(item => item.ref.toString())).toEqual(['John 3:16'])
        expect(await markup_references(collection, root('<p>John 3:16</p>'), ['spa_test'], false))
            .toEqual([])
    })

    it("Excludes headings by default", ({expect}) => {
        expect(default_filter(document.createElement('h1'))).toBe(false)
        expect(default_filter(document.createElement('p'))).toBe(true)
    })
})
