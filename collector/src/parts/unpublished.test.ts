
import {existsSync, readFileSync} from 'node:fs'

import {describe, it} from 'vitest'

import {
    read_unpublished, add_unpublished, remove_unpublished, clear_unpublished, mark_all_unpublished,
} from './unpublished.js'
import {use_temp_cwd, write_files} from './test_utils.js'


describe('unpublished tracking', () => {

    use_temp_cwd()

    it("Reads an empty list when there is no tracking file", ({expect}) => {
        expect(read_unpublished()).toEqual([])
    })

    it("Adds entries without duplicates and ignores blank lines", ({expect}) => {
        write_files({'unpublished.txt': 'bibles/a\n\n  \n'})
        add_unpublished(['bibles/b', 'bibles/a'])
        expect(read_unpublished()).toEqual(['bibles/a', 'bibles/b'])
        expect(readFileSync('unpublished.txt', 'utf-8')).toBe('bibles/a\nbibles/b\n')
    })

    it("Removes single entries and deletes the file when none remain", ({expect}) => {
        add_unpublished(['bibles/a', 'bibles/b'])
        remove_unpublished('bibles/a')
        expect(read_unpublished()).toEqual(['bibles/b'])
        remove_unpublished('bibles/b')
        expect(existsSync('unpublished.txt')).toBe(false)
    })

    it("Clears the tracking file", ({expect}) => {
        add_unpublished(['bibles/a'])
        clear_unpublished()
        expect(existsSync('unpublished.txt')).toBe(false)
        clear_unpublished()
    })

    it("Marks every subdir of each dist category", ({expect}) => {
        mark_all_unpublished()
        expect(read_unpublished()).toEqual([])
        write_files({
            'dist/bibles/eng_a/x.json': '',
            'dist/bibles/eng_b/x.json': '',
            'dist/notes/eng_n/x.json': '',
            'dist/manifest.json': '',
        })
        mark_all_unpublished()
        expect(read_unpublished().sort()).toEqual(['bibles/eng_a', 'bibles/eng_b', 'notes/eng_n'])
    })
})

