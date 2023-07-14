
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

import {describe, it} from 'vitest'

import {usx_to_html} from './index.js'


const test_usx = readFileSync(join(__dirname, '..', 'test.usx'), {encoding: 'utf8'})


describe("usx_to_html", () => {

    const output = usx_to_html(test_usx)

    it("Adds an empty chapter 0", async ({expect}) => {
        expect(output.contents[0]).toEqual([])
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
        expect(output.contents[1][1][1]).toMatch(/^<h3 data-c="1">1<\/h3>/)
        expect(output.contents[2][1][1]).toMatch(/^<h3 data-c="2">2<\/h3>/)
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

    it("Has no opening tags when verse is starting a new paragraph", async ({expect}) => {
        expect(output.contents[1][1][0]).toEqual('')
        expect(output.contents[1][4][0]).toEqual('')
        expect(output.contents[1][5][0]).toEqual('')
    })

    it("Has opening tags when verse is mid-paragraph", async ({expect}) => {
        expect(output.contents[1][2][0]).toEqual('<p class="fb-m">')
        expect(output.contents[2][2][0]).toEqual('<p class="fb-m">')
        expect(output.contents[2][3][0]).toEqual('<p class="fb-m">')
    })

    it("Has no closing tags when verse ends a paragraph", async ({expect}) => {
        expect(output.contents[1][2][2]).toEqual('')
        expect(output.contents[1][4][2]).toEqual('')
        expect(output.contents[1][5][2]).toEqual('')
    })

    it("Has closing tags when verse ends mid-paragraph", async ({expect}) => {
        expect(output.contents[1][1][2]).toEqual('</p>')
        expect(output.contents[2][1][2]).toEqual('</p>')
        expect(output.contents[2][2][2]).toEqual('</p>')
    })

})
