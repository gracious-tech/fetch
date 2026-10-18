
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

import {describe, it} from 'vitest'
import {last_verse} from '@gracious.tech/bible-references'

import {usx_to_json_typst, default_typst_definitions,
    emittable_typst_markers, typst_builtins_used} from './typst.js'

const test_usx = readFileSync(join(__dirname, '..', '..', 'test.usx'), {encoding: 'utf8'})
const test_psa_usx = readFileSync(join(__dirname, '..', '..', 'test_web_psa.usx'),
    {encoding: 'utf8'})

// Concatenate a verse's 3-tuple into a single string
const cat = (verse:string[]) => (verse[0] ?? '') + (verse[1] ?? '') + (verse[2] ?? '')

/**
 * @vitest-environment jsdom
 */
describe("usx_to_json_typst", () => {

    const output = usx_to_json_typst(test_usx)

    it("returns the correct book code", ({expect}) => {
        expect(output.book).toEqual('hag')
    })

    it("returns the book name object", ({expect}) => {
        expect(output.name.normal).toEqual('Haggai')
        expect(output.name.long).toEqual('Haggai')
        expect(output.name.abbrev).toEqual('Haggai')
    })

    it("adds an empty chapter 0", ({expect}) => {
        expect(output.contents[0]).toEqual([])
    })

    it("sets up the contents structure correctly", ({expect}) => {
        expect(output.contents).toHaveLength(3)
        expect(output.contents[0]).toHaveLength(0)
        // Account for verse 0
        expect(output.contents[1]).toHaveLength((last_verse['hag'][0] as number) + 1)
        expect(output.contents[2]).toHaveLength((last_verse['hag'][1] as number) + 1)
    })

    it("uses 3-tuple [open, content, close] per verse", ({expect}) => {
        for (let ch = 1; ch < output.contents.length; ch++){
            for (let v = 0; v < output.contents[ch]!.length; v++){
                const verse = output.contents[ch]![v]!
                expect(Array.isArray(verse)).toBe(true)
                expect(verse).toHaveLength(3)
                expect(typeof verse[0]).toBe('string')
                expect(typeof verse[1]).toBe('string')
                expect(typeof verse[2]).toBe('string')
            }
        }
    })

    it("has empty tuple for verse 0 in each chapter", ({expect}) => {
        expect(output.contents[1]![0]).toEqual(['', '', ''])
        expect(output.contents[2]![0]).toEqual(['', '', ''])
    })

    it("includes chapter markers at start of first verse content", ({expect}) => {
        expect(output.contents[1]![1]![1]).toMatch(/^#ch\(1\)\n/)
        expect(output.contents[2]![1]![1]).toMatch(/^#ch\(2\)\n/)
    })

    it("includes verse markers inline in content", ({expect}) => {
        expect(output.contents[1]![1]![1]).toContain('#vn(1)')
        expect(output.contents[1]![2]![1]).toContain('#vn(2)')
        expect(output.contents[2]![1]![1]).toContain('#vn(1)')
    })

    it("includes section headings as typst == headings", ({expect}) => {
        expect(output.contents[1]![1]![1]).toContain('== A Call to Rebuild the Temple\n')
        expect(output.contents[1]![12]![1]).toContain('== The People Obey\n')
        expect(output.contents[2]![1]![1]).toContain("== The Coming Glory of God’s House\n")
        expect(output.contents[2]![10]![1]).toContain('== Blessings for a Defiled People\n')
        expect(output.contents[2]![20]![1]).toContain("== Zerubbabel the LORD’s Signet Ring\n")
    })

    it("represents missing verses as an empty 3-tuple", ({expect}) => {
        // Verse 3 of chapter 1 was removed in the test data
        expect(output.contents[1]![3]).toEqual(['', '', ''])
        // Verse 15 of chapter 1 was removed in the test data
        expect(output.contents[1]![15]).toEqual(['', '', ''])
    })

    it("includes actual text content for regular verses", ({expect}) => {
        const joined = cat(output.contents[1]![1]!)
        expect(joined).toContain('Darius')
        expect(joined).toContain('Haggai')
        expect(joined).toContain('prophet')
    })

    it("converts footnotes to typst footnote syntax", ({expect}) => {
        const joined = cat(output.contents[1]![1]!)
        expect(joined).toContain('#footnote[')
        expect(joined).toContain('Jehozadak')
    })

    it("preserves char-style formatting inside footnotes", ({expect}) => {
        // Footnote contents can include FootnoteChar styles (ft, fr, fk, fq, ...) and
        // generic char styles (it, bd, sc, ...). FootnoteChar styles are pass-through,
        // but generic char styles inside notes should still render as native functions.
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>text<note style="f" caller="+"><char style="fr">1:1 </char><char style="ft">See <char style="it">italic</char> and <char style="bd">bold</char> here.</char></note> more<verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        // The footnote should contain the italic and bold portions as native Typst functions
        expect(content).toContain('#footnote[')
        expect(content).toContain('#emph[italic]')
        expect(content).toContain('#strong[bold]')
        // The fr/ft wrapper char styles themselves should NOT emit function calls
        expect(content).not.toContain('#fr[')
        expect(content).not.toContain('#ft[')
    })

    it("includes <ref> text inside footnotes (allow_nonbib)", ({expect}) => {
        // Footnotes can contain <ref> elements pointing to other passages — their text
        // should survive even though <ref> is in ignored_elements at the para level.
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>text<note style="f" caller="+"><char style="ft">see <ref loc="MAT 1:1">Matt 1:1</ref> for context</char></note><verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        expect(content).toContain('Matt 1:1')
    })

    it("passes curly quotes through unescaped", ({expect}) => {
        const verse2 = cat(output.contents[1]![2]!)
        expect(verse2).toContain('“')  // Opening curly quote
        expect(verse2).toContain('’')  // Curly apostrophe
    })

    it("does not repeat section headings", ({expect}) => {
        const joined = cat(output.contents[1]![12]!)
        const count = (joined.match(/== The People Obey/g) || []).length
        expect(count).toEqual(1)
    })

    it("wraps poetry paragraphs in #q(N)[…]\\n with the level as an argument", ({expect}) => {
        // Verse 2 of chapter 1 has q1/q2 poetry lines after the prose para ends —
        // both should emit as #q(1)[…] and #q(2)[…] so the consumer defines one #q
        // function that takes the indent level
        const verse2 = cat(output.contents[1]![2]!)
        expect(verse2).toContain('#q(1)[')
        expect(verse2).toContain('#q(2)[')
        expect(verse2).toContain(']\n')
        // No level-suffixed variants should appear (q1 / q2 become arg-based)
        expect(verse2).not.toContain('#q1[')
        expect(verse2).not.toContain('#q2[')
    })

    it("does not wrap regular prose paragraphs", ({expect}) => {
        // Verse 1 of chapter 1 is in a <para style="m"> — no #m[ wrapper expected
        const verse1 = cat(output.contents[1]![1]!)
        expect(verse1).not.toContain('#m[')
        // Regular prose ends with a blank line (\n\n)
        expect(verse1).toContain('\n\n')
    })

    it("emits #b() as a passthrough for stanza breaks and scene breaks", ({expect}) => {
        // Hag 1:5-6 has a poetry-poetry stanza break (q1 → b → q1) that already has a
        // source b, so it should pass through as a #b() call rather than being dropped
        const verse6 = cat(output.contents[1]![6]!)
        expect(verse6).toContain('#b()')
        // Hag 2:12-13 has several prose-prose scene breaks (m → b → m dialogue turns)
        // that should pass through the same way
        const all = output.contents.flat().map(cat).join('')
        expect((all.match(/#b\(\)/g) ?? []).length).toBeGreaterThan(1)
    })

    it("drops <para style='b'/> that's adjacent to a heading", ({expect}) => {
        // Hag 1:12 has a heading ("The People Obey") directly followed by a <para style="b"/>
        // then prose — the b sits between a heading and prose, so it must be dropped entirely,
        // never emitted as #b(), since the heading already provides its own separation
        const verse12 = cat(output.contents[1]![12]!)
        expect(verse12).toContain('== The People Obey')
        expect(verse12).not.toContain('#b(')
    })

    it("forces a #b() at a poetry/prose boundary even with no source b", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="q1"><verse number="1" style="v" sid="HAG 1:1"/>poem line<verse eid="HAG 1:1"/></para>
                <para style="m"><verse number="2" style="v" sid="HAG 1:2"/>prose line<verse eid="HAG 1:2"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        expect(cat(out.contents[1]![2]!)).toContain('#b()')

        // And the reverse direction (prose → poetry)
        const xml_reversed = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>prose line<verse eid="HAG 1:1"/></para>
                <para style="q1"><verse number="2" style="v" sid="HAG 1:2"/>poem line<verse eid="HAG 1:2"/></para>
            </usx>`
        const out_reversed = usx_to_json_typst(xml_reversed)
        expect(cat(out_reversed.contents[1]![2]!)).toContain('#b()')
    })

    it("emits exactly one #b() at a poetry/prose boundary when source b is present", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="q1"><verse number="1" style="v" sid="HAG 1:1"/>poem line<verse eid="HAG 1:1"/></para>
                <para style="b"/>
                <para style="m"><verse number="2" style="v" sid="HAG 1:2"/>prose line<verse eid="HAG 1:2"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const joined = out.contents.flat().map(cat).join('')
        expect((joined.match(/#b\(\)/g) ?? []).length).toBe(1)
    })

    it("never emits #b() for a b directly adjacent to a heading, either side", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="q1"><verse number="1" style="v" sid="HAG 1:1"/>poem line<verse eid="HAG 1:1"/></para>
                <para style="b"/>
                <para style="s1">A Heading</para>
                <para style="b"/>
                <para style="q1"><verse number="2" style="v" sid="HAG 1:2"/>poem line<verse eid="HAG 1:2"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const joined = out.contents.flat().map(cat).join('')
        expect(joined).toContain('== A Heading')
        expect(joined).not.toContain('#b(')
    })

    it("does not force #b() between same-category paragraphs with no source b", ({expect}) => {
        const xml_poetry = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="q1"><verse number="1" style="v" sid="HAG 1:1"/>poem line one<verse eid="HAG 1:1"/></para>
                <para style="q1"><verse number="2" style="v" sid="HAG 1:2"/>poem line two<verse eid="HAG 1:2"/></para>
            </usx>`
        const out_poetry = usx_to_json_typst(xml_poetry)
        expect(out_poetry.contents.flat().map(cat).join('')).not.toContain('#b(')

        const xml_prose = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>prose line one<verse eid="HAG 1:1"/></para>
                <para style="m"><verse number="2" style="v" sid="HAG 1:2"/>prose line two<verse eid="HAG 1:2"/></para>
            </usx>`
        const out_prose = usx_to_json_typst(xml_prose)
        expect(out_prose.contents.flat().map(cat).join('')).not.toContain('#b(')
    })

    it("forces a #b() at a list/prose boundary too, not just poetry", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="li1"><verse number="1" style="v" sid="HAG 1:1"/>list item<verse eid="HAG 1:1"/></para>
                <para style="m"><verse number="2" style="v" sid="HAG 1:2"/>prose line<verse eid="HAG 1:2"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        expect(cat(out.contents[1]![2]!)).toContain('#b()')
    })

    it("does not force #b() between poetry and a list (both non_para)", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="q1"><verse number="1" style="v" sid="HAG 1:1"/>poem line<verse eid="HAG 1:1"/></para>
                <para style="li1"><verse number="2" style="v" sid="HAG 1:2"/>list item<verse eid="HAG 1:2"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        expect(out.contents.flat().map(cat).join('')).not.toContain('#b(')
    })

    it("keeps forcing a poetry/prose boundary break across a chapter marker", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="q1"><verse number="1" style="v" sid="HAG 1:1"/>poem line<verse eid="HAG 1:1"/></para>
                <chapter number="2" style="c" sid="HAG 2"/>
                <para style="m"><verse number="1" style="v" sid="HAG 2:1"/>prose line<verse eid="HAG 2:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        expect(cat(out.contents[2]![1]!)).toContain('#b()')
    })

    it("handles mid-para verse transitions in wrapped paras", ({expect}) => {
        // Chapter 2 verses 4–9 are in poetry (q1/q2 → #q(1)[…] / #q(2)[…]) —
        //     mid-poem paragraph splits stay paired, so verse N closes with ] and
        //     verse N+1 opens with #q(N)[
        const verse4 = output.contents[2]![4]!
        const verse5 = output.contents[2]![5]!
        if (verse5[0] !== ''){
            expect(verse5[0]).toMatch(/^#q\(\d+\)\[$/)
            // Then verse 4 should have closed with `]\n`
            expect(verse4[2]).toBe(']\n')
        }
    })

    it("handles mid-para verse transitions in regular paras", ({expect}) => {
        // Chapter 2 verses 1–3 share one <para style="m"> — mid-prose-paragraph splits
        //     close prior verse with \n\n and open next verse with empty string
        const verse1_ch2 = output.contents[2]![1]!
        const verse2_ch2 = output.contents[2]![2]!
        const verse3_ch2 = output.contents[2]![3]!
        // Verse 1 isn't where the para closes (it's the first of the para) — its [2]
        //     is the para-close
        expect(verse1_ch2[2]).toBe('\n\n')
        // Verse 2 and 3 start mid-para, so their [0] should be '' (no wrapper)
        expect(verse2_ch2[0]).toBe('')
        expect(verse3_ch2[0]).toBe('')
        // Each verse 2 and 3 still has its marker in content
        expect(verse2_ch2[1]).toContain('#vn(2)')
        expect(verse3_ch2[1]).toContain('#vn(3)')
    })

    it("concatenated chapter is balanced Typst", ({expect}) => {
        const joined = output.contents[1]!.map(v => cat(v)).join('')
        const opens = (joined.match(/(?<!\\)\[/g) || []).length
        const closes = (joined.match(/(?<!\\)\]/g) || []).length
        expect(opens).toBe(closes)
    })

    it("surfaces kept char styles as #<style>[…]", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>before <char style="wj">red words</char> after<verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        expect(out.contents[1]![1]![1]).toContain('#wj[red words]')
    })

    it("does not wrap non-kept char styles (e.g. qt, w)", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>before <char style="qt">quote</char> and <char style="w" strong="H1">word</char> after<verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        expect(content).not.toContain('#qt[')
        expect(content).not.toContain('#w[')
        expect(content).toContain('quote')
        expect(content).toContain('word')
    })

    it("uses #super[…] for sup and ord char styles", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>1<char style="ord">st</char><verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        expect(out.contents[1]![1]![1]).toContain('#super[st]')
    })

    it("keeps intraword italic valid and escapes a following '.'", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>the <char style="it">Priest</char>s and <char style="bd">end</char>.That<verse eid="HAG 1:1"/></para>
            </usx>`
        const content = usx_to_json_typst(xml).contents[1]![1]![1]!
        expect(content).toContain('#emph[Priest]s and #strong[end]\\.That')
    })

    it("uses native Typst functions for bold and italic", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>plain <char style="bd">bold</char> and <char style="it">italic</char> and <char style="em">emph</char> and <char style="bdit">both</char> and <char style="k">keyword</char> done<verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        expect(content).toContain('#strong[bold]')
        expect(content).toContain('#emph[italic]')
        expect(content).toContain('#emph[emph]')
        expect(content).toContain('#strong[#emph[both]]')
        expect(content).toContain('#strong[#emph[keyword]]')
        // Shorthand `_…_`/`*…*` would be literal when touching a word character
        expect(content).not.toMatch(/[_*]/)
        // No #bd[…] / #it[…] etc. — should be native functions
        expect(content).not.toContain('#bd[')
        expect(content).not.toContain('#it[')
        expect(content).not.toContain('#em[')
    })

    it("uses Typst's built-in #smallcaps[…] for sc and nd", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>a <char style="sc">smallcap</char> and <char style="nd">LORD</char><verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        expect(content).toContain('#smallcaps[smallcap]')
        expect(content).toContain('#smallcaps[LORD]')
    })

    it("escapes typst special characters in text content", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>uses #hash and [bracket]<verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        expect(content).toContain('\\#hash')
        expect(content).toContain('\\[bracket\\]')
    })

    it("escapes the leading paren so text after a verse marker isn't parsed as a call", ({expect}) => {
        // A verse whose text starts with `(` (e.g. a parenthetical sentence) would render as
        // `#vn(1)(text)` and Typst would read `(text)` as args to vn(1); only the leading `(` needs
        // escaping (the closing `)` is literal markup), so guard just the seam
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>(an aside)<verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        expect(content).toContain('#vn(1)\\(an aside)')
    })

    it("escapes a leading '.' after an inline expr so it isn't read as field access", ({expect}) => {
        // Text starting with `.` straight after `#vn(1)` (or a char close `]`) would parse as
        // field access (#vn(1).foo); only this leading dot is escaped, others stay literal
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="HAG" style="id">Test</book>
                <chapter number="1" style="c" sid="HAG 1"/>
                <para style="m"><verse number="1" style="v" sid="HAG 1:1"/>...trailing on<verse eid="HAG 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        const content = out.contents[1]![1]![1]!
        expect(content).toContain('#vn(1)\\...trailing on')
    })

    it("should throw an error on missing usx tag", ({expect}) => {
        const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><blah></blah>'
        expect(() => usx_to_json_typst(xml)).toThrow()
    })

    it("should throw an error on missing book tag", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx>
                <para></para>
        </usx>`
        expect(() => usx_to_json_typst(xml)).toThrow()
    })

    it("should throw an error on missing book code attribute", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx>
            <book style="id">- Berean Study Bible</book>
                <para></para>
        </usx>`
        expect(() => usx_to_json_typst(xml)).toThrow()
    })

    it("should throw an error on invalid book code", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx>
            <book code="FAKE" style="id">- Berean Study Bible</book>
                <para></para>
        </usx>`
        expect(() => usx_to_json_typst(xml)).toThrow()
    })

    it("allows a gap in chapters (partial book) leaving missing chapters empty", ({expect}) => {
        // Joel chapter 1 then chapter 3, skipping the (missing) chapter 2
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
            <book code="JOL" style="id">Joel</book>
            <chapter number="1" style="c" sid="JOL 1"/>
            <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Verse one.</para>
            <chapter eid="JOL 1"/>
            <chapter number="3" style="c" sid="JOL 3"/>
            <para style="p"><verse number="1" style="v" sid="JOL 3:1"/>Verse three.</para>
            <chapter eid="JOL 3"/>
        </usx>`
        const result = usx_to_json_typst(xml)
        // Chapter 1 and 3 have content, the skipped chapter 2 is left entirely empty
        expect(cat(result.contents[1]![1]!)).toContain('Verse one.')
        expect(cat(result.contents[3]![1]!)).toContain('Verse three.')
        expect(result.contents[2]!.every(verse => cat(verse) === '')).toBe(true)
    })

    it("still throws when chapters go backwards", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
            <book code="JOL" style="id">Joel</book>
            <chapter number="2" style="c" sid="JOL 2"/>
            <para style="p"><verse number="1" style="v" sid="JOL 2:1"/>Verse two.</para>
            <chapter eid="JOL 2"/>
            <chapter number="1" style="c" sid="JOL 1"/>
            <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Verse one.</para>
            <chapter eid="JOL 1"/>
        </usx>`
        expect(() => usx_to_json_typst(xml)).toThrow()
    })

    it("default_typst_definitions covers every function the converter emits", ({expect}) => {
        // Each #let must define a function our emitter calls. Conversely, every consumer
        // function the converter ever emits must have a default definition here so the
        // joined output compiles standalone when this string is appended.
        const defs = default_typst_definitions
        const expected_names = [
            'ch', 'vn', 'b',  // markers
            'q', 'qm', 'li', 'lim',  // leveled wrapped paras
            'qc', 'qr', 'qd', 'lh', 'lf', 'd',  // non-leveled wrapped paras
            'wj', 'qac', 'qs', 'bk', 'tl', 'add', 'sig',  // consumer-defined char styles
        ]
        for (const name of expected_names){
            // Match either `#let name(` (with args) or `#let name =` (alias)
            expect(defs).toMatch(new RegExp(`#let ${name}\\(`))
        }
    })

    it("attaches psalm-style 'd' superscriptions to verse 1 not verse 0", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="PSA" style="id">Test</book>
                <chapter number="1" style="c" sid="PSA 1"/>
                <para style="d">A psalm of David</para>
                <para style="q1"><verse number="1" style="v" sid="PSA 1:1"/>Blessed is the one<verse eid="PSA 1:1"/></para>
            </usx>`
        const out = usx_to_json_typst(xml)
        // Verse 0 should be untouched
        expect(out.contents[1]![0]).toEqual(['', '', ''])
        // Verse 1 should contain the superscription text, wrapped as #d[...] — body text
        // (a consumer-defined marker), never a heading (=/==/===)
        const joined = cat(out.contents[1]![1]!)
        expect(joined).toContain('#d[A psalm of David]')
        expect(joined).not.toMatch(/^=+ /m)
    })

    it("drops verse-less body text before verse 1 and warns (not attached to verse 1)", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="MAT" style="id">Test</book>
                <chapter number="1" style="c" sid="MAT 1"/>
                <para style="p">Stray body text before any verse.</para>
                <para style="p"><verse number="1" style="v" sid="MAT 1:1"/>Real verse one.<verse eid="MAT 1:1"/></para>
            </usx>`
        const warnings:string[] = []
        const out = usx_to_json_typst(xml, undefined, msg => warnings.push(msg))
        // Verse 0 should be cleared and verse 1 must not contain the stray body text
        expect(out.contents[1]![0]).toEqual(['', '', ''])
        const joined = cat(out.contents[1]![1]!)
        expect(joined).not.toContain('Stray body text')
        expect(joined).toContain('Real verse one.')
        // The dropped real text should be reported via the warning callback
        expect(warnings).toContain('[typst] Ignoring content before verse 1:1')
    })

    it("does not warn when only empty structural markup precedes verse 1", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="MAT" style="id">Test</book>
                <chapter number="1" style="c" sid="MAT 1"/>
                <para style="q1"></para>
                <para style="p"><verse number="1" style="v" sid="MAT 1:1"/>Real verse one.<verse eid="MAT 1:1"/></para>
            </usx>`
        const warnings:string[] = []
        usx_to_json_typst(xml, undefined, msg => warnings.push(msg))
        // Empty poetry para emits only structural markup (#q(1)[]), so nothing real is dropped
        expect(warnings).toEqual([])
    })

    it("routes warnings through the on_warning callback instead of console", ({expect}) => {
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="MAT" style="id">Test</book>
                <chapter number="1" style="c" sid="MAT 1"/>
                <bogus>unexpected root element</bogus>
                <para style="p"><verse number="1" style="v" sid="MAT 1:1"/>Verse one.<verse eid="MAT 1:1"/></para>
            </usx>`
        const warnings:string[] = []
        usx_to_json_typst(xml, undefined, msg => warnings.push(msg))
        expect(warnings).toContain('[typst] Ignoring non-para root element: bogus')
    })
})


