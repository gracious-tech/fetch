
import {BibleClient} from '@/client'
import type {BibleCollection, GetTranslationsItem, GetLanguagesItem} from '@/client/collection'

const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


export const content = {
    client: new BibleClient({endpoints: [endpoint]}),
    // These will be set before app loads, so force types
    collection: null as unknown as BibleCollection,
    translations: null as unknown as Record<string, GetTranslationsItem>,
    languages: null as unknown as Record<string, GetLanguagesItem>,
}
