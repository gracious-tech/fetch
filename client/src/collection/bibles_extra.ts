
import {books_ordered} from '@gracious.tech/bible-references'

import type {DistTranslationExtra} from '../assets/shared_types'


// Access to local book names, sections, and chapter headings for a translation
export class TranslationExtra {

    // @internal
    _extra:DistTranslationExtra

    readonly wj_markup:boolean

    // @internal
    constructor(extra:DistTranslationExtra){
        this._extra = extra
        this.wj_markup = extra.wj_markup
    }

    // @internal
    _ensure_book_exists(book:string){
        // Util that throws if book doesn't exist
        if (!books_ordered.includes(book)){
            throw new Error(`Book id "${book}" is not valid (should be 3 letters lowercase)`)
        }
        if (!(book in this._extra.book_names)){
            throw new Error(`Translation does not have book "${book}"`)
        }
    }

    // Get local name data for a book.
    // This will throw if the book doesn't exist or will contain empty strings if no data available.
    // You should call `get_books()` on the collection instance for more intuitive access.
    // It will automatically make use of local name data after fetching it.
    get_book_name(book:string){
        this._ensure_book_exists(book)
        return {
            ...this._extra.book_names[book]!,
        }
    }

    // Get list of chapters for book which also includes a heading property for each
    get_chapters(book:string){
        this._ensure_book_exists(book)
        return this._extra.chapter_headings[book]!.map((heading, number) => ({number, heading}))
            .slice(1)
    }

    // Get the heading for a specific chapter
    get_chapter_heading(book:string, chapter:number){
        this._ensure_book_exists(book)
        return this._extra.chapter_headings[book]![chapter]!
    }

    // Get list of sections for a book which includes a heading for each and verse range
    get_sections(book:string){
        this._ensure_book_exists(book)
        return this._extra.sections[book]!.map(section => {

            // Heading value will be null when starts at first verse of chapter
            const heading = section.heading
                ?? this._extra.chapter_headings[book]![section.start_chapter]!
            return {
                ...section,
                heading,
            }
        })
    }

}
