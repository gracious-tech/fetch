
import {describe, it} from 'vitest'

import {
    usfm_displace_range,
    usfm_drop_chapter_tail,
    usfm_drop_from_chapter,
    usfm_empty_chapter,
    usfm_fold_verse,
    usfm_insert_empty_verse,
    usfm_reorder_verse,
    usfm_super_to_title,
    usfm_swap_chapters,
} from './usfm'


describe('usfm_empty_chapter', () => {

    const usfm = '\\c 3\n\\p\n\\v 1 first\n\\v 2 second\n\\c 4\n\\p\n\\v 1 next chapter\n'

    it("Keeps the \\c marker but drops the chapter body", ({expect}) => {
        const out = usfm_empty_chapter(usfm, 3)
        expect(out).toContain('\\c 3')
        expect(out).not.toContain('first')
        expect(out).not.toContain('second')
        // The following chapter is untouched
        expect(out).toContain('\\c 4\n\\p\n\\v 1 next chapter')
    })

    it("Is idempotent (no verses left is a no-op)", ({expect}) => {
        const once = usfm_empty_chapter(usfm, 3)
        expect(usfm_empty_chapter(once, 3)).toEqual(once)
    })

    it("Is a no-op when the chapter is absent", ({expect}) => {
        expect(usfm_empty_chapter(usfm, 9)).toEqual(usfm)
    })

})


describe('usfm_fold_verse', () => {

    const usfm = '\\c 16\n\\p\n\\v 3 part a\n\\v 0 part b\n'

    it("Drops the displaced verse marker so its text folds into the preceding verse", ({expect}) => {
        const out = usfm_fold_verse(usfm, 16, 0)
        expect(out).not.toContain('\\v 0')
        expect(out).toContain('part b')
        expect(out).toContain('\\v 3 part a')
    })

    it("Is idempotent (no text-bearing copy remains)", ({expect}) => {
        const once = usfm_fold_verse(usfm, 16, 0)
        expect(usfm_fold_verse(once, 16, 0)).toEqual(once)
    })

    it("Is a no-op when the verse is absent", ({expect}) => {
        expect(usfm_fold_verse(usfm, 16, 9)).toEqual(usfm)
    })

})


describe('usfm_insert_empty_verse', () => {

    const usfm = '\\c 6\n\\p\n\\v 22 the last present verse\n'

    it("Inserts an empty placeholder after the anchor verse's content", ({expect}) => {
        const out = usfm_insert_empty_verse(usfm, 6, 23, 22)
        expect(out).toContain('\\v 22 the last present verse')
        expect(out).toMatch(/\\v 23\n/)
    })

    it("Is a no-op when the verse already exists", ({expect}) => {
        const usfm2 = '\\c 6\n\\p\n\\v 22 present\n\\v 23 already here\n'
        expect(usfm_insert_empty_verse(usfm2, 6, 23, 22)).toEqual(usfm2)
    })

})


describe('usfm_reorder_verse', () => {

    it("Folds a displaced verse and inserts a placeholder before the next marker", ({expect}) => {
        const usfm = '\\c 9\n\\p\n\\v 1 one\n\\v 14 displaced\n\\v 2 two\n\\v 13 thirteen\n'
        const out = usfm_reorder_verse(usfm, 9, 14, 13)
        // The displaced text is kept (folded), and an empty placeholder 14 now exists
        expect(out).toContain('displaced')
        expect(out.match(/\\v 14\b/g)).toHaveLength(1)
        expect(out).toMatch(/\\v 13 thirteen\n\\v 14\n/)
    })

    it("Places the verse at the chapter start when place_after is 0", ({expect}) => {
        const usfm = '\\c 14\n\\p\n\\v 3 three\n\\v 1 one\n'
        const out = usfm_reorder_verse(usfm, 14, 1, 0)
        expect(out).toMatch(/\\c 14\n\\v 1\n/)
        expect(out).toContain('one')
    })

    it("Is idempotent", ({expect}) => {
        const usfm = '\\c 9\n\\p\n\\v 1 one\n\\v 14 displaced\n\\v 2 two\n\\v 13 thirteen\n'
        const once = usfm_reorder_verse(usfm, 9, 14, 13)
        expect(usfm_reorder_verse(once, 9, 14, 13)).toEqual(once)
    })

})


