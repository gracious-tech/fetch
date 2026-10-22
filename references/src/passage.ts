/* THEORY OF RANGES
    When presented with "Titus", does it refer to the beginning of the book or whole contents?
        E.g. When highlighting verses, should the whole book be highlighted or just first verse?
    Likewise, does "Titus 1" refer to the start of the chapter or the whole chapter?

    This module defaults to assuming "Titus" and "Titus 1" are _identifiers_ rather than ranges
    And if a range is intended, then it should be presented as "Titus 1-3" or "Titus 1:1-16"

    As for the other types, anything with a hyphen is obviously a range (1:1-2, 1-2, 1:1-2:2)
    That only leaves single verses (1:1) which are identifiers and can never be a range
    So it makes sense to consider books and chapters (no hyphens) as identifiers as well

    However, when using methods that expect ranges, book/chapter types ARE interpreted as ranges.
    For example: get_end(), is_after(), includes(), etc.
    These methods treat book as a whole book range, and chapter as a whole chapter range.
*/


import {parse_int} from './utils.js'
import {books_ordered, book_names_english, english_abbrev_include,
    english_abbrev_exclude} from './data.js'
import {last_verse} from './last_verse.js'


export interface PassageArgs {
    book:string
    start_chapter?:number|undefined|null
    start_verse?:number|undefined|null
    end_chapter?:number|undefined|null
    end_verse?:number|undefined|null
}

export type ReferenceType = 'book'|'chapter'|'verse'|'range_verses'|'range_chapters'|'range_multi'

export type BookNamesArg = Record<string, string>|[string, string][]


const single_chapter_books = ['2jn', '3jn', 'jud', 'oba', 'phm']


// Parse verses reference string into an object (but does not validate numbers)
export function _verses_str_to_obj(ref:string){

    // Clean ref
    ref = ref.replace(/ /g, '')  // Remove spaces
        .replace(/\./g, ':').replace(/：/gu, ':')  // Normalise chap/verse seperators to common colon
        .replace(/\p{Dash}/gu, '-')  // Normalise range separators to common hyphen

    // Init props
    let start_chapter:number|undefined
    let start_verse:number|undefined
    let end_chapter:number|undefined
    let end_verse:number|undefined

    if (!ref.includes(':')){
        // Dealing with chapters only
        const parts = ref.split('-')
        start_chapter = parse_int(parts[0]!) ?? undefined
        end_chapter = parse_int(parts[1] ?? '') ?? undefined
    } else {
        // Includes verses
        const parts = ref.split('-')
        const start_parts = parts[0]!.split(':')
        start_chapter = parse_int(start_parts[0]!) ?? undefined
        start_verse = parse_int(start_parts[1]!) ?? undefined  // Has a ':' so has a 2nd part
        if (parts[1]){
            // Is a range
            const end_parts = parts[1].split(':')
            if (end_parts.length > 1){
                // Specifies end chapter
                end_chapter = parse_int(end_parts[0]!) ?? undefined
                end_verse = parse_int(end_parts[1]!) ?? undefined
            } else {
                // End verse is in same chapter
                end_verse = parse_int(end_parts[0]!) ?? undefined
            }
        }
    }

    return {start_chapter, start_verse, end_chapter, end_verse}
}


