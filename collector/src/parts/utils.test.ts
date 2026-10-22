
import path from 'path'
import {statSync} from 'fs'

import {describe, it} from 'vitest'

import {read_dir, get_dir_entries, DirectoryEntry} from './utils'


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
    const bsb_path = path.join('dist', 'bibles', 'eng_bsb')
    const contents = get_dir_entries(bsb_path)

    it('should return a correct directory entry', ({expect}) => {
        expect(contents.length).not.toEqual(0)
        const html = contents.find((item: DirectoryEntry) => item.name === 'html')
        expect(html).not.toEqual(undefined)
        expect(html!.name).toEqual('html')
        expect(html!.isDirectory).toBe(true)
        expect(html!.fileSize).toEqual(undefined)
        expect(html!.dirSize).toEqual(66)
    })

    it('should return a correct file entry', ({expect}) => {
        const expected_size = statSync(path.join(bsb_path, 'extra.json')).size
        expect(contents.length).not.toEqual(0)
        const extra = contents.find((item: DirectoryEntry) => item.name === 'extra.json')
        expect(extra).not.toEqual(undefined)
        expect(extra!.name).toEqual('extra.json')
        expect(extra!.isDirectory).toBe(false)
        expect(extra!.fileSize).toEqual(expected_size)
        expect(extra!.dirSize).toEqual(undefined)
    })

})
