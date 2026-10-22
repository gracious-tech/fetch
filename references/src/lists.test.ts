
import {describe, it} from 'vitest'

import {PassageReference} from './passage.js'
import {sort_references, simplify_references, references_to_string} from './lists.js'


// Helper to parse a reference string
function ref(str:string):PassageReference {
    return PassageReference.from_string(str)!
}

// Helper to get serialized forms of a list for easy comparison
function ser(refs:PassageReference[]):string[] {
    return refs.map(r => r.to_serialized())
}


describe('sort_references', () => {

    it("Sorts by book in canonical order", ({expect}) => {
        const refs = [ref('Exo'), ref('Gen'), ref('Matt')]
        expect(ser(sort_references(refs))).toEqual(['gen', 'exo', 'mat'])
    })

    it("Sorts by chapter within the same book", ({expect}) => {
        const refs = [ref('Gen 3'), ref('Gen 1'), ref('Gen 2')]
        expect(ser(sort_references(refs))).toEqual(['gen1', 'gen2', 'gen3'])
    })

    it("Sorts by verse within the same chapter", ({expect}) => {
        const refs = [ref('Gen 1:3'), ref('Gen 1:1'), ref('Gen 1:2')]
        expect(ser(sort_references(refs))).toEqual(['gen1:1', 'gen1:2', 'gen1:3'])
    })

    it("Sorts smaller end positions first when start is the same", ({expect}) => {
        // Gen 1 (chapter identifier, end=1:1) should sort before Gen 1:2 (end=1:2)
        const refs = [ref('Gen 1:2'), ref('Gen 1')]
        expect(ser(sort_references(refs))).toEqual(['gen1', 'gen1:2'])
    })

    it("Preserves first-seen book order when non-canonical", ({expect}) => {
        const refs = [ref('Matt'), ref('Gen'), ref('Exo')]
        expect(ser(sort_references(refs, false))).toEqual(['mat', 'gen', 'exo'])
    })

    it("Returns a new array without mutating the original", ({expect}) => {
        const refs = [ref('Exo'), ref('Gen')]
        const sorted = sort_references(refs)
        expect(sorted).not.toBe(refs)
        // Original order unchanged
        expect(ser(refs)).toEqual(['exo', 'gen'])
    })
})


describe('sort_references (same start)', () => {

    it("Orders references starting at the same verse by where they end", ({expect}) => {
        const refs = [
            new PassageReference({book: 'gen', start_chapter: 2, start_verse: 2, end_chapter: 3,
                end_verse: 1}),
            new PassageReference({book: 'gen', start_chapter: 2, start_verse: 2, end_chapter: 2,
                end_verse: 9}),
            new PassageReference({book: 'gen', start_chapter: 2, start_verse: 2, end_chapter: 2,
                end_verse: 5}),
        ]
        expect(sort_references(refs).map(ref => ref.toString()))
            .toEqual(['Genesis 2:2-5', 'Genesis 2:2-9', 'Genesis 2:2-3:1'])
    })
})


describe('simplify_references', () => {

    it("Leaves non-overlapping, non-adjacent refs unchanged", ({expect}) => {
        // Gap at 1:2 means these do not merge
        const refs = [ref('Gen 1:1'), ref('Gen 1:3')]
        expect(ser(simplify_references(refs))).toEqual(['gen1:1', 'gen1:3'])
    })

    it("Merges adjacent verses into a range", ({expect}) => {
        const refs = [ref('Gen 1:1'), ref('Gen 1:2')]
        expect(ser(simplify_references(refs))).toEqual(['gen1:1-2'])
    })

    it("Merges overlapping verse ranges", ({expect}) => {
        const refs = [ref('Gen 1:1-3'), ref('Gen 1:2-5')]
        expect(ser(simplify_references(refs))).toEqual(['gen1:1-5'])
    })

    it("Absorbs a verse contained in a chapter ref (Gen 1, Gen 1:2 -> Gen 1)", ({expect}) => {
        const refs = [ref('Gen 1'), ref('Gen 1:2')]
        const result = simplify_references(refs)
        expect(result).toHaveLength(1)
        expect(result[0]!.type).toBe('chapter')
        expect(result[0]!.to_serialized()).toBe('gen1')
    })

    it("Absorbs a verse into a chapter ref regardless of order (Gen 1:2, Gen 1 -> Gen 1)", ({expect}) => {
        const refs = [ref('Gen 1:2'), ref('Gen 1')]
        const result = simplify_references(refs)
        expect(result).toHaveLength(1)
        expect(result[0]!.type).toBe('chapter')
        expect(result[0]!.to_serialized()).toBe('gen1')
    })

    it("Merges adjacent chapters", ({expect}) => {
        const refs = [ref('Gen 1'), ref('Gen 2')]
        expect(ser(simplify_references(refs))).toEqual(['gen1-2'])
    })

    it("Does not merge refs from different books", ({expect}) => {
        const refs = [ref('Gen 1:1'), ref('Exo 1:1')]
        expect(ser(simplify_references(refs))).toEqual(['gen1:1', 'exo1:1'])
    })

    it("Keeps the merged ref at the position of the earlier ref", ({expect}) => {
        // 1:1 and 1:2 are adjacent and should merge at index 0; 1:5 stays separate
        const refs = [ref('Gen 1:1'), ref('Gen 1:5'), ref('Gen 1:2')]
        const result = simplify_references(refs)
        expect(ser(result)).toEqual(['gen1:1-2', 'gen1:5'])
    })

    it("Expands a verse into a range when merged with a later verse", ({expect}) => {
        const refs = [ref('Gen 1:1'), ref('Gen 1:3')]
        // Gap — no merge
        expect(simplify_references(refs)).toHaveLength(2)
        // Now adjacent
        const refs2 = [ref('Gen 1:2'), ref('Gen 1:3')]
        expect(ser(simplify_references(refs2))).toEqual(['gen1:2-3'])
    })
})


