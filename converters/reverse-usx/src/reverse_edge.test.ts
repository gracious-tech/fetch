// @vitest-environment jsdom

import {describe, it, vi} from 'vitest'

import {reverse_usx} from './reverse.js'
import {strip_subverses} from './strip_subverses.js'
import {validate_numbering} from './validate.js'
import {rules_by_system, system_to_rules} from './rules.js'
import {book_system_tests} from './systems.js'

import type {BookRuleSet} from './rules.js'


// Build USX for a book from chapters of paragraphs of verse numbers (null = verse outside a para)
function build(book:string, chapters:Record<number, (number[]|number)[]>, style='p'){
    let xml = `<usx version="3.0"><book code="${book}" style="id"/>`
    for (const [ch, paras] of Object.entries(chapters)){
        xml += `<chapter number="${ch}" style="c" sid="${book} ${ch}"/>`
        for (const para of paras){
            const verse = (v:number) => `<verse number="${v}" style="v" sid="${book} ${ch}:${v}"/>`
                + `${ch}:${v} <verse eid="${book} ${ch}:${v}"/>`
            if (typeof para === 'number'){
                xml += verse(para)  // Directly under root (malformed)
            } else {
                xml += `<para${style ? ` style="${style}"` : ''}>${para.map(verse).join('')}</para>`
            }
        }
        xml += `<chapter eid="${book} ${ch}"/>`
    }
    return xml + '</usx>'
}


// The chapter:verse ids of a USX document's verse start markers, grouped by chapter marker
function profile(xml:string){
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const out:string[] = []
    for (const el of doc.querySelectorAll('chapter[sid], verse[sid]')){
        out.push(el.nodeName === 'chapter' ? `c${el.getAttribute('number') ?? ''}`
            : el.getAttribute('sid')!.split(' ')[1]!)
    }
    return out.join(' ')
}


// Rules for GEN only
const gen = (rule:BookRuleSet) => ({GEN: [rule]})
const quiet = () => undefined


describe('reverse_usx input checks', () => {

    it("Rejects documents that aren't USX or lack a book code", ({expect}) => {
        expect(() => reverse_usx('<foo/>')).toThrow('not USX')
        expect(() => reverse_usx('<usx/>')).toThrow('missing <book>')
        expect(() => reverse_usx('<usx><book/></usx>')).toThrow('No book code')
    })

    it("Leaves books without rules unchanged", ({expect}) => {
        const xml = build('GEN', {1: [[1, 2]]})
        expect(reverse_usx(xml, DOMParser, XMLSerializer, {})).toBe(xml)
    })

    it("Throws (with a warning) if the original numbering is invalid", ({expect}) => {
        const warn = vi.fn()
        const xml = build('GEN', {1: [[1, 3, 2]]})
        expect(() => reverse_usx(xml, DOMParser, XMLSerializer,
            gen({test: 'GEN 1:1', renumber: {}}), warn)).toThrow('Expected verse')
        expect(warn).toHaveBeenCalledWith('Issue with original numbering of file')
    })

    it("Throws for a verse id that isn't a chapter:verse", ({expect}) => {
        const xml = build('GEN', {1: [[1]]}).replace('<para style="p">',
            '<para style="p"><verse style="v" sid="GEN 1:x"/>x<verse eid="GEN 1:x"/>')
        expect(() => reverse_usx(xml, DOMParser, XMLSerializer,
            gen({test: 'GEN 1:1', renumber: {}}), quiet)).toThrow('Invalid sid: GEN 1:x')
    })

    it("Rejects a verse with neither a sid nor an eid during validation", ({expect}) => {
        const xml = build('GEN', {1: [[1]]}).replace('<para style="p">',
            '<para style="p"><verse style="v"/>')
        expect(() => reverse_usx(xml, DOMParser, XMLSerializer,
            gen({test: 'GEN 1:1', renumber: {}}), quiet)).toThrow('Expected sid')
    })
})