// Get book USX code from the book name or an abbreviation of it
// This should be language neutral (though some English special cases are included)
// `book_names` is an array so that multiple names for same book can be provided
export function _detect_book(input:string, book_names:[string, string][],
        exclude_book_names:string[]=[], match_from_start=true):string|null{

    // Clean util to be used for both input and book names
    const clean = (string:string) => {
        return string
            .trim().toLowerCase()
            .replace(/^i /, '1').replace('1st ', '1').replace('first ', '1')
            .replace(/^ii /, '2').replace('2nd ', '2').replace('second ', '2')
            .replace(/^iii /, '3').replace('3rd ', '3').replace('third ', '3')
            .replace(/[^\d\p{Letter}]/gui, '')
    }

    // Clean the input
    input = clean(input)
    if (!input){
        return null  // So know have at least 1 char
    }

    // Ignore if excluded
    exclude_book_names = exclude_book_names.map(name => clean(name))
    if (exclude_book_names.includes(input)){
        return null
    }

    // If a direct match to a code, just return it
    // This allows passing a book code when the human name is not available
    if (books_ordered.includes(input)){
        return input
    }

    // Normalise book names and ensure no empty strings
    const normalised = book_names.map(([code, name]) => ([code, clean(name)] as [string, string]))
        .filter(([code, name]) => name)

    // See if input matches or abbreviates any book name
    const matches:[string, string][] = []
    for (const [code, name] of normalised){
        if (input === name){
            return code  // Return straight away if an exact match (even if could prefix multiple)
        } else if (name.startsWith(input)){
            matches.push([code, name])
        }
    }

    // Only return if unique match
    if (matches.length === 1){
        return matches[0]![0]
    } else if (matches.length){
        return null  // Multiple matches so input must be too vague
    }

    // Try fuzzy regex, since vowels are often removed in abbreviations
    // NOTE Constructed regex should be safe as only digits and letters are allowed in input
    let input_regex_str = input.split('').join('.{0,4}')
    if (match_from_start){
        if (['1', '2', '3'].includes(input[0]!)){
            // Must match first two chars from start if first char is a number
            input_regex_str = '^' + input[0]! + input.slice(1).split('').join('.{0,4}')
        } else {
            input_regex_str = '^' + input_regex_str
        }
    }
    const input_regex = new RegExp(input_regex_str)
    const fuzzy_matches = normalised.filter(([code, name]) => input_regex.test(name))
    if (fuzzy_matches.length === 1){
        return fuzzy_matches[0]![0]
    }

    return null
}


export class PassageReference {

    readonly type:ReferenceType
    readonly range:boolean
    readonly book:string
    readonly ot:boolean
    readonly nt:boolean
    readonly start_chapter:number
    readonly start_verse:number
    readonly end_chapter:number
    readonly end_verse:number
    readonly args_valid:boolean  // Whether the original input was valid or not
    readonly _args:PassageArgs  // The args originally given when creating this ref

    /* Force a given passage reference to be valid (providing as much or as little as desired)
    Chapter and verse numbers will be forced to their closest valid equivalent.
    All properties are returned and `type`/`range` signifies what kind of reference it is.
    */
    constructor(book:string, chapter?:number, verse?:number)
    constructor(reference:PassageArgs)
    constructor(book_or_obj:string|PassageArgs, chapter?:number, verse?:number){

        // Normalize args
        if (typeof book_or_obj !== 'string'){
            // Destructure so extraneous properties aren't preserved in `this._args`
            this._args = {
                book: book_or_obj.book,
                start_chapter: book_or_obj.start_chapter,
                start_verse: book_or_obj.start_verse,
                end_chapter: book_or_obj.end_chapter,
                end_verse: book_or_obj.end_verse,
            }
        } else {
            this._args = {
                book: book_or_obj,
                start_chapter: chapter,
                start_verse: verse,
            }
        }

        // Detect what props are provided (will use later)
        const chapters_given = typeof this._args.start_chapter === 'number'
            || typeof this._args.end_chapter === 'number'
        const verses_given = typeof this._args.start_verse === 'number'
            || typeof this._args.end_verse === 'number'

        // Provide defaults
        this.book = this._args.book
        this.start_chapter = this._args.start_chapter ?? 1
        this.start_verse = this._args.start_verse ?? 1
        this.end_chapter = this._args.end_chapter ?? this._args.start_chapter ?? 1
        // If end_chapter given then dealing with whole chapters, otherwise a non-range
        this.end_verse = this._args.end_verse ?? (this._args.end_chapter ? 999 : 1)

        // Validate book
        if (books_ordered.indexOf(this.book) === -1){
            this.book = 'gen'
        }

        // Ensure start chapter is valid
        const last_verse_book = last_verse[this.book]!
        if (this.start_chapter < 1){
            this.start_chapter = 1
            this.start_verse = 1
        } else if (this.start_chapter > last_verse_book.length){
            this.start_chapter = last_verse_book.length
            this.start_verse = last_verse_book[last_verse_book.length-1]!
        }

        // Ensure start verse is valid
        this.start_verse = Math.min(Math.max(this.start_verse, 1),
            last_verse_book[this.start_chapter-1]!)

        // Ensure end is not before start
        if (this.end_chapter < this.start_chapter ||
                (this.end_chapter === this.start_chapter && this.end_verse < this.start_verse)){
            this.end_chapter = this.start_chapter
            this.end_verse = this.start_verse
        }

        // Ensure end chapter is not invalid (already know is same or later than start)
        if (this.end_chapter > last_verse_book.length){
            this.end_chapter = last_verse_book.length
            this.end_verse = last_verse_book[last_verse_book.length-1]!
        }

        // Ensure end verse is valid
        this.end_verse = Math.min(Math.max(this.end_verse, 1), last_verse_book[this.end_chapter-1]!)

        // Determine type
        const chapters_same = this.start_chapter === this.end_chapter
        const verses_same = this.start_verse === this.end_verse
        if (chapters_same && verses_same){
            this.type = chapters_given ? (verses_given ? 'verse' : 'chapter') : 'book'
        } else {
            this.type = chapters_same ? 'range_verses' :
                (verses_given ? 'range_multi': 'range_chapters')
        }

        // Identify if range completes chapters
        if (this.type === 'range_multi' && this.start_verse === 1
                && this.end_verse === last_verse_book[this.end_chapter-1]){
            this.type = 'range_chapters'
        }

        // A chapter for a single chapter book is just the book
        if (single_chapter_books.includes(this.book) && this.type === 'chapter'){
            this.type = 'book'
        }

        // Determine range and testament properties
        this.range = this.type.startsWith('range_')
        this.ot = books_ordered.indexOf(this.book) < 39
        this.nt = !this.ot

        // Determine if original input was valid
        const determine_args_valid = () => {

            // Verify parts stayed same, but only those provided (ignoring undefined)
            if (this._args.book !== this.book){
                return false
            }
            const props = ['start_chapter', 'start_verse', 'end_chapter', 'end_verse'] as const
            for (const prop of props){
                if (Number.isInteger(this._args[prop]) && this._args[prop] !== this[prop]){
                    return false
                }
            }

            // Also fail if provided args don't make sense
            // NOTE Already know that no numbers in ref are 0/false due to above
            if (!this._args.start_chapter && (this._args.end_chapter || this._args.start_verse
                    || this._args.end_verse)){
                return false  // e.g. Matt :1
            }
            if (this._args.end_verse && !this._args.start_verse){
                return false  // e.g. Matt 1:-1
            }
            if (this._args.start_verse && this._args.end_chapter && !this._args.end_verse){
                return false  // e.g. Matt 1:1-2:
            }

            return true
        }
        this.args_valid = determine_args_valid()
    }

