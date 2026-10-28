
import {describe, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'

import {table_rows} from './test_utils'
import PageStatistics from './PageStatistics.vue'


vi.mock('./collection', async () => {
    const {make_collection} = await import('./test_utils')
    return {collection: await make_collection()}
})


describe('PageStatistics', () => {

    const tables = mount(PageStatistics).findAll('table').map(t => table_rows(t.element))
    const [testaments, licenses, usages, periods, owners] = tables

    it("Groups translations by books available", ({expect}) => {
        expect(testaments).toEqual(['Whole Bible|25%', 'NT + some OT|25%', 'NT only|25%',
            'Some books|25%'])
    })

    it("Counts used licenses, with custom licenses grouped", ({expect}) => {
        expect(licenses).toEqual(['CC BY|25%', 'CC BY-ND|25%', 'CC BY-SA|25%',
            'Custom license only|25%'])
    })

    it("Gives percentages allowing each kind of usage", ({expect}) => {
        expect(usages).toEqual([
            'Can use commercially|75%',
            'Attribution not required|100%',
            'No quotation limits|100%',
            'Can modify|50%',
            'Can modify if same license|75%',
        ])
    })

    it("Groups translations by decade of publication, newest first", ({expect}) => {
        const decade = `${Math.floor(new Date().getFullYear() / 10) * 10}s`
        expect(periods![0]).toBe(`${decade}|0%`)
        expect(periods).toContain('2010s|25%')
        expect(periods).toContain('1980s|25%')
        expect(periods).toContain('1950s|0%')
        expect(periods!.at(-1)).toBe('Pre-1950|50%')
    })

    it("Normalises owner names and groups single-translation owners", ({expect}) => {
        expect(owners).toEqual(['Bible Society|2', 'Someone|2', '* Unable to auto-detect *|0'])
    })
})
