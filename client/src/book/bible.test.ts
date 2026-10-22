
import {describe, it} from 'vitest'
import {PassageReference} from '@gracious.tech/bible-references'

import {BibleBookHtml, BibleBookTxt, BibleBookTypst, BibleBookUsfm, BibleBookUsx} from './bible.js'

import type {RuntimeCopyright, RuntimeLicense} from '../assets/types.js'


// Licenses for attribution tests
const restrictions = {forbid_limitless: false, forbid_commercial: false, forbid_derivatives: false,
    forbid_attributionless: false, forbid_other: false}
const license_a:RuntimeLicense = {id: 'a', name: 'License A', restrictions, url: 'https://a'}
const license_b:RuntimeLicense = {id: 'b', name: 'License B', restrictions, url: 'https://b'}
const copyright:RuntimeCopyright = {
    attribution: 'Owner & Co',
    attribution_url: 'https://owner',
    licenses: [license_a, license_b],
}


// Markup books: chapters > verses > [before, body, after] (chapter/verse 0 unused)
const markup_json = JSON.stringify({contents: [
    [],
    [['', '', ''], ['<p>', 'A1 ', ''], ['', 'A2 ', '</p>']],
    [['', '', ''], ['<p>', 'B1 ', '</p>']],
]})


// Txt book with a heading and a note
const txt_json = JSON.stringify({book: 'gen', name: {normal: '', long: '', abbrev: ''}, contents: [
    [],
    [[], ['A1 '], [{type: 'heading', contents: 'Head', level: 2}, 'A2 ',
        {type: 'note', contents: 'Note'}]],
    [[], ['B1 ']],
]})


describe('BibleBookHtml', () => {

    const book = new BibleBookHtml(markup_json)
    const wrap = (chapter:number, inner:string) =>
        `<div class="fb-chapter" data-c="${chapter}">${inner}</div>`

    it("Gets the whole book", ({expect}) => {
        expect(book.get_whole()).toBe('A1 A2 B1 ')
    })

    it("Gets passages within and across chapters, wrapping each chapter", ({expect}) => {
        expect(book.get_passage(1, 1, 1, 1)).toBe(wrap(1, '<p>A1 '))
        expect(book.get_passage(1, 2, 2, 1)).toBe(wrap(1, 'A2 </p>') + wrap(2, '<p>B1 </p>'))
        expect(book.get_chapter(1)).toBe(wrap(1, '<p>A1 A2 </p>'))
        expect(book.get_chapters(1, 2)).toBe(wrap(1, '<p>A1 A2 </p>') + wrap(2, '<p>B1 </p>'))
        expect(book.get_verse(2, 1)).toBe(wrap(2, '<p>B1 </p>'))
    })

    it("Returns nothing for a passage that doesn't exist", ({expect}) => {
        expect(book.get_passage(5, 1, 5, 2)).toBe('')
    })

    it("Gets passages from references of every type", ({expect}) => {
        expect(book.get_passage_from_ref(new PassageReference('gen'))).toBe('A1 A2 B1 ')
        expect(book.get_passage_from_ref(new PassageReference('gen', 2)))
            .toBe(wrap(2, '<p>B1 </p>'))
        expect(book.get_passage_from_ref(PassageReference.from_string('Gen 1-2')!))
            .toBe(wrap(1, '<p>A1 A2 </p>') + wrap(2, '<p>B1 </p>'))
        expect(book.get_passage_from_ref(new PassageReference('gen', 1, 2)))
            .toBe(wrap(1, 'A2 </p>'))
    })

    it("Lists individual verses with reproducible ids", ({expect}) => {
        expect(book.get_list()).toEqual([
            {id: 1001, chapter: 1, verse: 1, content: '<p>A1 '},
            {id: 1002, chapter: 1, verse: 2, content: 'A2 </p>'},
            {id: 2001, chapter: 2, verse: 1, content: '<p>B1 </p>'},
        ])
        expect(book.get_list(1, 2, 1)).toHaveLength(1)  // End chapter without end verse
        expect(book.get_list_from_ref(new PassageReference('gen', 1)).map(v => v.id))
            .toEqual([1001, 1002])
        expect(book.get_list_from_ref(new PassageReference('gen')).map(v => v.id))
            .toEqual([1001, 1002, 2001])
        expect(book.get_list_from_ref(new PassageReference('gen', 2, 1)).map(v => v.id))
            .toEqual([2001])
    })

    it("Validates arguments", ({expect}) => {
        // @ts-expect-error Testing invalid input
        expect(() => book.get_passage('1', 1, 1, 1)).toThrow('must all be numbers')
        expect(() => book.get_passage(1, -1, 1, 1)).toThrow('cannot be negative')
        expect(() => book.get_passage(2, 1, 1, 1)).toThrow('end is less than passage start')
        expect(() => book.get_passage(1, 2, 1, 1)).toThrow('end is less than passage start')
        // @ts-expect-error Testing invalid input
        expect(() => book.get_chapters('1', 2)).toThrow('must be numbers')
    })

    it("Has no attribution unless copyright is known", ({expect}) => {
        expect(book.get_attribution()).toBe('')
    })

    it("Attributes using the first license by default, or a given one", ({expect}) => {
        const with_copyright = new BibleBookHtml(markup_json, copyright)
        const default_attribution = with_copyright.get_attribution()
        expect(default_attribution).toContain('<a href="https://owner" target="_blank">'
            + 'Owner &amp; Co</a>')
        expect(default_attribution).toContain('<a href="https://a" target="_blank">License A</a>')
        expect(with_copyright.get_attribution(license_b)).toContain('License B')
        expect(with_copyright.get_whole()).toBe('A1 A2 B1 ' + default_attribution)
        expect(with_copyright.get_whole({attribute: true})).toBe('A1 A2 B1 ' + default_attribution)
        expect(with_copyright.get_whole({attribute: false})).toBe('A1 A2 B1 ')
        expect(with_copyright.get_verse(2, 1, {attribute: license_b}))
            .toBe(wrap(2, '<p>B1 </p>') + with_copyright.get_attribution(license_b))
    })
})


