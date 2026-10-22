
import {describe, it} from 'vitest'

import {
    append_empty_verses,
    collapse_para_leading_ws,
    drop_chapter_tail,
    drop_from_chapter,
    empty_chapter,
    fold_verse,
    insert_empty_verse,
    merge_overrange_verses,
    psalm_superscriptions_to_d,
    relabel_verse,
    remove_verse_span,
    renumber_chapter,
    renumber_chapter_range,
    reorder_verse,
    wrap_root_verse,
} from './usx'


// Build a converted-USX3 verse (start marker + text + end marker), matching dist serialization
function v(sid:string, num:string, text=''):string{
    return `<verse number="${num}" style="v" sid="${sid}" />${text}<verse eid="${sid}" />`
}


describe('fold_verse', () => {

    // 1CO 11:9 printed out of order after 11:7 — fold its text back into 11:7
    const usx = `<para style="p">${v('1CO 11:7', '7', 'seven ')}${v('1CO 11:9', '9', 'nine ')}</para>`

    it("Folds the verse's text into the preceding verse and drops its markers", ({expect}) => {
        const out = fold_verse(usx, '1CO 11:7', '1CO 11:9')
        expect(out).not.toContain('sid="1CO 11:9"')
        expect(out).not.toContain('eid="1CO 11:9"')
        expect(out).toContain('seven nine ')
        // The kept verse retains exactly one end marker
        expect(out.match(/<verse eid="1CO 11:7" \/>/g)).toHaveLength(1)
    })

    it("Is idempotent (re-running is a no-op)", ({expect}) => {
        const once = fold_verse(usx, '1CO 11:7', '1CO 11:9')
        expect(fold_verse(once, '1CO 11:7', '1CO 11:9')).toEqual(once)
    })

    it("Is a no-op when the folded verse is an empty placeholder", ({expect}) => {
        const empty = `<para style="p">${v('1CO 11:7', '7', 'seven ')}${v('1CO 11:9', '9')}</para>`
        expect(fold_verse(empty, '1CO 11:7', '1CO 11:9')).toEqual(empty)
    })

    it("Is a no-op when a marker is absent", ({expect}) => {
        const usx2 = `<para style="p">${v('1CO 11:7', '7', 'seven ')}</para>`
        expect(fold_verse(usx2, '1CO 11:7', '1CO 11:9')).toEqual(usx2)
    })

})


describe('insert_empty_verse', () => {

    const usx = `<para style="p">${v('GEN 1:1', '1', 'a ')}${v('GEN 1:2', '2', 'b ')}</para>`

    it("Inserts an empty placeholder right after the anchor verse", ({expect}) => {
        const out = insert_empty_verse(usx, 'GEN 1:1', 'GEN 1:99', '99')
        expect(out).toContain(
            '<verse eid="GEN 1:1" /><verse number="99" style="v" sid="GEN 1:99" />'
            + '<verse eid="GEN 1:99" />')
    })

    it("Is a no-op when the new verse already exists", ({expect}) => {
        const out = insert_empty_verse(usx, 'GEN 1:1', 'GEN 1:2', '2')
        expect(out).toEqual(usx)
    })

    it("Is a no-op when the anchor is missing", ({expect}) => {
        expect(insert_empty_verse(usx, 'GEN 1:50', 'GEN 1:99', '99')).toEqual(usx)
    })

})


describe('collapse_para_leading_ws', () => {

    it("Removes whitespace between a para tag and following text", ({expect}) => {
        const usx = '<para style="p">\n    some text</para>'
        expect(collapse_para_leading_ws(usx)).toEqual('<para style="p">some text</para>')
    })

    it("Leaves a para that opens onto a child element untouched", ({expect}) => {
        const usx = '<para style="p">\n  <verse number="1" style="v" sid="GEN 1:1" /></para>'
        expect(collapse_para_leading_ws(usx)).toEqual(usx)
    })

})


