
import {PassageReference} from '@gracious.tech/bible-references'

import {escape_html, escape_typst, num_to_letters} from '../assets/utils.js'

import type {RuntimeLicense, RuntimeCopyright} from '../assets/types.js'
import type {BibleJsonTxt, TxtContent,
} from '../assets/shared_types.js'


export interface GetMarkupOptions {
    attribute?:boolean|RuntimeLicense
}

export type GetHtmlOptions = GetMarkupOptions

export type GetTypstOptions = GetMarkupOptions

export interface GetTxtOptions {
    attribute?:boolean|RuntimeLicense
    verse_nums?:boolean
    headings?:boolean
    notes?:boolean
}

export interface IndividualVerse<T> {
    id:number
    chapter:number
    verse:number
    content:T
}


// @internal
function validate_ref(start_chapter:number, start_verse:number, end_chapter:number,
        end_verse:number):void{
    // NOTE It's ok to give a range that doesn't exist, as long as values are logical

    // General validation
    for (const arg of [start_chapter, start_verse, end_chapter, end_verse]){
        // Confusing non-breaking bugs can occur if strings passed (like '1' + 1 = '11')
        if (typeof arg !== 'number'){
            throw new Error("Chapter/verse arguments must all be numbers")
        } else if (arg < 0){
            throw new Error("Chapter/verse arguments cannot be negative")
        }
    }

    // Ensure start is before end
    if (start_chapter > end_chapter
            || (start_chapter === end_chapter && start_verse > end_verse)){
        throw new Error("Passage end is less than passage start")
    }
}


// @internal
function _get_list<T>(contents:T[][][], start_chapter=1, start_verse=1, end_chapter?:number,
        end_verse?:number):IndividualVerse<T[]>[][]{
    // Get list of individual verses with metadata, grouped by chapter
    // NOTE end_verse can be 0 to signify non-inclusion of the first verse/heading of chapter
    // TODO Option for splitting at clean paragraph breaks (where new verse starts next para)

    // Default to ending at end of book
    if (!end_chapter){
        end_chapter = contents.length
        end_verse = 0
    } else if (typeof end_verse !== 'number'){  // WARN May be 0 which is valid
        end_chapter += 1
        end_verse = 0
    }

    // Validate
    validate_ref(start_chapter, start_verse, end_chapter, end_verse)

    // Util for creating objects from verse data
    const get_verses_for_ch = (chapter:number, start:number, end?:number) => {
        const verses = contents[chapter]?.slice(start, end && end + 1) ?? []
        return verses.map((verse, i) => {
            const verse_num = start + i
            return {
                // Calculate an id for the verse that is reproducible and sortable
                // e.g. Psalm 119:176 = 119176 (cccvvv)
                id: chapter * 1000 + verse_num,
                chapter,
                verse: verse_num,
                content: verse,
            }
        })
    }

    // If range is within a single chapter, need to limit how much is taken from it
    const same_ch_end_verse = start_chapter === end_chapter ? end_verse : undefined

    // Add verses of start chapter
    const verses = [get_verses_for_ch(start_chapter, start_verse, same_ch_end_verse)]

    // Add inbetween chapters
    for (let ch = start_chapter + 1; ch < end_chapter; ch++){
        verses.push(get_verses_for_ch(ch, 1))
    }

    // Add verses of end chapter
    if (end_chapter > start_chapter){
        verses.push(get_verses_for_ch(end_chapter, 1, end_verse))
    }

    return verses.filter(verses_for_ch => verses_for_ch.length)
}


// @internal
function _ref_to_get_list_args(ref:PassageReference){
    // PassageReference objects will have exact numbers except for `book` and `chapter`
    let end_chapter:number|undefined = ref.end_chapter
    let end_verse:number|undefined = ref.end_verse
    if (ref.type === 'book'){
        // `get_list()` defaults to going to end of book when no end given
        end_chapter = undefined
        end_verse = undefined
    } else if (ref.type === 'chapter'){
        // `get_list()` accepts 0 for end_verse to finish at end of previous chapter
        end_chapter += 1
        end_verse = 0
    }
    return [ref.start_chapter, ref.start_verse, end_chapter, end_verse]
}


