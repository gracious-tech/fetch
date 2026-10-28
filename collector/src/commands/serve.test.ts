
import http from 'node:http'
import {once} from 'node:events'
import type {AddressInfo} from 'node:net'

import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {serve} from './serve.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'


describe('serve', () => {

    use_temp_cwd()
    let server:http.Server
    let base = ''

    // Start server on a random free port, capturing it so it can be closed after each test
    beforeEach(async () => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const create = http.createServer.bind(http)
        vi.spyOn(http, 'createServer').mockImplementation(((...args:Parameters<typeof create>) => {
            server = create(...args)
            return server
        }) as typeof http.createServer)
        await serve(0)
        await once(server, 'listening')
        base = `http://localhost:${(server.address() as AddressInfo).port}`
        write_files({'dist/bibles/eng_a/usx/gen.usx': '<usx/>'})
    })
    afterEach(() => {
        server.close()
        vi.restoreAllMocks()
    })

    it("Serves files from dist with CORS and content type", async ({expect}) => {
        const resp = await fetch(`${base}/bibles/eng_a/usx/gen.usx?v=1`)
        expect(resp.status).toBe(200)
        expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*')
        expect(resp.headers.get('Content-Type')).toBe('application/xml')
        expect(await resp.text()).toBe('<usx/>')
    })

    it("Returns 404 for missing files and dirs", async ({expect}) => {
        expect((await fetch(`${base}/bibles/eng_a/usx/exo.usx`)).status).toBe(404)
        expect((await fetch(`${base}/bibles`)).status).toBe(404)
        const root = await fetch(`${base}/`)
        expect(root.status).toBe(404)
        expect(await root.text()).toBe("Not found: /")
    })

    it("Rejects non-GET requests", async ({expect}) => {
        const resp = await fetch(`${base}/bibles/eng_a/usx/gen.usx`, {method: 'POST'})
        expect(resp.status).toBe(400)
    })
})