describe('append_empty_verses', () => {

    const usx = `<para style="p">${v('ISA 38:20', '20', 'x ')}</para>`

    it("Appends a new paragraph of empty placeholders after the anchor", ({expect}) => {
        const out = append_empty_verses(usx, 'ISA 38:20',
            [['21', 'ISA 38:21'], ['22', 'ISA 38:22']])
        expect(out).toContain('<verse number="21" style="v" sid="ISA 38:21" />')
        expect(out).toContain('<verse number="22" style="v" sid="ISA 38:22" />')
        // The placeholders live in their own new paragraph after the anchor's para
        expect(out).toContain('</para>\n  <para style="p">')
    })

    it("Is idempotent (first placeholder already present is a no-op)", ({expect}) => {
        const once = append_empty_verses(usx, 'ISA 38:20',
            [['21', 'ISA 38:21'], ['22', 'ISA 38:22']])
        expect(append_empty_verses(once, 'ISA 38:20',
            [['21', 'ISA 38:21'], ['22', 'ISA 38:22']])).toEqual(once)
    })

    it("Is a no-op when the anchor is missing", ({expect}) => {
        expect(append_empty_verses(usx, 'ISA 38:50', [['51', 'ISA 38:51']])).toEqual(usx)
    })

})


describe('reorder_verse', () => {

    // GEN 1:5 printed out of order after 1:9 — fold into 9, placeholder at slot after 4
    const usx = `<para style="p">${v('GEN 1:4', '4', 'd ')}${v('GEN 1:9', '9', 'i ')}`
        + `${v('GEN 1:5', '5', 'e ')}</para>`

    it("Folds the displaced verse and adds a placeholder at its canonical slot", ({expect}) => {
        const out = reorder_verse(usx, 'GEN 1', 5, 9, 4)
        // Text folded into verse 9
        expect(out).toContain('i e ')
        // An empty placeholder for verse 5 now sits after verse 4
        expect(out).toContain('<verse eid="GEN 1:4" /><verse number="5" style="v" sid="GEN 1:5" />'
            + '<verse eid="GEN 1:5" />')
    })

    it("Is idempotent", ({expect}) => {
        const once = reorder_verse(usx, 'GEN 1', 5, 9, 4)
        expect(reorder_verse(once, 'GEN 1', 5, 9, 4)).toEqual(once)
    })

})


describe('relabel_verse', () => {

    // A mis-numbered second "13:1" after 13:13 should become 13:14; the real 13:1 is untouched
    const usx = `${v('ISA 13:1', '1', 'real ')}${v('ISA 13:13', '13', 'thirteen ')}`
        + `${v('ISA 13:1', '1', 'misnumbered ')}`

    it("Relabels only the occurrence after the anchor", ({expect}) => {
        const out = relabel_verse(usx, 'ISA 13', '1', '14', 'ISA 13:13')
        expect(out).toContain('<verse number="14" style="v" sid="ISA 13:14" />misnumbered ')
        expect(out).toContain('<verse eid="ISA 13:14" />')
        // The genuine 13:1 earlier in the chapter is left alone
        expect(out).toContain('<verse number="1" style="v" sid="ISA 13:1" />real ')
        expect(out.match(/sid="ISA 13:1"/g)).toHaveLength(1)
    })

    it("Is a no-op when the anchor or mis-numbered verse is absent", ({expect}) => {
        const clean = `${v('ISA 13:13', '13', 'thirteen ')}${v('ISA 13:14', '14', 'fourteen ')}`
        expect(relabel_verse(clean, 'ISA 13', '1', '14', 'ISA 13:13')).toEqual(clean)
    })

})


describe('remove_verse_span', () => {

    // A duplicate 4:1 inserted after 4:14 should be removed; the real 4:1 earlier is untouched
    const usx = `${v('1TH 4:1', '1', 'real ')}${v('1TH 4:14', '14', 'fourteen ')}`
        + `${v('1TH 4:1', '1', 'duplicate ')}${v('1TH 4:15', '15', 'fifteen ')}`

    it("Removes the spurious span after the anchor only", ({expect}) => {
        const out = remove_verse_span(usx, '1TH 4:1', '1TH 4:14')
        expect(out).not.toContain('duplicate ')
        // The real 4:1 and the following 4:15 remain
        expect(out).toContain('real ')
        expect(out).toContain('fifteen ')
        expect(out.match(/sid="1TH 4:1"/g)).toHaveLength(1)
    })

    it("Is idempotent", ({expect}) => {
        const once = remove_verse_span(usx, '1TH 4:1', '1TH 4:14')
        expect(remove_verse_span(once, '1TH 4:1', '1TH 4:14')).toEqual(once)
    })

})


