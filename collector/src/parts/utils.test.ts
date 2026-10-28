
import path, {join} from 'path'
import {existsSync, readFileSync, readdirSync, statSync, symlinkSync} from 'fs'

import {describe, it, vi} from 'vitest'
import {z} from 'zod'

import {
    read_dir, get_dir_entries, DirectoryEntry, request, request_json, parse_json, validate,
    concurrent, mkdir_exist, clean_dir, list_files, list_dirs, list_dirs_if, read_dir_deep,
    read_json, write_json, type_from_path, rm_diacritics, word_to_original,
} from './utils'
import {stub_fetch, use_temp_cwd, write_files} from './test_utils.js'


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

describe('request', () => {

    it("Returns the body in the requested type and passes headers", async ({expect}) => {
        const fetch = stub_fetch({'https://x/a': 'abc'})
        expect(await request('https://x/a', 'text')).toBe('abc')
        expect(fetch).toHaveBeenLastCalledWith('https://x/a', undefined)
        expect(new TextDecoder().decode(await request('https://x/a', 'arrayBuffer', {k: 'v'})))
            .toBe('abc')
        expect(fetch).toHaveBeenLastCalledWith('https://x/a', {headers: {k: 'v'}})
    })

    it("Throws with status and body when not ok", async ({expect}) => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
            new Response('details', {status: 500, statusText: 'Oops'}))))
        await expect(request('https://x/a', 'text')).rejects
            .toThrow('500 Oops: https://x/a\ndetails')
    })

    it("Throws without body when it can't be read", async ({expect}) => {
        stub_fetch({})
        await expect(request('https://x/b', 'text')).rejects.toThrow(/^404 : https:\/\/x\/b$/)
        const resp = new Response('', {status: 403})
        vi.spyOn(resp, 'text').mockRejectedValue(new Error())
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(resp)))
        await expect(request('https://x/c', 'text')).rejects.toThrow(/^403 : https:\/\/x\/c$/)
    })
})


describe('request_json / parse_json / validate', () => {

    it("Returns validated JSON with original key order", async ({expect}) => {
        stub_fetch({'https://x/a': '{"b": 1, "a": 2}'})
        const data = await request_json('https://x/a', z.object({a: z.number(), b: z.number()}))
        expect(Object.keys(data)).toEqual(['b', 'a'])
    })

    it("Identifies the source of invalid JSON or data", ({expect}) => {
        expect(() => parse_json('{', z.number(), 'src')).toThrow(/^Invalid JSON from src: /)
        expect(() => validate('x', z.number(), 'src')).toThrow(/^Invalid data from src:\n/)
    })
})


describe('concurrent', () => {

    it("Runs all tasks within the concurrency limit", async ({expect}) => {
        let active = 0
        let max_active = 0
        const done:number[] = []
        await concurrent([...Array(5).keys()].map(i => async () => {
            active += 1
            max_active = Math.max(max_active, active)
            await new Promise(resolve => {
                setTimeout(resolve, 1)
            })
            done.push(i)
            active -= 1
        }), 2)
        expect(done.sort()).toEqual([0, 1, 2, 3, 4])
        expect(max_active).toBe(2)
    })
})


describe('filesystem helpers', () => {

    use_temp_cwd()

    it("Creates dirs only when needed and cleans them", ({expect}) => {
        mkdir_exist('a/b')
        write_files({'a/b/f.txt': 'x'})
        mkdir_exist('a/b')
        expect(existsSync('a/b/f.txt')).toBe(true)
        clean_dir('a/b')
        expect(readdirSync('a/b')).toEqual([])
        clean_dir('c')
        expect(existsSync('c')).toBe(true)
    })

    it("Lists files and dirs, skipping ignored names", ({expect}) => {
        write_files({'d/f.txt': '', 'd/.DS_Store': '', 'd/sub/g.txt': '', 'd/.git/h': ''})
        symlinkSync('f.txt', 'd/link')
        expect(list_files('d').sort()).toEqual(['f.txt'])
        expect(list_dirs('d')).toEqual(['sub'])
        expect(list_dirs_if('d')).toEqual(['sub'])
        expect(list_dirs_if('missing')).toEqual([])
    })

    it("Reads dirs recursively", ({expect}) => {
        write_files({'d/f.txt': '', 'd/.DS_Store': '', 'd/sub/g.txt': ''})
        symlinkSync('f.txt', 'd/link')
        expect(read_dir_deep('d')).toEqual({dirs: ['d', join('d', 'sub')],
            files: [join('d', 'f.txt'), join('d', 'sub', 'g.txt')]})
    })

    it("Writes and reads JSON", ({expect}) => {
        write_json('a.json', {a: [1]})
        expect(readFileSync('a.json', 'utf-8')).toBe('{"a":[1]}')
        write_json('b.json', {a: 1}, true)
        expect(readFileSync('b.json', 'utf-8')).toBe('{\n    "a": 1\n}')
        expect(read_json('b.json', z.object({a: z.number()}))).toEqual({a: 1})
    })
})


describe('type_from_path', () => {

    it("Maps collection file extensions to content types", ({expect}) => {
        expect(type_from_path('a.usx')).toBe('application/xml')
        expect(type_from_path('a.usfm')).toBe('text/plain')
        expect(type_from_path('a.html')).toBe('text/html')
        expect(type_from_path('a.txt')).toBe('text/plain')
        expect(type_from_path('a.json')).toBe('application/json')
        expect(type_from_path('a.zip')).toBe('application/octet-stream')
    })
})


describe('word_to_original', () => {

    it("Strips diacritics, punctuation and non-original chars", ({expect}) => {
        expect(rm_diacritics('café')).toBe('cafe')
        expect(word_to_original('λόγος,')).toBe('ΛΟΓΟΣ')
        expect(word_to_original('בְּרֵאשִׁית׃')).toBe('בראשית')
        expect(word_to_original('word')).toBe('')
    })
})