/**
 * Exercises element types not present in the Haggai fixture: `ms1` book headings,
 * `qs` Selah markers, `wh` transliterated Hebrew, ignored `cl`/`mt1`/`h`/`toc*` paras,
 * psalm superscriptions (`d`), and the full 150-chapter structure.
 * @vitest-environment jsdom
 */
describe("usx_to_json_typst (WEB Psalms)", () => {

    const output = usx_to_json_typst(test_psa_usx)
    const all_chapters_joined = output.contents.slice(1).map(
        ch => ch.map(cat).join('')).join('')

    it("returns the correct book code", ({expect}) => {
        expect(output.book).toEqual('psa')
    })

    it("produces 150 chapters (plus chapter 0)", ({expect}) => {
        expect(output.contents).toHaveLength(151)
        expect(output.contents[0]).toEqual([])
    })

    it("uses 3-tuple [open, content, close] per verse across all chapters", ({expect}) => {
        for (let ch = 1; ch < output.contents.length; ch++){
            for (let v = 0; v < output.contents[ch]!.length; v++){
                const verse = output.contents[ch]![v]!
                expect(verse).toHaveLength(3)
                expect(typeof verse[0]).toBe('string')
                expect(typeof verse[1]).toBe('string')
                expect(typeof verse[2]).toBe('string')
            }
        }
    })

    it("emits ms1 book divisions as major (=) headings on the following verse", ({expect}) => {
        // BOOK 1 sits between Psalm 1's chapter marker and verse 1 — attached to verse 1
        expect(output.contents[1]![1]![1]).toContain('= BOOK 1\n')
        // BOOK 2 / 3 / 4 / 5 start at Psalms 42 / 73 / 90 / 107
        expect(output.contents[42]![1]![1]).toContain('= BOOK 2\n')
        expect(output.contents[73]![1]![1]).toContain('= BOOK 3\n')
        expect(output.contents[90]![1]![1]).toContain('= BOOK 4\n')
        expect(output.contents[107]![1]![1]).toContain('= BOOK 5\n')
    })

    it("drops ignored para styles (cl, mt1, h, toc1, toc2, toc3)", ({expect}) => {
        // "The Psalms" comes from mt1 and toc1 — should never appear in output
        expect(all_chapters_joined).not.toContain('The Psalms')
        // "Psalm" alone is the cl chapter-label — verify it doesn't leak in as a bare line
        expect(all_chapters_joined).not.toMatch(/(^|\n)Psalm\n/)
        // "Psa" comes from toc3 — also dropped
        expect(all_chapters_joined).not.toMatch(/(^|\n)Psa\n/)
    })

    it("emits Selah as #qs[Selah.]", ({expect}) => {
        // Psalm 3:2 ends with Selah
        expect(cat(output.contents[3]![2]!)).toContain('#qs[Selah.]')
        // Psalm 3:4 and 3:8 also have it
        expect(cat(output.contents[3]![4]!)).toContain('#qs[Selah.]')
        expect(cat(output.contents[3]![8]!)).toContain('#qs[Selah.]')
    })

    it("emits combined Selah variants without flattening (#qs[Meditation. Selah.])",
            ({expect}) => {
        // Psalm 9:16 has "Meditation. Selah." inside a single qs char
        expect(cat(output.contents[9]![16]!)).toContain('#qs[Meditation. Selah.]')
    })

    it("passes Hebrew script (wh char style) text through inside footnotes", ({expect}) => {
        // Psalm 1:2 footnote contains <char style="wh">יהוה</char>
        const verse = cat(output.contents[1]![2]!)
        expect(verse).toContain('#footnote[')
        expect(verse).toContain('יהוה')
        // wh is not a kept char style — no #wh[ wrapper
        expect(verse).not.toContain('#wh[')
    })

    it("attaches psalm 'd' superscription content to verse 1, wrapped as body text", ({expect}) => {
        // Psalm 3 has "A Psalm by David, when he fled from Absalom his son."
        const psalm3_v0 = output.contents[3]![0]!
        const psalm3_v1 = cat(output.contents[3]![1]!)
        expect(psalm3_v0).toEqual(['', '', ''])
        expect(psalm3_v1)
            .toContain('#d[A Psalm by David, when he fled from Absalom his son.]')
        // Psalm 4 superscription
        expect(cat(output.contents[4]![1]!)).toContain(
            '#d[For the Chief Musician; on stringed instruments. A Psalm by David.]')
    })

    it("handles Psalm 119 acrostic 'd' letter markers", ({expect}) => {
        // ALEPH (before verse 1) attaches to verse 1
        expect(cat(output.contents[119]![1]!)).toContain('ALEPH')
        // Every acrostic letter should appear somewhere in chapter 119
        const ch119 = output.contents[119]!.map(cat).join('')
        for (const letter of ['ALEPH', 'BETH', 'GIMEL', 'DALETH', 'TAV']){
            expect(ch119).toContain(letter)
        }
    })

    it("produces balanced Typst brackets across the entire book", ({expect}) => {
        const opens = (all_chapters_joined.match(/(?<!\\)\[/g) || []).length
        const closes = (all_chapters_joined.match(/(?<!\\)\]/g) || []).length
        expect(opens).toBe(closes)
    })

    it("emits the expected wrapped/leveled poetry forms throughout", ({expect}) => {
        // Psalms is overwhelmingly q1/q2 poetry
        expect(all_chapters_joined).toContain('#q(1)[')
        expect(all_chapters_joined).toContain('#q(2)[')
        // No level-suffixed forms should leak through
        expect(all_chapters_joined).not.toContain('#q1[')
        expect(all_chapters_joined).not.toContain('#q2[')
    })

    it("emits <para style='b'/> stanza separators as #b()", ({expect}) => {
        // Psalm 10:11-12 has a poetry-poetry stanza break (q2 → b → q1) with a source b
        const verse12 = cat(output.contents[10]![12]!)
        expect(verse12).toContain('#b()')
        // Never as a bracketed call — b takes no content
        expect(all_chapters_joined).not.toContain('#b[')
    })

    it("never forces a #b() around psalm 'd' superscriptions", ({expect}) => {
        // Every psalm's 'd' superscription sits directly against its poem with no heading
        // and (in this fixture) no source b — 'd' is treated as heading-like for b-boundary
        // purposes, so no #b() should be forced around it despite the poetry/prose adjacency
        const psalm3_v1 = cat(output.contents[3]![1]!)
        expect(psalm3_v1).toContain('A Psalm by David, when he fled from Absalom his son.')
        expect(psalm3_v1).not.toContain('#b(')
    })

    it("default_typst_definitions covers every #fn(... actually emitted in Psalms",
            ({expect}) => {
        // Collect every consumer-defined function name actually emitted across the whole book,
        //     then assert each has a #let definition. Native Typst built-ins are skipped.
        const native = new Set(['footnote', 'super', 'smallcaps'])
        const emitted = new Set<string>()
        for (const match of all_chapters_joined.matchAll(/#([a-z]+)[\[(]/g)){
            const name = match[1]!
            if (!native.has(name)){
                emitted.add(name)
            }
        }
        for (const name of emitted){
            expect(default_typst_definitions).toMatch(new RegExp(`#let ${name}\\(`))
        }
    })

    /* The whitespace/line-structure invariants downstream Typst consumers parse against
        (chapter splitting, heading detection, verse-level alignment). These hold because
        escape_text() collapses all whitespace runs in source text to single spaces, so no
        emitted text fragment can itself contain a newline — only the converter's own
        structural output (\n after #ch, headings, para_close) introduces line breaks. */

    it("invariant: #ch(n) always appears alone at the start of a line", ({expect}) => {
        expect(all_chapters_joined).toMatch(/(^|\n)#ch\(\d+\)\n/)
        // Never with trailing content on the same line
        expect(all_chapters_joined).not.toMatch(/#ch\(\d+\)[^\n]/)
    })

    it("invariant: heading markers are = / == / === at the start of a line", ({expect}) => {
        // Psalms (WEB) only exercises major (ms1) headings — build a fixture covering all
        // three levels (major/regular/minor) for this invariant specifically
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
                <book code="MAT" style="id">Test</book>
                <chapter number="1" style="c" sid="MAT 1"/>
                <para style="ms1">Major</para>
                <para style="s1">Regular</para>
                <para style="sp">Minor</para>
                <para style="p"><verse number="1" style="v" sid="MAT 1:1"/>Text<verse eid="MAT 1:1"/></para>
            </usx>`
        const joined = usx_to_json_typst(xml).contents[1]!.map(cat).join('')
        expect(joined).toMatch(/(^|\n)= Major\n/)
        expect(joined).toMatch(/(^|\n)== Regular\n/)
        expect(joined).toMatch(/(^|\n)=== Minor\n/)
        // Never a heading marker preceded by other content on the same line
        expect(joined).not.toMatch(/[^\n=]={1,3} /)
    })

    it("invariant: paragraphs are separated by a blank line", ({expect}) => {
        // Every '\n\n' (regular prose para_close) or wrapped ']\n' close is followed either by
        // another structural marker or a blank line before the next content — never glued text
        expect(all_chapters_joined).not.toMatch(/[a-zA-Z][^\n]\n[a-zA-Z]/)
    })

    it("invariant: wrapper calls open and close on a single line, never nested", ({expect}) => {
        // Every wrapped-para open fragment (#q(1)[, #d[, etc) is matched by a `]` before the
        // next newline — i.e. no wrapper's content itself contains a raw newline
        for (const match of all_chapters_joined.matchAll(/#[a-z]+(?:\(\d+\))?\[([^\n]*)/g)){
            expect(match[1]).not.toContain('\n')
        }
    })

    it("every ..rest-sinked default definition takes at least one function", ({expect}) => {
        // Mandating ..rest is what makes an additive marker change (new positional/named arg)
        // safe rather than a fatal "unexpected argument" — verify every #let in the reference
        // preamble actually declares the sink
        const lets = [...default_typst_definitions.matchAll(/#let ([a-z]+)\(([^)]*)\)/g)]
        expect(lets.length).toBeGreaterThan(0)
        for (const [, name, args] of lets){
            expect(args, `#let ${name} is missing a ..rest sink`).toContain('..rest')
        }
    })

    it("publishes a marker vocabulary with no overlap between emittable and builtin",
            ({expect}) => {
        // These two lists are the authoritative vocabulary a consumer's preamble should bind
        // against — not the sample-dependent set any one collection happens to use
        const emittable = new Set(emittable_typst_markers)
        const builtins = new Set(typst_builtins_used)
        for (const name of emittable){
            expect(builtins.has(name), `${name} is both emittable and a builtin`).toBe(false)
        }
        // 'd' is part of the live (emittable) contract, wrapped as body text not a heading
        expect(emittable.has('d')).toBe(true)
    })
})

// A table whose rows split across verses (verse 2 starts inside a cell), followed by a para that
// starts with the previous verse's end marker (as usfmtc emits after a table)
const table_usx = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<usx version="3.0">
    <book code="HAG" style="id">Test</book>
    <chapter number="1" style="c" sid="HAG 1"/>
    <para style="li1"><verse number="1" style="v" sid="HAG 1:1"/>The singers:</para>
    <table>
        <row style="tr">
            <cell style="tc1" align="start">Asaph </cell>
            <cell style="tcr2" align="end">128</cell>
        </row>
        <row style="tr">
            <cell style="tc1" align="start">
                <verse eid="HAG 1:1"/>
                <verse number="2" style="v" sid="HAG 1:2"/>Gatekeepers</cell>
            <cell style="tcr2" align="end">139</cell>
        </row>
    </table>
    <para style="li1" vid="HAG 1:2">
        <verse eid="HAG 1:2"/>
        <verse number="3" style="v" sid="HAG 1:3"/>Temple servants:<verse eid="HAG 1:3"/></para>
</usx>`


// A para whose first content is a footnote before the verse 1 marker (e.g. Lamentations)
const note_first_usx = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<usx version="3.0">
    <book code="HAG" style="id">Test</book>
    <chapter number="1" style="c" sid="HAG 1"/>
    <para style="q1"><note caller="+" style="f"><char style="ft">Acrostic</char></note><verse number="1" style="v" sid="HAG 1:1"/>How lonely<verse eid="HAG 1:1"/></para>
    <para style="q1"><verse number="2" style="v" sid="HAG 1:2"/>She weeps<verse eid="HAG 1:2"/></para>
</usx>`



describe("usx_to_json_typst tables and pre-verse content", () => {

    it("converts table rows to #li(1)[…] paras, splitting verses within cells", ({expect}) => {
        const contents = usx_to_json_typst(table_usx).contents[1]!
        expect(contents[1]![1]).toContain('#li(1)[Asaph 128]')
        expect(contents[2]).toEqual(['', '#li(1)[#vn(2)Gatekeepers 139]\n', ''])
        // Para starting with a verse end marker shouldn't reopen/close around the new verse
        expect(contents[3]![0]).toBe('')
        const joined = contents.flat().join('')
        expect(joined.split('[').length).toBe(joined.split(']').length)
    })

    it("doesn't duplicate a para's open fragment when a footnote precedes verse 1", ({expect}) => {
        const contents = usx_to_json_typst(note_first_usx).contents[1]!
        expect(contents[1]![0]).toBe('')
        expect(contents[1]![1]).toContain('#q(1)[#vn(1)How lonely]')
        const joined = contents.flat().join('')
        expect(joined.split('[').length).toBe(joined.split(']').length)
    })
})
