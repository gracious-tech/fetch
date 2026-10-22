
import {describe, it} from 'vitest'

import {deep_copy, escape_html, escape_typst, fuzzy_search, num_to_letters, rm_diacritics,
    word_to_original} from './utils.js'
import {substantial_poetry} from './data.js'


describe('deep_copy', () => {

    it("Copies nested objects and arrays without sharing references", ({expect}) => {
        const source = {a: [1, {b: 2}], c: {d: null}, e: 'x'}
        const copy = deep_copy(source)
        expect(copy).toEqual(source)
        expect(copy.a).not.toBe(source.a)
        expect(copy.a[1]).not.toBe(source.a[1])
        expect(copy.c).not.toBe(source.c)
        expect(Array.isArray(deep_copy([1, 2]))).toBe(true)
    })
})


describe('rm_diacritics / word_to_original', () => {

    it("Removes diacritics", ({expect}) => {
        expect(rm_diacritics('crème brûlée')).toBe('creme brulee')
    })

    it("Reduces Greek and Hebrew words to their bare original letters", ({expect}) => {
        expect(word_to_original('ἀρχῇ,')).toBe('ΑΡΧΗ')
        expect(word_to_original('בְּרֵאשִׁ֖ית')).toBe('בראשית')
        expect(word_to_original('abc')).toBe('')
    })
})


describe('fuzzy_search', () => {

    const names = ['Genesis', 'Exodus', 'Leviticus', 'Song of Songs', 'Génération']
    const search = (input:string) => fuzzy_search(input, names, name => name)

    it("Returns all candidates unchanged for empty input", ({expect}) => {
        expect(search('  ')).toEqual(names)
        expect(search('')).not.toBe(names)  // A copy
    })

    it("Matches exact and abbreviated words, best first", ({expect}) => {
        expect(search('genesis')).toEqual(['Genesis'])
        expect(search('gen')[0]).toBe('Genesis')
        expect(search('lev')).toEqual(['Leviticus'])
        expect(search('song so')).toEqual(['Song of Songs'])
    })

    it("Tolerates a few skipped characters but requires the first letter", ({expect}) => {
        expect(search('gnss')).toContain('Genesis')
        expect(search('enesis')).toEqual([])
        expect(search('gxxxxxxs')).toEqual([])  // Too many skips
        expect(search('genesisx')).toEqual([])  // Input longer than candidate
    })

    it("Ignores diacritics and case", ({expect}) => {
        expect(search('GENERATION')).toEqual(['Génération'])
    })

    it("Never matches an empty candidate", ({expect}) => {
        expect(fuzzy_search('a', [''], name => name)).toEqual([])
    })
})


describe('escape_html / escape_typst', () => {

    it("Escapes HTML special characters", ({expect}) => {
        expect(escape_html(`<a href="x">Tom & Jerry's</a>`))
            .toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
    })

    it("Escapes Typst special characters and condenses whitespace", ({expect}) => {
        expect(escape_typst('#a  [b]\n*c*_d_`e`$f$<g>@h~i/j+k-l\\m'))
            .toBe('\\#a \\[b\\] \\*c\\*\\_d\\_\\`e\\`\\$f\\$\\<g\\>\\@h\\~i\\/j\\+k\\-l\\\\m')
    })
})


describe('num_to_letters', () => {

    it("Converts numbers to spreadsheet-style letters", ({expect}) => {
        expect(num_to_letters(0)).toBe('')
        expect(num_to_letters(1)).toBe('a')
        expect(num_to_letters(26)).toBe('z')
        expect(num_to_letters(27)).toBe('aa')
        expect(num_to_letters(703)).toBe('aaa')
    })
})


describe('substantial_poetry', () => {

    it("Lists poetic books and is frozen", ({expect}) => {
        expect(substantial_poetry).toContain('psa')
        expect(substantial_poetry).not.toContain('gen')
        expect(Object.isFrozen(substantial_poetry)).toBe(true)
    })
})
