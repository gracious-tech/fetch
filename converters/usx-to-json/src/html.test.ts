
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

import {describe, it} from 'vitest'
import {last_verse} from '@gracious.tech/bible-references'

import {usx_to_json_html} from './html.js'

const test_usx = readFileSync(join(__dirname, '..', '..', 'test.usx'), {encoding: 'utf8'})

/**
 * @vitest-environment jsdom
 */
describe("usx_to_json_html", () => {

    const output = usx_to_json_html(test_usx)

    it("Adds an empty chapter 0", async ({expect}) => {
        expect(output.contents[0]).toEqual([])
    })

    it('sets up the contents object correctly', ({expect}) => {
        expect(output.contents).toHaveLength(3)
        expect(output.contents[0]).toHaveLength(0)
        // Account for 0 verse
        expect(output.contents[1]).toHaveLength((last_verse['hag'][0] as number) + 1)
        expect(output.contents[2]).toHaveLength((last_verse['hag'][1] as number) + 1)
        for (let i = 0; i <= last_verse['hag'][0]; i++) {
            expect(output.contents[1][i]).toHaveLength(3)
        }
        for (let i = 1; i <= last_verse['hag'][1]; i++) {
            expect(output.contents[2][i]).toHaveLength(3)
        }
    })

    it('should throw an error on missing usx tag', ({expect}) => {
        const html = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><blah></blah>'
        expect(() => usx_to_json_html(html)).toThrow()
    })

    it('should throw an error on missing book tag', ({expect}) => {
        const html = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx>
                <para></para>
        </usx>`
        expect(() => usx_to_json_html(html)).toThrow()
    })

    it('should throw an error on missing the book code attribute', ({expect}) => {
        const html = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx>
            <book style="id">- Berean Study Bible</book>
                <para></para>
        </usx>`
        expect(() => usx_to_json_html(html)).toThrow()
    })

    it('should throw an error on providing an invalid book code attribute', ({expect}) => {
        const html = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx>
            <book code="FAKE" style="id">- Berean Study Bible</book>
                <para></para>
        </usx>`
        expect(() => usx_to_json_html(html)).toThrow()
    })

    it("should get a verse that completes a paragraph", ({expect}) => {
        const verse = output.contents[1][7]
        expect(verse[0]).toEqual('')
        expect(verse[1]).toMatch(/^<p class.+<\/p>$/)
        expect(verse[2]).toEqual('')
    })

    it("Has no opening tags when verse is starting a new paragraph", async ({expect}) => {
        expect(output.contents[1][1][0]).toEqual('')
        expect(output.contents[1][4][0]).toEqual('')
        expect(output.contents[1][5][0]).toEqual('')
    })

    it("Has no closing tags when verse ends a paragraph", async ({expect}) => {
        expect(output.contents[1][2][2]).toEqual('')
        expect(output.contents[1][4][2]).toEqual('')
        expect(output.contents[1][5][2]).toEqual('')
    })

    it('should correctly handle a verse that ends mid-paragraph', ({expect}) => {
        const verse  = output.contents[2][2]
        expect(verse[0]).toEqual('<p class="fb-m">')
        expect(verse[1]).not.toMatch(/^<p/)
        expect(verse[1]).not.toMatch(/<\/p>$/)
        expect(verse[2]).toEqual('</p>')
    })

    it("Has closing tags when verse ends mid-paragraph", async ({expect}) => {
        expect(output.contents[1][1][2]).toEqual('</p>')
        expect(output.contents[2][1][2]).toEqual('</p>')
        expect(output.contents[2][2][2]).toEqual('</p>')
    })

    it("Has opening tags when verse is mid-paragraph", async ({expect}) => {
        expect(output.contents[1][2][0]).toEqual('<p class="fb-m">')
        expect(output.contents[2][2][0]).toEqual('<p class="fb-m">')
        expect(output.contents[2][3][0]).toEqual('<p class="fb-m">')
    })

    it("Includes missing verses as blank strings", async ({expect}) => {
        // The examples below don't, but some may need opening/closing tags if within a paragraph
        expect(output.contents[1][3]).toEqual(['', '', ''])
        expect(output.contents[1][15]).toEqual(['', '', ''])
    })

    it("Includes the expected number of verses", async ({expect}) => {
        expect(output.contents[1]).toHaveLength(15+1)  // +1 for empty verse at 0 index
        expect(output.contents[2]).toHaveLength(23+1)
    })

    it("Includes chapter headings at start of first verses", async ({expect}) => {
        expect(output.contents[1][1][1].startsWith('<h3 data-c="1">1</h3>')).toBe(true)
        expect(output.contents[2][1][1].startsWith('<h3 data-c="2">2</h3>')).toBe(true)
    })

    it("Includes section headings at start of verse that follows", async ({expect}) => {
        // Only when not occuring within a verse that is
        expect(output.contents[1][1][1])
            .toContain('<h4 class="fb-s1">A Call to Rebuild the Temple</h4>')
        expect(output.contents[1][12][1])
            .toContain('<h4 class="fb-s1">The People Obey</h4>')
        expect(output.contents[2][1][1])
            .toContain('<h4 class="fb-s1">The Coming Glory of God’s House</h4>')
        expect(output.contents[2][10][1])
            .toContain('<h4 class="fb-s1">Blessings for a Defiled People</h4>')
        expect(output.contents[2][20][1])
            .toContain('<h4 class="fb-s1">Zerubbabel the LORD’s Signet Ring</h4>')
    })

    it("Includes verse markers as a <sup> element", async ({expect}) => {
        expect(output.contents[1][1][1]).toContain('<sup data-v="1:1">1</sup>')
    })

    it('should not repeat the header', ({expect}) => {
        const verse = output.contents[1][12][1]
        const count = (verse.match(/<h4 class="fb-s1">The People Obey<\/h4>/g) || []).length
        expect(count).toEqual(1)
    })

    it("allows a gap in chapters (partial book) leaving missing chapters empty", ({expect}) => {
        // Joel chapter 1 then chapter 3, skipping the (missing) chapter 2
        const usx = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
            <book code="JOL" style="id">Joel</book>
            <chapter number="1" style="c" sid="JOL 1"/>
            <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Verse one.</para>
            <chapter eid="JOL 1"/>
            <chapter number="3" style="c" sid="JOL 3"/>
            <para style="p"><verse number="1" style="v" sid="JOL 3:1"/>Verse three.</para>
            <chapter eid="JOL 3"/>
        </usx>`
        const result = usx_to_json_html(usx)
        // Chapter 1 and 3 have content, the skipped chapter 2 is left entirely empty
        expect(result.contents[1][1][1]).toContain('Verse one.')
        expect(result.contents[3][1][1]).toContain('Verse three.')
        expect(result.contents[2].every(verse => verse.join('') === '')).toBe(true)
    })

    it("still throws when chapters go backwards", ({expect}) => {
        const usx = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <usx version="3.0">
            <book code="JOL" style="id">Joel</book>
            <chapter number="2" style="c" sid="JOL 2"/>
            <para style="p"><verse number="1" style="v" sid="JOL 2:1"/>Verse two.</para>
            <chapter eid="JOL 2"/>
            <chapter number="1" style="c" sid="JOL 1"/>
            <para style="p"><verse number="1" style="v" sid="JOL 1:1"/>Verse one.</para>
            <chapter eid="JOL 1"/>
        </usx>`
        expect(() => usx_to_json_html(usx)).toThrow()
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



describe("usx_to_json_html tables and pre-verse content", () => {

    it("converts table rows to fb-li1 paras, splitting verses within cells", ({expect}) => {
        const contents = usx_to_json_html(table_usx).contents[1]!
        expect(contents[1]![1]).toContain('<p class="fb-li1">Asaph 128</p>')
        expect(contents[2]).toEqual(
            ['', '<p class="fb-li1"><sup data-v="1:2">2</sup>Gatekeepers 139</p>', ''])
        expect(contents[3]![0]).toBe('')
    })

    it("doesn't duplicate a para's opening tag when a footnote precedes verse 1", ({expect}) => {
        const contents = usx_to_json_html(note_first_usx).contents[1]!
        expect(contents[1]![0]).toBe('')
        expect(contents[1]![1]!.match(/<p /g)).toHaveLength(1)
    })
})