// @internal
// Shared base for markup formats (HTML, Typst) whose verses are [before, body, after] fragments
abstract class BibleBookMarkup {

    // @internal
    _copyright:RuntimeCopyright|undefined
    // @internal
    _content:{contents:string[][][]}

    // @internal
    constructor(json:string, copyright?:RuntimeCopyright){
        this._copyright = copyright
        this._content = JSON.parse(json) as {contents:string[][][]}
    }

    // Get appropriate text for attribution (format depends on the subclass)
    abstract get_attribution(license?:RuntimeLicense):string

    // @internal
    // Wrap a chapter's markup (subclasses may add a format-specific wrapper; default is none)
    _wrap_chapter(chapter:number, inner:string):string{
        return inner
    }

    // @internal
    _attribution(license:RuntimeLicense|boolean|undefined):string{
        // Helper for getting (or not getting) attribution string based on attribute arg
        // NOTE Defaults to including attribution unless explicitly set to false
        if (license === false){
            return ''
        }
        return this.get_attribution((!license || license === true) ? undefined : license)
    }

    // Get the markup for the entire book
    get_whole({attribute}:GetMarkupOptions={}):string{
        return this._content.contents.flat().map(v => v[1]).join('') + this._attribution(attribute)
    }

    // Get markup for a specific passage
    get_passage(start_chapter:number, start_verse:number, end_chapter:number, end_verse:number,
            options:GetMarkupOptions={}):string{
        const chapters =
            _get_list(this._content.contents, start_chapter, start_verse, end_chapter, end_verse)
        if (!chapters.length){
            return ''
        }

        // Wrap each chapter in a div so users can style entire chapters at a time
        // NOTE Not possible for verses since they flow across paragraphs
        let out = ''
        for (const verses_for_ch of chapters){
            const inner = verses_for_ch[0]!.content[0]!
                + verses_for_ch.map(v => v.content[1]).join('')
                + verses_for_ch[verses_for_ch.length-1]!.content[2]!
            out += this._wrap_chapter(verses_for_ch[0]!.chapter, inner)
        }
        return out + this._attribution(options.attribute)
    }

    // Get markup for a specific passage specified by a PassageReference object
    get_passage_from_ref(ref:PassageReference, options:GetMarkupOptions={}):string{
        if (ref.type === 'book'){
            return this.get_whole(options)
        }
        if (ref.type === 'chapter' || ref.type === 'range_chapters'){
            return this.get_chapters(ref.start_chapter, ref.end_chapter, options)
        }
        return this.get_passage(ref.start_chapter, ref.start_verse, ref.end_chapter, ref.end_verse,
            options)
    }

    // Get markup for multiple chapters
    get_chapters(first:number, last:number, options:GetMarkupOptions={}):string{
        if (typeof first !== 'number' || typeof last !== 'number'){
            throw new Error("First/last chapters must be numbers")  // Protect against '1' + 1 = 11
        }
        return this.get_passage(first, 1, last + 1, 0, options)
    }

    // Get markup for a single chapter
    get_chapter(chapter:number, options:GetMarkupOptions={}):string{
        // @ts-ignore possible TS bug
        return this.get_chapters(chapter, chapter, options)
    }

    // Get markup for a single verse
    get_verse(chapter:number, verse:number, options:GetMarkupOptions={}):string{
        return this.get_passage(chapter, verse, chapter, verse, options)
    }

    // Get markup as an array of individual verses (each verse will be in its own paragraph)
    get_list(start_chapter?:number, start_verse?:number, end_chapter?:number, end_verse?:number)
            :IndividualVerse<string>[]{
        return _get_list(this._content.contents, start_chapter, start_verse, end_chapter, end_verse)
            .flat().map(verse => {
                return {
                    ...verse,
                    content: verse.content.join(''),  // Join ends to form valid paragraph
                }
            })
    }

    // Get markup as an array of individual verses by passing a PassageReference object
    get_list_from_ref(ref:PassageReference):IndividualVerse<string>[]{
        return this.get_list(..._ref_to_get_list_args(ref))
    }
}


// Access to the HTML text of a Bible book
export class BibleBookHtml extends BibleBookMarkup {

