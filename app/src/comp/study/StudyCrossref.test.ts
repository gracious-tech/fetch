
import {mount_app} from '@/services/test_utils'

import {afterEach, describe, it} from 'vitest'
import {enableAutoUnmount} from '@vue/test-utils'
import {PassageReference} from '@gracious.tech/fetch-client'

import {state} from '@/services/state'
import StudyCrossref from './StudyCrossref.vue'


enableAutoUnmount(afterEach)


describe('StudyCrossref', () => {

    it("Shows the reference and navigates to it, saving the study verse", ({expect}) => {
        state.study = new PassageReference('gen', 1, 1)
        state.read_history = []
        const reference = new PassageReference({book: 'jhn', start_chapter: 1, start_verse: 1,
            end_verse: 3})
        const wrapper = mount_app(StudyCrossref, {props: {reference}})
        expect(wrapper.text()).toBe('John 1:1-3')

        void wrapper.find('.v-chip').trigger('click')
        expect(state.read_history).toEqual(['jhn1:1-3', 'gen1:1'])
        expect(state.passage?.to_serialized()).toBe('jhn1:1-3')
        expect(state.book).toBe('jhn')
    })
})
