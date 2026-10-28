
import {existsSync, mkdirSync} from 'node:fs'

import {describe, it} from 'vitest'

import {clean_collection} from './maintenance.js'
import {read_unpublished} from '../parts/unpublished.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'


describe('clean_collection', () => {

    use_temp_cwd()

    it("Removes empty source dirs and dist dirs without a source", async ({expect}) => {
        mkdirSync('sources/bibles/eng_empty', {recursive: true})
        write_files({
            'dist/bibles/eng_empty/usx/gen.usx': '',
            'dist/bibles/eng_gone/usx/gen.usx': '',
        })
        await clean_collection()
        expect(existsSync('sources/bibles/eng_empty')).toBe(false)
        expect(existsSync('dist/bibles/eng_empty')).toBe(false)
        expect(existsSync('dist/bibles/eng_gone')).toBe(false)
        expect(read_unpublished()).toEqual(['bibles/eng_empty', 'bibles/eng_gone'])
    })

    it("Removes dist books whose source is missing or invalid", async ({expect}) => {
        write_files({
            'sources/bibles/eng_a/usx/gen.usx': '',
            'sources/bibles/eng_a/usx/exo.usx.invalid': '',
            'sources/bibles/eng_b/usfm/gen.usfm': '',
            'sources/bibles/eng_c/meta.json': '{}',  // Not downloaded yet (no format dir)
        })
        for (const format of ['usx', 'usfm', 'html', 'txt']){
            write_files({
                [`dist/bibles/eng_a/${format}/gen.json`]: '',
                [`dist/bibles/eng_a/${format}/exo.json`]: '',
                [`dist/bibles/eng_a/${format}/lev.json`]: '',
                [`dist/bibles/eng_b/${format}/gen.json`]: '',
            })
        }
        await clean_collection()
        for (const format of ['usx', 'usfm', 'html', 'txt']){
            expect(existsSync(`dist/bibles/eng_a/${format}/gen.json`)).toBe(true)
            expect(existsSync(`dist/bibles/eng_a/${format}/exo.json`)).toBe(false)
            expect(existsSync(`dist/bibles/eng_a/${format}/lev.json`)).toBe(false)
            expect(existsSync(`dist/bibles/eng_b/${format}/gen.json`)).toBe(true)
        }
        expect(read_unpublished()).toEqual(['bibles/eng_a'])
    })

    it("Tolerates downloaded translations that haven't been processed yet", async ({expect}) => {
        write_files({'sources/bibles/eng_a/usx/gen.usx': ''})
        mkdirSync('dist/bibles', {recursive: true})
        await clean_collection()
        expect(existsSync('sources/bibles/eng_a/usx/gen.usx')).toBe(true)
        expect(existsSync('unpublished.txt')).toBe(false)
    })
})

