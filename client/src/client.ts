
import {BibleCollection} from './collection'
import {DistManifest} from './shared_types'
import {UsageOptions, UsageConfig} from './types'
import {request} from './utils'


// The options available for configuring a BibleClient
export interface BibleClientConfig {

    /* A list of CDN endpoints to connect to that defaults to the official CDN
        (https://collection.fetch.bible/).
    You can optionally host your own fetch(bible) collection and use that instead, or you could
    use it in addition to the official CDN by listing it first.
    The values can be relative URLs but all must end in a slash.
    */
    endpoints?:string[]

    /* Configure how you'll be using Bible translations to automatically filter out those
        which have incompatible licenses. You can alternatively do this per translation when
        fetching actual passages.

        All options default to `false` which results in having access to the most translations.

         * `commercial`: `true` if you will use translations in a commercial manner
         * `attributionless`: `true` if you will be using Bible translations without including
                attribution to the owners
         * `limitless`: `true` if you will be using translations in full without any limitations
                to the number of verses that can be quoted
         * `derivatives`: `true` if you'll be modifying the translations, or `same-license` if
                you'll be sharing modifications under the same license as the original
     */
    usage?:UsageOptions

}


// A client for interacting with a fetch(bible) CDN
export class BibleClient {

    // @internal
    _endpoints = ['https://collection.fetch.bible/']
    // @internal
    _usage:UsageConfig = {
        commercial: false,
        attributionless: false,
        limitless: false,
        derivatives: false,
    }

    // Create a new BibleClient, defaulting to the official fetch(bible) collection
    constructor(config:BibleClientConfig={}){
        this._endpoints = config.endpoints ?? this._endpoints
        this._usage = {...this._usage, ...config.usage}
    }

    // Fetch the collection's manifest and return a BibleCollection object for interacting with it
    async fetch_collection():Promise<BibleCollection>{
        const manifests = await Promise.all(this._endpoints.map(async endpoint => {
            return [
                endpoint,
                JSON.parse(await request(endpoint + 'bibles/manifest.json')) as DistManifest,
            ]
        }))
        return new BibleCollection(this._usage, manifests as OneOrMore<[string, DistManifest]>)
    }

}
