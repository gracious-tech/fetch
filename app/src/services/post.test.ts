// @vitest-environment jsdom

import './test_utils'

import {describe, it, vi} from 'vitest'

import {post_message} from './post'
import {state} from './state'


describe('post_message', () => {

    it("Posts message with current status to parent frame", ({expect}) => {
        const post = vi.spyOn(self.parent, 'postMessage').mockImplementation(() => undefined)
        state.trans = ['eng_a', 'spa_b']
        state.book = 'jhn'
        state.chapter = 3
        state.verse = 16
        state.dark = null
        post_message('verse')
        expect(post).toHaveBeenCalledWith({type: 'verse', languages: ['eng', 'spa'],
            translations: ['eng_a', 'spa_b'], book: 'jhn', chapter: 3, verse: 16, dark: false}, '*')
    })
})

