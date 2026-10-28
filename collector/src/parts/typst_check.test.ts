
import * as child_process from 'node:child_process'
import * as fs from 'node:fs'

import {describe, it, vi, afterEach} from 'vitest'

import {check_typst_snippets, join_typst_chunks, label_typst_errors, typst_bin}
    from './typst_check.js'


// Wrap the real functions so individual tests can override them
vi.mock('node:child_process', async original => {
    const actual = await original<typeof import('node:child_process')>()
    return {...actual, execFileSync: vi.fn(actual.execFileSync)}
})
vi.mock('node:fs', async original => {
    const actual = await original<typeof import('node:fs')>()
    return {...actual, existsSync: vi.fn(actual.existsSync)}
})

// Whether a real Typst CLI is available to compile with
const has_typst = typst_bin() !== 'typst'


afterEach(() => {
    vi.restoreAllMocks()
})


describe('typst_bin', () => {

    it("Prefers the repo's copy, else assumes it's on PATH", ({expect}) => {
        vi.mocked(fs.existsSync).mockReturnValueOnce(true)
        expect(typst_bin()).toMatch(/\.bin\/typst$/)
        vi.mocked(fs.existsSync).mockReturnValueOnce(false)
        expect(typst_bin()).toBe('typst')
    })
})


describe('join_typst_chunks', () => {

    it("Records where each chunk starts in code points", ({expect}) => {
        const doc = join_typst_chunks([
            {label: 'a', body: "one\ntwo"},
            {label: 'b', body: "😀x"},
            {label: 'c', body: "end"},
        ], "#set page()\n#let x = 1")
        expect(doc.source).toBe("#set page()\n#let x = 1\none\ntwo😀xend")
        expect(doc.starts).toEqual([[3, 1], [4, 4], [4, 6]])
    })
})


describe('label_typst_errors', () => {

    const chunks = [{label: 'a', body: ''}, {label: 'b', body: ''}]
    const doc = {source: '', starts: [[2, 1], [2, 5]] as [number, number][]}

    it("Labels errors by the chunk (or preamble) they occur in", ({expect}) => {
        const output = [
            "check.typ:1:3: error: bad preamble",
            "check.typ:2:4: error: bad a",
            "check.typ:2:5: error: bad b",
            "check.typ:3:1: warning: ignored",
        ].join('\n')
        expect(label_typst_errors(output, chunks, doc))
            .toEqual(["preamble: bad preamble", "a: bad a", "b: bad b"])
    })

    it("Falls back to raw output when in an unexpected format", ({expect}) => {
        expect(label_typst_errors(" weird \n", chunks, doc)).toEqual(["weird"])
        expect(label_typst_errors("  ", chunks, doc)).toEqual([])
    })
})


describe('check_typst_snippets', () => {

    it.skipIf(!has_typst)("Passes valid snippets", ({expect}) => {
        expect(check_typst_snippets([{label: 'ok', body: "Hello *world*"}], '')).toBe(true)
    })

    it.skipIf(!has_typst)("Reports the label of a failing snippet", ({expect}) => {
        expect(() => check_typst_snippets([
            {label: 'ok', body: "Fine"},
            {label: 'gen 1:1', body: "#undefined_func()"},
        ], '')).toThrow(/gen 1:1: unknown variable/)
    })

    it("Skips validation if Typst isn't installed", ({expect}) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.mocked(child_process.execFileSync).mockImplementationOnce(() => {
            throw Object.assign(new Error("spawn typst ENOENT"), {code: 'ENOENT'})
        })
        expect(check_typst_snippets([{label: 'a', body: "x"}], '')).toBe(false)
    })

    it("Uses the error message when there is no stderr", ({expect}) => {
        vi.mocked(child_process.execFileSync).mockImplementationOnce(() => {
            throw new Error("killed")
        })
        expect(() => check_typst_snippets([], '')).toThrow("Typst failed to compile:\nkilled")
    })
})

