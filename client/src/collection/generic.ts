// Common methods for resources with multiple options per language

import {book_names_english, books_ordered, book_abbrev_english,
} from '@gracious.tech/bible-references'

import {filter_licenses} from '../assets/licenses.js'
import {deep_copy, fuzzy_search} from '../assets/utils.js'

import type {BookNames, MetaTag, MetaLanguage} from '../assets/shared_types.js'
import type {UsageOptions, UsageConfig, RuntimeLicense, RuntimeManifestItem}
    from '../assets/types.js'
import type {RequestHandler} from '../assets/request.js'


// No browser types since may be running in Node, so define as possibly existing
declare const self:{navigator: {language:string, languages: string[]}}|undefined


// Utils for forcing an interface's `object` property to be true or falsey
type ObjT<T> = Omit<T, 'object'> & {object:true}
type ObjF<T> = Omit<T, 'object'> & {object?:false}


// Types for collection methods

export interface GetLanguagesOptions {
    object?:boolean
    exclude_old?:boolean
    sort_by?:'local'|'english'|'population'|'population_L1'
    search?:string
}

export interface GetLanguagesItem {
    code:string
    name_local:string
    name_english:string
    name_bilingual:string
    population:number|null
}

export interface GetResourcesOptions {
    language?:string
    object?:boolean
    sort_by_year?:boolean
    usage?:UsageOptions
    // Basic filtering using combination of factors (manually filter for more fine-tuned results)
    exclude_obsolete?:boolean
    exclude_incomplete?:boolean
}

export interface GetResourcesItem {
    // NOTE Keeps flat structure for better dev experience
    id:string
    language:string
    direction:'ltr'|'rtl',
    year:number
    attribution:string
    attribution_url:string
    licenses:RuntimeLicense[]
    tags:MetaTag[]
    // Local name of resource (falls back to English)
    name:string
    // Local abbreviation of resource (falls back to English)
    name_abbrev:string
    // English name of resource (may not exist)
    name_english:string
    // English abbreviation of resource (may not exist)
    name_english_abbrev:string
    // Local name of resource (may not exist)
    name_local:string
    // Local abbreviation of resource (may not exist)
    name_local_abbrev:string
    // Local name of resource with the English name in brackets when it differs
    name_bilingual:string
    // Local abbreviation of resource with the English abbreviation in brackets when it differs
    name_bilingual_abbrev:string
}

export interface GetBooksOptions {
    object?:boolean
    sort_by_name?:boolean
    testament?:'ot'|'nt'
    whole?:boolean  // Include even those unavailable
}

export interface GetBooksItem {
    id:string
    ot:boolean
    nt:boolean
    available:boolean
    // Local name of book (falls back to English)
    name:string
    // Local abbreviation of book (falls back to English)
    name_abbrev:string
    // English name of book (always exists)
    name_english:string
    // English abbreviation of book (always exists)
    name_english_abbrev:string
    // Local name of book (may be empty string)
    name_local:string
    // Local abbreviation of book (may be empty string)
    name_local_abbrev:string
    // Local long name of book (may be empty string)
    name_local_long:string
    // Local name of book with the English name in brackets when it differs
    name_bilingual:string
    // Local abbreviation of book with the English abbreviation in brackets when it differs
    name_bilingual_abbrev:string
}

export interface GetCompletionReturn {
    ot:{
        available:string[]
        missing:string[]
    }
    nt:{
        available:string[]
        missing:string[]
    }
}


export class GenericCollection {

    // @internal
    _items:Record<string, RuntimeManifestItem>
    // @internal
    _languages:Record<string, MetaLanguage>
    // @internal
    _language2to3:Record<string, string>
    // @internal
    _languages_most_spoken:string[]
    // @internal
    _usage:UsageConfig
    // @internal
    _modern_year = new Date().getFullYear() - 70
    // @internal Must be set by subclass
    _local_book_names:Record<string, Record<string, BookNames>> = {}