    // Get appropriate text for attribution (defaults to first license, optionally provide one)
    get_attribution(license?:RuntimeLicense):string{
        if (!this._copyright){
            return ''  // Copyright not provided when creating instance (only by manual use)
        }
        if (!license){
            license = this._copyright.licenses[0]!  // Always at least one
        }
        const url = this._copyright.attribution_url
        const owner = escape_html(this._copyright.attribution)
        const license_name = escape_html(license.name)
        // NOTE Use <div> so <p> is reserved for actual bible content
        return `
            <div class="fb-attribution">
                <a href="${url}" target="_blank">${owner}</a>
                (<a href="${license.url}" target="_blank">${license_name}</a>)
            </div>
        `
    }

    // @internal
    // Wrap each chapter in a div so users can style entire chapters at a time
    // NOTE Not possible for verses since they flow across paragraphs
    override _wrap_chapter(chapter:number, inner:string):string{
        return `<div class="fb-chapter" data-c="${chapter}">${inner}</div>`
    }
}


// Access to the Typst markup of a Bible book (for compiling to print/PDF)
export class BibleBookTypst extends BibleBookMarkup {

    // Get appropriate text for attribution (defaults to first license, optionally provide one)
    get_attribution(license?:RuntimeLicense):string{
        if (!this._copyright){
            return ''  // Copyright not provided when creating instance (only by manual use)
        }
        if (!license){
            license = this._copyright.licenses[0]!  // Always at least one
        }
        return escape_typst(`\n\n[${license.name} - ${this._copyright.attribution}]\n`)
    }
}


// Access to the USX3+ text of a Bible book
export class BibleBookUsx {

    // @internal
    _copyright:RuntimeCopyright|undefined
    // @internal
    _usx:string

    // @internal
    constructor(usx:string, copyright?:RuntimeCopyright){
        this._copyright = copyright
        this._usx = usx
    }

    // Get the USX for the entire book
    get_whole(){
        return this._usx
    }
}


// Access to the USFM text of a Bible book
export class BibleBookUsfm {

    // @internal
    _copyright:RuntimeCopyright|undefined
    // @internal
    _usfm:string

    // @internal
    constructor(usfm:string, copyright?:RuntimeCopyright){
        this._copyright = copyright
        this._usfm = usfm
    }

    // Get the USFM for the entire book
    get_whole(){
        return this._usfm
    }
}


// Convert a plain text array to a Markdown string
function txt_array_to_markdown(contents:TxtContent[], headings=true, notes=true):string{

    // Collect footnotes for later appending
    const footnotes:string[] = []

    // Convert all elements to strings
    let result = contents.map(part => {
        if (typeof part === 'string'){
            return part
        } else if (part.type === 'heading' && headings){
            return '\n' + '#'.repeat(part.level) + ' ' + part.contents
        } else if (part.type === 'note' && notes){
            footnotes.push(part.contents)
            const note_letter = num_to_letters(footnotes.length)
            return `[^${note_letter}]`
        }
        return ''  // Ignore
    }).join('')

    // Append footnotes if any
    if (footnotes.length){
        result += '\n\n\n\n'
        result += footnotes.map((note, i) => `[^${num_to_letters(i+1)}]: ${note}`).join('\n')
    }

    return result
}


// Access to the plain text of a Bible book (will be Markdown if headings/notes enabled)
export class BibleBookTxt {

    // @internal
    _copyright:RuntimeCopyright|undefined
    // @internal
    _txt:BibleJsonTxt

    // @internal
    constructor(txt:string, copyright?:RuntimeCopyright){
        this._copyright = copyright
        this._txt = JSON.parse(txt) as BibleJsonTxt
    }

    // Get appropriate text for attribution (defaults to first license, optionally provide one)
    get_attribution(license?:RuntimeLicense):string{
        if (!this._copyright){
            return ''  // Copyright not provided when creating instance (only by manual use)
        }
        if (!license){
            license = this._copyright.licenses[0]!  // Always at least one
        }
        return `\n\n\n\n[${license.name} - ${this._copyright.attribution}]`
    }

