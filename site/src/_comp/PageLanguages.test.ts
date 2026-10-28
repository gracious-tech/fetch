
import {describe, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'

import {table_rows} from './test_utils'
import PageLanguages from './PageLanguages.vue'


vi.mock('./collection', async () => {
    const {make_collection} = await import('./test_utils')
    return {collection: await make_collection()}
})


describe('PageLanguages', () => {

    const wrapper = mount(PageLanguages)
    const [top20, all] = wrapper.findAll('table').map(t => table_rows(t.element))

    it("Counts available languages", ({expect}) => {
        expect(wrapper.find('h1').text()).toBe("Languages available (3)")
    })

    it("Lists top languages by population with their bible counts", ({expect}) => {
        expect(top20).toEqual([
            'Español|Spanish|spa|500 million|1',
            'English|English|eng|400 million|2',
            'Ἑλληνική|Ancient Greek|grc|< 1 million|1',
        ])
    })

    it("Lists all languages in collection order", ({expect}) => {
        expect(all).toHaveLength(3)
        expect(new Set(all)).toEqual(new Set(top20))
    })

    it("Links each count to that language's bibles", ({expect}) => {
        expect(wrapper.find('a[href="../bibles/#spa"]').text()).toBe('1')
    })
})
