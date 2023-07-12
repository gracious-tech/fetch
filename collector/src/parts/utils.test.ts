import * as path from 'path'
import {afterEach, beforeEach, describe, it} from 'vitest'
import { 
    read_dir, get_dir_entries, DirectoryEntry, read_files_in_dir, FirstFullParent,
    find_first_full_parent_dir,
} from './utils'
import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync } from 'fs'

describe('read_dir', () => {
    const contents = read_dir(path.join('dist', 'bibles', 'eng_bsb'))

    it('should return all the resources by default', ({expect}) => {
        expect(contents.length).not.toEqual(0)
        expect(contents.includes('html')).toBe(true)
        expect(contents.includes('txt')).toBe(true)
        expect(contents.includes('usfm')).toBe(true)
    })

})

describe('get_dir_entries', () => {
    const contents = get_dir_entries(path.join('dist', 'bibles'))

    it('should return a correct directory entry', ({expect}) => {
        expect(contents.length).not.toEqual(0)
        const bsb = contents.find((item: DirectoryEntry) => item.name === 'eng_bsb')
        expect(bsb).not.toEqual(undefined)
        expect(bsb!.name).toEqual('eng_bsb')
        expect(bsb!.isDirectory).toBe(true)
        expect(bsb!.fileSize).toEqual(-1)
        expect(bsb!.contentSize).toEqual(4)
    })

    it('should return a correct file entry', ({expect}) => {
        const expected_size = statSync(path.join('dist', 'bibles', 'manifest.json')).size
        expect(contents.length).not.toEqual(0)
        const manifest = contents.find((item: DirectoryEntry) => item.name === 'manifest.json')
        expect(manifest).not.toEqual(undefined)
        expect(manifest!.name).toEqual('manifest.json')
        expect(manifest!.isDirectory).toBe(false)
        expect(manifest!.fileSize).toEqual(expected_size)
        expect(manifest!.contentSize).toEqual(-1)
    })

})
describe('read_files_in_dir', () => {

    it('should only get the files', ({expect}) => {
        const files = read_files_in_dir(path.join('dist', 'bibles'))
        expect(files).toHaveLength(1)
        expect(files[0]).toEqual('manifest.json')
    })

})
describe('find_first_full_parent_dir', () => {
    const test_dir = path.join('dist', 'bibles', 'first_full_parent')

    beforeEach(() => {
        if (!existsSync(test_dir)) {
            mkdirSync(test_dir)
        }
    })

    afterEach(() => {
        if (existsSync(test_dir)) {
            rmSync(test_dir, { recursive: true, force: true })
        }
    })

    it('should return the correct full parent', ({expect}) => {
        const results: FirstFullParent = find_first_full_parent_dir(test_dir)
        expect(results).not.toBeNull()
        expect(results.directory).toEqual(path.join('dist', 'bibles'))
        expect(results.emptyDirectories).toHaveLength(1)
        expect(results.emptyDirectories[0]).toEqual(test_dir)
    })

    it('should handle deep empty directories', ({expect}) => {
        const first_level = path.join(test_dir, 'first_level')
        const second_level = path.join(first_level, 'second_level')
        mkdirSync(first_level)
        mkdirSync(second_level)
        const results: FirstFullParent = find_first_full_parent_dir(second_level)
        expect(results).not.toBeNull()
        expect(results.directory).toEqual(path.join('dist', 'bibles'))
        expect(results.emptyDirectories).toHaveLength(3)
        expect(results.emptyDirectories.sort())
            .toEqual([test_dir, first_level, second_level].sort())
    })

    it('should handle where there is no empty directories', ({expect}) => {
        closeSync(openSync(path.join(test_dir, 'temp.html'), 'w'))
        const results: FirstFullParent = find_first_full_parent_dir(test_dir)
        expect(results).not.toBeNull()
        expect(results.directory).toEqual(test_dir)
        expect(results.emptyDirectories).toHaveLength(0)
    })

    it('should handle when all parents are empty', ({expect}) => {
        const empty_parent = 'empty_parent'
        if (!existsSync(empty_parent)) {
            mkdirSync(empty_parent)
        }
        const empty_sibling = path.join(empty_parent, 'empty_sibling')
        if (!existsSync(empty_sibling)) {
            mkdirSync(empty_sibling)
        }
        const results: FirstFullParent = find_first_full_parent_dir(empty_sibling)
        if (existsSync(empty_parent)) {
            rmSync(empty_parent, { recursive: true, force: true })
        }
        expect(results).not.toBeNull()
        expect(results.directory).toEqual('')
        expect(results.emptyDirectories).toHaveLength(2)
        expect(results.emptyDirectories.sort()).toEqual([empty_parent, empty_sibling].sort())
    })
})
