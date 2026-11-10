
import {PassageReference} from '@gracious.tech/bible-references'

import type {CrossrefCategory, CrossrefSpan, CrossrefStrength, CrossrefsData}
    from '../assets/shared_types'


// All cross-reference categories, in order of strength (the order links are returned in)
export const crossref_categories:CrossrefCategory[] =
    ['quotation', 'parallel', 'allusion', 'mention', 'relevant']


// All strengths, strongest first
export const crossref_strengths:CrossrefStrength[] = ['very_high', 'high', 'medium']


// One categorised cross-reference
export interface CrossrefLink {
    category:CrossrefCategory
    // very_high = essential counterpart, high = strong, medium = worthwhile
    strength:CrossrefStrength
    source:PassageReference  // The passage the link was looked up from
    target:PassageReference  // The passage it links to
    // Whether the target comes earlier in the Bible — i.e. it is the original that the source
    // quotes, echoes or mentions (meaningful for those categories; parallel/relevant are mutual)
    target_is_earlier:boolean
}


// A link with its source span's bounds precomputed for fast lookups
export interface IndexedLink extends CrossrefLink {
    start:number
    end:number
}


// Access to categorised cross-references for the whole Bible (download once, then look up any
// verse synchronously)
export class Crossrefs {

    _by_book = new Map<string, IndexedLink[]>()

    constructor(data:CrossrefsData){

        // Index every link under both of its passages (each is stored once in the data)
        for (const category of crossref_categories){
            for (const strength of crossref_strengths){
                for (const [a, b] of data[category]?.[strength] ?? []){
                    const ref_a = span_to_ref(a)
                    const ref_b = span_to_ref(b)
                    // NOTE The earlier passage is always stored first
                    this._add({category, strength, source: ref_a, target: ref_b,
                        target_is_earlier: false})
                    this._add({category, strength, source: ref_b, target: ref_a,
                        target_is_earlier: true})
                }
            }
        }
    }

    // Add a link to the index of its source passage's book
    _add(link:CrossrefLink){
        const book_links = this._by_book.get(link.source.book) ?? []
        book_links.push({
            ...link,
            start: position(link.source.start_chapter, link.source.start_verse),
            end: position(link.source.end_chapter, link.source.end_verse),
        })
        this._by_book.set(link.source.book, book_links)
    }

    // Get cross-references for a verse: every link whose source passage includes the verse,
    // grouped by category (strongest first), with links starting at the verse itself listed
    // before longer passages that merely include it, then by strength (strongest first)
    get_refs(reference:PassageReference):CrossrefLink[]
    get_refs(book:string, chapter:number, verse:number):CrossrefLink[]
    get_refs(book_or_ref:string|PassageReference, chapter=1, verse=1):CrossrefLink[]{

        // Get book/chapter/verse from ref if given
        let book = book_or_ref as string
        if (typeof book_or_ref !== 'string'){
            book = book_or_ref.book
            chapter = book_or_ref.start_chapter
            verse = book_or_ref.start_verse
        }
        const pos = position(chapter, verse)

        // Collect matches, then rank them
        const matches = (this._by_book.get(book) ?? [])
            .filter(link => link.start <= pos && link.end >= pos)
        const rank = (link:IndexedLink) =>
            crossref_categories.indexOf(link.category) * 2 + (link.start === pos ? 0 : 1)
        return matches
            .sort((a, b) => rank(a) - rank(b)
                || crossref_strengths.indexOf(a.strength) - crossref_strengths.indexOf(b.strength))
            .map(({start: _start, end: _end, ...link}) => link)
    }
}


// A comparable number for a chapter/verse position within a book
function position(chapter:number, verse:number):number{
    return chapter * 1000 + verse
}


// Convert a published span (single verse or range) to a reference
function span_to_ref(span:CrossrefSpan):PassageReference{
    const [book, start_chapter, start_verse, end_chapter, end_verse] = span
    return new PassageReference({
        book,
        start_chapter,
        start_verse,
        end_chapter: end_chapter ?? start_chapter,
        end_verse: end_verse ?? start_verse,
    })
}