describe('drop_chapter_tail', () => {

    const usx = `<para style="p">${v('GEN 44:33', '33', 'c ')}${v('GEN 44:34', '34', 'd ')}`
        + `${v('GEN 44:35', '35', 'e ')}</para>\n  <chapter eid="GEN 44" />`

    it("Drops verses beyond last_keep but preserves the chapter end marker", ({expect}) => {
        const out = drop_chapter_tail(usx, 'GEN 44', 34)
        expect(out).not.toContain('sid="GEN 44:35"')
        expect(out).toContain(v('GEN 44:34', '34', 'd '))
        expect(out).toContain('<chapter eid="GEN 44" />')
    })

    it("Is idempotent", ({expect}) => {
        const once = drop_chapter_tail(usx, 'GEN 44', 34)
        expect(drop_chapter_tail(once, 'GEN 44', 34)).toEqual(once)
    })

    it("Is a no-op when that verse is absent", ({expect}) => {
        expect(drop_chapter_tail(usx, 'GEN 44', 99)).toEqual(usx)
    })

})


describe('renumber_chapter_range', () => {

    // A continuation paragraph carries a vid that must shift along with the verse markers
    const usx = `${v('EZK 21:6', '6', 'a ')}<para style="q1" vid="EZK 21:6">cont</para>`
        + `${v('EZK 21:7', '7', 'b ')}`

    it("Shifts verse numbers, sids, eids and vids within the range", ({expect}) => {
        const out = renumber_chapter_range(usx, 'EZK 21', 6, 7, -5)
        expect(out).toContain('<verse number="1" style="v" sid="EZK 21:1" />')
        expect(out).toContain('<verse number="2" style="v" sid="EZK 21:2" />')
        expect(out).toContain('vid="EZK 21:1"')
        expect(out).not.toContain('EZK 21:6')
        expect(out).not.toContain('EZK 21:7')
    })

    it("Leaves verses outside the range untouched", ({expect}) => {
        const usx2 = `${v('EZK 21:5', '5', 'x ')}${v('EZK 21:6', '6', 'a ')}`
        const out = renumber_chapter_range(usx2, 'EZK 21', 6, 6, -5)
        expect(out).toContain('sid="EZK 21:5"')
        expect(out).toContain('sid="EZK 21:1"')
    })

})


describe('renumber_chapter', () => {

    const usx = `<chapter number="15" style="c" sid="PSA 15" />${v('PSA 15:1', '1', 'a ')}`
        + `<chapter eid="PSA 15" />`

    it("Renumbers the chapter marker and every sid/eid in the chapter", ({expect}) => {
        const out = renumber_chapter(usx, 'psa', 15, 16)
        expect(out).toContain('<chapter number="16" style="c" sid="PSA 16" />')
        expect(out).toContain('sid="PSA 16:1"')
        expect(out).toContain('eid="PSA 16"')
        expect(out).not.toContain('PSA 15')
    })

})


describe('empty_chapter', () => {

    const usx = `<chapter number="23" style="c" sid="ACT 23" /><para style="p">`
        + `${v('ACT 23:1', '1', 'x ')}</para><chapter eid="ACT 23" />`

    it("Empties the chapter body but keeps the chapter markers", ({expect}) => {
        const out = empty_chapter(usx, 'ACT 23')
        expect(out).toContain('sid="ACT 23"')
        expect(out).toContain('eid="ACT 23"')
        expect(out).not.toContain('<verse')
    })

    it("Is idempotent (no verses left is a no-op)", ({expect}) => {
        const once = empty_chapter(usx, 'ACT 23')
        expect(empty_chapter(once, 'ACT 23')).toEqual(once)
    })

})


describe('drop_from_chapter', () => {

    const usx = `<usx version="3.0"><chapter number="12" style="c" sid="DAN 12" />`
        + `${v('DAN 12:1', '1', 'x ')}<chapter eid="DAN 12" />`
        + `<chapter number="13" style="c" sid="DAN 13" />${v('DAN 13:1', '1', 'y ')}</usx>`

    it("Drops the chapter and everything after, closing the document", ({expect}) => {
        const out = drop_from_chapter(usx, 'DAN', 13)
        expect(out).not.toContain('DAN 13')
        expect(out).toContain('sid="DAN 12"')
        expect(out.endsWith('</usx>')).toBe(true)
    })

    it("Is a no-op when the chapter is absent", ({expect}) => {
        expect(drop_from_chapter(usx, 'DAN', 14)).toEqual(usx)
    })

})


