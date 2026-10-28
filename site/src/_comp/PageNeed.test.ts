
import {describe, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'

import {table_rows, VPButton} from './test_utils'
import PageNeed from './PageNeed.vue'


vi.mock('./collection', async () => {
    const {make_collection} = await import('./test_utils')
    return {collection: await make_collection()}
})

// A world of 1000 people: eng has a shareable bible, cjy is covered by Mandarin's
vi.mock('./population.json', () => {
    const small = Object.fromEntries([...Array(25).keys()].map(i =>
        [`l${String(i).padStart(2, '0')}`, {pop: 4, english: `Lang ${i}`, local: `L${i}`}]))
    return {default: {
        eng: {pop: 500, english: "English", local: "English"},
        cjy: {pop: 100, english: "Jinyu", local: "晋语"},
        spa: {pop: 300, english: "Spanish", local: "Español"},
        zzz: {pop: 0, english: "Nobody", local: "Nobody"},
        ...small,
    }}
})


// Mount with VitePress' global button stubbed
function mount_need(){
    return mount(PageNeed, {global: {components: {VPButton}}})
}


describe('PageNeed', () => {

    it("States what counts as modern", ({expect}) => {
        expect(mount_need().text()).toContain("(published in last 70 years)")
    })

    it("Gives the share of the world with shareable/unrestricted bibles", ({expect}) => {
        const warnings = mount_need().findAll('h3.warn').map(h => h.text())
        expect(warnings).toContain(
            "Only 60% of the world has a translation they can legally share themselves")
        expect(warnings).toContain(
            "Only 60% of the world has a bible they have unrestricted access to")
    })

    it("Lists most populous languages lacking a shareable bible", ({expect}) => {
        const rows = table_rows(mount_need().find('table').element)
        expect(rows).toHaveLength(10)
        expect(rows[0]).toBe('Español|Spanish|spa|< 1 million')
        // Languages with a bible (or covered by another) or no speakers are excluded
        expect(rows.join()).not.toMatch(/\|(eng|cjy|zzz)\|/)
    })

    it("Doubles the rows shown until all are displayed", async ({expect}) => {
        const wrapper = mount_need()
        const count = () => table_rows(wrapper.find('table').element).length
        await wrapper.find('button').trigger('click')
        expect(count()).toBe(20)
        await wrapper.find('button').trigger('click')
        expect(count()).toBe(26)
        expect(wrapper.find('button').exists()).toBe(false)
    })
})
