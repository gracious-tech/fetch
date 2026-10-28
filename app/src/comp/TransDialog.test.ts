
import {mount_app} from '@/services/test_utils'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'
import {flushPromises} from '@vue/test-utils'

import {state} from '@/services/state'
import {content} from '@/services/content'
import TransDialog from './TransDialog.vue'

import type {FetchCollection, GetLanguagesItem, GetResourcesItem} from '@gracious.tech/fetch-client'


// A language list item
function lang(code:string, name:string, population:number):GetLanguagesItem{
    return {id: code, code, script: undefined, name_local: name, name_english: name,
        name_bilingual: name, population}
}

// A translation list item (obsolete ones are only shown as niche)
function trans(id:string, name:string, obsolete=false){
    return {id, language: id.split('_')[0]!, script: undefined, name, name_abbrev: id.toUpperCase(),
        name_english: obsolete ? `${name} (English)` : name, obsolete}
}

// Twelve languages, so more than the ten most populous initially shown
const languages = [
    lang('eng', "English", 100), lang('spa', "Español", 90), lang('fra', "Français", 80),
    ...[...Array(9).keys()].map(i => lang(`l${i}x`, `Lang ${i}`, 50 - i)),
]

// English has a decent and niche translation, Spanish just one, French two decent
const translations = [
    trans('eng_a', "English A"), trans('eng_old', "Old English", true),
    trans('spa_b', "Spanish B"),
    trans('fra_c', "French C"), trans('fra_d', "French D"),
]


// A collection that serves the above languages and translations
function fake_collection(){
    const bibles = {
        get_languages: vi.fn(({sort_by, search}:{sort_by?:string, search?:string}) => {
            if (search){
                return languages.filter(l => l.name_local.includes(search))
            }
            return sort_by === 'population'
                ? [...languages].sort((a, b) => b.population! - a.population!) : languages
        }),
        get_language: vi.fn((code:string) => languages.find(l => l.code === code)),
        get_resources: vi.fn(({language, exclude_obsolete}:
                {language:string, exclude_obsolete?:boolean}) => translations.filter(t =>
            t.language === language && !(exclude_obsolete && t.obsolete))),
    }
    return {bibles} as unknown as FetchCollection
}


// Find an element by selector whose text includes the given string
function find_el(selector:string, text:string){
    return [...document.querySelectorAll<HTMLElement>(selector)]
        .find(el => el.textContent?.includes(text))!
}

// Text of all translation/language list items
function list_items(){
    return [...document.querySelectorAll('.v-list-item-title')].map(el => el.textContent!.trim())
}

// Let the dialog's delayed apply-changes timeout run
function wait_for_apply(){
    return new Promise(resolve => {setTimeout(resolve, 20)})
}


