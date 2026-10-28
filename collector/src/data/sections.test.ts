
import {readFileSync} from 'node:fs'

import {describe, it, vi} from 'vitest'

import {sections_process} from './sections.js'
import {read_unpublished} from '../parts/unpublished.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'


// Read the committed section data relative to CWD rather than the package dir
vi.mock('../parts/utils.js', async original => ({
    ...await original<typeof import('../parts/utils.js')>(),
    PKG_PATH: '.',
}))


describe('sections_process', () => {

    use_temp_cwd()

    it("Publishes section stats without their reasons", ({expect}) => {
        const stat = {start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 5,
            importance: 5, popularity: 4}
        write_files({'dist/data/sections.json': {model: 'm', generated: '2026-01-01',
            sections: {jhn: [{...stat, reason: "Why"}], gen: [stat]}}})
        vi.spyOn(console, 'info').mockImplementation(() => undefined)

        sections_process()

        expect(JSON.parse(readFileSync('dist/sections/sections.json', 'utf-8'))).toEqual(
            {model: 'm', generated: '2026-01-01', sections: {jhn: [stat], gen: [stat]}})
        expect(console.info).toHaveBeenCalledWith("Wrote section data for 2 books")
        expect(read_unpublished()).toEqual(['sections'])
    })
})

