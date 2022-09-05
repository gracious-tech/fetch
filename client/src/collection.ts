
import {BibleBookHtml, BibleBookUsx} from './book'
import {filter_licenses} from './licenses'
import {DistManifest} from './shared_types'
import {UsageOptions, UsageConfig, RuntimeManifest, RuntimeLicense} from './types'
import {deep_copy, fuzzy_search, request} from './utils'


// No browser types since may be running in Node, so define as possibly existing
declare const self:{navigator: {language:string, languages: string[]}}|undefined


// Utils for forcing an interface's `object` property to be true or falsey
type ObjT<T> = Omit<T, 'object'> & {object:true}
type ObjF<T> = Omit<T, 'object'> & {object?:false}


// Types for collection methods

export interface GetLanguagesOptions {
    object?:boolean
    exclude_old?:boolean
    sort_by_english?:boolean
    search?:string
}

export interface GetLanguagesItem {
    code:string
    local:string
    english:string
    living:boolean
}

export interface GetTranslationsOptions {
    language?:string
    object?:boolean
    sort_by_year?:boolean
    usage?:UsageOptions
    exclude_obsolete?:boolean
    exclude_incomplete?:boolean
}

export interface GetTranslationsItem {
    // NOTE Keeps flat structure for better dev experience
    id:string
    language:string
    year:number
    name_local:string
    name_english:string
    name_abbrev:string
    attribution:string
    attribution_url:string
    licenses:RuntimeLicense[]
}

export interface GetBooksOptions {
    object?:boolean
    sort_by_name?:boolean
    testament?:'ot'|'nt'
    whole?:boolean  // Include even those unavailable
}

export interface GetBooksItem {
    id:string
    local:string  // WARN May be empty string
    english:string
    available:boolean
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


// Access to a collection's meta data, including languages and translations available
export class BibleCollection {

    // @internal
    _usage:UsageConfig
    // @internal
    _manifest:RuntimeManifest
    // @internal
    _endpoints:Record<string, string> = {}  // Map translation ids to endpoints

    // @internal
    constructor(usage:UsageConfig, manifests:OneOrMore<[string, DistManifest]>){
        // Merge the manifests given into a combined collection while remembering endpoints
        // WARN Original manifests are not dereferenced and assumed to not be used outside here

        this._usage = usage

        // Start with an empty manifest with common metadata extracted from first manifest
        this._manifest = {
            book_names_english: manifests[0][1].book_names_english,
            books_ordered: manifests[0][1].books_ordered,
            licenses: manifests[0][1].licenses,  // Still useful even if resolved within transl.s
            languages: {},
            language2to3: {},
            translations: {},
        }

        // Keep track of included languages as may be less than in collection due to usage config
        const languages = new Set()

        // Process manifests in reverse such that the first will have priority
        for (const [endpoint, manifest] of manifests.reverse()){

            // Loop through endpoint's translations
            for (const [trans, trans_data] of Object.entries(manifest.translations)){

                // Resolve licenses
                let licenses:RuntimeLicense[] = trans_data.copyright.licenses.map(item => {
                    if (typeof item.license === 'string'){
                        return {
                            id: item.license,
                            name: manifest.licenses[item.license]!.name,
                            restrictions: manifest.licenses[item.license]!.restrictions,
                            url: item.url,
                        }
                    } else {
                        return {
                            id: null,
                            name: "Custom license",
                            restrictions: item.license,
                            url: item.url,
                        }
                    }
                })

                // Remove licenses not compatible with the given usage restrictions
                licenses = filter_licenses(licenses, this._usage)
                if (!licenses.length){
                    continue  // No compatible licenses so exclude translation
                }
                languages.add(trans_data.language)

                // Add the translation to the combined collection
                this._manifest.translations[trans] = {
                    ...trans_data,
                    last_verse: trans_data.last_verse ?? manifest.last_verse,
                    copyright: {
                        ...trans_data.copyright,
                        licenses,
                    },
                }

                // Remember which endpoint has which translation
                this._endpoints[trans] = endpoint
            }

            // Only add languages that have translations (may have been excluded if usage config)
            for (const lang in manifest.languages){
                if (languages.has(lang)){
                    this._manifest.languages[lang] = manifest.languages[lang]!
                }
            }
            for (const [lang2, lang3] of Object.entries(manifest.language2to3)){
                if (languages.has(lang3)){
                    this._manifest.language2to3[lang2] = manifest.language2to3[lang2]!
                }
            }
        }
    }