    requester:RequestHandler

    constructor(items:Record<string, RuntimeManifestItem>, requester:RequestHandler,
            languages:Record<string, MetaLanguage>,
            language2to3:Record<string, string>, languages_most_spoken:string[], usage:UsageConfig){

        this.requester = requester
        this._items = items
        this._usage = usage

        // Only include languages that have a resource
        const included_langs = new Set(Object.keys(items).map(id => id.slice(0, 3)))
        this._languages = Object.fromEntries(
            Object.entries(languages).filter(([k, v]) => included_langs.has(k)))

        // More language data that is useful but doesn't need filtering
        this._language2to3 = language2to3
        this._languages_most_spoken = languages_most_spoken
    }

    // @internal
    _ensure_resource_exists(resource:string){
        // Util that throws if resource doesn't exist
        if (! this.has_resource(resource)){
            throw new Error(`Resource with id "${resource}" does not exist in collection`)
        }
    }

    // @internal Split a composite id ("ot_id|nt_id") into its two halves if both exist
    _split_composite_id(id:string):[string, string]|undefined{
        const parts = id.split('|')
        if (parts.length !== 2 || !parts[0] || !parts[1]){
            return undefined
        }
        if (!(parts[0] in this._items) || !(parts[1] in this._items)){
            return undefined
        }
        return [parts[0], parts[1]]
    }

    // @internal Resolve which real resource id owns a book, given a possibly-composite id
    _resolve_book_resource(resource:string, book:string):string{
        const composite = this._split_composite_id(resource)
        if (!composite){
            return resource
        }
        return books_ordered.slice(0, 39).includes(book) ? composite[0] : composite[1]
    }

    // @internal
    _ensure_book_exists(resource:string, book:string){
        // Util that throws if book doesn't exist
        this._ensure_resource_exists(resource)
        if (!books_ordered.includes(book)){
            throw new Error(`Book id "${book}" is not valid (should be 3 letters lowercase)`)
        }
        if (! this.has_book(resource, book)){
            throw new Error(`Resource "${resource}" does not have book "${book}"`)
        }
    }

    // Check if a language exists (must be 3 character id)
    has_language(language:string):boolean{
        return language in this._languages
    }

    // Check if a resource exists
    has_resource(resource:string):boolean{
        // NOTE _split_composite_id confirms existance in _items itself
        return resource in this._items || this._split_composite_id(resource) !== undefined
    }

    // Check if a book exists within a resource
    has_book(resource:string, book:string):boolean{
        this._ensure_resource_exists(resource)
        const resource_meta = this._items[this._resolve_book_resource(resource, book)]!
        return resource_meta.books_ot_list.includes(book)
            || resource_meta.books_nt_list.includes(book)
    }

    // Get a language's metadata
    get_language(code:string):GetLanguagesItem|undefined{
        const data = this._languages[code]
        if (!data){
            return undefined
        }
        return {
            code,
            name_local: data.local,
            name_english: data.english,
            name_bilingual:
                data.english === data.local ? data.local : `${data.local} (${data.english})`,
            population: data.pop,
        }
    }

