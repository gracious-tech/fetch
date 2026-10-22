
import {describe, it, vi, afterEach} from 'vitest'

import {FetchNetworkError, RequestHandler} from './request.js'


// Stub fetch to respond with the given text (or fail) and count calls
function stub_fetch(respond:(url:string) => Response|Error){
    const fetch = vi.fn((url:string) => {
        const result = respond(url)
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
}


afterEach(() => {
    vi.unstubAllGlobals()
})


describe('RequestHandler', () => {

    it("Returns response text and caches it when remembering", async ({expect}) => {
        const fetch = stub_fetch(url => new Response(`body of ${url}`))
        const handler = new RequestHandler(true)
        expect(await handler.request('a')).toBe('body of a')
        expect(await handler.request('a')).toBe('body of a')
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(fetch).toHaveBeenCalledWith('a', {mode: 'cors'})
    })

    it("Doesn't cache when not remembering", async ({expect}) => {
        const fetch = stub_fetch(() => new Response('x'))
        const handler = new RequestHandler(false)
        await handler.request('a')
        await handler.request('a')
        expect(fetch).toHaveBeenCalledTimes(2)
    })

    it("Can bypass and clear the cache", async ({expect}) => {
        const fetch = stub_fetch(() => new Response('x'))
        const handler = new RequestHandler(true)
        await handler.request('a')
        handler.disable_responding_from_cache()
        await handler.request('a')
        expect(fetch).toHaveBeenCalledTimes(2)
        handler.enable_responding_from_cache()
        await handler.request('a')
        expect(fetch).toHaveBeenCalledTimes(2)
        handler.clear_cache()
        await handler.request('a')
        expect(fetch).toHaveBeenCalledTimes(3)
    })

    it("Throws for unsuccessful responses and forgets them so they can be retried",
        async ({expect}) => {
            const fetch = stub_fetch(() => new Response('', {status: 404, statusText: 'Not Found'}))
            const handler = new RequestHandler(true)
            await expect(handler.request('a')).rejects.toThrow('404 Not Found: a')
            await expect(handler.request('a')).rejects.toThrow('404 Not Found: a')
            expect(fetch).toHaveBeenCalledTimes(2)
        })

    it("Throws a FetchNetworkError for network failures", async ({expect}) => {
        stub_fetch(() => new TypeError('offline'))
        const error = await new RequestHandler(false).request('a').catch((e:unknown) => e)
        expect(error).toBeInstanceOf(FetchNetworkError)
        expect((error as Error).name).toBe('FetchNetworkError')
        expect((error as Error).message).toBe('a')
    })
})
