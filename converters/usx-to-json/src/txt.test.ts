
import {describe, it} from 'vitest'
import {last_verse} from '@gracious.tech/bible-references'

import {usx_to_json_txt} from './txt.js'

import type {TxtContent} from './shared_types'


/**
 * @vitest-environment jsdom
 */

// Wrap a USX body fragment in a minimal valid document for the given book code
function usx(book:string, body:string):string{
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <usx version="3.0">
            <book code="${book.toUpperCase()}" style="id">Book</book>
            ${body}
        </usx>`
}


// Convert a USX body and return both the output and any warnings that were emitted
function convert(book:string, body:string){
    const warnings:string[] = []
    const output = usx_to_json_txt(usx(book, body), undefined, msg => warnings.push(msg))
    return {output, warnings}
}


// Collapse a verse's content into a plain string of just its text items (drops headings/notes)
function verse_text(verse:TxtContent[]):string{
    return verse.filter(item => typeof item === 'string').join('')
}


describe("usx_to_json_txt", () => {

    describe("document structure", () => {

        // The output should always reserve an empty chapter 0 so chapters are 1-indexed
        it("adds an empty chapter 0", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[0]).toEqual([])
        })

        // Each chapter is sized to its verse count (+1 for the unused verse 0)
        it("sizes chapters and verses from the versification data", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents).toHaveLength(last_verse['jol']!.length + 1)
            expect(output.contents[1]).toHaveLength((last_verse['jol']![0] as number) + 1)
            expect(output.contents[2]).toHaveLength((last_verse['jol']![1] as number) + 1)
        })

        // Verses that have no content remain as empty arrays
        it("leaves undefined verses as empty arrays", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![0]).toEqual([])
            expect(output.contents[1]![2]).toEqual([])
        })

        // The book code and names are extracted from the identification paras
        it("extracts the book code and names", ({expect}) => {
            const {output} = convert('jol', `
                <para style="h">Joel</para>
                <para style="toc1">The Book of Joel</para>
                <para style="toc2">Joel</para>
                <para style="toc3">Joe</para>
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.book).toEqual('jol')
            expect(output.name).toEqual({normal: 'Joel', long: 'The Book of Joel', abbrev: 'Joe'})
        })

    })

    describe("error handling", () => {

        // The root element must be <usx>
        it("throws when not a USX document", ({expect}) => {
            const xml = '<?xml version="1.0"?><blah></blah>'
            expect(() => usx_to_json_txt(xml, undefined, () => {})).toThrow()
        })

        // A <book> element is required to identify the book
        it("throws when the book element is missing", ({expect}) => {
            const xml = `<?xml version="1.0"?><usx version="3.0"><para></para></usx>`
            expect(() => usx_to_json_txt(xml, undefined, () => {})).toThrow()
        })

        // The book element must carry a code attribute
        it("throws when the book code is missing", ({expect}) => {
            const xml = `<?xml version="1.0"?><usx version="3.0">
                <book style="id">Book</book><para></para></usx>`
            expect(() => usx_to_json_txt(xml, undefined, () => {})).toThrow()
        })

        // The book code must be a recognised book
        it("throws on an invalid book code", ({expect}) => {
            const xml = `<?xml version="1.0"?><usx version="3.0">
                <book code="FAKE" style="id">Book</book><para></para></usx>`
            expect(() => usx_to_json_txt(xml, undefined, () => {})).toThrow()
        })

        // Chapters must increase in number
        it("throws when chapters go backwards", ({expect}) => {
            expect(() => convert('jol', `
                <chapter number="2" style="c" sid="JOL 2"/>
                <para style="p"><verse number="1" style="v" sid="JOL 2:1"/>Two.<verse eid="JOL 2:1"/></para>
                <chapter eid="JOL 2"/>
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>One.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)).toThrow()
        })

        // A verse number beyond the chapter's range is invalid
        it("throws on an out-of-range verse number", ({expect}) => {
            expect(() => convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="999" style="v" sid="JOL 1:999"/>Nope.</para>
                <chapter eid="JOL 1"/>`)).toThrow()
        })

        // Verses must not decrease within a chapter
        it("throws when verses go backwards", ({expect}) => {
            expect(() => convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="2" style="v" sid="JOL 1:2"/>Two.<verse eid="JOL 1:2"/></para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>One.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)).toThrow()
        })

    })

    describe("verse content", () => {

        // A simple prose verse captures its text
        it("captures prose text", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Verse one.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('Verse one.')
        })

        // A verse range keeps all content under the first verse of the range
        it("stores a verse range under its first verse", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>One.<verse eid="JOL 1:1"/></para>
                <para style="p"><verse number="2-3" style="v" sid="JOL 1:2"/>Two and three.<verse eid="JOL 1:2"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![2]!).trimEnd()).toEqual('Two and three.')
            expect(output.contents[1]![3]).toEqual([])
        })

        // Sub-verses (1a, 1b) are concatenated into the single whole verse
        it("concatenates sub-verses into the whole verse", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1a" style="v" sid="JOL 1:1"/>First part. <verse number="1b" style="v" sid="JOL 1:1"/>second part.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('First part. second part.')
        })

        // Text inside <char> elements is included as ordinary verse text
        it("includes text from char elements", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>The <char style="nd">LORD</char> reigns.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('The LORD reigns.')
        })

        // In-text cross-reference chars (rq) are dropped
        it("excludes ignored char styles", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Text<char style="rq">Gen 1:1</char> end.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('Text end.')
        })

    })

    describe("whitespace and newlines", () => {

        // Each paragraph is followed by at least one newline
        it("ends a paragraph with a newline", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="q1"><verse number="1" style="v" sid="JOL 1:1"/>Only line.</para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!)).toMatch(/Only line\.\n/)
        })

        // Consecutive poetry lines within a verse are separated by a single newline
        it("uses a single newline between poetry lines", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="q1"><verse number="1" style="v" sid="JOL 1:1"/>Line one.</para>
                <para style="q2" vid="JOL 1:1">Line two.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            const text = verse_text(output.contents[1]![1]!)
            expect(text).toContain('Line one.\nLine two.')
            expect(text).not.toContain('Line one.\n\nLine two.')
        })

        // Prose paragraphs are separated by a blank line (double newline)
        it("uses a blank line between prose paragraphs", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>One.<verse eid="JOL 1:1"/></para>
                <para style="p"><verse number="2" style="v" sid="JOL 1:2"/>Two.<verse eid="JOL 1:2"/></para>
                <para style="p"><verse number="3" style="v" sid="JOL 1:3"/>Three.<verse eid="JOL 1:3"/></para>
                <chapter eid="JOL 1"/>`)
            // The blank-line separator is appended to the verse it follows
            expect(verse_text(output.contents[1]![2]!)).toMatch(/Two\.\n\n$/)
        })

    })

    describe("headings", () => {

        // Major-section headings (ms) become level 1
        it("classifies major section headings as level 1", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="ms">BOOK ONE</para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![1]).toContainEqual(
                {type: 'heading', contents: 'BOOK ONE', level: 1})
        })

        // Section headings (s1) become level 2
        it("classifies section headings as level 2", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="s1">A Section</para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![1]).toContainEqual(
                {type: 'heading', contents: 'A Section', level: 2})
        })

        // Minor headings (sp, qa) become level 3
        it("classifies minor headings as level 3", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="qa">ALEPH</para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![1]).toContainEqual(
                {type: 'heading', contents: 'ALEPH', level: 3})
        })

        // A heading before verse 1 is buffered and attached to verse 1 (not orphaned in verse 0)
        it("attaches a heading before verse 1 to verse 1", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="s1">A Section</para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![1]![0]).toEqual({type: 'heading', contents: 'A Section', level: 2})
            expect(output.contents[1]![0]).toEqual([])
        })

        // A heading between two verses belongs to the following verse
        it("attaches a heading between verses to the following verse", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>One.<verse eid="JOL 1:1"/></para>
                <para style="s1">A Section</para>
                <para style="p"><verse number="2" style="v" sid="JOL 1:2"/>Two.<verse eid="JOL 1:2"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![2]).toContainEqual(
                {type: 'heading', contents: 'A Section', level: 2})
            expect(output.contents[1]![1]!.some(item =>
                typeof item !== 'string' && item.type === 'heading')).toBe(false)
        })

        // A heading must not be duplicated across verses
        it("does not duplicate a heading", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="s1">A Section</para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>One.<verse eid="JOL 1:1"/></para>
                <para style="p"><verse number="2" style="v" sid="JOL 1:2"/>Two.<verse eid="JOL 1:2"/></para>
                <chapter eid="JOL 1"/>`)
            const all = output.contents[1]!.flat()
            const count = all.filter(item =>
                typeof item !== 'string' && item.contents === 'A Section').length
            expect(count).toEqual(1)
        })

    })

    describe("psalm superscriptions", () => {

        // A psalm `d` superscription holding the verse 1 marker: the verse must advance so the
        //     rest of verse 1 is preserved rather than orphaned in verse 0 and wiped
        it("keeps verse 1 when its marker is inside a `d` superscription", ({expect}) => {
            const {output, warnings} = convert('psa', `
                <chapter number="3" style="c" sid="PSA 3"/>
                <para style="s1">Deliver Me, O LORD!</para>
                <para style="d"><verse number="1" style="v" sid="PSA 3:1"/>A Psalm of David.</para>
                <para style="b" vid="PSA 3:1"/>
                <para style="q1" vid="PSA 3:1">O LORD, how my foes have increased!<verse eid="PSA 3:1"/></para>
                <para style="q1"><verse number="2" style="v" sid="PSA 3:2"/>Many rise up.<verse eid="PSA 3:2"/></para>
                <chapter eid="PSA 3"/>`)
            const verse_1 = output.contents[3]![1]!
            expect(verse_1).toContainEqual({type: 'heading', contents: 'A Psalm of David.', level: 3})
            expect(verse_text(verse_1)).toContain('O LORD, how my foes have increased!')
            // Nothing should be orphaned in verse 0 and no wiping warning should fire
            expect(output.contents[3]![0]).toEqual([])
            expect(warnings.filter(msg => msg.includes('before verse 1'))).toHaveLength(0)
        })

        // The section heading preceding the superscription still belongs to verse 1
        it("attaches the preceding section heading to verse 1", ({expect}) => {
            const {output} = convert('psa', `
                <chapter number="3" style="c" sid="PSA 3"/>
                <para style="s1">Deliver Me, O LORD!</para>
                <para style="d"><verse number="1" style="v" sid="PSA 3:1"/>A Psalm of David.</para>
                <para style="q1" vid="PSA 3:1">O LORD.<verse eid="PSA 3:1"/></para>
                <chapter eid="PSA 3"/>`)
            const headings = output.contents[3]![1]!.filter(item => typeof item !== 'string')
            expect(headings).toEqual([
                {type: 'heading', contents: 'Deliver Me, O LORD!', level: 2},
                {type: 'heading', contents: 'A Psalm of David.', level: 3},
            ])
        })

        // A `d` para used as a book-grouping title (no verse marker) before verse 1 is still kept
        //     as a heading on verse 1
        it("keeps a markerless `d` title before verse 1 as a heading", ({expect}) => {
            const {output} = convert('psa', `
                <chapter number="1" style="c" sid="PSA 1"/>
                <para style="d">Psalms 1–41</para>
                <para style="q1"><verse number="1" style="v" sid="PSA 1:1"/>Blessed is the man.<verse eid="PSA 1:1"/></para>
                <chapter eid="PSA 1"/>`)
            expect(output.contents[1]![1]).toContainEqual(
                {type: 'heading', contents: 'Psalms 1–41', level: 3})
            expect(output.contents[1]![0]).toEqual([])
        })

        // The `d` heading classification is psalm-only: elsewhere a `d` para is ordinary text
        it("treats `d` as ordinary text outside the psalms", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="d"><verse number="1" style="v" sid="JOL 1:1"/>A descriptive line.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('A descriptive line.')
            expect(output.contents[1]![1]!.every(item => typeof item === 'string')).toBe(true)
        })

    })

    describe("notes", () => {

        // Footnotes become note objects within the verse
        it("converts footnotes to note objects", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Text<note caller="+" style="f"><char style="ft">A footnote.</char></note> end.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![1]).toContainEqual({type: 'note', contents: 'A footnote.'})
        })

        // Cross-reference notes (style x) are dropped (handled by a separate system)
        it("drops cross-reference notes", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Text<note caller="+" style="x"><char style="ft">Gen 1:1</char></note> end.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![1]!.some(item => typeof item !== 'string')).toBe(false)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('Text end.')
        })

        // Note content is normalised to single spaces (no stray newlines from the source)
        it("normalises whitespace inside notes", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Text<note caller="+" style="f"><char style="ft">A
                    spread   out    note.</char></note><verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![1]).toContainEqual(
                {type: 'note', contents: 'A spread out note.'})
        })

    })

    describe("ignored and stray content", () => {

        // Introduction/identification paragraphs are skipped entirely
        it("skips ignored para styles", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="ip">Some introduction.</para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('Hi.')
            expect(output.contents[1]!.flat()).not.toContainEqual(
                expect.objectContaining({contents: 'Some introduction.'}))
        })

        // Non-biblical elements (e.g. tables) are ignored
        it("ignores extra-biblical elements like tables", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <table><row><cell>data</cell></row></table>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('Hi.')
        })

        // Stray body text before the first verse is dropped and a warning is emitted
        it("wipes orphan body text before verse 1 and warns", ({expect}) => {
            const {output, warnings} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p">Orphan text with no verse.</para>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Real verse.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[1]![0]).toEqual([])
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('Real verse.')
            expect(warnings.some(msg => msg.includes('before verse 1:1'))).toBe(true)
        })

        // Content appearing before the first chapter marker is ignored
        it("ignores content before the first chapter", ({expect}) => {
            const {output} = convert('jol', `
                <para style="p">Stray before any chapter.</para>
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(output.contents[0]).toEqual([])
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('Hi.')
        })

        // A non-<para> element at the document root triggers a warning but doesn't abort
        it("warns on a non-para element at the root", ({expect}) => {
            const {warnings} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <char>stray root char</char>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Hi.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>`)
            expect(warnings.some(msg => msg.includes('non-para root element'))).toBe(true)
        })

    })

    describe("partial books", () => {

        // A gap in chapters is allowed, leaving the missing chapter empty
        it("allows a missing chapter to stay empty", ({expect}) => {
            const {output} = convert('jol', `
                <chapter number="1" style="c" sid="JOL 1"/>
                <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>One.<verse eid="JOL 1:1"/></para>
                <chapter eid="JOL 1"/>
                <chapter number="3" style="c" sid="JOL 3"/>
                <para style="p"><verse number="1" style="v" sid="JOL 3:1"/>Three.<verse eid="JOL 3:1"/></para>
                <chapter eid="JOL 3"/>`)
            expect(verse_text(output.contents[1]![1]!).trimEnd()).toEqual('One.')
            expect(verse_text(output.contents[3]![1]!).trimEnd()).toEqual('Three.')
            expect(output.contents[2]!.every(verse => verse.length === 0)).toBe(true)
        })

    })

})
