// @vitest-environment jsdom

import {describe, it, vi} from 'vitest'

import {usx_to_json_html} from './html.js'
import {usx_to_json_txt} from './txt.js'
import {usx_to_json_typst} from './typst.js'


// Wrap a body in a USX doc for a book (Haggai has 2 chapters of 15 and 23 verses)
const usx = (body:string, book='HAG') =>
    `<usx version="3.0"><book code="${book}" style="id"/>${body}</usx>`

// Wrap paras in chapter 1 of Haggai
const ch1 = (paras:string) =>
    usx(`<chapter number="1" style="c" sid="HAG 1"/>${paras}<chapter eid="HAG 1"/>`)

// A verse's start marker, text and end marker
const v = (n:number|string, text:string) =>
    `<verse number="${n}" style="v" sid="HAG 1:${n}"/>${text}<verse eid="HAG 1:${n}"/>`

// A plain para containing the given content
const p = (content:string) => `<para style="p">${content}</para>`


// Each converter with a common signature, so the same inputs can be checked against all of them
type Converter = (xml:string, warn?:(message:string)=>void) => {contents:unknown[][]}
const converters:Record<string, Converter> = {
    html: (xml, warn = () => undefined) => usx_to_json_html(xml, true, undefined, warn),
    txt: (xml, warn = () => undefined) => usx_to_json_txt(xml, undefined, warn),
    typst: (xml, warn = () => undefined) => usx_to_json_typst(xml, undefined, warn),
}

// Serialise a verse's output so text can be checked regardless of format
const verse_str = (convert:Converter, xml:string, ch:number, verse:number) =>
    JSON.stringify(convert(xml).contents[ch]?.[verse])


describe.each(Object.entries(converters))("%s converter edge cases", (_name, convert) => {

    it("Throws for chapter numbers that aren't in the book", ({expect}) => {
        for (const chapter of ['number="0"', 'number="3"', '']){
            expect(() => convert(usx(`<chapter ${chapter} style="c"/>`)))
                .toThrow("Chapter number isn't valid")
        }
    })

    it("Throws for verse numbers that aren't in the chapter", ({expect}) => {
        expect(() => convert(ch1(p(v(99, 'x'))))).toThrow('Invalid verse: hag 1:99')
        expect(() => convert(ch1(p(v('a', 'x'))))).toThrow('Invalid verse: hag 1:-1')
        expect(() => convert(ch1(p('<verse style="v" sid="HAG 1:1"/>x'))))
            .toThrow('Invalid verse: hag 1:-1')
    })

    it("Throws when verses go backwards", ({expect}) => {
        expect(() => convert(ch1(p(v(3, 'x') + v(2, 'y'))))).toThrow('2 less than hag 1:3')
    })

    it("Merges sub-verses (1a, 1b) into the one verse", ({expect}) => {
        const verse = verse_str(convert, ch1(p(v('1a', 'Alpha') + v('1b', 'Beta'))), 1, 1)
        expect(verse).toContain('Alpha')
        expect(verse).toContain('Beta')
    })

    it("Omits ignored char and note styles but keeps those without a style", ({expect}) => {
        const verse = verse_str(convert, ch1(p(v(1, 'T<char style="rq">RQ</char>'
            + '<note caller="+" style="x">XREF</note><char>Plain</char>'
            + '<note caller="+">Unstyled</note>'))), 1, 1)
        expect(verse).not.toContain('RQ')
        expect(verse).not.toContain('XREF')
        expect(verse).toContain('Plain')
        expect(verse).toContain('Unstyled')
    })

    it("Warns about and skips root elements other than paras", ({expect}) => {
        const warn = vi.fn()
        const output = convert(ch1(p(v(1, 'T')) + '<list>Aside</list>'), warn)
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/non-para root element: list/))
        expect(JSON.stringify(output.contents)).not.toContain('Aside')
    })

    it("Treats a para without a style as a normal para", ({expect}) => {
        expect(verse_str(convert, ch1('<para>' + v(1, 'Unstyled para') + '</para>'), 1, 1))
            .toContain('Unstyled para')
    })

    // NOTE The first heading holds verse 1's end marker, which mustn't attach it to verse 1
    it("Includes major and minor headings in the verse that follows", ({expect}) => {
        const xml = ch1(p(v(1, 'One')) + '<para style="s"><verse eid="HAG 1:1"/>Section</para>'
            + '<para style="ms">Major</para><para style="sp">Minor</para><para style="s"/>'
            + p(v(2, 'Two')))
        const verse = verse_str(convert, xml, 1, 2)
        for (const text of ['Section', 'Major', 'Minor', 'Two']){
            expect(verse).toContain(text)
        }
        expect(verse_str(convert, xml, 1, 1)).not.toContain('Section')
    })
})