describe('references_to_string', () => {

    it("Renders the example from the comment correctly", ({expect}) => {
        // Matt 1:1-2, Matt 1:5, Matt 5, Gen 1 -> Matt 1:1-2, 5; 5; Gen 1
        const refs = [
            ref('Matt 1:1-2'),
            ref('Matt 1:5'),
            ref('Matt 5'),
            ref('Gen 1'),
        ]
        expect(references_to_string(refs)).toBe('Matthew 1:1-2, 5; 5; Genesis 1')
    })

    it("Returns empty string for empty array", ({expect}) => {
        expect(references_to_string([])).toBe('')
    })

    it("Renders a single ref normally", ({expect}) => {
        expect(references_to_string([ref('Gen 1:1')])).toBe('Genesis 1:1')
    })

    it("Omits book name for consecutive refs in the same book", ({expect}) => {
        const refs = [ref('Gen 1'), ref('Gen 2')]
        expect(references_to_string(refs)).toBe('Genesis 1; 2')
    })

    it("Omits book and chapter for consecutive verse refs in the same chapter", ({expect}) => {
        const refs = [ref('Gen 1:1'), ref('Gen 1:3')]
        expect(references_to_string(refs)).toBe('Genesis 1:1, 3')
    })

    it("Omits chapter for consecutive verse ranges in the same chapter", ({expect}) => {
        const refs = [ref('Gen 1:1-3'), ref('Gen 1:5-7')]
        expect(references_to_string(refs)).toBe('Genesis 1:1-3, 5-7')
    })

    it("Resets chapter context when chapter changes", ({expect}) => {
        const refs = [ref('Gen 2:1'), ref('Gen 3:1')]
        expect(references_to_string(refs)).toBe('Genesis 2:1; 3:1')
    })

    it("Shows full ref again after a different book", ({expect}) => {
        const refs = [ref('Gen 1:1'), ref('Exo 1:1'), ref('Exo 1:2')]
        expect(references_to_string(refs)).toBe('Genesis 1:1; Exodus 1:1, 2')
    })

    it("Uses custom book names", ({expect}) => {
        const refs = [ref('Gen 1'), ref('Exo 1')]
        expect(references_to_string(refs, {gen: 'Gen', exo: 'Exo'})).toBe('Gen 1; Exo 1')
    })

    it("Respects custom chapter_sep", ({expect}) => {
        const refs = [ref('Gen 1'), ref('Gen 2'), ref('Exo 1')]
        expect(references_to_string(refs, {}, ':', '-', '|')).toBe('Genesis 1|2|Exodus 1')
    })

    it("Does not abbreviate chapter-type refs as same-chapter context", ({expect}) => {
        // A chapter ref following a verse ref in the same chapter should use chapter_sep
        // since the chapter ref is not a verse/range_verses type
        const refs = [ref('Gen 1:1'), ref('Gen 1')]
        expect(references_to_string(refs)).toBe('Genesis 1:1; 1')
    })

    it("Handles multi-chapter range followed by a verse", ({expect}) => {
        const refs = [ref('Gen 1:1-2:5'), ref('Gen 3:1')]
        expect(references_to_string(refs)).toBe('Genesis 1:1-2:5; 3:1')
    })
})


describe('sort_references (non-canonical)', () => {

    it("Keeps books in order of first appearance", ({expect}) => {
        const refs = ['John 3:16', 'Genesis 1:1', 'John 1:1', 'Genesis 2:1']
            .map(text => PassageReference.from_string(text)!)
        expect(sort_references(refs, false).map(ref => ref.toString()))
            .toEqual(['John 1:1', 'John 3:16', 'Genesis 1:1', 'Genesis 2:1'])
    })
})
