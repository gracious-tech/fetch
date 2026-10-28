
import {afterEach, describe, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'

import type {Component} from 'vue'
import type {DOMWrapper} from '@vue/test-utils'

import {table_rows} from './test_utils'
import PageBibles from './PageBibles.vue'


vi.mock('./collection', async () => {
    const {make_collection} = await import('./test_utils')
    return {collection: await make_collection()}
})


// Ids of the bibles currently listed in the given table
function listed(table:DOMWrapper<Element>){
    return table_rows(table.element).map(row => row.split('|')[1])
}


describe('PageBibles', () => {

    afterEach(() => {
        location.hash = ''
        vi.unstubAllEnvs()
    })

    it("Lists every translation, newest first, with completion and licenses", ({expect}) => {
        const wrapper = mount(PageBibles)
        expect(wrapper.find('h1').text()).toBe("Bible translations available (4)")
        expect(wrapper.find('th[colspan]').text()).toBe("Showing 4 translations")
        expect(table_rows(wrapper.find('table').element)).toEqual([
            'New English|eng_new|eng|2010|100%|cc-by',
            'Spanish Mix|spa_mix|spa|1985|OT 2%NT 100%|cc-by-sa',
            'Old English|eng_old|eng|1900|OT 0%NT 100%|cc-by-nd',
            'Greek Part|grc_part|grc|1800|OT 0%NT 3%|Custom',
        ])
        // Names link to the translation in the dev app
        expect(wrapper.find('td a').attributes('href'))
            .toBe('http://localhost:8431/#trans=eng_new')
    })

    it("Links to the live app in production", async ({expect}) => {
        vi.stubEnv('PROD', true)
        vi.resetModules()
        const prod_page = (await import('./PageBibles.vue') as {default:Component}).default
        const wrapper = mount(prod_page)
        expect(wrapper.find('td a').attributes('href'))
            .toBe('https://app.fetch.bible/#trans=eng_new')
    })

    it("Offers every language as a filter", ({expect}) => {
        const options = mount(PageBibles).findAll('select')[0]!.findAll('option')
        expect(options.map(o => o.attributes('value'))).toEqual(['', 'eng', 'spa', 'grc'])
    })

    it("Inits language filter from the url hash", ({expect}) => {
        location.hash = 'spa'
        const wrapper = mount(PageBibles)
        expect(listed(wrapper.find('table'))).toEqual(['spa_mix'])
        expect(wrapper.find('th[colspan]').text()).toBe("Showing 1 translation")
    })

    it("Ignores a hash that isn't a language", ({expect}) => {
        location.hash = 'nope'
        expect(listed(mount(PageBibles).find('table'))).toHaveLength(4)
    })

    it("Filters by language when a language code is clicked", async ({expect}) => {
        const wrapper = mount(PageBibles)
        await wrapper.find('a:not([href])').trigger('click')
        expect(listed(wrapper.find('table'))).toEqual(['eng_new', 'eng_old'])
        expect((wrapper.find('select').element).value).toBe('eng')
    })

    it("Hides obsolete translations", async ({expect}) => {
        const wrapper = mount(PageBibles)
        await wrapper.find('#exclude_obsolete').setValue(true)
        expect(listed(wrapper.find('table'))).toEqual(['eng_new', 'spa_mix'])
    })

    it("Filters by allowed usage", async ({expect}) => {
        const wrapper = mount(PageBibles)
        await wrapper.find('#usage_commercial').setValue(true)
        expect(listed(wrapper.find('table'))).toEqual(['eng_new', 'spa_mix', 'eng_old'])
        await wrapper.find('#usage_limitless').setValue(true)
        await wrapper.find('#usage_attributionless').setValue(true)
        expect(listed(wrapper.find('table'))).toHaveLength(3)

        // Derivatives allowed either outright or only under the same license
        const derivatives = wrapper.findAll('select')[1]!
        await derivatives.setValue('same-license')
        expect(listed(wrapper.find('table'))).toEqual(['eng_new', 'spa_mix'])
        await derivatives.setValue('yes')
        expect(listed(wrapper.find('table'))).toEqual(['eng_new'])
    })
})
