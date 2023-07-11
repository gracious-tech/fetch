
import {describe, it} from 'vitest'

import {generate_index_file, update_indexes} from './indexes'


describe('generate_index_file', () => {

    const html = generate_index_file('dist/bibles/eng_bsb/')

    it("Returns a HTML string", ({expect}) => {
        expect(html).toMatch(/^<!doctype html>/i)
    })

    it("Contains links to the different formats available", ({expect}) => {
        expect(html).toMatch(/<a href="usfm\/">.*<a href="usx\/">/)
    })

    it("Contains breadcrumb links to parent dirs", ({expect}) => {
        expect(html).toMatch(/<a.+?>bibles<\/a>/)
    })
})


describe('update_indexes', () => {

    it("Generates parent dir index when file changes", ({expect}) => {
        const out = update_indexes(['dist/bibles/manifest.json'], [])
        expect(out.update.map(i => i.path)).toEqual(['dist/bibles/'])
        expect(out.remove).toHaveLength(0)
    })

    it("Doesn't duplicate when files in same dir changed", ({expect}) => {
        const out = update_indexes(['dist/bibles/manifest.json', 'dist/bibles/fake'], [])
        expect(out.update).toHaveLength(1)
        expect(out.remove).toHaveLength(0)
    })

    it("Generates parent dir indexes when a file removed", ({expect}) => {
        const out = update_indexes([], ['dist/bibles/fake'])
        // Parent dir needs to remove file, and grandparent dir needs to update size of parent dir
        expect(out.update.map(i => i.path).sort()).toEqual(['dist/', 'dist/bibles/'])
        expect(out.remove).toHaveLength(0)
    })

    it("Removes parent index when no more files", ({expect}) => {
        const out = update_indexes([], ['dist/bibles/fake/file'])
        expect(out.update.map(i => i.path).sort()).toEqual(['dist/', 'dist/bibles/'])
        expect(out.remove).toEqual(['dist/bibles/fake/'])
    })

    it("Removes multiple parents when no more files", ({expect}) => {
        const out = update_indexes([], ['dist/bibles/fake/fake/file'])
        expect(out.update.map(i => i.path).sort()).toEqual(['dist/', 'dist/bibles/'])
        expect(out.remove.sort()).toEqual(['dist/bibles/fake/', 'dist/bibles/fake/fake/'])
    })

    it("Doesn't generate index for a dir higher than `dist/`", ({expect}) => {
        const out = update_indexes(['dist/file'], [])
        expect(out.update.map(i => i.path)).toEqual(['dist/'])
        expect(out.remove).toHaveLength(0)
    })

})
