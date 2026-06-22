
import {book_names_english, PassageReference, detect_references, english_abbrev_include,
    english_abbrev_exclude, book_abbrev_english} from '@gracious.tech/bible-references'

import {BibleBook, BibleBookHtml, BibleBookUsx, BibleBookUsfm, BibleBookTxt, BibleBookTypst}
    from '../book/bible.js'
import {TranslationExtra} from './bibles_extra.js'
import {GenericCollection} from './generic.js'

import type {DistTranslationExtra} from '../assets/shared_types'


export class BibleCollection extends GenericCollection {

    // Get the URL for a book's content (useful for caching and manual retrieval)
    get_book_url(resource:string, book:string, format:'html'|'usx'|'usfm'|'txt'|'typst'='html'){
        this._ensure_book_exists(resource, book)
        const endpoint = this._items[resource]!.endpoint
        const ext = ['html', 'txt', 'typst'].includes(format) ? 'json' : format
        return `${endpoint}bibles/${resource}/${format}/${book}.${ext}`
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

        // Return in appropriate class
        const format_class = {
            html: BibleBookHtml,
            usx: BibleBookUsx,
            usfm: BibleBookUsfm,
            txt: BibleBookTxt,
            typst: BibleBookTypst,
        }[format]
        return new format_class(contents, this._items[resource]!.copyright)
    }

    // Make request for extra metadata for a translation (such as book names and section headings).
    // This will also auto-provide local book names for future calls of `get_books()`.
    async fetch_translation_extras(resource:string):Promise<TranslationExtra>{

        // Check args valid
        this._ensure_resource_exists(resource)

        // Fetch data
        const endpoint = this._items[resource]!.endpoint
        const url = `${endpoint}bibles/${resource}/extra.json`
        const contents = await this.requester.request(url)
        const data = JSON.parse(contents) as DistTranslationExtra

        // Extract local book names when done (regardless of `remember_fetches` setting)
        this._local_book_names[resource] = data.book_names

        // Return in class
        return new TranslationExtra(data)
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
