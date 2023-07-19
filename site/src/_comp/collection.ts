
import {BibleClient} from '@gracious.tech/fetch-client'


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Get collection
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()


export {client, collection}
