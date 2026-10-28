// @vitest-environment jsdom

import {fake_collection} from './test_utils'

import {describe, it} from 'vitest'

import {current_book_name, current_book_abbrev, chapters, chapter_display, chapter_display_abbrev,
    direction} from './computes'
import {content} from './content'
import {state} from './state'

import type {GetResourcesItem} from '@gracious.tech/fetch-client'


describe('computes', () => {

    content.collection = fake_collection({eng_a: ['gen', 'oba']})
    state.trans = ['eng_a']

    it("Displays book and chapter", ({expect}) => {
        state.book = 'gen'
        state.chapter = 2
        expect(current_book_name.value).toBe('Genesis')
        expect(current_book_abbrev.value).toBe('Gen')
        expect(chapters.value).toHaveLength(50)
        expect(chapter_display.value).toBe('Genesis 2')
        expect(chapter_display_abbrev.value).toBe('Gen 2')
    })

    it("Omits chapter for single chapter books", ({expect}) => {
        state.book = 'oba'
        state.chapter = 1
        expect(chapter_display.value).toBe('Obadiah')
        expect(chapter_display_abbrev.value).toBe('Obad')
    })

    it("Has no chapters if translation lacks book", ({expect}) => {
        state.book = 'exo'
        expect(chapters.value).toEqual([])
    })

    it("Gives text direction of each translation", ({expect}) => {
        content.translations = {heb_a: {direction: 'rtl'} as GetResourcesItem}
        state.trans = ['heb_a', 'eng_x']
        expect(direction.value).toEqual(['rtl', 'ltr'])
    })
})

