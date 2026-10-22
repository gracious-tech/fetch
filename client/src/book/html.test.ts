// @vitest-environment jsdom

import {describe, it} from 'vitest'
import {PassageReference} from '@gracious.tech/bible-references'

import {add_passage_class, rm_passage_class, wrap_verse_parts} from './html.js'


// Render HTML into a fresh container element
function container(html:string):HTMLElement{
    const div = document.createElement('div')
    div.innerHTML = html
    return div
}


describe('wrap_verse_parts', () => {

    it("Wraps the parts of each verse in a span marked with the verse", ({expect}) => {
        const root = container('<p>Before<sup data-v="1:1">1</sup>One <b>bold</b>'
            + '<sup data-v="1:2">2</sup>Two</p><p>Still two<sup>x</sup></p>')
        wrap_verse_parts(root)
        expect(root.innerHTML).toBe('<p>Before<sup data-v="1:1">1</sup>'
            + '<span data-v="1:1">One <b>bold</b></span><sup data-v="1:2">2</sup>'
            + '<span data-v="1:2">Two</span></p>'
            + '<p><span data-v="1:2">Still two<sup>x</sup></span></p>')
    })
})


describe('add_passage_class / rm_passage_class', () => {

    const html = '<span data-v="1:1">a</span><span data-v="1:2">b</span>'
        + '<span data-v="1:3">c</span><span data-v="2:1">d</span>'

    it("Adds a class to the verses of a passage only", ({expect}) => {
        const root = container(html)
        add_passage_class(root, new PassageReference({book: 'gen', start_chapter: 1,
            start_verse: 2, end_chapter: 1, end_verse: 3}), 'hl')
        expect([...root.querySelectorAll('.hl')].map(el => el.textContent)).toEqual(['b', 'c'])
    })

    it("Removes the class again", ({expect}) => {
        const root = container(html)
        add_passage_class(root, new PassageReference('gen', 1), 'hl')
        expect(root.querySelectorAll('.hl')).toHaveLength(3)
        rm_passage_class(root, 'hl')
        expect(root.querySelectorAll('.hl')).toHaveLength(0)
    })
})