    // Parse passage reference string
    // book_names can be a list if a single book has multiple names [["gen", "Genesis"], ...]
    static from_string(reference:string, book_names?:BookNamesArg, exclude_book_names?:string[],
            min_chars=2, match_from_start=true):PassageReference|null{

        // Default to English book names if none given
        // NOTE Don't always include in case creates false positives in some languages
        if (!book_names){
            book_names = [...Object.entries(book_names_english), ...english_abbrev_include]
            if (!exclude_book_names){
                exclude_book_names = [...english_abbrev_exclude]
            }
        }

        // Conform book_names to a list
        const book_names_list = Array.isArray(book_names) ? book_names : Object.entries(book_names)

        // Trim
        reference = reference.trim()

        // Find start of first digit, except if start of string (e.g. 1 Sam)
        let verses_start = reference.slice(1).search(/\d/) + 1
        if (verses_start === 0){  // NOTE +1 above means never -1 and 0 is a no match
            verses_start = reference.length
        }

        // Fail if book string is less than min chars
        // Check before cleaning the value so that "So. 1" works but "So 1" doesn't (if min were 3)
        const book_str = reference.slice(0, verses_start).trim()
        if (book_str.length < min_chars){
            return null
        }

        // If book can be parsed, ref is valid even if verse range can't be parsed
        const book_code = _detect_book(book_str, book_names_list, exclude_book_names,
            match_from_start)
        if (!book_code){
            return null
        }

        // Parse verses
        const verses_str = reference.slice(verses_start)
        let verses = _verses_str_to_obj(verses_str)

        // Interpret single digits as verses for single chapter books
        if (single_chapter_books.includes(book_code) && verses.start_chapter
                && verses.start_verse === undefined && verses.end_verse === undefined){
            verses = _verses_str_to_obj('1:' + verses_str)
        }

        return new PassageReference({book: book_code, ...verses})
    }

    // Return a new reference that extends from start of first ref to end of second ref
    // NOTE get_end() used so that book/chapter types are treated as ranges
    static from_refs(start:PassageReference, end:PassageReference){
        const actual_end = end.get_end()  // Treat book/chapter types as ranges
        return new PassageReference({
            book: start.book,
            start_chapter: start.start_chapter,
            start_verse: start.start_verse,
            end_chapter: actual_end.end_chapter,
            end_verse: actual_end.end_verse,
        })
    }