describe('usfm_displace_range', () => {

    // DEU 10 prints vv6-9 after vv10-11 — fold them and place ascending placeholders after v5
    const usfm = '\\c 10\n\\p\n\\v 5 five\n\\v 10 ten\n\\v 11 eleven\n'
        + '\\v 6 six\n\\v 7 seven\n\\v 8 eight\n\\v 9 nine\n'

    it("Folds each displaced verse and adds chained placeholders", ({expect}) => {
        const out = usfm_displace_range(usfm, 10, [6, 7, 8, 9], 5)
        // The text of the displaced verses is retained
        for (const word of ['six', 'seven', 'eight', 'nine']){
            expect(out).toContain(word)
        }
        // Each displaced number now appears exactly once (as the placeholder)
        for (const n of [6, 7, 8, 9]){
            expect(out.match(new RegExp(`\\\\v ${n}\\b`, 'g'))).toHaveLength(1)
        }
        // The placeholders are chained in ascending order after v5
        expect(out).toMatch(/\\v 5 five\n\\v 6\n\\v 7\n\\v 8\n\\v 9\n/)
    })

    it("Is idempotent", ({expect}) => {
        const once = usfm_displace_range(usfm, 10, [6, 7, 8, 9], 5)
        expect(usfm_displace_range(once, 10, [6, 7, 8, 9], 5)).toEqual(once)
    })

})


describe('usfm_swap_chapters', () => {

    const usfm = '\\c 20\n\\p\n\\v 1 a1\n'
        + '\\c 21\n\\p\n\\v 1 b1\n\\v 2 b2\n\\v 3 b3\n'
        + '\\c 22\n\\p\n\\v 1 c1\n'

    it("Swaps the two chapter bodies while keeping \\c markers ascending", ({expect}) => {
        const out = usfm_swap_chapters(usfm, 20, 21)
        // Chapter 20 now holds the (longer) former chapter-21 body and vice versa
        expect(out).toMatch(/\\c 20\n\\p\n\\v 1 b1\n\\v 2 b2\n\\v 3 b3\n\\c 21/)
        expect(out).toMatch(/\\c 21\n\\p\n\\v 1 a1\n\\c 22/)
        // The surrounding chapter is untouched
        expect(out).toContain('\\c 22\n\\p\n\\v 1 c1')
    })

    it("Is idempotent via the verse-count guard", ({expect}) => {
        const once = usfm_swap_chapters(usfm, 20, 21)
        expect(usfm_swap_chapters(once, 20, 21)).toEqual(once)
    })

    it("Is a no-op when already in order (a has more verses than b)", ({expect}) => {
        const ordered = '\\c 20\n\\v 1 x\n\\v 2 y\n\\c 21\n\\v 1 z\n\\c 22\n'
        expect(usfm_swap_chapters(ordered, 20, 21)).toEqual(ordered)
    })

})


describe('usfm_super_to_title', () => {

    const usfm = '\\c 10\n\\q1\n\\v 1 the superscription\n\\v 2 body one\n\\v 3 body two\n'

    it("Converts the \\v 1 superscription to a \\d title and shifts body verses down", ({expect}) => {
        const out = usfm_super_to_title(usfm, 10)
        expect(out).toContain('\\d the superscription')
        expect(out).toContain('\\v 1 body one')
        expect(out).toContain('\\v 2 body two')
        expect(out).not.toMatch(/\\v 3\b/)
    })

    it("Is idempotent via the \\d guard", ({expect}) => {
        const once = usfm_super_to_title(usfm, 10)
        expect(usfm_super_to_title(once, 10)).toEqual(once)
    })

})


describe('usfm_drop_from_chapter', () => {

    const usfm = '\\c 34\n\\p\n\\v 1 kept\n\\c 35\n\\p\n\\v 1 dropped\n'

    it("Drops the chapter and everything after it", ({expect}) => {
        const out = usfm_drop_from_chapter(usfm, 35)
        expect(out).not.toContain('\\c 35')
        expect(out).not.toContain('dropped')
        expect(out).toContain('\\c 34')
    })

    it("Is idempotent", ({expect}) => {
        const once = usfm_drop_from_chapter(usfm, 35)
        expect(usfm_drop_from_chapter(once, 35)).toEqual(once)
    })

})


describe('usfm_drop_chapter_tail', () => {

    const usfm = '\\c 38\n\\p\n\\v 37 a\n\\v 38 last kept\n\\q1\n\\v 39 dropped\n\\v 40 also dropped\n'

    it("Drops trailing verses beyond last_keep with their preceding empty markers", ({expect}) => {
        const out = usfm_drop_chapter_tail(usfm, 38, 38)
        expect(out).not.toContain('\\v 39')
        expect(out).not.toContain('dropped')
        expect(out).toContain('\\v 38 last kept')
    })

    it("Is idempotent", ({expect}) => {
        const once = usfm_drop_chapter_tail(usfm, 38, 38)
        expect(usfm_drop_chapter_tail(once, 38, 38)).toEqual(once)
    })

})