    // @internal
    _ensure_trans_exists(translation:string){
        // Util that throws if translation doesn't exist
        if (! this.has_translation(translation)){
            throw new Error(`Translation with id "${translation}" does not exist in collection(s)`)
        }
    }

    // @internal
    _ensure_book_exists(translation:string, book:string){
        // Util that throws if book doesn't exist
        this._ensure_trans_exists(translation)
        if (!this._manifest.books_ordered.includes(book)){
            throw new Error(`Book id "${book}" is not valid (should be 3 letters lowercase)`)
        }
        if (! this.has_book(translation, book)){
            throw new Error(`Translation "${translation}" does not have book "${book}"`)
        }
    }

    // Check if a language exists (must be 3 character id)
    has_language(language:string):boolean{
        return language in this._manifest.languages
    }

    // Check if a translation exists
    has_translation(translation:string):boolean{
        return translation in this._manifest.translations
    }

    // Check if a book exists within a translation
    has_book(translation:string, book:string):boolean{
        return this._manifest.translations[translation]?.books[book] !== undefined
    }

    // Get available languages as either a list or an object
    get_languages(options:ObjT<GetLanguagesOptions>):Record<string, GetLanguagesItem>
    get_languages(options?:ObjF<GetLanguagesOptions>):GetLanguagesItem[]
    get_languages({object, exclude_old, sort_by_english, search}:GetLanguagesOptions={}):
            GetLanguagesItem[]|Record<string, GetLanguagesItem>{

        // Start with list and dereference internal objects so manifest can't be modified
        let list = Object.entries(this._manifest.languages).map(([code, data]) => ({...data, code}))

        // Optionally exclude non-living languages
        if (exclude_old){
            list = list.filter(item => item.living)
        }

        // Optionally apply search
        if (search !== undefined){
            list = fuzzy_search(search, list, c => c.local + ' ' + c.english)
        }

        // Return object if desired
        if (object){
            return Object.fromEntries(list.map(item => [item.code, item]))
        }

        // Sort list and return it
        if (!search){
            list.sort((a, b) => {
                const name_key = sort_by_english ? 'english' : 'local'
                return a[name_key].localeCompare(b[name_key])
            })
        }
        return list
    }

    // Get the user's preferred available language (no arg required when used in browser)
    get_preferred_language(preferences:string[]=[]):string{

        // Default to navigator property when in browser
        if (preferences.length === 0 && typeof self !== 'undefined'){
            preferences = [...(self.navigator.languages ?? [self.navigator.language ?? 'eng'])]
        }

        // Loop through user's preferences (first is most preferred)
        for (let code of preferences){

            // Normalise the code to 2/3 lowercase char
            code = code.toLowerCase().split('-')[0] ?? ''

            // If 3 char exists use it
            if (code in this._manifest.languages){
                return code
            }

            // If 2 char mode known then return 3 char version
            if (code in this._manifest.language2to3){
                return this._manifest.language2to3[code]!
            }
        }

        // Default to English if available, else random language
        return 'eng' in this._manifest.languages ? 'eng' : Object.keys(this._manifest.languages)[0]!
    }

