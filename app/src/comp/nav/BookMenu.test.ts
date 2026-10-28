
import {mount_app} from '@/services/test_utils'

import {afterEach, beforeEach, describe, it} from 'vitest'
import {enableAutoUnmount} from '@vue/test-utils'

import {state} from '@/services/state'
import {content} from '@/services/content'
import BookMenu from './BookMenu.vue'

import type {DOMWrapper} from '@vue/test-utils'
import type {FetchCollection, PassageReference} from '@gracious.tech/fetch-client'


enableAutoUnmount(afterEach)


// OT has more books than NT (as in a real Bible), Exodus and Jude unavailable
const books = {
    ot: [{id: 'gen', available: true}, {id: 'exo', available: false},
        {id: 'oba', available: true}],
    nt: [{id: 'mat', available: true}, {id: 'jud', available: false}],
}
content.collection = {bibles: {
    get_books: (_trans:string, {testament}:{testament:'ot'|'nt'}) => books[testament],
    has_book: (_trans:string, book:string) => ['gen', 'oba', 'mat'].includes(book),
    reference_to_string: (ref:PassageReference) => ref.toString(),
}} as unknown as FetchCollection


// Find the list item for a book by its displayed name
function book_item(items:DOMWrapper<Element>[], name:string):DOMWrapper<Element>{
    return items.find(item => item.text() === name)!
}


describe('BookMenu', () => {

    beforeEach(() => {
        state.trans = ['eng_a']
        state.book = 'gen'
        state.chapter = 1
        state.show_nav = true
        state.read_history = []
    })

    it("Shows recent passages", ({expect}) => {
        state.read_history = ['rom8:28', 'jhn3:16']
        const chips = mount_app(BookMenu).findAll('.recent .v-chip')
        expect(chips.map(c => c.text())).toEqual(['Romans 8:28', 'John 3:16'])
    })

    it("Lists OT and NT books side by side, disabling unavailable ones", ({expect}) => {
        const wrapper = mount_app(BookMenu)
        expect(wrapper.findAll('.row').map(r => r.text()))
            .toEqual(['GenesisMatthew', 'ExodusJude', 'Obadiah'])
        const items = wrapper.findAll('.v-list-item')
        expect(book_item(items, 'Exodus').classes()).toContain('v-list-item--disabled')
        expect(book_item(items, 'Genesis').classes()).toContain('v-list-item--active')
    })

    it("Shows chapters of the current book and goes to one when picked", async ({expect}) => {
        state.chapter = 2
        const wrapper = mount_app(BookMenu)
        const buttons = wrapper.findAll('.chapters button')
        expect(buttons).toHaveLength(50)
        expect(buttons[1]!.classes()).toContain('v-btn--active')

        await buttons[2]!.trigger('click')
        expect(state.chapter).toBe(3)
        expect(state.show_nav).toBe(false)
        expect(state.read_history).toEqual([state.passage!.to_serialized()])
    })

    it("Stays open after picking a book with multiple chapters", async ({expect}) => {
        const wrapper = mount_app(BookMenu)
        await book_item(wrapper.findAll('.v-list-item'), 'Matthew').trigger('click')
        expect(state.book).toBe('mat')
        expect(state.show_nav).toBe(true)
        expect(state.read_history).toEqual([])
        // Chapters of an NT book are aligned under the NT column
        expect(wrapper.find('.chapters').classes()).toContain('nt')
        expect(wrapper.findAll('.chapters button')).toHaveLength(28)
    })

    it("Goes straight to a book that has a single chapter", async ({expect}) => {
        const wrapper = mount_app(BookMenu)
        await book_item(wrapper.findAll('.v-list-item'), 'Obadiah').trigger('click')
        expect(state.book).toBe('oba')
        expect(state.show_nav).toBe(false)
        expect(state.read_history).toEqual(['oba'])
        expect(wrapper.find('.chapters').exists()).toBe(false)
    })
})