    // Restore reference from serialized form
    // While deserializing using `from_string()` works, this method is faster & never returns null
    static from_serialized(code:string){
        const book = code.slice(0, 3)
        const verses = code.slice(3)
        return new PassageReference({book, ..._verses_str_to_obj(verses)})
    }

    // Get name for book (defaults to English when book names not provided)
    get_book_string(book_names:Record<string, string>={}):string{
        // WARN A value may be undefined or empty string
        return book_names[this.book] || book_names_english[this.book]!
    }

    // Get string representation of verses
    get_verses_string(verse_sep=':', range_sep='-'):string{

        if (this.type === 'book'){
            return ''
        } else if (this.type === 'chapter'){
            return `${this.start_chapter}`
        } else if (this.type === 'range_chapters'){
            return `${this.start_chapter}${range_sep}${this.end_chapter}`
        } else if (this.type === 'verse'){
            return `${this.start_chapter}${verse_sep}${this.start_verse}`
        }

        // Other ranges
        let out = `${this.start_chapter}${verse_sep}${this.start_verse}${range_sep}`
        if (this.end_chapter !== this.start_chapter){
            out += `${this.end_chapter}${verse_sep}`
        }
        return out + `${this.end_verse}`
    }

    // Format passage reference to a readable string
    toString(book_names:Record<string, string>={}, verse_sep=':', range_sep='-'):string{
        const out = this.get_book_string(book_names) + ' '
            + this.get_verses_string(verse_sep, range_sep)
        return out.trim()
    }

    // Serialize reference to string that can be restored by `from_serialized()`
    to_serialized(){
        return this.book + this.get_verses_string()
    }

    // Whether this reference is the same as the one provided
    equals(ref:PassageReference):boolean{
        return this.type === ref.type
            && this.book === ref.book
            && this.start_chapter === ref.start_chapter
            && this.start_verse === ref.start_verse
            && this.end_chapter === ref.end_chapter
            && this.end_verse === ref.end_verse
    }

    // Whether this reference ends before the given reference starts (no overlap)
    // NOTE 'book'/'chapter' types are interpreted as ranges for this
    is_before(chapter:number, verse:number):boolean
    is_before(ref:PassageReference):boolean
    is_before(chapter_or_ref:number|PassageReference, verse?:number):boolean{
        const ref = typeof chapter_or_ref === 'number'
            ? new PassageReference(this.book, chapter_or_ref, verse) : chapter_or_ref
        if (this.book !== ref.book){
            return books_ordered.indexOf(this.book) < books_ordered.indexOf(ref.book)
        }
        const this_end = this.get_end()  // Treat book/chapter types as ranges
        return this_end.end_chapter < ref.start_chapter
            || (this_end.end_chapter === ref.start_chapter && this_end.end_verse < ref.start_verse)
    }

    // Whether this reference starts after the given reference ends (no overlap)
    // NOTE 'book'/'chapter' types are interpreted as ranges for this
    is_after(chapter:number, verse:number):boolean
    is_after(ref:PassageReference):boolean
    is_after(chapter_or_ref:number|PassageReference, verse?:number):boolean{
        const ref = typeof chapter_or_ref === 'number'
            ? new PassageReference(this.book, chapter_or_ref, verse) : chapter_or_ref
        if (this.book !== ref.book){
            return books_ordered.indexOf(this.book) > books_ordered.indexOf(ref.book)
        }
        const ref_end = ref.get_end()  // Treat book/chapter types as ranges
        return this.start_chapter > ref_end.end_chapter
            || (this.start_chapter === ref_end.end_chapter && this.start_verse > ref_end.end_verse)
    }

    // Whether this reference includes all verses of given reference
    // NOTE 'book'/'chapter' types are interpreted as ranges for this
    includes(chapter:number, verse:number):boolean
    includes(ref:PassageReference):boolean
    includes(chapter_or_ref:number|PassageReference, verse?:number):boolean{
        const ref = typeof chapter_or_ref === 'number'
            ? new PassageReference(this.book, chapter_or_ref, verse) : chapter_or_ref
        // ref must not start before `this`, and must not end after `this`
        // NOTE get_start/get_end needed — without them is_before/is_after compares ref's end/start,
        //      so a ref that overlaps but isn't fully contained would pass the check incorrectly
        return !ref.get_start().is_before(this) && !ref.get_end().is_after(this)
    }

    // Whether this reference shares any verses with the given reference
    // NOTE 'book'/'chapter' types are interpreted as ranges for this
    overlaps(ref:PassageReference):boolean{
        return !this.is_before(ref) && !this.is_after(ref)
    }

