
import {existsSync, readFileSync, writeFileSync} from 'node:fs'

import {describe, it} from 'vitest'

import {init_config} from './config.js'
import {use_temp_cwd} from './test_utils.js'


describe('init_config', () => {

    use_temp_cwd()

    it("Creates config template and sources dirs", async ({expect}) => {
        await init_config()
        expect(readFileSync('config.yaml', 'utf8')).toContain('cloudfront:')
        for (const dir of ['bibles', 'notes', 'crossref']){
            expect(existsSync(`sources/${dir}`)).toBe(true)
        }
    })

    it("Doesn't overwrite an existing config", async ({expect}) => {
        writeFileSync('config.yaml', 'custom')
        await init_config()
        expect(readFileSync('config.yaml', 'utf8')).toBe('custom')
    })
})