describe("usx_to_json_html specific elements", () => {

    // Get verse 1's html for given verse content
    const html = (content:string, alignment=true) =>
        usx_to_json_html(ch1(p(v(1, content))), alignment).contents[1]![1]!.join('')

    it("Only wraps aligned words in a span when alignment is enabled", ({expect}) => {
        const word = '<char style="w" strong="H1">word</char>'
        expect(html(word)).toContain('<span>word</span>')
        expect(html(word, false)).toContain('<sup data-v="1:1">1</sup>word')
    })

    it("Converts ordinals and superscripts to <sup>", ({expect}) => {
        expect(html('1<char style="ord">st</char> and 2<char style="sup">nd</char>'))
            .toContain('1<sup>st</sup> and 2<sup>nd</sup>')
    })

    it("Converts ruby text, removing gloss syllable separators", ({expect}) => {
        expect(html('<char style="rb" gloss="ka:n">漢</char>'))
            .toContain('<ruby>漢<rt>kan</rt></ruby>')
        expect(html('<char style="rb">字</char>')).toContain('<ruby>字<rt></rt></ruby>')
    })

    it("Attaches a psalm superscription to verse 1 only when it precedes verse 1", ({expect}) => {
        const contents = usx_to_json_html(usx(`<chapter number="3" style="c" sid="PSA 3"/>
            <para style="d">A Psalm of David.</para>
            <para style="p"><verse number="1" style="v" sid="PSA 3:1"/>One</para>
            <para style="d">Selah</para>
            <para style="d"><verse number="2" style="v" sid="PSA 3:2"/>Two</para>
            <chapter number="4" style="c" sid="PSA 4"/>
            <para style="d"><verse number="1" style="v" sid="PSA 4:1"/>Title in verse</para>`,
        'PSA')).contents
        expect(contents[3]![1]!.join('')).toMatch(/A Psalm of David\..*One.*Selah/)
        expect(contents[3]![2]!.join('')).toContain('Two')
        expect(contents[4]![1]!.join('')).toContain('<p class="fb-d"><sup data-v="4:1">1</sup>')
    })

    it("Silently drops empty structural paras before verse 1", ({expect}) => {
        const warn = vi.fn()
        const output = usx_to_json_html(ch1('<para style="b"/>' + p(v(1, 'One'))), true,
            undefined, warn)
        expect(warn).not.toHaveBeenCalled()
        expect(output.contents[1]![0]).toEqual(['', '', ''])
        expect(output.contents[1]![1]!.join('')).not.toContain('fb-b')
    })
})


describe("table flattening", () => {

    // Get chapter 1's verses' html for a table following verse 1's para
    const table = (cells:string) => {
        const xml = ch1(p(v(1, 'Intro')) + `<table><row style="tr">${cells}</row></table>`)
        return usx_to_json_html(xml).contents[1]!.map(verse => verse.join(''))
    }

    it("Handles an empty first cell", ({expect}) => {
        expect(table('<cell style="tc1"></cell><cell style="tc2">B</cell>')[1])
            .toContain('<p class="fb-li1">B</p>')
    })

    it("Drops whitespace beside a verse marker within a cell", ({expect}) => {
        const verses = table('<cell style="tc1">A<char style="bd">b</char> '
            + '<verse number="2" style="v" sid="HAG 1:2"/>C</cell>')
        expect(verses[1]).toContain('A<span class="fb-bd">b</span></p>')
        expect(verses[2]).toContain('<sup data-v="1:2">2</sup>C')
    })
})
