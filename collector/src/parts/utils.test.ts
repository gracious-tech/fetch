import {join} from 'path'
import {describe, it} from 'vitest'
import { read_dir, get_dir_entries, DirectoryEntry } from './utils'
import { statSync } from 'fs'

describe('read_dir', () => {
    const contents = read_dir(join('dist', 'bibles', 'eng_bsb'))

    it('should return all the resources by default', ({expect}) => {
        expect(contents.length).not.toEqual(0)
        expect(contents.includes('html')).toBe(true)
        expect(contents.includes('txt')).toBe(true)
        expect(contents.includes('usfm')).toBe(true)
    })

})

describe('get_dir_entries', () => {
    const contents = get_dir_entries(join('dist', 'bibles'))

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
        const expected_size = statSync(join('dist', 'bibles', 'manifest.json')).size
        expect(contents.length).not.toEqual(0)
        const manifest = contents.find((item: DirectoryEntry) => item.name === 'manifest.json')
        expect(manifest).not.toEqual(undefined)
        expect(manifest!.name).toEqual('manifest.json')
        expect(manifest!.isDirectory).toBe(false)
        expect(manifest!.fileSize).toEqual(expected_size)
        expect(manifest!.contentSize).toEqual(-1)
    })

})
