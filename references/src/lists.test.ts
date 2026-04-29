
import {describe, it} from 'vitest'

import {PassageReference} from './passage.js'
import {sort_references, simplify_references} from './lists.js'


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

