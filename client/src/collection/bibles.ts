
import {book_names_english, PassageReference, detect_references, english_abbrev_include,
    english_abbrev_exclude, book_abbrev_english, books_ordered,
} from '@gracious.tech/bible-references'

import {BibleBook, BibleBookHtml, BibleBookUsx, BibleBookUsfm, BibleBookTxt, BibleBookTypst}
    from '../book/bible.js'
import {TranslationExtra} from './bibles_extra.js'
import {GenericCollection} from './generic.js'

import type {BookNames, BookSection, DistTranslationExtra} from '../assets/shared_types'


export class BibleCollection extends GenericCollection {

    // Get the URL for a book's content (useful for caching and manual retrieval)
    get_book_url(resource:string, book:string, format:'html'|'usx'|'usfm'|'txt'|'typst'='html'){
        this._ensure_book_exists(resource, book)
        const real_id = this._resolve_book_resource(resource, book)
        const endpoint = this._items[real_id]!.endpoint
        const ext = ['html', 'txt', 'typst'].includes(format) ? 'json' : format
        return `${endpoint}bibles/${real_id}/${format}/${book}.${ext}`
    }

    // Make request for the text for a book of a translation (returns object for accessing it)
    async fetch_book(resource:string, book:string, format?:'html'):Promise<BibleBookHtml>
    async fetch_book(resource:string, book:string, format:'usx'):Promise<BibleBookUsx>
    async fetch_book(resource:string, book:string, format:'usfm'):Promise<BibleBookUsfm>
    async fetch_book(resource:string, book:string, format:'txt'):Promise<BibleBookTxt>
    async fetch_book(resource:string, book:string, format:'typst'):Promise<BibleBookTypst>
    async fetch_book(resource:string, book:string, format:'html'|'usx'|'usfm'|'txt'|'typst'='html'):
            Promise<BibleBook>{

        // Check args valid
        this._ensure_book_exists(resource, book)

        // Fetch book in desired format
        const url = this.get_book_url(resource, book, format)
        const contents = await this.requester.request(url)

        // Resolve which real resource this book's copyright belongs to (handles composite ids)
        const real_id = this._resolve_book_resource(resource, book)

        // Return in appropriate class
        const format_class = {
            html: BibleBookHtml,
            usx: BibleBookUsx,
            usfm: BibleBookUsfm,
            txt: BibleBookTxt,
            typst: BibleBookTypst,
        }[format]
        return new format_class(contents, this._items[real_id]!.copyright)
    }

    // Make request for extra metadata for a translation (such as book names and section headings).
    // This will also auto-provide local book names for future calls of `get_books()`.
    async fetch_translation_extras(resource:string):Promise<TranslationExtra>{

        // Check args valid
        this._ensure_resource_exists(resource)

        // Composite ids need both halves' extras fetched and merged per-testament
        const composite = this._split_composite_id(resource)
        if (composite){
            const [ot_id, nt_id] = composite
            const merged = await this._fetch_merged_extras(ot_id, nt_id)
            // Also cache under composite id (halves cached individually within
            // `_fetch_merged_extras`)
            this._local_book_names[resource] = merged.book_names
            return new TranslationExtra(merged)
        }

        // Fetch data
        const data = await this._fetch_extras_raw(resource)

        // Extract local book names when done (regardless of `remember_fetches` setting)
        this._local_book_names[resource] = data.book_names

        // Return in class
        return new TranslationExtra(data)
    }

    // @internal Fetch a single real resource's raw extras data
    async _fetch_extras_raw(resource:string):Promise<DistTranslationExtra>{
        const endpoint = this._items[resource]!.endpoint
        const url = `${endpoint}bibles/${resource}/extra.json`
        const contents = await this.requester.request(url)
        return JSON.parse(contents) as DistTranslationExtra
    }