    // Get available translations as either a list or an object
    get_translations(options:ObjT<GetTranslationsOptions>):Record<string, GetTranslationsItem>
    get_translations(options?:ObjF<GetTranslationsOptions>):GetTranslationsItem[]
    get_translations({language, object, sort_by_year, usage, exclude_obsolete, exclude_incomplete}:
            GetTranslationsOptions={}):GetTranslationsItem[]|Record<string, GetTranslationsItem>{

        // Start with list of translations, extracting properties that don't need extra processing
        // NOTE Filters out translations not compatible with usage config
        // WARN Careful to unpack all objects so originals can't be modified
        let list = Object.entries(this._manifest.translations).map(([id, trans]) => {
            return {
                id,
                language: trans.language,
                year: trans.year,
                name_local: trans.name.local,
                name_english: trans.name.english,
                name_abbrev: trans.name.abbrev,
                attribution: trans.copyright.attribution,
                attribution_url: trans.copyright.attribution_url,
                licenses: deep_copy(
                    filter_licenses(trans.copyright.licenses, {...this._usage, ...usage})),
            }
        }).filter(trans => trans.licenses.length)

        // Optionally limit to single language
        if (language){
            list = list.filter(item => item.language === language)
        }

        // Optionally exclude obsolete translations (only if alternate not itself filtered out)
        if (exclude_obsolete){
            const list_ids = list.map(item => item.id)
            list = list.filter(item => {
                const obsoleted_by = this._manifest.translations[item.id]!.obsoleted_by
                return !obsoleted_by || !list_ids.includes(obsoleted_by)
            })
        }

        // Optionally exclude incomplete translations
        if (exclude_incomplete){
            list = list.filter(item => {
                const count = Object.keys(this._manifest.translations[item.id]!.books).length
                return count === this._manifest.books_ordered.length
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

    // Get user's preferred available translation (provide language preferences if not in browser)
    get_preferred_translation(languages:string[]=[]):string{

        // First get preferred language
        const language = this.get_preferred_language(languages)

        // Return most modern full translation that isn't obsolete
        let candidate:string|null = null
        let candidate_year = -9999
        for (const [id, data] of Object.entries(this._manifest.translations)){
            if (data.language === language && data.year > candidate_year && !data.obsoleted_by
                    && Object.keys(data.books).length === this._manifest.books_ordered.length){
                candidate = id
                candidate_year = data.year
            }
        }
        return candidate ?? Object.keys(this._manifest.translations)[0]!
    }

    // Get which books are available for a translation
    get_books(translation:string, options:ObjT<GetBooksOptions>):Record<string, GetBooksItem>
    get_books(translation:string, options?:ObjF<GetBooksOptions>):GetBooksItem[]
    get_books(translation:string, {object, sort_by_name, testament, whole}:GetBooksOptions={}):
            GetBooksItem[]|Record<string, GetBooksItem>{

        this._ensure_trans_exists(translation)

        // Create a list of the available books in traditional order
        const available = this._manifest.translations[translation]!.books
        const slice = testament ? (testament === 'ot' ? [0, 39] : [39]) : []
        const list = this._manifest.books_ordered.slice(...slice)
            .filter(id => whole || id in available)
            .map(id => {
                return {
                    id,
                    local: available[id] ?? '',
                    english: this._manifest.book_names_english[id]!,
                    available: id in available,
                }
            })

        // Return as object if desired
        if (object){
            return Object.fromEntries(list.map(item => [item.id, item]))
        }

        // Optionally sort by local instead of traditional order
        if (sort_by_name){
            list.sort((a, b) => a.local.localeCompare(b.local))
        }

        return list
    }

    // Get book ids that are available/missing for a translation for each testament
    get_completion(translation:string):GetCompletionReturn{

        this._ensure_trans_exists(translation)

        // Form object that will be returned
        const data:GetCompletionReturn = {
            nt: {available: [], missing: []},
            ot: {available: [], missing: []},
        }

        // Look through books adding to either `available` or `missing`
        const trans_books = this._manifest.translations[translation]!.books
        let testament:'ot'|'nt' = 'ot'
        for (const book of this._manifest.books_ordered){
            if (book === 'mat'){
                testament = 'nt'  // Switch testament when reach Matthew (books ordered)
            }
            const status = book in trans_books ? 'available' : 'missing'
            data[testament][status].push(book)
        }

        return data
    }

    // Get chapter numbers for a book
    get_chapters(translation:string, book:string):number[]{
        this._ensure_book_exists(translation, book)
        const last_verse = this._manifest.translations[translation]!.last_verse
        // NOTE Need to +1 since chapter numbers are derived from place in last_verse array
        return [...Array(last_verse[book]!.length).keys()].map(i => i + 1)
    }

    // Get verse numbers for a chapter
    get_verses(translation:string, book:string, chapter:number):number[]{
        this._ensure_book_exists(translation, book)
        const last_verse = this._manifest.translations[translation]!.last_verse
        // WARN Position of each chapter is chapter-1 due to starting from 0
        return [...Array(last_verse[book]![chapter-1]).keys()].map(i => i + 1)
    }

    // Make request for the HTML text for a book of a translation (returns object for accessing it)
    async fetch_html(translation:string, book:string):Promise<BibleBookHtml>{
        this._ensure_book_exists(translation, book)
        const url = `${this._endpoints[translation]!}bibles/${translation}/html/${book}.html`
        const html = await request(url)
        return new BibleBookHtml(this._manifest.translations[translation]!, html)
    }

    // Make request for the USX3+ text for a book of a translation (returns object for accessing it)
    async fetch_usx(translation:string, book:string):Promise<BibleBookUsx>{
        this._ensure_book_exists(translation, book)
        const url = `${this._endpoints[translation]!}bibles/${translation}/usx/${book}.usx`
        const usx = await request(url)
        return new BibleBookUsx(this._manifest.translations[translation]!, usx)
    }

    // TODO async fetch_audio(){}
    // TODO async fetch_video(){}
}
