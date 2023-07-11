import * as path from 'path'
import {describe, it} from 'vitest'
import { read_dir, read_dir_with_types } from './utils'
import { Dirent } from 'fs'

describe('read_dir', () => {
    const contents = read_dir(path.join('dist', 'bibles', 'eng_bsb'))

    it('should return all the resources by default', ({expect}) => {
        expect(contents.length).not.toEqual(0)
        expect(contents.includes('html')).toBe(true)
        expect(contents.includes('txt')).toBe(true)
        expect(contents.includes('usfm')).toBe(true)
    })

})

describe('read_dir_with_types', () => {

    it('should include file types when requested', ({expect}) => {
        const contents = read_dir_with_types(path.join('dist', 'bibles', 'eng_bsb'))
        expect(contents.length).not.toEqual(0)
        const html = contents.find((item: Dirent) => item.name === 'html')
        expect(html).not.toEqual(undefined)
        expect(html!.name).toEqual('html')
        expect(html!.isDirectory()).toBe(true)
    })

})
