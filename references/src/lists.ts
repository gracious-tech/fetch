
import {PassageReference} from './passage'
import {books_ordered} from './data.js'


// Sorts a list of references by verse in canonical order (or preserve existing book order)
export function sort_references(refs:PassageReference[], canonical=true):PassageReference[]{

    // When not canonical, preserve existing book order by recording first appearance index per book
    const book_first_index = new Map<string, number>()
    if (!canonical){
        refs.forEach((ref, i) => {
            if (!book_first_index.has(ref.book)){
                book_first_index.set(ref.book, i)
            }
        })
    }

    // Return new array
    return refs.slice().sort((a, b) => {

        // Sort by book order
        const book_diff = canonical
            ? books_ordered.indexOf(a.book) - books_ordered.indexOf(b.book)
            : book_first_index.get(a.book)! - book_first_index.get(b.book)!
        if (book_diff !== 0){
            return book_diff
        }

        // Sort by start chapter, then start verse
        if (a.start_chapter !== b.start_chapter){
            return a.start_chapter - b.start_chapter
        }
        if (a.start_verse !== b.start_verse){
            return a.start_verse - b.start_verse
        }

        // Same start verse, so sort by end position (smallest to largest)
        // NOTE It's expected for book and chapter types to end at their first verse
        //      E.g. Gen, Gen 2, Gen 2:2 and not Gen 2:2, Gen 2, Gen
        if (a.end_chapter !== b.end_chapter){
            return a.end_chapter - b.end_chapter
        }
        return a.end_verse - b.end_verse
    })
}


// Returns references merged where possible, keeping merged refs at the position of the earlier ref
export function simplify_references(refs:PassageReference[]):PassageReference[]{

    const result:PassageReference[] = []

    for (const ref of refs){

        // Find an earlier result entry that overlaps or is adjacent (no gap in either direction)
        const merge_i = result.findIndex(prev => {
            // Checking prev verse for both ensures order doesn't matter
            return prev.overlaps(ref)
                || ref.get_prev_verse()?.overlaps(prev) || prev.get_prev_verse()?.overlaps(ref)
        })

        // Just append if can't merge
        if (merge_i === -1){
            result.push(ref.simplify())
            continue
        }

        // Determine which ref contributes the start and end of the merged result
        const prev = result[merge_i]!
        const start_ref = prev.get_start().is_after(ref.get_start()) ? ref : prev
        const end_ref = ref.get_end().is_after(prev) ? ref : prev

        // Construct merged ref then simplify in case needed
        result[merge_i] = PassageReference.from_refs(start_ref, end_ref).simplify()
    }

    return result
}


// Render a list of references to string, making representation succinct where possible
// E.g. Matt 1:1-2, Matt 1:5, Matt 5, Gen 1 -> Matt 1:1-2, 5; 5; Gen 1
export function references_to_string(refs:PassageReference[], book_names:Record<string, string>={},
        verse_sep=':', range_sep='-', chapter_sep='; '):string{

    let result = ''
    let current_book:string|null = null
    let current_chapter:number|null = null

    for (const ref of refs){

        const same_book = ref.book === current_book
        const verse_level = ref.type === 'verse' || ref.type === 'range_verses'
        const same_chapter = same_book && ref.start_chapter === current_chapter && verse_level

        // Determine separator and display string based on shared context with previous ref
        let sep:string
        let display:string
        if (result === ''){
            sep = ''
            display = ref.toString(book_names, verse_sep, range_sep)
        } else if (same_chapter){
            // Same book and chapter — show only the verse(s), no chapter prefix
            sep = ', '
            display = ref.type === 'verse'
                ? `${ref.start_verse}`
                : `${ref.start_verse}${range_sep}${ref.end_verse}`
        } else if (same_book){
            // Same book, different chapter — omit book name
            sep = chapter_sep
            display = ref.get_verses_string(verse_sep, range_sep)
        } else {
            // Different book — show full reference
            sep = chapter_sep
            display = ref.toString(book_names, verse_sep, range_sep)
        }

        result += sep + display

        // Update context to track what was last rendered
        current_book = ref.book
        current_chapter = ref.start_chapter
    }

    return result
}
