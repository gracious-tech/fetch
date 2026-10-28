
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import * as child_process from 'node:child_process'

import {describe, it, vi, afterEach} from 'vitest'

import {convert, update_usfmtc} from './usfmtc.js'
import {clean_dir, PKG_PATH} from './utils.js'


// Mock shell commands (but let execFile run for real unless overridden)
vi.mock('node:child_process', async original => {
    const actual = await original<typeof import('node:child_process')>()
    return {...actual, execSync: vi.fn(), execFile: vi.fn(actual.execFile)}
})

// Never actually wipe the real venv
vi.mock('./utils.js', async original => {
    const actual = await original<typeof import('./utils.js')>()
    return {...actual, clean_dir: vi.fn()}
})

// Allow pretending the venv is missing
vi.mock('node:fs', async original => {
    const actual = await original<typeof import('node:fs')>()
    return {...actual, existsSync: vi.fn(actual.existsSync)}
})


const venv_exists = existsSync(join(PKG_PATH, 'usfmtc-venv', 'bin', 'python'))


// A fake execFile that calls back with given results and records stdin
function fake_exec_file(error:Error|null, stdout:string, stderr:string){
    const stdin = {end: vi.fn()}
    vi.mocked(child_process.execFile).mockImplementationOnce(((...args:unknown[]) => {
        const callback = args.at(-1) as (e:Error|null, out:string, err:string) => void
        callback(error, stdout, stderr)
        return {stdin}
    }) as unknown as typeof child_process.execFile)
    return stdin
}


afterEach(() => {
    vi.clearAllMocks()
})


describe('update_usfmtc', () => {

    it("Recreates venv and installs latest usfmtc", ({expect}) => {
        update_usfmtc()
        expect(clean_dir).toHaveBeenCalledWith(join(PKG_PATH, 'usfmtc-venv'))
        const commands = vi.mocked(child_process.execSync).mock.calls.map(c => c[0])
        expect(commands[0]).toContain('python3 -m venv')
        expect(commands[1]).toMatch(/pip install --upgrade pip usfmtc$/)
        expect(commands[2]).toContain('import usfmtc')
    })

    it("Installs a pinned version if given", ({expect}) => {
        update_usfmtc('2.0.0')
        const commands = vi.mocked(child_process.execSync).mock.calls.map(c => c[0])
        expect(commands[1]).toMatch(/usfmtc==2\.0\.0$/)
    })
})


describe('convert', () => {

    it("Throws if venv missing", ({expect}) => {
        vi.mocked(existsSync).mockReturnValueOnce(false)
        expect(() => convert('', 'usfm', 'usx')).toThrow('usfmtc venv missing')
    })

    it("Resolves with stdout and passes args and stdin", async ({expect}) => {
        vi.mocked(existsSync).mockReturnValueOnce(true)
        const stdin = fake_exec_file(null, 'out', '')
        await expect(convert('in', 'usfm', 'usx', true)).resolves.toBe('out')
        expect(stdin.end).toHaveBeenCalledWith('in')
        const args = vi.mocked(child_process.execFile).mock.calls[0]![1]
        expect(args).toEqual([join(PKG_PATH, 'usfmtc_worker.py'), 'usfm', 'usx', '1'])
    })

    it("Rejects with stderr if available", async ({expect}) => {
        vi.mocked(existsSync).mockReturnValueOnce(true)
        fake_exec_file(new Error('exit 1'), '', ' Traceback \n')
        await expect(convert('in', 'usx', 'usfm')).rejects.toThrow(/^Traceback$/)
        const args = vi.mocked(child_process.execFile).mock.calls[0]![1]
        expect(args).toContain('0')
    })

    it("Rejects with error message if no stderr", async ({expect}) => {
        vi.mocked(existsSync).mockReturnValueOnce(true)
        fake_exec_file(new Error('exit 1'), '', '')
        await expect(convert('in', 'usx', 'usfm')).rejects.toThrow('exit 1')
    })

    it.skipIf(!venv_exists)("Converts USFM to USX for real", async ({expect}) => {
        const usx = await convert('\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning\n',
            'usfm', 'usx', true)
        expect(usx).toContain('sid="JHN 1:1"')
        expect(usx).toContain('eid="JHN 1:1"')
    })
})