describe('reverse_usx renumbering edge cases', () => {

    it("Throws if rules keep changing the document", ({expect}) => {
        // Swaps 1:2 <-> 1:3 forever while the test verse remains
        const xml = build('GEN', {1: [[1, 2]]})
        expect(() => reverse_usx(xml, DOMParser, XMLSerializer, gen({test: 'GEN 1:1',
            renumber: {'GEN 1:2': 'GEN 1:3', 'GEN 1:3': 'GEN 1:2'}}), quiet))
            .toThrow('did not stabilise')
    })

    it("Throws (with a warning) if renumbering produces invalid numbering", ({expect}) => {
        const warn = vi.fn()
        const xml = build('GEN', {1: [[1, 2, 3]]})
        expect(() => reverse_usx(xml, DOMParser, XMLSerializer,
            gen({test: 'GEN 1:3', renumber: {'GEN 1:3': 'GEN 1:1'}}), warn)).toThrow()
        expect(warn).toHaveBeenCalledWith('Issue with numbering after re-versing file')
    })

    it("Keeps chapter 1's marker when its first verse is renumbered", ({expect}) => {
        const xml = build('GEN', {1: [[1, 2]]})
        const result = reverse_usx(xml, DOMParser, XMLSerializer, gen({test: 'GEN 1:1',
            renumber: {'GEN 1:1': 'GEN 1:2', 'GEN 1:2': 'GEN 1:3'}}), quiet)
        expect(profile(result)).toBe('c1 1:2 1:3')
    })

    it("Moves a chapter boundary across a missing chapter, splitting the para", ({expect}) => {
        // Last verse of ch1 becomes the first of ch3 (ch2 is absent, as in partial psalters)
        const xml = build('GEN', {1: [[1, 2]], 3: [[1, 2]]}, '')
        const result = reverse_usx(xml, DOMParser, XMLSerializer, gen({test: 'GEN 1:2',
            renumber: {'GEN 1:2': 'GEN 3:1', 'GEN 3:1': 'GEN 3:2', 'GEN 3:2': 'GEN 3:3'}}), quiet)
        expect(profile(result)).toBe('c1 1:1 c3 3:1 3:2 3:3')
        expect(result).toContain('<para style="p"><verse number="1" style="v" sid="GEN 3:1"/>')
    })

    it("Throws if the previous chapter's last verse isn't in a para", ({expect}) => {
        const xml = build('GEN', {1: [1, 2], 2: [[1, 2]]})
        expect(() => reverse_usx(xml, DOMParser, XMLSerializer, gen({test: 'GEN 1:2',
            renumber: {'GEN 1:2': 'GEN 2:1', 'GEN 2:1': 'GEN 2:2', 'GEN 2:2': 'GEN 2:3'}}), quiet))
            .toThrow('Expected a <para>')
    })
})


