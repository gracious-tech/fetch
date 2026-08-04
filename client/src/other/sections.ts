
import {books_ordered, PassageReference} from '@gracious.tech/bible-references'

import type {DistSectionData, SectionStat} from '../assets/shared_types'


// A section stat with its book code attached (returned by whole-Bible lookups)
export interface LocatedSectionStat extends SectionStat {
    book:string
}


// How to sort the results of `get_sections()`
export type SectionSortBy = 'canonical'|'importance'|'popularity'|'importance+popularity'


// Options for `get_sections()`
export interface GetSectionsOptions {
    book?:string  // Limit to a single book (else the whole Bible)
    min_importance?:number  // Only include sections with importance >= this
    min_popularity?:number  // Only include sections with popularity >= this
    sort_by?:SectionSortBy  // Sort order (default "canonical")
}


// Access to translation-independent section importance/popularity stats
export class SectionData {

    // @internal
    _data:DistSectionData

    readonly model:string
    readonly generated:string

    // @internal
    constructor(data:DistSectionData){
        this._data = data
        this.model = data.model
        this.generated = data.generated
    }

    // @internal Throw if a book id isn't a valid 3-letter lowercase code
    _ensure_book_valid(book:string){
        if (!books_ordered.includes(book)){
            throw new Error(`Book id "${book}" is not valid (should be 3 letters lowercase)`)
        }
    }

    // @internal Attach the book code to each of a book's sections
    _locate(book:string):LocatedSectionStat[]{
        return (this._data.sections[book] ?? []).map(section => ({...section, book}))
    }

    // Get sections (whole Bible, or a single book), optionally filtered and sorted
    get_sections(options:GetSectionsOptions={}):LocatedSectionStat[]{
        const {book, min_importance, min_popularity, sort_by = 'canonical'} = options

        // Collect sections for the requested scope
        let sections:LocatedSectionStat[] = []
        if (book !== undefined){
            this._ensure_book_valid(book)
            sections = this._locate(book)
        } else {
            for (const code of books_ordered){
                sections.push(...this._locate(code))
            }
        }

        // Filter by minimum scores
        if (min_importance !== undefined){
            sections = sections.filter(section => section.importance >= min_importance)
        }
        if (min_popularity !== undefined){
            sections = sections.filter(section => section.popularity >= min_popularity)
        }

        // Sort by the chosen key, always tie-breaking canonically
        const score = (section:LocatedSectionStat) => {
            if (sort_by === 'importance'){
                return section.importance
            }
            if (sort_by === 'popularity'){
                return section.popularity
            }
            if (sort_by === 'importance+popularity'){
                return section.importance + section.popularity
            }
            return 0  // "canonical" — rely on the tie-breaker below
        }
        sections.sort((a, b) => score(b) - score(a) || this._canonical_cmp(a, b))

        return sections
    }

    // @internal Compare two located sections in canonical (book, chapter, verse) order
    _canonical_cmp(a:LocatedSectionStat, b:LocatedSectionStat):number{
        return books_ordered.indexOf(a.book) - books_ordered.indexOf(b.book)
            || a.start_chapter - b.start_chapter
            || a.start_verse - b.start_verse
    }

    // Get the section containing a specific verse (or undefined if none)
    get_for_verse(book:string, chapter:number, verse:number):LocatedSectionStat|undefined{
        this._ensure_book_valid(book)
        return this._locate(book).find(section => {
            const ref = new PassageReference({
                book,
                start_chapter: section.start_chapter,
                start_verse: section.start_verse,
                end_chapter: section.end_chapter,
                end_verse: section.end_verse,
            })
            return ref.includes(chapter, verse)
        })
    }

    // Get all sections that overlap a reference (a PassageReference or a reference string)
    // Strings are auto-parsed with English book names (e.g. "John 3:16", "Jonah 1").
    get_for_ref(ref:PassageReference|string):LocatedSectionStat[]{
        const passage = typeof ref === 'string' ? PassageReference.from_string(ref) : ref
        if (!passage){
            throw new Error(`Could not parse reference "${ref as string}"`)
        }
        return this._locate(passage.book).filter(section => {
            const section_ref = new PassageReference({
                book: passage.book,
                start_chapter: section.start_chapter,
                start_verse: section.start_verse,
                end_chapter: section.end_chapter,
                end_verse: section.end_verse,
            })
            return section_ref.overlaps(passage)
        })
    }

}