    // Get the total number of verses included in the range
    total_verses(){

        // If a book or chapter, will expect range even though they are identifiers
        const {end_chapter, end_verse} = this.get_end()

        // Handle same chapter case
        if (this.start_chapter === end_chapter){
            return end_verse - this.start_verse + 1
        }

        // First add verses from first chapter
        const last_verse_book = last_verse[this.book]!
        let count = last_verse_book[this.start_chapter-1]! - this.start_verse + 1

        // Then add verses from middle chapters
        for (let ch=this.start_chapter+1; ch < end_chapter; ch++){
            count += last_verse_book[ch-1]!
        }

        // Finally add verses from last chapter
        return count + end_verse
    }

    // Get a reference for just the start verse of this reference (no effect if single verse)
    get_start(){
        return new PassageReference({
            book: this.book,
            start_chapter: this.start_chapter,
            start_verse: this.start_verse,
        })
    }

    // Get a reference for just the end verse of this reference (no effect if single verse)
    // NOTE 'book'/'chapter' types are interpreted as ranges for this
    get_end(){
        const last_verse_book = last_verse[this.book]!
        if (this.type === 'book'){
            // User will expect end of book, even though this type is an identifier and not range
            return new PassageReference({
                book: this.book,
                start_chapter: last_verse_book.length,
                start_verse: last_verse_book[last_verse_book.length-1],
            })
        } else if (this.type === 'chapter'){
            // User will expect end of chapter, even though this type is an identifier and not range
            return new PassageReference({
                book: this.book,
                start_chapter: this.start_chapter,
                start_verse: last_verse_book[this.start_chapter-1],
            })
        }
        return new PassageReference({
            book: this.book,
            start_chapter: this.end_chapter,
            start_verse: this.end_verse,
        })
    }

    // Get a reference for the verse previous to this one (accounting for chapters)
    // It can optionally be relative to the end verse, but a range is never returned (single verse)
    // NOTE 'book'/'chapter' types are interpreted as ranges for this
    get_prev_verse(prev_to_end=false):PassageReference|null{

        // Optionally relative to end rather than start (use get_end() in case book/chapter type)
        const end = prev_to_end ? this.get_end() : null
        let chapter = end ? end.end_chapter : this.start_chapter
        let verse = end ? end.end_verse : this.start_verse

        // Ensure action possible
        if (chapter === 1 && verse === 1){
            return null
        }

        // Go back a verse
        if (verse === 1){
            chapter -= 1
            verse = last_verse[this.book]![chapter-1]!
        } else {
            verse -= 1
        }

        return new PassageReference({
            book: this.book,
            start_chapter: chapter,
            start_verse: verse,
        })
    }

    // Get a reference for the verse after this one (accounting for chapters)
    // It can optionally be relative to the end verse, but a range is never returned (single verse)
    // NOTE 'book'/'chapter' types are interpreted as ranges for this
    get_next_verse(after_end=false):PassageReference|null{

        // Optionally relative to end rather than start (use get_end() in case book/chapter type)
        const end = after_end ? this.get_end() : null
        let chapter = end ? end.end_chapter : this.start_chapter
        let verse = end ? end.end_verse : this.start_verse

        // Ensure action possible
        const last_verse_book = last_verse[this.book]!
        if (chapter === last_verse_book.length
                && verse === last_verse_book[last_verse_book.length-1]){
            return null
        }

        // Go forward a verse
        if (verse === last_verse_book[chapter-1]){
            chapter += 1
            verse = 1
        } else {
            verse += 1
        }

        return new PassageReference({
            book: this.book,
            start_chapter: chapter,
            start_verse: verse,
        })
    }

    // Return new object that collapses ranges to a book/chapter type if possible
    // NOTE This is not done automatically in constructor since book/chapter types are identifiers
    //      and can refer to e.g. navigating to a chapter rather than selecting its contents
    simplify():PassageReference {
        const last_verse_book = last_verse[this.book]!

        // If range_verses (single chapter) covers whole chapter, convert to chapter type
        if (this.type === 'range_verses' && this.start_verse === 1
                && this.end_verse === last_verse_book[this.start_chapter-1]){
            return new PassageReference(this.book, this.start_chapter)
        }

        // If range_chapters covers whole book, convert to book type
        if (this.type === 'range_chapters' && this.start_chapter === 1
                && this.end_chapter === last_verse_book.length){
            return new PassageReference(this.book)
        }

        return this
    }
}