    // @internal Fetch both halves of a composite id's extras and merge them per-testament
    //     NOTE Merges book-by-book (not a blind object spread) since a half that happens to be a
    //     full Bible could carry keys for the other testament too, which spreading could clobber
    async _fetch_merged_extras(ot_id:string, nt_id:string):Promise<DistTranslationExtra>{
        const [ot_data, nt_data] = await Promise.all([
            this._fetch_extras_raw(ot_id),
            this._fetch_extras_raw(nt_id),
        ])
        this._local_book_names[ot_id] = ot_data.book_names
        this._local_book_names[nt_id] = nt_data.book_names

        const book_names:Record<string, BookNames> = {}
        const chapter_headings:Record<string, string[]> = {}
        const sections:Record<string, BookSection[]> = {}
        books_ordered.forEach((book, i) => {
            const data = i < 39 ? ot_data : nt_data
            book_names[book] = data.book_names[book]!
            chapter_headings[book] = data.chapter_headings[book]!
            sections[book] = data.sections[book]!
        })

        return {
            book_names,
            chapter_headings,
            sections,
            wj_markup: nt_data.wj_markup || ot_data.wj_markup,
        }
    }

    // @internal Auto-prepare args for from_string/detect_references based on translation
    _from_string_args(resource:string|string[]=[], always_detect_english=true){

        // Get book names and abbreviations for translations (if available)
        const book_names:[string, string][] = []
        const resources = typeof resource === 'string' ? [resource] : resource
        for (const re of resources){
            for (const [code, name_types] of Object.entries(this._local_book_names[re] ?? {})){
                if (name_types.normal){
                    book_names.push([code, name_types.normal])
                }
                if (name_types.abbrev){
                    book_names.push([code, name_types.abbrev])
                }
            }
        }

        // Optionally add English last so is lowest priority
        if (always_detect_english){
            for (const [code, name] of Object.entries(book_names_english)){
                book_names.push([code, name])
            }
            for (const [code, name] of english_abbrev_include){
                book_names.push([code, name])
            }
        }

        // Languages with Chinese-like characters
        const chinese_like = [
            'zho',  // Chinese macrolanguage group
            'lzh', 'gan', 'hak', 'czh', 'cjy', 'cmn', 'mnp', 'cdo',  // Part of 'zho' group
            'nan', 'czo', 'cnp', 'cpx', 'csp', 'wuu', 'hsn', 'yue',  // Part of 'zho' group
            'jpn',  // Japanese
            'kor',  // Korean
        ]

        // Detect language as whatever first translation given has
        // NOTE For a composite id ("ot_id|nt_id") this correctly yields the OT half's language,
        //     since the OT half always comes first - not a bug, don't "simplify" this away
        const lang = resources[0]?.split('_')[0] ?? 'eng'

        // Set args based on whether a Chinese script or not
        const exclude_book_names:string[]|undefined =
            lang === 'eng' ? [...english_abbrev_exclude] : []
        const min_chars:number = chinese_like.includes(lang) ? 1 : 2
        const match_from_start = !chinese_like.includes(lang)

        return [book_names, exclude_book_names, min_chars, match_from_start,
        ] as [[string, string][], string[], number, boolean]
    }

    // Detect bible references in a block of text using book names of given translation(s).
    // A generator is returned and can be passed updated text each time it yields a result.
    // You must have first awaited a call to `fetch_translation_extras()` to be able to parse
    //     non-English references.
    detect_references(text:string, resource:string|string[]=[], always_detect_english=true){
        return detect_references(text,
            ...this._from_string_args(resource, always_detect_english))
    }

    // Parse a single bible reference string into a PassageReference object (validating it).
    // Supports only single passages (for e.g. Matt 10:6,8 use `detect_references`).
    // You must have first awaited a call to `fetch_translation_extras()` to be able to parse
    //     non-English references.
    string_to_reference(text:string, resource:string|string[]=[], always_detect_english=true){
        return PassageReference.from_string(text,
            ...this._from_string_args(resource, always_detect_english))
    }

    // Render a PassageReference object as a string using the given translation's book names.
    // You must have first awaited a call to `fetch_translation_extras()` for the translation,
    // or English will be used by default.
    reference_to_string(reference:PassageReference, resource?:string, abbreviate?:boolean){

        // Start with English names as `toString()` default will not account for `abbreviate` option
        const book_names = {... abbreviate ? book_abbrev_english : book_names_english}

        // Overwrite English defaults with translation's names if they are available
        if (resource){
            const name_prop = abbreviate ? 'abbrev' : 'normal'
            for (const [book, props] of Object.entries(this._local_book_names[resource] ?? {})){
                if (props[name_prop]){
                    book_names[book] = props[name_prop]
                }
            }
        }
        return reference.toString(book_names)
    }

}
