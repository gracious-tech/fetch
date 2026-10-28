
import {describe, it} from 'vitest'

import {population_text} from './utils'


describe('population_text', () => {

    it("Shows population in millions", ({expect}) => {
        expect(population_text(1_500_000_000)).toBe(`${(1500).toLocaleString()} million`)
        expect(population_text(2_600_000)).toBe('3 million')
    })

    it("Shows small or unknown populations as under a million", ({expect}) => {
        expect(population_text(400_000)).toBe('< 1 million')
        expect(population_text(null)).toBe('< 1 million')
    })
})

