
import {FetchCollection} from './collection/collection.js'
import {BookCrossref} from './book/crossref.js'
import {Crossrefs} from './other/crossrefs.js'
import {GlossesBook} from './book/glosses.js'
import {NotesBook} from './book/notes.js'
import {TranslationExtra} from './collection/bibles_extra.js'
import {SectionData} from './other/sections.js'
import {SearchWords} from './other/search.js'
import {BibleBook, BibleBookHtml, BibleBookTxt, BibleBookUsfm, BibleBookUsx} from './book/bible.js'
import {RequestHandler} from './assets/request.js'
import {sanitize_descriptions, sanitize_manifest} from './assets/sanitize.js'

import type {UsageOptions, UsageConfig} from './assets/types'
import type {CrossrefData, CrossrefsData, CrossrefStrength, DistDescription, DistManifest,
    DistTranslationExtra, DistSectionData, OneOrMore} from './assets/shared_types'


// The options available for configuring a FetchClient
export interface FetchClientConfig {

    /* A list of CDN endpoints to connect to that defaults to the official CDN
        (https://v1.fetch.bible/).
    You can optionally host your own fetch(bible) collection and use that instead, or you could
    use it in addition to the official CDN by listing it first.
    The values can be relative URLs but all must end in a slash.
    */
    endpoints?:string[]

    /* The endpoint desired for generic data like crossrefs, defaulting to the first endpoint. */
    data_endpoint?:string

    /* Configure how you'll be using resources to automatically filter out those
        which have incompatible licenses. You can alternatively do this per resource when
        fetching actual data.

        All options default to `false` which results in having access to the most resources,
        except for `limitless` which defaults to `true` to ensure full use is allowed.

         * `commercial`: `true` if you will use resources in a commercial manner
         * `attributionless`: `true` if you will be using resources without including
                attribution to the owners
         * `limitless`: `true` if you will be using resources in full without any limitations
                to the number of verses that can be quoted
         * `derivatives`: `true` if you'll be modifying the resources, or `same-license` if
                you'll be sharing modifications under the same license as the original
     */
    usage?:UsageOptions

    /* Whether to preserve in memory the results of `fetch_*` methods (default true).

    This client will auto-preserve the results of `fetch_*` methods to avoid duplicate network
    requests. It preserves them in memory so that caching works even if service workers or other
    browser features are unimplemented or unavailable (such as in some iframes).

    This is convenient for most users but may result in a large use of memory if a
    significant amount of resources are requested. In such cases it is best to rely on service
    worker caching, or self-preserving frequently used results of requests. Though it's unlikely
    to be an issue as a whole bible is only around 14MB of memory (2MB compressed, 7MB disk space)

    It is best practice to use service worker caching for browsers either way, as this will not
    only speed up runtime execution but also revisits to your app.
    */
    remember_fetches?:boolean
}


// A client for interacting with a fetch(bible) CDN
export class FetchClient {

    // @internal
    _endpoints:string[]
    // @internal
    _data_endpoint:string
    // @internal
    _usage:UsageConfig = {
        commercial: false,
        attributionless: false,
        derivatives: false,
        limitless: true,  // Defaults to true since most apps will display entire bibles
    }

    // Synchronous access to collection if it has already been fetched with `fetch_collection()`
    collection:FetchCollection|undefined
    // Access to request handler and its caching methods
    requester:RequestHandler

    // Create a new FetchClient, defaulting to the official fetch(bible) collection
    constructor(config:FetchClientConfig={}){
        this._endpoints = config.endpoints ?? ['https://v1.fetch.bible/']
        this._data_endpoint = config.data_endpoint ?? this._endpoints[0]!
        this._usage = {...this._usage, ...config.usage}
        this.requester = new RequestHandler(config.remember_fetches !== false)
    }

    // Fetch the collection's manifest and return a FetchCollection object for interacting with it
    async fetch_collection():Promise<FetchCollection>{

        // Request all manifests and combine into a single FetchCollection instance
        return Promise.all(this._endpoints.map(async endpoint => {
            // Keep only valid entries, so one bad entry can't break the whole collection
            const manifest_url = endpoint + 'manifest.json'
            const manifest_str = await this.requester.request(manifest_url)
            return [
                endpoint,
                sanitize_manifest(JSON.parse(manifest_str), manifest_url),
            ]
        })).then(manifests => {
            // Store instance in `this.collection` for synchronous access
            this.collection = new FetchCollection(this._usage, this.requester,
                manifests as OneOrMore<[string, DistManifest]>)
            return this.collection
        })
    }

