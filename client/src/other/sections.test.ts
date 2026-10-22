
import {describe, it} from 'vitest'
import {PassageReference} from '@gracious.tech/bible-references'

import {SectionData} from './sections.js'


// Section stats for two books
const data = new SectionData({
    model: 'test-model',
    generated: '2026-01-01',
    sections: {
        jhn: [
            {start_chapter: 3, start_verse: 1, end_chapter: 3, end_verse: 21, importance: 5,
                popularity: 5},
            {start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 18, importance: 5,
                popularity: 3},
        ],
        gen: [
            {start_chapter: 1, start_verse: 1, end_chapter: 2, end_verse: 3, importance: 4,
                popularity: 4},
        ],
    },
})
const ids = (sections:{book:string, start_chapter:number}[]) =>
    sections.map(section => `${section.book}${section.start_chapter}`)


describe('SectionData', () => {

    it("Exposes provenance", ({expect}) => {
        expect([data.model, data.generated]).toEqual(['test-model', '2026-01-01'])
    })

    it("Gets all sections in canonical order by default", ({expect}) => {
        expect(ids(data.get_sections())).toEqual(['gen1', 'jhn1', 'jhn3'])
    })

    it("Limits to a book and filters by minimum scores", ({expect}) => {
        expect(ids(data.get_sections({book: 'jhn'}))).toEqual(['jhn1', 'jhn3'])
        expect(ids(data.get_sections({book: 'rom'}))).toEqual([])
        expect(ids(data.get_sections({min_importance: 5}))).toEqual(['jhn1', 'jhn3'])
        expect(ids(data.get_sections({min_popularity: 4}))).toEqual(['gen1', 'jhn3'])
        expect(() => data.get_sections({book: 'xyz'})).toThrow('is not valid')
    })

    it("Sorts by scores, breaking ties canonically", ({expect}) => {
        expect(ids(data.get_sections({sort_by: 'importance'}))).toEqual(['jhn1', 'jhn3', 'gen1'])
        expect(ids(data.get_sections({sort_by: 'popularity'}))).toEqual(['jhn3', 'gen1', 'jhn1'])
        expect(ids(data.get_sections({sort_by: 'importance+popularity'})))
            .toEqual(['jhn3', 'gen1', 'jhn1'])
    })

    it("Breaks ties within a chapter by verse", ({expect}) => {
        const same_chapter = new SectionData({model: '', generated: '', sections: {jhn: [
            {start_chapter: 3, start_verse: 22, end_chapter: 3, end_verse: 36, importance: 1,
                popularity: 1},
            {start_chapter: 3, start_verse: 1, end_chapter: 3, end_verse: 21, importance: 1,
                popularity: 1},
        ]}})
        expect(same_chapter.get_sections().map(s => s.start_verse)).toEqual([1, 22])
    })

    it("Gets the section containing a verse", ({expect}) => {
        expect(data.get_for_verse('jhn', 3, 16)?.start_chapter).toBe(3)
        expect(data.get_for_verse('jhn', 2, 1)).toBeUndefined()
        expect(() => data.get_for_verse('xyz', 1, 1)).toThrow('is not valid')
    })

    it("Gets sections overlapping a reference or reference string", ({expect}) => {
        expect(ids(data.get_for_ref('John 3:16'))).toEqual(['jhn3'])
        expect(ids(data.get_for_ref(new PassageReference('gen', 2)))).toEqual(['gen1'])
        expect(ids(data.get_for_ref('Romans 1'))).toEqual([])
        expect(() => data.get_for_ref('not a reference')).toThrow('Could not parse')
    })
})