describe('TransDialog', () => {

    beforeEach(() => {
        content.collection = fake_collection()
        content.translations = Object.fromEntries(translations.map(t =>
            [t.id, t as unknown as GetResourcesItem]))
        Object.assign(state, {show_trans_dialog: true, trans: ['eng_a']})
    })
    afterEach(() => {
        document.body.innerHTML = ''
    })

    // Mount the dialog and let it render
    async function open(){
        const wrapper = mount_app(TransDialog)
        await flushPromises()
        return wrapper
    }

    it("Lists translations of the current language, with niche ones separate", async ({expect}) => {
        const wrapper = await open()
        expect(document.querySelector('.v-tab')!.textContent).toContain('ENG_A')
        expect(find_el('.subbar', 'English')).toBeTruthy()
        expect(list_items()).toEqual(["ENG_A — English A", "ENG_OLD — Old English"])
        expect(document.querySelector('.v-list-subheader')!.textContent)
            .toContain("Historical & Niche Translations")
        // English name only shown if differs from local name
        expect(document.querySelector('.v-list-item-subtitle')!.textContent)
            .toContain("Old English (English)")
        // Can't remove the only translation
        expect(document.querySelector('.remove')).toBeNull()
        wrapper.unmount()
    })

    it("Applies a chosen translation after closing", async ({expect}) => {
        const wrapper = await open()
        find_el('.v-list-item', 'Old English').click()
        expect(state.show_trans_dialog).toBe(false)
        wrapper.unmount()
        expect(state.trans).toEqual(['eng_a'])  // Applied after a delay
        await wait_for_apply()
        expect(state.trans).toEqual(['eng_old'])
    })

    it("Leaves translations as is if nothing changed", async ({expect}) => {
        const wrapper = await open()
        const original = state.trans
        document.querySelector<HTMLButtonElement>('.close button')!.click()
        expect(state.show_trans_dialog).toBe(false)
        wrapper.unmount()
        await wait_for_apply()
        expect(state.trans).toBe(original)
    })

    it("Lists most spoken languages first and can show all", async ({expect}) => {
        const wrapper = await open()
        find_el('.subbar button', 'English').click()
        await flushPromises()
        expect(list_items()).toHaveLength(10)
        expect(list_items()).not.toContain("Lang 8")
        const scroll = vi.fn()
        Element.prototype.scroll = scroll
        find_el('.v-list button', '+ 2').click()
        await flushPromises()
        expect(list_items()).toHaveLength(12)
        expect(list_items()).toContain("Lang 8")
        // Scrolled back to top as new items added above
        expect(scroll).toHaveBeenCalledWith({top: 0})
        wrapper.unmount()
    })

    it("Searches languages", async ({expect}) => {
        const wrapper = await open()
        find_el('.subbar button', 'English').click()
        await flushPromises()
        const input = document.querySelector<HTMLInputElement>('.search input')!
        input.value = 'Fran'
        input.dispatchEvent(new Event('input'))
        await flushPromises()
        expect(list_items()).toEqual(["Français"])
        // Show all button not offered when searching
        expect(find_el('.v-list button', '+')).toBeUndefined()
        wrapper.unmount()
    })

    it("Lists translations when changing to a language with several", async ({expect}) => {
        const wrapper = await open()
        find_el('.subbar button', 'English').click()
        await flushPromises()
        find_el('.v-list-item', 'Français').click()
        await flushPromises()
        expect(list_items()).toEqual(["FRA_C — French C", "FRA_D — French D"])
        expect(document.querySelector('.v-list-subheader')).toBeNull()
        expect(state.show_trans_dialog).toBe(true)
        wrapper.unmount()
    })

    it("Auto-selects the only translation of a chosen language", async ({expect}) => {
        const wrapper = await open()
        find_el('.subbar button', 'English').click()
        await flushPromises()
        find_el('.v-list-item', 'Español').click()
        expect(state.show_trans_dialog).toBe(false)
        wrapper.unmount()
        await wait_for_apply()
        expect(state.trans).toEqual(['spa_b'])
    })

    it("Adds, switches between and removes translations", async ({expect}) => {
        state.trans = ['eng_a', 'spa_b']
        const wrapper = await open()
        const tabs = () => [...document.querySelectorAll('.v-tab')].map(t => t.textContent)
        expect(tabs()).toEqual(['ENG_A', 'SPA_B'])

        // Adding duplicates the last and selects it (showing its language)
        document.querySelector<HTMLButtonElement>('.add')!.click()
        await flushPromises()
        expect(tabs()).toEqual(['ENG_A', 'SPA_B', 'SPA_B'])
        expect(list_items()).toEqual(["SPA_B — Spanish B"])
        // Can't add more than three
        expect(document.querySelector('.add')).toBeNull()

        // Switching tabs shows that translation's language (and hides language list)
        find_el('.subbar button', 'Español').click()
        await flushPromises()
        document.querySelector<HTMLElement>('.v-tab')!.click()
        await flushPromises()
        expect(list_items()).toEqual(["ENG_A — English A", "ENG_OLD — Old English"])

        // Removing a tab before the selected one keeps selection in range
        document.querySelectorAll<HTMLButtonElement>('.remove')[1]!.click()
        await flushPromises()
        expect(tabs()).toEqual(['ENG_A', 'SPA_B'])

        // Removing the selected last tab moves selection to the new last tab
        document.querySelectorAll<HTMLElement>('.v-tab')[1]!.click()
        await flushPromises()
        document.querySelectorAll<HTMLButtonElement>('.remove')[1]!.click()
        await flushPromises()
        expect(tabs()).toEqual(['ENG_A'])
        expect(list_items()).toEqual(["ENG_A — English A", "ENG_OLD — Old English"])

        wrapper.unmount()
        await wait_for_apply()
        expect(state.trans).toEqual(['eng_a'])
    })
})