describe('BibleBookTypst', () => {

    it("Doesn't wrap chapters", ({expect}) => {
        expect(new BibleBookTypst(markup_json).get_chapter(1)).toBe('<p>A1 A2 </p>')
    })

    it("Escapes attribution for Typst", ({expect}) => {
        const book = new BibleBookTypst(markup_json, {...copyright, attribution: 'Owner'})
        expect(book.get_attribution()).toBe(' \\[License A \\- Owner\\] ')
        expect(book.get_attribution(license_b)).toBe(' \\[License B \\- Owner\\] ')
        expect(new BibleBookTypst(markup_json).get_attribution()).toBe('')
    })
})


describe('BibleBookUsx / BibleBookUsfm', () => {

    it("Return the whole document as given", ({expect}) => {
        expect(new BibleBookUsx('<usx/>').get_whole()).toBe('<usx/>')
        expect(new BibleBookUsfm('\\id GEN', copyright).get_whole()).toBe('\\id GEN')
    })
})


describe('BibleBookTxt', () => {

    const book = new BibleBookTxt(txt_json)

    it("Renders headings and notes as Markdown by default", ({expect}) => {
        expect(book.get_whole()).toBe('A1 \n## HeadA2 [^a]B1 \n\n\n\n[^a]: Note')
    })

    it("Can omit headings and notes", ({expect}) => {
        expect(book.get_whole({headings: false, notes: false})).toBe('A1 A2 B1 ')
    })

    it("Can prefix verse numbers (with the chapter at chapter/range starts)", ({expect}) => {
        expect(book.get_whole({verse_nums: true, headings: false, notes: false}))
            .toBe('[1:1] A1 [2] A2 [2:1] B1 ')
        expect(book.get_passage(1, 2, 1, 2, {verse_nums: true, headings: false, notes: false}))
            .toBe('[1:2] A2 ')
    })

    it("Gets chapters, verses and references", ({expect}) => {
        const plain = {headings: false, notes: false}
        expect(book.get_chapter(2, plain)).toBe('B1 ')
        expect(book.get_chapters(1, 2, plain)).toBe('A1 A2 B1 ')
        expect(book.get_verse(1, 1, plain)).toBe('A1 ')
        expect(book.get_passage(1, 2, 2, 1, plain)).toBe('A2 B1 ')
        expect(book.get_passage_from_ref(new PassageReference('gen'), plain)).toBe('A1 A2 B1 ')
        expect(book.get_passage_from_ref(new PassageReference('gen', 2), plain)).toBe('B1 ')
        expect(book.get_passage_from_ref(new PassageReference('gen', 1, 1), plain)).toBe('A1 ')
    })

    it("Lists verses", ({expect}) => {
        expect(book.get_list(2)).toEqual([{id: 2001, chapter: 2, verse: 1, content: ['B1 ']}])
        expect(book.get_list_from_ref(new PassageReference('gen', 1, 1))).toEqual(
            [{id: 1001, chapter: 1, verse: 1, content: ['A1 ']}])
    })

    it("Validates arguments", ({expect}) => {
        expect(() => book.get_passage(2, 1, 1, 1)).toThrow('end is less than passage start')
        // @ts-expect-error Testing invalid input
        expect(() => book.get_chapters(1, '2')).toThrow('must be numbers')
    })

    it("Attributes as plain text", ({expect}) => {
        const with_copyright = new BibleBookTxt(txt_json, copyright)
        expect(with_copyright.get_attribution()).toBe('\n\n\n\n[License A - Owner & Co]')
        expect(with_copyright.get_attribution(license_b)).toBe('\n\n\n\n[License B - Owner & Co]')
        expect(with_copyright.get_verse(1, 1, {attribute: false})).toBe('A1 ')
        expect(with_copyright.get_verse(1, 1)).toBe('A1 \n\n\n\n[License A - Owner & Co]')
        expect(with_copyright.get_verse(1, 1, {attribute: license_b}))
            .toBe('A1 \n\n\n\n[License B - Owner & Co]')
        expect(book.get_attribution()).toBe('')
    })
})