describe('merge_overrange_verses', () => {

    // Obadiah has a single chapter of 21 verses; a verse 22 is over-range
    const usx = `${v('OBA 1:21', '21', 'last ')}${v('OBA 1:22', '22', 'over ')}`

    it("Drops the markers of verses beyond the chapter's standard maximum", ({expect}) => {
        const out = merge_overrange_verses('oba', usx)
        expect(out).not.toContain('sid="OBA 1:22"')
        expect(out).not.toContain('eid="OBA 1:22"')
        // The over-range text remains (folds onto the previous valid verse)
        expect(out).toContain('over ')
        expect(out).toContain(v('OBA 1:21', '21', 'last '))
    })

    it("Is idempotent", ({expect}) => {
        const once = merge_overrange_verses('oba', usx)
        expect(merge_overrange_verses('oba', once)).toEqual(once)
    })

    it("Is a no-op for an unknown book", ({expect}) => {
        expect(merge_overrange_verses('zzz', usx)).toEqual(usx)
    })

})


describe('psalm_superscriptions_to_d', () => {

    it("Converts a mis-styled body para before verse 1 into a `d` title", ({expect}) => {
        const usx = '<chapter number="3" style="c" sid="PSA 3"/>'
            + '<para style="m">A psalm of David.</para>'
            + `<para style="q1">${v('PSA 3:1', '1', 'O LORD')}</para>`
            + '<chapter eid="PSA 3"/>'
        const out = psalm_superscriptions_to_d(usx)
        expect(out).toContain('<para style="d">A psalm of David.</para>')
        // The verse-bearing paragraph keeps its own style
        expect(out).toContain('<para style="q1">')
    })

    it("Leaves headings, chapter labels, empty paras and existing `d` titles untouched", ({expect}) => {
        const usx = '<chapter number="3" style="c" sid="PSA 3"/>'
            + '<para style="cl">Psalm 3</para>'
            + '<para style="s1">A heading</para>'
            + '<para style="b"/>'
            + '<para style="d">Already a title.</para>'
            + `<para style="q1">${v('PSA 3:1', '1', 'O LORD')}</para>`
            + '<chapter eid="PSA 3"/>'
        expect(psalm_superscriptions_to_d(usx)).toEqual(usx)
    })

    it("Does not touch body paras that come after verse 1", ({expect}) => {
        const usx = '<chapter number="3" style="c" sid="PSA 3"/>'
            + `<para style="q1">${v('PSA 3:1', '1', 'O LORD')}</para>`
            + '<para style="m">a margin note mid-psalm</para>'
            + '<chapter eid="PSA 3"/>'
        expect(psalm_superscriptions_to_d(usx)).toEqual(usx)
    })

})


describe('wrap_root_verse', () => {

    // tig_mdw ACT 22:2 sits after the chapter marker but outside any paragraph
    it("Wraps a root-level verse up to the next para", ({expect}) => {
        const usx = '<chapter number="22" style="c" sid="ACT 22" />\n  '
            + '<verse number="2" style="v" sid="ACT 22:2" />Text<para style="p" vid="ACT 22:2">More'
            + '<verse eid="ACT 22:2" /></para></usx>'
        const expected = '<chapter number="22" style="c" sid="ACT 22" />\n  <para style="p">'
            + '<verse number="2" style="v" sid="ACT 22:2" />Text</para><para style="p" '
            + 'vid="ACT 22:2">More<verse eid="ACT 22:2" /></para></usx>'
        expect(wrap_root_verse(usx, 'ACT 22:2')).toEqual(expected)
        expect(wrap_root_verse(expected, 'ACT 22:2')).toEqual(expected)
    })

    it("Leaves a verse already inside a para untouched", ({expect}) => {
        const usx = `<chapter number="1" style="c" sid="ACT 1" /><para style="p">${v('ACT 1:1', '1', 'A')}`
            + '</para></usx>'
        expect(wrap_root_verse(usx, 'ACT 1:1')).toEqual(usx)
    })

})
