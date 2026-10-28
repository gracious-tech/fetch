
import {describe, it, vi} from 'vitest'


// Don't actually fetch the collection
const fetch_collection = vi.hoisted(() => vi.fn(() => Promise.resolve('collection')))
vi.mock('@gracious.tech/fetch-client', () => ({
    FetchClient: class {
        constructor(public options:unknown){}
        fetch_collection = fetch_collection
    },
}))


describe('collection', () => {

    it("Exports a client for the local dev endpoint and its collection", async ({expect}) => {
        const {client, collection} = await import('./collection')
        expect(client).toMatchObject({options: {endpoints: ['http://localhost:8430/']}})
        expect(collection).toBe('collection')
    })
})

