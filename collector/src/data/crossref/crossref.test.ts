
import {describe, it} from 'vitest'

import {best_common_run, count_content, lcs_length} from './textual.js'
import {compact_source, compact_target} from './distribute.js'
import {merge_ranges, canonical_pair, fold_shared_side} from './merge.js'
import {classify_note} from './bsb.js'
import {passage_text} from './judge/campaign.js'


describe('best_common_run', () => {

    it("Finds the longest run of identical adjacent tokens", ({expect}) => {
        const run = best_common_run(['A', 'B', 'C', 'D', 'E'], ['X', 'C', 'D', 'E', 'Y'])
        expect(run).toEqual(['C', 'D', 'E'])
    })

    it("Returns empty when nothing is shared", ({expect}) => {
        expect(best_common_run(['A', 'B'], ['C', 'D'])).toEqual([])
    })

    it("Requires the run to be contiguous (gaps don't count)", ({expect}) => {
        // Shared tokens A and C are not adjacent in the second sequence, so the run is length 1
        expect(best_common_run(['A', 'B', 'C'], ['A', 'X', 'C']).length).toBe(1)
    })
})


describe('lcs_length', () => {

    it("Counts in-order matches with gaps (the MT-pass ordered-overlap signal)", ({expect}) => {
        // egypt, called, son align in order in both verses' glosses despite other words between
        const nt = ['death', 'egypt', 'called', 'son']
        const ot = ['child', 'egypt', 'loved', 'called', 'son']
        expect(lcs_length(nt, ot)).toBe(3)
    })

    it("Does not count out-of-order matches as a longer run", ({expect}) => {
        expect(lcs_length(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(1)
    })
})


describe('count_content', () => {

    it("Counts distinct non-stopword tokens", ({expect}) => {
        // ΚΑΙ and ΕΝ are stopwords; ΘΕΟΣ and ΛΟΓΟΣ are content (ΘΕΟΣ repeated counts once)
        expect(count_content(['ΚΑΙ', 'ΘΕΟΣ', 'ΕΝ', 'ΛΟΓΟΣ', 'ΘΕΟΣ'])).toBe(2)
    })

    it("Returns zero for an all-stopword run", ({expect}) => {
        expect(count_content(['ΚΑΙ', 'ΕΝ', 'ΤΩ'])).toBe(0)
    })
})


describe('canonical_pair', () => {

    it("Orders the two spans by canonical book, then chapter, then verse", ({expect}) => {
        // NT verse given first, but the OT (earlier) passage must come first
        expect(canonical_pair(['mat', 2, 15, 2, 15], ['hos', 11, 1, 11, 1]))
            .toEqual([['hos', 11, 1, 11, 1], ['mat', 2, 15, 2, 15]])
    })

    it("Orders same-book spans by chapter/verse", ({expect}) => {
        expect(canonical_pair(['psa', 108, 7, 108, 9], ['psa', 60, 6, 60, 8]))
            .toEqual([['psa', 60, 6, 60, 8], ['psa', 108, 7, 108, 9]])
    })
})


describe('merge_ranges', () => {

    it("Folds a diagonal run of single-verse links into one range, absorbing off-by-one noise", ({expect}) => {
        // Acts 2:17-21 ← Joel 2:28-32 plus the off-diagonal cross-pairings per-verse matching emits
        const links = [
            [['jol', 2, 28, 2, 28], ['act', 2, 17, 2, 17]],
            [['jol', 2, 29, 2, 29], ['act', 2, 17, 2, 17]],
            [['jol', 2, 28, 2, 28], ['act', 2, 18, 2, 18]],
            [['jol', 2, 29, 2, 29], ['act', 2, 18, 2, 18]],
            [['jol', 2, 30, 2, 30], ['act', 2, 19, 2, 19]],
            [['jol', 2, 31, 2, 31], ['act', 2, 20, 2, 20]],
            [['jol', 2, 32, 2, 32], ['act', 2, 21, 2, 21]],
        ] as const
        const merged = merge_ranges(structuredClone(links) as never)
        expect(merged).toEqual([[['jol', 2, 28, 2, 32], ['act', 2, 17, 2, 21]]])
    })

    it("Leaves an isolated single-verse link unchanged", ({expect}) => {
        const links = [[['isa', 7, 14, 7, 14], ['mat', 1, 23, 1, 23]]] as const
        expect(merge_ranges(structuredClone(links) as never)).toEqual(
            [[['isa', 7, 14, 7, 14], ['mat', 1, 23, 1, 23]]])
    })

    it("Does not merge across a target gap (composite quote stays separate)", ({expect}) => {
        // Same source verses but target jumps 8 → 10 (verse 9 missing): two separate links, no range
        const links = [
            [['isa', 1, 1, 1, 1], ['rom', 3, 8, 3, 8]],
            [['isa', 1, 3, 1, 3], ['rom', 3, 9, 3, 9]],
        ] as const
        expect(merge_ranges(structuredClone(links) as never).length).toBe(2)
    })
})


describe('classify_note (BSB footnotes)', () => {

    it("Routes an OT 'Cited in' footnote to quotation (canonical order, OT first)", ({expect}) => {
        const out = classify_note('8:3 Cited in Matthew 4:4 and Luke 4:4', ['deu', 8, 3, 8, 3])
        expect(out.quotation).toEqual([
            [['deu', 8, 3, 8, 3], ['mat', 4, 4, 4, 4]],
            [['deu', 8, 3, 8, 3], ['luk', 4, 4, 4, 4]],
        ])
        expect(out.allusion).toEqual([])
    })

    it("Routes a bare NT reference footnote to quotation", ({expect}) => {
        const out = classify_note('2:15 Hosea 11:1', ['mat', 2, 15, 2, 15])
        expect(out.quotation).toEqual([[['hos', 11, 1, 11, 1], ['mat', 2, 15, 2, 15]]])
    })

    it("Splits primary vs 'see also' into quotation vs allusion", ({expect}) => {
        const out = classify_note('2:6 Micah 5:2; see also 2 Samuel 5:2.', ['mat', 2, 6, 2, 6])
        expect(out.quotation).toEqual([[['mic', 5, 2, 5, 2], ['mat', 2, 6, 2, 6]]])
        expect(out.allusion).toEqual([[['2sa', 5, 2, 5, 2], ['mat', 2, 6, 2, 6]]])
    })

    it("Ignores translation/textual-apparatus footnotes", ({expect}) => {
        const out = classify_note('1:7 Greek Asaph, a variant of Asa; see 1 Chronicles 3:10.',
            ['mat', 1, 7, 1, 7])
        expect(out.quotation).toEqual([])
        expect(out.allusion).toEqual([])
    })
})


describe('fold_shared_side', () => {

    it("Folds consecutive verses that share an identical opposite span", ({expect}) => {
        // OpenBible emits Gen 1:1→Jhn 1:1-3, Gen 1:2→Jhn 1:1-3 for a range→range relationship
        const links = [
            [['gen', 1, 1, 1, 1], ['jhn', 1, 1, 1, 3]],
            [['gen', 1, 2, 1, 2], ['jhn', 1, 1, 1, 3]],
        ] as const
        expect(fold_shared_side(structuredClone(links) as never, 1)).toEqual(
            [[['gen', 1, 1, 1, 2], ['jhn', 1, 1, 1, 3]]])
    })

    it("Does not fold across a verse gap", ({expect}) => {
        const links = [
            [['gen', 1, 1, 1, 1], ['jhn', 1, 1, 1, 3]],
            [['gen', 1, 3, 1, 3], ['jhn', 1, 1, 1, 3]],
        ] as const
        expect(fold_shared_side(structuredClone(links) as never, 1).length).toBe(2)
    })

    it("Folds the target side when the source is the shared span", ({expect}) => {
        // One source verse pointing at consecutive target verses becomes verse→range
        const links = [
            [['gen', 1, 1, 1, 1], ['mat', 1, 1, 1, 1]],
            [['gen', 1, 1, 1, 1], ['mat', 1, 2, 1, 2]],
        ] as const
        expect(fold_shared_side(structuredClone(links) as never, 0)).toEqual(
            [[['gen', 1, 1, 1, 1], ['mat', 1, 1, 1, 2]]])
    })

    it("Passes links through when the folding side is already a range", ({expect}) => {
        const links = [[['gen', 1, 1, 1, 2], ['jhn', 1, 1, 1, 3]]] as const
        expect(fold_shared_side(structuredClone(links) as never, 1)).toEqual(
            [[['gen', 1, 1, 1, 2], ['jhn', 1, 1, 1, 3]]])
    })
})


describe('passage_text (judge)', () => {

    it("Returns the plain text of a single verse without notes or headings", ({expect}) => {
        const text = passage_text(['gen', 1, 1, 1, 1])
        expect(text).toContain('In the beginning God created')
        expect(text).not.toContain('Creation')  // the heading must be stripped
    })

    it("Joins the verses of a range", ({expect}) => {
        const text = passage_text(['gen', 1, 1, 1, 2])
        expect(text).toContain('In the beginning')
        expect(text).toContain('formless and void')
    })

    it("Truncates very long ranges with an ellipsis", ({expect}) => {
        const text = passage_text(['gen', 1, 1, 2, 25])
        expect(text.endsWith('…')).toBe(true)
    })
})


describe('compact_source', () => {

    it("Collapses a single verse to [chapter, verse]", ({expect}) => {
        expect(compact_source(['rom', 1, 17, 1, 17])).toEqual([1, 17])
    })

    it("Keeps the end pair for a range", ({expect}) => {
        expect(compact_source(['rom', 3, 10, 3, 18])).toEqual([3, 10, 3, 18])
    })
})


describe('compact_target', () => {

    it("Drops the book id when the target is in the file's own book", ({expect}) => {
        expect(compact_target(['psa', 2, 7, 2, 7], 'psa')).toEqual([2, 7])
    })

    it("Includes the book id for a different book (single verse)", ({expect}) => {
        expect(compact_target(['isa', 7, 14, 7, 14], 'mat')).toEqual(['isa', 7, 14])
    })

    it("Includes the book id and end pair for a different-book range", ({expect}) => {
        expect(compact_target(['psa', 95, 7, 95, 11], 'heb')).toEqual(['psa', 95, 7, 95, 11])
    })
})
