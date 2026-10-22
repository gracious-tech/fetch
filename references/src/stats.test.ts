
import {describe, it} from 'vitest'

import {get_chapters, get_verses} from './stats.js'
import {parse_int} from './utils.js'


describe('get_chapters / get_verses', () => {

    it("Lists the chapters of a book and verses of a chapter", ({expect}) => {
        expect(get_chapters('rut')).toEqual([1, 2, 3, 4])
        expect(get_verses('rut', 4)).toHaveLength(22)
        expect(get_verses('psa', 117)).toEqual([1, 2])
    })
})


describe('parse_int', () => {

    it("Parses integers, returning null for invalid input", ({expect}) => {
        expect(parse_int('42')).toBe(42)
        expect(parse_int('7a')).toBe(7)
        expect(parse_int('x')).toBeNull()
    })

    it("Clamps to the given bounds", ({expect}) => {
        expect(parse_int('0', 1)).toBe(1)
        expect(parse_int('99', 1, 50)).toBe(50)
        expect(parse_int('20', 1, 50)).toBe(20)
    })
})