    // Manually fetch contents of book for a translation without needing to request FetchCollection
    async fetch_book(resource:string, book:string, format?:'html'):Promise<BibleBookHtml>
    async fetch_book(resource:string, book:string, format:'usx'):Promise<BibleBookUsx>
    async fetch_book(resource:string, book:string, format:'usfm'):Promise<BibleBookUsfm>
    async fetch_book(resource:string, book:string, format:'txt'):Promise<BibleBookTxt>
    async fetch_book(resource:string, book:string, format:'html'|'usx'|'usfm'|'txt'='html'):
            Promise<BibleBook>{
        const ext = ['html', 'txt'].includes(format) ? 'json' : format
        const url = `${this._data_endpoint}bibles/${resource}/${format}/${book}.${ext}`
        return this.requester.request(url).then(contents => {
            const format_class = {
                html: BibleBookHtml,
                usx: BibleBookUsx,
                usfm: BibleBookUsfm,
                txt: BibleBookTxt,
            }[format]
            return new format_class(contents)
        })
    }

    // Manually fetch extra metadata for a translation without needing to request FetchCollection
    async fetch_translation_extras(resource:string):Promise<TranslationExtra>{
        const url = `${this._data_endpoint}bibles/${resource}/extra.json`
        return this.requester.request(url).then(contents => {
            const data = JSON.parse(contents) as DistTranslationExtra
            return new TranslationExtra(data)
        })
    }

    // Fetch short descriptions of a language's Bibles (to help users choose between them)
    // Returns an object keyed by translation id which only has entries for those with something
    // to show (`english` and `local` descriptions and/or a `provenance` label)
    async fetch_bible_descriptions(language:string):Promise<Record<string, DistDescription>>{
        if (!/^[a-z]{3}$/.test(language)){
            throw new Error(`Language "${language}" is not valid (should be 3 letters lowercase)`)
        }
        const url = `${this._data_endpoint}descriptions/bibles/${language}.json`
        return this.requester.request(url).then(data => sanitize_descriptions(JSON.parse(data)))
    }

    // Manually fetch glosses for book without needing to request FetchCollection
    async fetch_glosses(resource:string, book:string):Promise<GlossesBook>{
        const url = this._data_endpoint + `glosses/${resource}/json/${book}.json`
        const json = await this.requester.request(url)
        return new GlossesBook(json)
    }

    // Manually fetch study notes for book without needing to request FetchCollection
    async fetch_notes(resource:string, book:string, format:'html'|'txt'='html'):Promise<NotesBook>{
        const url = this._data_endpoint + `notes/${resource}/${format}/${book}.json`
        const json = await this.requester.request(url)
        return new NotesBook(json)
    }

    // Fetch categorised cross-references for the whole Bible (one download, then synchronous
    // lookups for any verse)
    // NOTE `min_strength` 'very_high' = essential links only (mostly quotations and parallel
    //      accounts), 'high' = strong links, 'medium' = every worthwhile link;
    //      `relevant: false` leaves out the "relevant" category
    async fetch_crossrefs(options:{min_strength?:CrossrefStrength, relevant?:boolean}={})
            :Promise<Crossrefs>{
        // NOTE Files other than the strongest are named "_plus" as they include stronger links too
        const min_strength = options.min_strength ?? 'high'
        const plus = min_strength === 'very_high' ? '' : '_plus'
        const name = min_strength + plus + (options.relevant === false ? '_no_relevant' : '')
        const url = this._data_endpoint + `crossref/categorised/${name}.json`
        return new Crossrefs(JSON.parse(await this.requester.request(url)) as CrossrefsData)
    }

    /** @deprecated Uncategorised cross-references — use `fetch_crossrefs()` instead */
    async fetch_crossref(book:string, size:'small'|'medium'|'large'='medium'):Promise<BookCrossref>{
        const url = this._data_endpoint + `crossref/${size}/${book}.json`
        return this.requester.request(url).then(data => {
            return new BookCrossref(JSON.parse(data) as CrossrefData)
        })
    }

    // Fetch section data (importance/popularity), a translation-independent resource
    async fetch_sections():Promise<SectionData>{
        const url = this._data_endpoint + 'sections/sections.json'
        return this.requester.request(url).then(data => {
            return new SectionData(JSON.parse(data) as DistSectionData)
        })
    }

    // Fetch search data for a testament
    async fetch_search(id:string, format:'strongs'|'original'):Promise<SearchWords>{
        const url = this._data_endpoint + `search/${id}/${format}.json`
        return this.requester.request(url).then(data => {
            return new SearchWords(data)
        })
    }
}
