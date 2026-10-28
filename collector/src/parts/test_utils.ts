// Shared helpers for collector tests that read/write a collection relative to CWD

import {mkdtempSync, rmSync, mkdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {crc32} from 'node:zlib'

import {beforeEach, afterEach, vi} from 'vitest'


// Run each test in the calling file inside a fresh temp dir (collector paths are CWD-relative)
// NOTE Needs the default `forks` pool, as worker threads can't chdir
export function use_temp_cwd():{path:string}{
    const state = {path: ''}
    let original = ''
    beforeEach(() => {
        original = process.cwd()
        state.path = mkdtempSync(join(tmpdir(), 'fetch-collector-test-'))
        process.chdir(state.path)
    })
    afterEach(() => {
        process.chdir(original)
        rmSync(state.path, {recursive: true, force: true})
    })
    return state
}


// Build an uncompressed zip in memory (for fixtures of downloaded archives)
export function make_zip(files:Record<string, string|Buffer>):Buffer{
    const locals:Buffer[] = []
    const centrals:Buffer[] = []
    let offset = 0
    for (const [name, contents] of Object.entries(files)){
        const data = Buffer.from(contents)
        const name_buf = Buffer.from(name)
        const crc = crc32(data)

        // Local file header (stored, no extra field)
        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(20, 4)
        local.writeUInt32LE(crc, 14)
        local.writeUInt32LE(data.length, 18)
        local.writeUInt32LE(data.length, 22)
        local.writeUInt16LE(name_buf.length, 26)
        locals.push(local, name_buf, data)

        // Central directory header pointing back to the local header
        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(20, 4)
        central.writeUInt16LE(20, 6)
        central.writeUInt32LE(crc, 16)
        central.writeUInt32LE(data.length, 20)
        central.writeUInt32LE(data.length, 24)
        central.writeUInt16LE(name_buf.length, 28)
        central.writeUInt32LE(offset, 42)
        centrals.push(central, name_buf)
        offset += local.length + name_buf.length + data.length
    }

    // End of central directory record
    const central_size = centrals.reduce((sum, buf) => sum + buf.length, 0)
    const count = Object.keys(files).length
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(count, 8)
    end.writeUInt16LE(count, 10)
    end.writeUInt32LE(central_size, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...locals, ...centrals, end])
}


// Stub fetch to serve the given URLs (anything else is a 404)
export function stub_fetch(responses:Record<string, string|Buffer>){
    const fetch = vi.fn((url:string) => Promise.resolve(url in responses
        ? new Response(responses[url]) : new Response('', {status: 404})))
    vi.stubGlobal('fetch', fetch)
    return fetch
}


// Write a tree of files (relative to CWD), JSON-encoding any non-string contents
export function write_files(files:Record<string, unknown>):void{
    for (const [path, contents] of Object.entries(files)){
        mkdirSync(dirname(path), {recursive: true})
        writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents))
    }
}