    // Get available languages as either a list or an object
    get_languages(options:ObjT<GetLanguagesOptions>):Record<string, GetLanguagesItem>
    get_languages(options?:ObjF<GetLanguagesOptions>):GetLanguagesItem[]
    get_languages({object, exclude_old, sort_by, search}:GetLanguagesOptions={}):
            GetLanguagesItem[]|Record<string, GetLanguagesItem>{

        // Start with list and dereference internal objects so manifest can't be modified
        let list = Object.keys(this._languages).map(code => this.get_language(code)!)

        // Optionally exclude non-living languages
        if (exclude_old){
            list = list.filter(item => item.population !== null)
        }

        // Optionally apply search
        if (search !== undefined){
            list = fuzzy_search(search, list, c => c.name_local + ' ' + c.name_english)
        }

        // Return object if desired
        if (object){
            return Object.fromEntries(list.map(item => [item.code, item]))
        }

        // Sort list and return it
        if (!search){
            if (sort_by === 'population_L1'){
                list.sort((a, b) => {
                    return (b.population ?? -1) - (a.population ?? -1)
                })
            } else if (sort_by === 'population'){
                // Sorting by total speakers (L1+L2) so need to consult extra array
                const item_to_pop = (item:typeof list[number]) => {
                    const most_spoken_i = this._languages_most_spoken.indexOf(item.code)
                    if (most_spoken_i !== -1){
                        // First in most spoken list needs largest number
                        // They all need to exceed 1 billion too, to override standard pop data
                        const list_len = this._languages_most_spoken.length
                        return (list_len - most_spoken_i) * 9999999999  // 10 billion - 1
                    }
                    return item.population ?? -1  // Fallback on L1-only pop data
                }
                list.sort((a, b) => {
                    return item_to_pop(b) - item_to_pop(a)
                })
            } else {
                list.sort((a, b) => {
                    // Defaults to sorting by local name
                    const name_key = sort_by === 'english' ? 'name_english' : 'name_local'
                    return a[name_key].localeCompare(b[name_key])
                })
            }
        }
        return list
    }

    // Get the user's preferred available language (no arg required when used in browser)
    get_preferred_language(preferences:string[]=[]):GetLanguagesItem{
        return this.get_language(this._get_preferred_language_code(preferences))!
    }

    // @internal Get preferred language code
    _get_preferred_language_code(preferences:string[]=[]):string{

        // Default to navigator property when in browser
        if (preferences.length === 0 && typeof self !== 'undefined'){
            preferences = [...(self.navigator.languages ?? [self.navigator.language ?? 'eng'])]
        }

        // Loop through user's preferences (first is most preferred)
        for (let code of preferences){

            // Normalise the code to 2/3 lowercase char
            code = code.toLowerCase().split('-')[0] ?? ''

            // Convert 2 char codes to 3 chars
            code = this._language2to3[code] ?? code

            // If resources includes language, use it
            if (code in this._languages){
                return code
            }
        }

        // Default to English if available, else random language
        return 'eng' in this._languages ? 'eng' : Object.keys(this._languages)[0]!
    }

    // Get a resource's metadata
    // (book only required for OT/NT dual ids so get correct resource's meta data)
    get_resource(id:string, book?:string):GetResourcesItem|undefined{
        const real_id = this._resolve_book_resource(id, book ?? 'gen')
        return this._get_resource(real_id)
    }

    // @internal Version that takes a `usage` arg which is only useful for `get_resources()`
    _get_resource(id:string, usage?:UsageOptions):GetResourcesItem|undefined{
        const resource = this._items[id]
        if (!resource){
            return undefined
        }

        // Work out bilingual names
        let bilingual = resource.name.local || resource.name.english
        if (resource.name.local && resource.name.english &&
                resource.name.local.toLowerCase() !== resource.name.english.toLowerCase()){
            bilingual = `${resource.name.local} (${resource.name.english})`
        }
        let bilingual_abbrev = resource.name.local_abbrev || resource.name.english_abbrev
        if (resource.name.local_abbrev && resource.name.english_abbrev &&
                resource.name.local_abbrev !== resource.name.english_abbrev){
            bilingual_abbrev = `${resource.name.local_abbrev} (${resource.name.english_abbrev})`
        }

        return {
            id,
            language: id.slice(0, 3),
            direction: resource.direction,
            year: resource.year,

            name: resource.name.local || resource.name.english,
            name_abbrev: resource.name.local_abbrev || resource.name.english_abbrev,
            name_english: resource.name.english,
            name_english_abbrev: resource.name.english_abbrev,
            name_local: resource.name.local,
            name_local_abbrev: resource.name.local_abbrev,
            name_bilingual: bilingual,
            name_bilingual_abbrev: bilingual_abbrev,

            attribution: resource.copyright.attribution,
            attribution_url: resource.copyright.attribution_url,
            licenses: deep_copy(
                filter_licenses(resource.copyright.licenses, {...this._usage, ...usage})),
            tags: [...resource.tags],
        } as GetResourcesItem
    }