describe('validate_numbering', () => {

    // Validate the given USX, returning the error message (or null)
    const check = (xml:string) => {
        const warn = vi.fn()
        try {
            validate_numbering(new DOMParser().parseFromString(xml, 'application/xml'), warn)
            return null
        } catch (error){
            expect_warned(warn)
            return (error as Error).message
        }
    }
    const expect_warned = (warn:ReturnType<typeof vi.fn>) => {
        if (!warn.mock.calls.length){
            throw new Error("Expected a warning with context")
        }
    }
    const usx = (body:string) => `<usx version="3.0"><book code="GEN"/>${body}</usx>`

    it("Accepts sequential numbering with skipped chapters and verse segments", ({expect}) => {
        expect(check(usx('<chapter number="1" sid="GEN 1"/><para><verse number="1" sid="GEN 1:1"/>'
            + '<verse eid="GEN 1:1"/><verse sid="GEN 1:1"/><verse eid="GEN 1:1"/></para>'
            + '<chapter eid="GEN 1"/><chapter number="3" sid="GEN 3"/>'
            + '<para><verse sid="GEN 3:1"/><verse eid="GEN 3:1"/></para><chapter eid="GEN 3"/>')))
            .toBeNull()
    })

    it("Rejects the wrong element, position, chapter, verse or number", ({expect}) => {
        expect(check(usx('<para><verse sid="GEN 1:1"/></para>'))).toMatch(/^Expected chapter /)
        expect(check(usx('<chapter eid="GEN 1"/>'))).toMatch(/^Expected sid /)
        expect(check(usx('<chapter number="1"/>'))).toMatch(/^Expected sid /)
        expect(check(usx('<chapter sid="GEN 2"/><para><verse sid="GEN 2:1"/><verse eid="GEN 2:1"/>'
            + '</para><chapter eid="GEN 2"/><chapter sid="GEN 1"/>')))
            .toMatch(/^Expected chapter 3 or later /)
        expect(check(usx('<chapter sid="GEN 1"/><para><verse sid="GEN 2:1"/></para>')))
            .toMatch(/^Expected chapter 1 /)
        expect(check(usx('<chapter sid="GEN 1"/><para><verse sid="GEN 1:3"/><verse eid="GEN 1:3"/>'
            + '<verse sid="GEN 1:1"/></para>'))).toMatch(/^Expected verse 4 /)
        expect(check(usx('<chapter number="2" sid="GEN 1"/>'))).toMatch(/^Expected number attr /)
        expect(check(usx('<chapter sid="GEN 1"/><para><verse number="5" sid="GEN 1:1"/></para>')))
            .toMatch(/^Expected number attr to be 1 /)
    })

    it("Includes preceding blocks as context in the warning", ({expect}) => {
        const warn = vi.fn()
        const doc = new DOMParser().parseFromString(usx('<chapter sid="GEN 1"/><para>'
            + '<char>a</char><verse sid="GEN 2:1"/></para>'), 'application/xml')
        expect(() => validate_numbering(doc, warn)).toThrow()
        const message = String(warn.mock.calls[0]![0])
        expect(message).toContain('<chapter sid="GEN 1"/>')
        expect(message).not.toContain('<char>')  // Char tags removed for readability
    })
})


describe('strip_subverses input checks', () => {

    it("Rejects documents that aren't USX or lack a book code", ({expect}) => {
        expect(() => strip_subverses('<foo number="1a"/>')).toThrow('not USX')
        expect(() => strip_subverses('<usx><verse number="1a"/></usx>')).toThrow('missing <book>')
    })

    it("Treats verses without digits or ids as starting at 0", ({expect}) => {
        const xml = '<usx><book code="GEN"/><chapter sid="GEN 1"/><para><verse number="a"/>'
            + 'x<verse eid="GEN 1:a"/></para></usx>'
        expect(() => strip_subverses(xml)).not.toThrow()
    })

    it("Leaves a verse without a number attribute untouched", ({expect}) => {
        const xml = '<usx><book code="GEN"/><chapter sid="GEN 1"/><para><verse sid="GEN 1:1"/>'
            + 'x<verse eid="GEN 1:1"/><verse number="1a" sid="GEN 1:1a"/>y</para></usx>'
        expect(strip_subverses(xml)).toContain('<verse sid="GEN 1:1"/>x<verse eid="GEN 1:1"/>')
    })
})


describe('rules', () => {

    it("Rejects system data that doesn't map verses 1-1", ({expect}) => {
        expect(() => system_to_rules({'GEN 1:1-2': 'GEN 1:1'}))
            .toThrow('Different length: GEN 1:1-2 GEN 1:1')
    })

    it("Has rules for every book a system test is defined for", ({expect}) => {
        for (const [book, entries] of Object.entries(book_system_tests)){
            for (const [system_name] of entries){
                expect(rules_by_system[system_name]?.[book], `${system_name} ${book}`)
                    .toBeDefined()
            }
        }
    })
})