    // @internal
    _attribution(license:RuntimeLicense|boolean|undefined):string{
        // Helper for getting (or not getting) attribution string based on attribute arg
        // NOTE Defaults to including attribution unless explicitly set to false
        if (license === false){
            return ''
        }
        return this.get_attribution((!license || license === true) ? undefined : license)
    }

    // Get the contents of entire book
    get_whole(options:GetTxtOptions={}):string{
        return this.get_passage(1, 1, this._txt.contents.length, 0, options)
    }

    // Get txt for a specific passage
    get_passage(start_chapter:number, start_verse:number, end_chapter:number, end_verse:number,
        options:GetTxtOptions={}):string{
        // NOTE end_verse can be 0 to signify non-inclusion of the first verse of chapter

        // Validate
        validate_ref(start_chapter, start_verse, end_chapter, end_verse)

        // Util for auto-adding verse numbers
        const get_verses_for_ch = (chapter:number, start:number, end?:number)
                :TxtContent[][] => {

            // Get the verses
            const verses = this._txt.contents[chapter]?.slice(start, end && end + 1) ?? []
            if (!options.verse_nums){
                return verses
            }

            // Auto-prefix each verse with a verse ref
            return verses.map((verse, i) => {
                let ref = ''
                const verse_num = start + i
                // Add chapter num too if first verse of range or of chapter (so 0 start still ok)
                if (verse_num === 1 || (start > 1 && i === 0)){
                    ref += `${chapter}:`
                }
                ref += verse_num
                ref = `[${ref}] `
                return [ref, ...verse]  // Deconstruct verse to avoid modifying original array
            })
        }

        // If range is within a single chapter, need to limit how much is taken from it
        const same_ch_end_verse = start_chapter === end_chapter ? end_verse : undefined

        // Add verses of start chapter
        const verses = get_verses_for_ch(start_chapter, start_verse, same_ch_end_verse)

        // Add inbetween chapters
        for (let ch = start_chapter + 1; ch < end_chapter; ch++){
            verses.push(...get_verses_for_ch(ch, 1))
        }

        // Add verses of end chapter
        if (end_chapter > start_chapter){
            verses.push(...get_verses_for_ch(end_chapter, 1, end_verse))
        }

        // Merge into single string
        const result = txt_array_to_markdown(verses.flat(), options.headings, options.notes)
        return result + this._attribution(options.attribute)
    }

    // Get txt for a specific passage specified by a PassageReference object
    get_passage_from_ref(ref:PassageReference, options:GetTxtOptions={}):string{
        if (ref.type === 'book'){
            return this.get_whole(options)
        }
        if (ref.type === 'chapter' || ref.type === 'range_chapters'){
            return this.get_chapters(ref.start_chapter, ref.end_chapter, options)
        }
        return this.get_passage(ref.start_chapter, ref.start_verse, ref.end_chapter, ref.end_verse,
            options)
    }

    // Get txt for multiple chapters
    get_chapters(first:number, last:number, options:GetTxtOptions={}):string{
        if (typeof first !== 'number' || typeof last !== 'number'){
            throw new Error("First/last chapters must be numbers")  // Protect against '1' + 1 = 11
        }
        return this.get_passage(first, 1, last + 1, 0, options)
    }

    // Get txt for a single chapter
    get_chapter(chapter:number, options:GetTxtOptions={}):string{
        return this.get_chapters(chapter, chapter, options)
    }

    // Get txt for a single verse
    get_verse(chapter:number, verse:number, options:GetTxtOptions={}):string{
        return this.get_passage(chapter, verse, chapter, verse, options)
    }

    // Get txt as an array of individual verses
    get_list(start_chapter?:number, start_verse?:number, end_chapter?:number, end_verse?:number)
            :IndividualVerse<TxtContent[]>[]{
        return _get_list(this._txt.contents, start_chapter, start_verse, end_chapter, end_verse)
            .flat()
    }

    // Get txt as an array of individual verses by passing a PassageReference object
    get_list_from_ref(ref:PassageReference):IndividualVerse<TxtContent[]>[]{
        return this.get_list(..._ref_to_get_list_args(ref))
    }
}


export type BibleBook = BibleBookHtml|BibleBookTxt|BibleBookUsfm|BibleBookUsx|BibleBookTypst