    // Get available resources as either a list or an object
    get_resources(options:ObjT<GetResourcesOptions>):Record<string, GetResourcesItem>
    get_resources(options?:ObjF<GetResourcesOptions>):GetResourcesItem[]
    get_resources({language, object, sort_by_year, usage, exclude_obsolete, exclude_incomplete}:
            GetResourcesOptions={}):GetResourcesItem[]|Record<string, GetResourcesItem>{

        // Start with list of resources, extracting properties that don't need extra processing
        // NOTE Filters out resources not compatible with usage config
        // WARN Careful to unpack all objects so originals can't be modified
        let list = Object.keys(this._items).map(id => {
            return this._get_resource(id, usage)!
        }).filter(resource => resource.licenses.length)

        // Optionally limit to single language
        if (language){
            list = list.filter(item => item.language === language)
        }

        // Optionally exclude obsolete resources (as long as better alternative exists)
        // For each test, only apply if 1 resource remains (else try other tests)
        if (exclude_obsolete){

            // First filter out very old resources
            const modern = list.filter(item => item.year >= this._modern_year)
            if (modern.length){
                list = modern
            }

            // Then try filter out obsolete-like tags
            for (const tag of ['archaic', 'questionable', 'niche'] as MetaTag[]){
                const reduced_list = list.filter(item => !item.tags.includes(tag))
                if (reduced_list.length){
                    list = reduced_list
                }
            }
        }

        // Optionally exclude incomplete resources
        if (exclude_incomplete){
            list = list.filter(item => {
                const resource_meta = this._items[item.id]!
                return resource_meta.books_ot === true && resource_meta.books_nt === true
            })
        }

        // Reform as object if desired
        if (object){
            return Object.fromEntries(list.map(item => [item.id, item]))
        }

        // Sort list and return it
        list.sort((a, b) => {
            return sort_by_year ? b.year - a.year : a.name_local.localeCompare(b.name_local)
        })
        return list
    }

    // Get user's preferred available resource (provide language preferences if not in browser)
    get_preferred_resource(languages:string[]=[]):GetResourcesItem{
        return this.get_resource(this._get_preferred_resource_id(languages))!
    }

    // @internal Get preferred resource id
    _get_preferred_resource_id(languages:string[]=[]):string{

        // First get preferred language
        const language = this._get_preferred_language_code(languages)

        // Return recommended resource, or otherwise the most modern full resource
        let candidate:string|null = null
        let candidate_full = false
        let candidate_year = -9999
        for (const [id, data] of Object.entries(this._items)){

            // Obviously must be desired language
            if (id.slice(0, 3) === language){

                // If recommended, don't bother checking any others
                if (data.tags.includes('recommended')){
                    return id
                }

                // Consider as a candidate until something better comes up
                // NOTE Not considering tags as if any tagged then one would be recommended already
                const full = data.books_ot === true && data.books_nt === true
                if (
                    !candidate  // Something better than nothing
                    || (!candidate_full && full)  // Full resource better than partial
                    // Otherwise only consider if more modern
                    || (full && data.year > candidate_year)
                ){
                    candidate = id
                    candidate_year = data.year
                    candidate_full = full
                }
            }
        }

        // If no candidate for this language, just return the first resource whatever that is
        return candidate ?? Object.keys(this._items)[0]!
    }

