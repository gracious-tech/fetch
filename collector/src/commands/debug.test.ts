
import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {debug_convert} from './debug.js'
import {convert} from '../parts/usfmtc.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'
import {test_meta, usx3_jude, usx3_bad_romans} from './test_utils.js'


// Avoid depending on the Python venv
vi.mock('../parts/usfmtc.js', () => ({convert: vi.fn()}))


describe('debug_convert', () => {

    use_temp_cwd()

    // Capture what gets written to stdout
    let output = ''
    beforeEach(() => {
        output = ''
        vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
            output += String(chunk)
            return true
        })
        vi.mocked(convert).mockResolvedValue(usx3_jude)
        write_files({
            'sources/bibles/usx_test/meta.json': test_meta('usx'),
            'sources/bibles/usx_test/usx/jud.usx': usx3_jude,
            'sources/bibles/usx_test/usx/rev.usx.invalid': usx3_jude,
            'sources/bibles/usfm_test/meta.json': test_meta('usfm'),
            'sources/bibles/usfm_test/usfm/jud.usfm': '\\id JUD\n\\c 1\n\\p\n\\v 1 Jude\n',
        })
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.mocked(convert).mockReset()
    })

    it("Throws if book missing (or only invalid)", async ({expect}) => {
        await expect(debug_convert('usx_test', 'rev', 'reversed')).rejects.toThrow('No source')
    })

    it("Outputs pre-converted source", async ({expect}) => {
        await debug_convert('usfm_test', 'jud', 'pre_converted')
        expect(output).toBe('\\id JUD\n\\c 1\n\\p\n\\v 1 Jude\n')
        expect(convert).not.toHaveBeenCalled()
    })

    it("Converts USFM source via usfmtc", async ({expect}) => {
        await debug_convert('usfm_test', 'jud', 'converted')
        expect(convert).toHaveBeenCalledWith(expect.any(String), 'usfm', 'usx', true)
        expect(output).toBe(usx3_jude)
    })

    it("Keeps USX3 source as-is", async ({expect}) => {
        await debug_convert('usx_test', 'jud', 'converted')
        expect(convert).not.toHaveBeenCalled()
        expect(output).toBe(usx3_jude)
    })

    it("Converts older USX source", async ({expect}) => {
        write_files({'sources/bibles/usx_test/usx/jud.usx': '<usx version="2.0"></usx>'})
        await debug_convert('usx_test', 'jud', 'converted')
        expect(convert).toHaveBeenCalledWith(expect.any(String), 'usx', 'usx', true)
    })

    it("Converts USX lacking a version", async ({expect}) => {
        write_files({'sources/bibles/usx_test/usx/jud.usx': '<usx></usx>'})
        await debug_convert('usx_test', 'jud', 'converted')
        expect(convert).toHaveBeenCalled()
    })

    it("Outputs pre_reverse, reversed, and post_reverse stages", async ({expect}) => {
        for (const stage of ['pre_reverse', 'reversed', 'post_reverse']){
            output = ''
            await debug_convert('usx_test', 'jud', stage)
            expect(output).toContain('sid="JUD 1:1"')
        }
    })

    it("Prefixes reverse warnings with id and book", async ({expect}) => {
        write_files({'sources/bibles/usx_test/usx/rom.usx': usx3_bad_romans})
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        await expect(debug_convert('usx_test', 'rom', 'reversed')).rejects.toThrow()
        expect(error.mock.calls.some(c => String(c[0]).startsWith('[usx_test/rom] '))).toBe(true)
    })
})
