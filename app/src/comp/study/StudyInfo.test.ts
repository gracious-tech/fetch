
import {mount_app} from '@/services/test_utils'

import {afterEach, beforeEach, describe, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises} from '@vue/test-utils'
import {PassageReference} from '@gracious.tech/fetch-client'

import {state} from '@/services/state'
import {content} from '@/services/content'
import StudyInfo from './StudyInfo.vue'

import type {BookCrossref, GlossesBook, NotesBook, SearchWords}
    from '@gracious.tech/fetch-client'


enableAutoUnmount(afterEach)


// Strongs lookup that labels codes by testament
function strongs(prefix:string){
    return Promise.resolve({get_words_for_ref: () => [`${prefix}1`, `${prefix}2`]}) as
        unknown as Promise<SearchWords>
}


// Notes for a verse, including a range too long to be useful
function fake_notes(){
    return {get_relevant_notes: vi.fn(() => [
        {reference: new PassageReference('gen', 1, 1),
            contents: 'See <span data-ref="exo,2,3">Exo 2:3</span>'
                + ' and <span data-ref="">nowhere</span>'},
        {reference: new PassageReference({book: 'gen', start_chapter: 1, start_verse: 1,
            end_verse: 5}), contents: 'Range note'},
        {reference: new PassageReference({book: 'gen', start_chapter: 1, end_chapter: 5}),
            contents: 'Too long'},
    ])} as unknown as NotesBook
}


describe('StudyInfo', () => {

    beforeEach(() => {
        content.search_orig_ot = strongs('H')
        content.search_orig_nt = strongs('G')
        state.trans = ['eng_a']
        state.study_notes = true
        state.original_chars = true
        state.hebrew_ltr = false
        state.read_history = []
        state.passage = null
        state.crossref = {get_refs: () => [...Array(10).keys()].map(i =>
            new PassageReference('jhn', 1, i + 1))} as unknown as BookCrossref
        state.glosses = {get_words: () => [{word: 'In', original: 'בְּ', gloss: 'in'},
            {word: 'beginning', original: 'רֵאשִׁית', gloss: 'beginning'}]} as
            unknown as GlossesBook
        state.notes = fake_notes()
        state.study = new PassageReference('gen', 1, 1)
    })

    it("Labels the verse and returns to it when clicked", async ({expect}) => {
        const wrapper = mount_app(StudyInfo)
        expect(wrapper.find('h4.ref').text()).toBe('Genesis 1:1')
        await wrapper.find('h4.ref').trigger('click')
        expect(state.passage?.to_serialized()).toBe('gen1:1')
        expect(state.read_history).toEqual(['gen1:1'])
    })

    it("Shows up to 8 related passages", ({expect}) => {
        const chips = mount_app(StudyInfo).findAll('.crossrefs .v-chip')
        expect(chips).toHaveLength(8)
        expect(chips[0]!.text()).toBe('John 1:1')
    })

    it("Shows original words with their strongs codes", async ({expect}) => {
        const wrapper = mount_app(StudyInfo)
        await flushPromises()
        expect(wrapper.findAll('.orig .word').map(w => w.text())).toEqual(['בְּ', 'רֵאשִׁית'])
        // Strongs codes passed to each word (seen in their research links)
        expect(wrapper.findAll('.orig .gloss').map(a => a.attributes('href'))).toEqual([
            'https://biblehub.com/hebrew/1.htm', 'https://biblehub.com/hebrew/2.htm'])
    })

    it("Toggles original characters and Hebrew direction", async ({expect}) => {
        const wrapper = mount_app(StudyInfo)
        const [chars_btn, dir_btn] = wrapper.findAll('h5 button')
        expect(chars_btn!.text()).toBe('original')
        expect(dir_btn!.text()).toBe('⟻')
        expect(wrapper.find('.orig').classes()).not.toContain('flex_ltr')

        await chars_btn!.trigger('click')
        expect(state.original_chars).toBe(false)
        expect(chars_btn!.text()).toBe('critical')
        await dir_btn!.trigger('click')
        expect(state.hebrew_ltr).toBe(true)
        expect(dir_btn!.text()).toBe('⟼')
        expect(wrapper.find('.orig').classes()).toContain('flex_ltr')
    })

    it("Shows study notes, labelling ranges and excluding very long ones", async ({expect}) => {
        const wrapper = mount_app(StudyInfo)
        await flushPromises()
        const notes = wrapper.find('.notes')
        expect(notes.findAll('h4').map(h => h.text())).toEqual(['Genesis 1:1-5'])
        expect(notes.text()).toContain('Range note')
        expect(notes.text()).not.toContain('Too long')
        expect(state.notes!.get_relevant_notes).toHaveBeenCalledWith(1, 1)
    })

    it("Makes references in notes navigable", async ({expect}) => {
        const wrapper = mount_app(StudyInfo)
        await flushPromises()

        // Refs without a book do nothing
        await wrapper.find('span[data-ref=""]').trigger('click')
        expect(state.passage).toBe(null)

        await wrapper.find('span[data-ref="exo,2,3"]').trigger('click')
        expect(state.passage?.to_serialized()).toBe('exo2:3')
        expect(state.read_history).toEqual(['exo2:3', 'gen1:1'])
    })

    it("Hides notes when disabled or not reading an English translation", ({expect}) => {
        state.trans = ['spa_a']
        expect(mount_app(StudyInfo).find('.notes').exists()).toBe(false)
        state.trans = ['eng_a']
        state.study_notes = false
        expect(mount_app(StudyInfo).find('.notes').exists()).toBe(false)
    })

    it("Links NT verses to variants (but not OT)", async ({expect}) => {
        const wrapper = mount_app(StudyInfo)
        expect(wrapper.find('a[target="variants"]').exists()).toBe(false)
        state.study = new PassageReference('jhn', 3, 16)
        await flushPromises()
        expect(wrapper.find('a[target="variants"]').attributes('href'))
            .toBe('https://greekcntr.org/collation/index.htm?v=43003016')
        // No Hebrew direction toggle for NT, and NT strongs used
        expect(wrapper.findAll('h5 button')).toHaveLength(1)
        expect(wrapper.find('.orig .gloss').attributes('href'))
            .toBe('https://biblehub.com/greek/1.htm')
    })

    it("Shows nothing extra when there's no data for the book", ({expect}) => {
        state.crossref = null
        state.glosses = null
        state.notes = null
        const wrapper = mount_app(StudyInfo)
        expect(wrapper.find('.crossrefs').exists()).toBe(false)
        expect(wrapper.find('.orig').exists()).toBe(false)
        expect(wrapper.find('.notes').exists()).toBe(false)
    })

    it("Closes and clears everything", async ({expect}) => {
        const wrapper = mount_app(StudyInfo)
        await wrapper.find('.close').trigger('click')
        await flushPromises()
        expect(state.study).toBe(null)
        expect(wrapper.find('h4.ref').text()).toBe('')
        expect(wrapper.find('.crossrefs').exists()).toBe(false)
        expect(wrapper.find('.orig').exists()).toBe(false)
        expect(wrapper.find('.notes').exists()).toBe(false)
        expect(wrapper.find('a[target="variants"]').exists()).toBe(false)
    })
})