    // Get which books are available for a resource.
    // If no resource is given, all books will be listed but marked as unavailable.
    // If `fetch_translation_extras()` has already been called for a translation then local name
    // data will also be available (otherwise only English book names will be available).
    get_books(resource:string|undefined,
        options:ObjT<GetBooksOptions>):Record<string, GetBooksItem>
    get_books(resource?:string, options?:ObjF<GetBooksOptions>):GetBooksItem[]
    get_books(resource?:string, {object, sort_by_name, testament, whole}:GetBooksOptions={}):
            GetBooksItem[]|Record<string, GetBooksItem>{

        // Determine what books are available if given a resource (otherwise list all)
        // NOTE Composite ids take OT books from their first half and NT books from their second
        let available = books_ordered
        if (resource){
            this._ensure_resource_exists(resource)
            const composite = this._split_composite_id(resource)
            const ot_meta = this._items[composite?.[0] ?? resource]!
            const nt_meta = this._items[composite?.[1] ?? resource]!
            available = [...ot_meta.books_ot_list, ...nt_meta.books_nt_list]
        }

        // Get local book names if available
        let local:Record<string, BookNames> = {}
        if (resource && resource in this._local_book_names){
            local = this._local_book_names[resource]!
        }

        // Create a list of the available books in traditional order
        const slice = testament ? (testament === 'ot' ? [0, 39] : [39]) : []
        const list = books_ordered.slice(...slice)
            .filter(id => whole || available.includes(id))
            .map(id => {
                const ot = books_ordered.indexOf(id) < 39

                // Work out bilingual names
                const local_name = local[id]?.normal
                let bilingual = book_names_english[id]!
                if (local_name && bilingual.toLowerCase() !== local_name.toLowerCase()){
                    bilingual = `${local_name} (${bilingual})`
                }
                const local_abbrev = local[id]?.abbrev
                let bilingual_abbrev = book_abbrev_english[id]!
                if (local_abbrev && bilingual_abbrev.toLowerCase() !== local_abbrev.toLowerCase()){
                    bilingual_abbrev = `${local_abbrev} (${bilingual_abbrev})`
                }

                return {
                    id,
                    name: local_name || book_names_english[id]!,
                    name_abbrev: local_abbrev || book_abbrev_english[id]!,
                    name_english: book_names_english[id]!,
                    name_english_abbrev: book_abbrev_english[id]!,
                    name_local: local_name ?? '',
                    name_local_abbrev: local_abbrev ?? '',
                    name_local_long: local[id]?.long ?? '',
                    name_bilingual: bilingual,
                    name_bilingual_abbrev: bilingual_abbrev,
                    ot,
                    nt: !ot,
                    available: !!resource && available.includes(id),
                }
            })

        // Return as object if desired
        if (object){
            return Object.fromEntries(list.map(item => [item.id, item]))
        }

        // Optionally sort by name instead of traditional order
        if (sort_by_name){
            list.sort((a, b) => a.name_english.localeCompare(b.name_english))
        }

        return list
    }

    // Get book ids that are available/missing for a resource for each testament
    get_completion(resource:string):GetCompletionReturn{

        this._ensure_resource_exists(resource)

        // Form object that will be returned
        const data:GetCompletionReturn = {
            nt: {available: [], missing: []},
            ot: {available: [], missing: []},
        }

        // Look through books adding to either `available` or `missing`
        // NOTE Composite ids take OT books from their first half and NT books from their second
        const composite = this._split_composite_id(resource)
        const ot_meta = this._items[composite?.[0] ?? resource]!
        const nt_meta = this._items[composite?.[1] ?? resource]!
        const resource_books = [...ot_meta.books_ot_list, ...nt_meta.books_nt_list]
        let testament:'ot'|'nt' = 'ot'
        for (const book of books_ordered){
            if (book === 'mat'){
                testament = 'nt'  // Switch testament when reach Matthew (books ordered)
            }
            const status = resource_books.includes(book) ? 'available' : 'missing'
            data[testament][status].push(book)
        }

        return data
    }

}
