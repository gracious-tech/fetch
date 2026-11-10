
import {describe, it} from 'vitest'

import {Crossrefs} from './crossrefs.js'


// Compact references as strings for easy comparison
function summarise(crossrefs:Crossrefs, book:string, chapter:number, verse:number):string[]{
    return crossrefs.get_refs(book, chapter, verse)
        .map(link => `${link.category} ${link.strength}: ${link.target.toString()}`)
}


describe('Crossrefs', () => {

    // Data in the published format (category → strength → pairs, earlier passage first)
    const crossrefs = new Crossrefs({
        quotation: {very_high: [
            [['psa', 91, 11, 91, 12], ['mat', 4, 6]], [['deu', 8, 3], ['mat', 4, 4]]]},
        parallel: {very_high: [[['mat', 4, 1, 4, 11], ['luk', 4, 1, 4, 13]]]},
        relevant: {
            medium: [[['mat', 4, 6], ['mat', 27, 40]]],
            high: [[['mal', 3, 15], ['mat', 4, 6]]],
        },
    })

    it("Decodes single verses and ranges", ({expect}) => {
        expect(summarise(crossrefs, 'mat', 4, 6)).toContain('quotation very_high: Psalms 91:11-12')
    })

    it("Indexes both directions of each link", ({expect}) => {
        expect(summarise(crossrefs, 'psa', 91, 12)).toEqual(['quotation very_high: Matthew 4:6'])
        expect(summarise(crossrefs, 'mat', 27, 40)).toEqual(['relevant medium: Matthew 4:6'])
    })

    it("Includes links whose source passage covers the verse", ({expect}) => {
        expect(summarise(crossrefs, 'mat', 4, 4)).toEqual([
            'quotation very_high: Deuteronomy 8:3',
            'parallel very_high: Luke 4:1-13',
        ])
        expect(summarise(crossrefs, 'mat', 4, 12)).toEqual([])
    })

    it("Orders by category, then links starting at the verse, then strength", ({expect}) => {
        expect(summarise(crossrefs, 'mat', 4, 6)).toEqual([
            'quotation very_high: Psalms 91:11-12',
            'parallel very_high: Luke 4:1-13',
            'relevant high: Malachi 3:15',
            'relevant medium: Matthew 27:40',
        ])
    })

    it("Says whether the target is the earlier passage", ({expect}) => {
        const [quotation] = crossrefs.get_refs('mat', 4, 6)
        expect(quotation?.target_is_earlier).toBe(true)
        const [quoted_in] = crossrefs.get_refs('psa', 91, 11)
        expect(quoted_in?.target_is_earlier).toBe(false)
    })

    it("Exposes the source passage each link belongs to", ({expect}) => {
        const [quotation, parallel] = crossrefs.get_refs('mat', 4, 6)
        expect(quotation?.source.toString()).toBe('Matthew 4:6')
        expect(parallel?.source.toString()).toBe('Matthew 4:1-11')
    })
})
