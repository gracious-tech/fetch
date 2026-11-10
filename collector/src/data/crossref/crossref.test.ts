
import {describe, it} from 'vitest'

import {best_common_run, count_content} from './textual.js'
import {compact_span, crossref_file_name, group_links} from './distribute.js'
import {merge_ranges, canonical_pair, fold_shared_side} from './merge.js'
import {classify_note} from './bsb.js'
import {passage_text} from './judge/campaign.js'
import {drop_near_duplicates, key_to_pair} from './judged.js'

import type {ScoredLink} from './judged.js'
import type {CrossrefCategory} from '../../parts/shared_types.js'


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


describe('compact_span', () => {

    it("Collapses a single verse to [book, ch, v]", ({expect}) => {
        expect(compact_span(['rom', 1, 17, 1, 17])).toEqual(['rom', 1, 17])
    })

    it("Keeps the end pair for a range", ({expect}) => {
        expect(compact_span(['psa', 95, 7, 95, 11])).toEqual(['psa', 95, 7, 95, 11])
    })
})


describe('crossref_file_name', () => {

    it("Marks files that include stronger links with _plus", ({expect}) => {
        expect(crossref_file_name('very_high', true)).toBe('very_high')
        expect(crossref_file_name('high', true)).toBe('high_plus')
        expect(crossref_file_name('medium', false)).toBe('medium_plus_no_relevant')
    })
})


describe('group_links', () => {

    it("Groups links by category then strength, keeping their order", ({expect}) => {
        const scored = (key:string, category:CrossrefCategory, salience:number):ScoredLink =>
            ({key, pair: key_to_pair(key), category, salience})
        expect(group_links([
            scored('psa,91,11,91,12>mat,4,6,4,6', 'quotation', 5),
            scored('deu,8,3,8,3>mat,4,4,4,4', 'quotation', 5),
            scored('mat,4,6,4,6>mat,27,40,27,40', 'allusion', 4),
            scored('isa,40,3,40,3>jhn,1,23,1,23', 'quotation', 3),
        ])).toEqual({
            quotation: {
                very_high: [[['psa', 91, 11, 91, 12], ['mat', 4, 6]], [['deu', 8, 3], ['mat', 4, 4]]],
                medium: [[['isa', 40, 3], ['jhn', 1, 23]]],
            },
            allusion: {high: [[['mat', 4, 6], ['mat', 27, 40]]]},
        })
    })

    it("Lists strengths strongest first", ({expect}) => {
        const scored = (salience:number):ScoredLink =>
            ({key: 'a', pair: key_to_pair('gen,1,1,1,1>jhn,1,1,1,1'), category: 'allusion', salience})
        expect(Object.keys(group_links([scored(3), scored(5), scored(4)]).allusion ?? {}))
            .toEqual(['very_high', 'high', 'medium'])
    })
})


describe('drop_near_duplicates', () => {

    // Build a scored link from a record key (quotation unless given)
    const link = (key:string, salience:number, category:CrossrefCategory = 'quotation'):ScoredLink =>
        ({key, pair: key_to_pair(key), category, salience})

    // Keys of the links that survive
    const survivors = (links:ScoredLink[]) => drop_near_duplicates(links).map(l => l.key).sort()

    it("Keeps the higher-scored variant", ({expect}) => {
        expect(survivors([
            link('deu,5,16,5,21>luk,18,20,18,20', 5),
            link('deu,5,16,5,20>luk,18,20,18,20', 4),
            link('deu,5,16,5,16>luk,18,20,18,20', 4),
        ])).toEqual(['deu,5,16,5,21>luk,18,20,18,20'])
    })

    it("Keeps the narrower variant when one ties with a wider one", ({expect}) => {
        expect(survivors([
            link('gen,2,1,2,2>heb,4,3,4,4', 4),
            link('gen,2,1,2,2>heb,4,4,4,4', 4),
        ])).toEqual(['gen,2,1,2,2>heb,4,4,4,4'])
    })

    it("Keeps a wider variant over several tied pieces of it", ({expect}) => {
        expect(survivors([
            link('psa,91,11,91,12>mat,4,6,4,6', 5),
            link('psa,91,11,91,11>mat,4,6,4,6', 5),
            link('psa,91,12,91,12>mat,4,6,4,6', 5),
        ])).toEqual(['psa,91,11,91,12>mat,4,6,4,6'])
    })

    it("Lets a wider variant kept over pieces win ties on its other side too", ({expect}) => {
        expect(survivors([
            link('psa,16,8,16,11>act,2,25,2,28', 5),
            link('psa,16,8,16,8>act,2,25,2,28', 5),
            link('psa,16,11,16,11>act,2,25,2,28', 5),
            link('psa,16,8,16,11>act,2,25,2,25', 5),
        ])).toEqual(['psa,16,8,16,11>act,2,25,2,28'])
    })

    it("Prefers the stronger category on equal scores", ({expect}) => {
        expect(survivors([
            link('isa,53,7,53,8>act,8,32,8,33', 5, 'quotation'),
            link('isa,53,7,53,7>act,8,32,8,33', 5, 'allusion'),
        ])).toEqual(['isa,53,7,53,8>act,8,32,8,33'])
    })

    it("Leaves links that share no side untouched", ({expect}) => {
        expect(survivors([
            link('mat,4,15,4,15>isa,9,1,9,1', 5),
            link('mat,4,15,4,16>isa,9,1,9,2', 5),
        ])).toHaveLength(2)
    })
})
