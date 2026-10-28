
import {mount_app} from '@/services/test_utils'

import {afterEach, beforeEach, describe, it} from 'vitest'
import {nextTick} from 'vue'
import {enableAutoUnmount} from '@vue/test-utils'
import {PassageReference} from '@gracious.tech/fetch-client'

import {state} from '@/services/state'
import StudyWord from './StudyWord.vue'

import type {GlossesWord} from '@gracious.tech/fetch-client'


enableAutoUnmount(afterEach)


// A Hebrew/Greek word with a gloss
function word(gloss='create', text='created', original='בָּרָא'):GlossesWord{
    return {word: text, original, gloss}
}


// Mount a word for the given strongs code
function mount_word(props:{word:GlossesWord, strongs:string|undefined}){
    return mount_app(StudyWord, {props})
}


describe('StudyWord', () => {

    beforeEach(() => {
        state.study = new PassageReference('gen', 1, 1)
        state.original_chars = true
        state.show_nav = false
        state.search_orig = null
        state.search_orig_mode = 'strongs'
    })

    it("Shows original or transliterated word and the gloss", async ({expect}) => {
        const wrapper = mount_word({word: word(), strongs: 'H1254'})
        expect(wrapper.find('.word').text()).toBe('בָּרָא')
        expect(wrapper.find('.word').classes()).toContain('ot')
        expect(wrapper.find('.gloss').text()).toBe('create')
        state.original_chars = false
        await nextTick()
        expect(wrapper.find('.word').text()).toBe('created')
    })

    it("Replaces a blank or hyphen gloss with an mdash", ({expect}) => {
        expect(mount_word({word: word(''), strongs: 'H1'}).find('.gloss').text()).toBe('—')
        expect(mount_word({word: word('-'), strongs: 'H1'}).find('.gloss').text()).toBe('—')
    })

    it("Links to research by strongs number, dropping any letter suffix", ({expect}) => {
        const ot = mount_word({word: word(), strongs: 'H1254a'})
        expect(ot.find('.gloss').attributes('href')).toBe('https://biblehub.com/hebrew/1254.htm')
        state.study = new PassageReference('jhn', 1, 1)
        const nt = mount_word({word: word(), strongs: 'G25'})
        expect(nt.find('.gloss').attributes('href')).toBe('https://biblehub.com/greek/25.htm')
    })

    it("Links to a word search when there's no strongs number", ({expect}) => {
        const ot = mount_word({word: word('x', 'a b'), strongs: undefined})
        expect(ot.find('.gloss').attributes('href'))
            .toBe('https://biblehub.com/searchhebrew.php?q=a%20b')
        state.study = new PassageReference('jhn', 1, 1)
        const nt = mount_word({word: word('x', 'logos'), strongs: undefined})
        expect(nt.find('.gloss').attributes('href'))
            .toBe('https://biblehub.com/searchgreek.php?q=logos')
    })

    it("Can't search for a word without strongs in strongs mode", async ({expect}) => {
        await mount_word({word: word(), strongs: undefined}).find('.word').trigger('click')
        expect(state.show_nav).toBe(false)
        expect(state.search_orig).toBe(null)
    })

    it("Searches without strongs in original mode", async ({expect}) => {
        state.search_orig_mode = 'original'
        await mount_word({word: word(), strongs: undefined}).find('.word').trigger('click')
        expect(state.search_orig).toEqual({ot: true,
            words: [{word: 'created', original: 'בָּרָא', strongs: ''}]})
    })

    it("Starts a search, adds new words, and ignores duplicates", async ({expect}) => {
        await mount_word({word: word(), strongs: 'H1254'}).find('.word').trigger('click')
        expect(state.show_nav).toBe(true)
        expect(state.search_orig).toEqual({ot: true,
            words: [{word: 'created', original: 'בָּרָא', strongs: 'H1254'}]})

        // Same strongs again isn't added
        await mount_word({word: word('y', 'other'), strongs: 'H1254'}).find('.word')
            .trigger('click')
        expect(state.search_orig?.words).toHaveLength(1)

        // Different strongs is added
        await mount_word({word: word('god', 'God', 'אֱלֹהִים'), strongs: 'H430'}).find('.word')
            .trigger('click')
        expect(state.search_orig?.words.map(w => w.strongs)).toEqual(['H1254', 'H430'])
    })

    it("Resets the search when the testament differs", async ({expect}) => {
        state.search_orig = {ot: false, words: [{word: 'a', original: 'b', strongs: 'G1'}]}
        await mount_word({word: word(), strongs: 'H1254'}).find('.word').trigger('click')
        expect(state.search_orig).toEqual({ot: true,
            words: [{word: 'created', original: 'בָּרָא', strongs: 'H1254'}]})
    })
})
