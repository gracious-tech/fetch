
import {escape_html} from './utils'
import type {RuntimeLicense, RuntimeTranslation} from './types'


type ListT<T> = Omit<T, 'list'> & {list:true}
type ListF<T> = Omit<T, 'list'> & {list?:false}

export interface GetPassageOptions {
    list?:boolean
    attribute?:boolean|RuntimeLicense
}

export interface SeparatedVerse {
    id:number
    chapter:number
    verse:number
    html:string
}

export interface SeparatedHeading {
    id:number
    heading:string
}

export interface SeparatedVerseSynced {
    id:number
    chapter:number
    verse:number
    html:string[]
}


export type Verses = (SeparatedVerse|SeparatedHeading)[]
export type SyncedVerses = (SeparatedVerseSynced|SeparatedHeading)[]


// Access to the HTML text of a Bible book
export class BibleBookHtml {

    // @internal
    _translation:RuntimeTranslation
    // @internal
    _html:string

    // @internal
    constructor(translation:RuntimeTranslation, html:string){
        this._translation = translation
        this._html = html
    }

    // Get appropriate text for attribution (defaults to first license, optionally provide one)
    get_attribution(license?:RuntimeLicense):string{
        if (!license){
            license = this._translation.copyright.licenses[0]!  // Always at least one
        }
        const url = this._translation.copyright.attribution_url
        const owner = escape_html(this._translation.copyright.attribution)
        return `
            <p class="fb-rem">
                <a href="${url}" target="_blank">${owner}</a>
                (<a href="${license.url}" target="_blank">license</a>)
            </p>
        `
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

    // Get the HTML for the entire book (as a string or a list of verses)
    get_whole(options:ListT<GetPassageOptions>):Verses
    get_whole(options?:ListF<GetPassageOptions>):string
    get_whole({list, attribute}:GetPassageOptions={}):string|Verses{
        if (list){
            return separate_verses(this._html, this._attribution(attribute))
        }
        return this._html + this._attribution(attribute)
    }

    // Get HTML for a specific passage
    get_passage(start_chapter:number, start_verse:number, end_chapter:number, end_verse:number,
        options:ListT<GetPassageOptions>):Verses
    get_passage(start_chapter:number, start_verse:number, end_chapter:number, end_verse:number,
        options?:ListF<GetPassageOptions>):string
    get_passage(start_chapter:number, start_verse:number, end_chapter:number, end_verse:number,
        {list, attribute}:GetPassageOptions={}):string|Verses{
        // NOTE Simple plain text matching is used as much faster than parsing the HTML
        // NOTE Assumes chapter headings are top-level but verse markers are always within <p>
        // NOTE end_verse can be 0 to signify non-inclusion of the first verse/heading of chapter
        // TODO This code loses classes on <p> when reconstructing etc

        // Confusing non-breaking bugs can occur if strings passed (like '1' + 1 = '11')
        start_chapter = typeof start_chapter === 'number' ? start_chapter : parseInt(start_chapter)
        start_verse = typeof start_verse === 'number' ? start_verse : parseInt(start_verse)
        end_chapter = typeof end_chapter === 'number' ? end_chapter : parseInt(end_chapter)
        end_verse = typeof end_verse === 'number' ? end_verse : parseInt(end_verse)

        // May need to add tags to start/end when extracting mid-paragraph
        let prefix = ''
        let suffix = ''

        // Identify start
        // TODO Include section heading if one is between previous verse and passage start
        let start = 0
        if (start_verse === 1){
            // If starting from the first verse of a chapter include the chapter heading element
            start = this._html.indexOf(`<h3 data-c=${start_chapter}>`)
            if (start === -1){
                return list ? [] : ''  // Chapter number must be higher than available chapters
            }
        } else {
            // Will start from a certain verse within a paragraph so must reconstruct <p> start
            prefix = '<p>'
            const start = this._html.indexOf(`<sup data-v=${start_chapter}:${start_verse}>`)
            if (start === -1){
                return list ? [] : ''  // Verse doesn't exist
            }
        }

        // Identify end
        let end = this._html.length

        if (end_verse === 0){
            // Want to end before end_chapter begins
            end = this._html.indexOf(`<h3 data-c=${end_chapter}>`)
            if (end === -1){
                // end_chapter does not exist (last chapter probably end_chapter-1)
                end = this._html.length
            }
        } else {
            end = this._html.indexOf(`<sup data-v=${end_chapter}:${end_verse + 1}>`)
            if (end !== -1){
                // end_verse is not the last verse of the chapter
                suffix = '</p>'  // TODO Chance of having an empty <p></p> at end due to this
            } else {
                // End verse is the last of the chapter
                end = this._html.indexOf(`<h3 data-c=${end_chapter + 1}>`)
                if (end === -1){
                    // end_verse is last verse of book
                    end = this._html.length
                }
            }
        }

        // Return html
        const result = prefix + this._html.slice(start, end) + suffix
        if (list){
            return separate_verses(result, this._attribution(attribute))
        }
        return result + this._attribution(attribute)
    }

    // Get HTML for multiple chapters
    get_chapters(first:number, last:number, options:ListT<GetPassageOptions>):Verses
    get_chapters(first:number, last:number, options?:ListF<GetPassageOptions>):string
    get_chapters(first:number, last:number, options:GetPassageOptions={}):string|Verses{
        first = typeof first === 'number' ? first : parseInt(first)
        last = typeof last === 'number' ? last : parseInt(last)
        // @ts-ignore possible TS bug
        return this.get_passage(first, 1, last + 1, 0, options)
    }

    // Get HTML for a single chapter
    get_chapter(chapter:number, options:ListT<GetPassageOptions>):Verses
    get_chapter(chapter:number, options?:ListF<GetPassageOptions>):string
    get_chapter(chapter:number, options:GetPassageOptions={}):string|Verses{
        // @ts-ignore possible TS bug
        return this.get_chapters(chapter, chapter, options)
    }

    // Get HTML for a single verse
    get_verse(chapter:number, verse:number, options:Omit<GetPassageOptions, 'list'>={}):string{
        return this.get_passage(chapter, verse, chapter, verse, options)
    }

}


// Access to the USX3+ text of a Bible book
export class BibleBookUsx {

    // @internal
    _translation:RuntimeTranslation
    // @internal
    _usx:string

    // @internal
    constructor(translation:RuntimeTranslation, usx:string){
        this._translation = translation
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
    _translation:RuntimeTranslation
    // @internal
    _usfm:string

    // @internal
    constructor(translation:RuntimeTranslation, usfm:string){
        this._translation = translation
        this._usfm = usfm
    }

    // Get the USFM for the entire book
    get_whole(){
        return this._usfm
    }
}


// Access to the plain text of a Bible book
export class BibleBookTxt {

    // @internal
    _translation:RuntimeTranslation
    // @internal
    _txt:string

    // @internal
    constructor(translation:RuntimeTranslation, txt:string){
        this._translation = translation
        this._txt = txt
    }

    // Get the plain text for the entire book
    get_whole(){
        return this._txt
    }
}


function advance(current:number, target:string, string:string):number{
    // Advance index `current` up to the next detection of `target` or otherwise to the string's end
    const result = string.indexOf(target, current)
    return result === -1 ? string.length : result
}


function separate_verses(html:string, attribution:string){
    // Separate the verses/headings in given HTML into a list

    // Patterns that never change
    const sup_open = '<sup data-v='
    const sup_close = '</sup>'
    const para_open = ['<p ', '<p>']
    const headings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

    // Start at first tag opening
    let i = advance(0, '<', html)

    // Keep track of last item id as needed to calculate ids for headings
    let last_id = 0

    // Keep track of last paragraph tag so can reconstruct for verses
    let last_p = '<p>'

    // Loop until reach end of html string
    const items = [] as (SeparatedVerse|SeparatedHeading)[]
    while (i < html.length){

        // Detect the type of tag have reached
        if (para_open.includes(html.slice(i, i+3))){
            // This is a paragraph
            const p_open_end = advance(i, '>', html) + 1
            last_p = html.slice(i, p_open_end)
            i = p_open_end

        } else if (html.slice(i, i + sup_open.length) === sup_open){
            // This is a verse marker

            // Detect the verse and chapter number
            const sup_open_end = advance(i + sup_open.length, '>', html)
            const vid = html.slice(i + sup_open.length, sup_open_end)
            const [chapter, verse] = vid.split(':').map(part => parseInt(part))
            if (!chapter || !verse){
                // Corrupted verse id so ignore and move on
                i = sup_open_end
                continue
            }

            // Calculate an id for the verse that is reproducible and sortable as a single integer
            // e.g. A heading after Psalm 119:176 -- 119*1000 + 176*10 + 1 = 1191761 (cccvvvh)
            const id = chapter * 10000 + verse * 10

            // Exclude the verse <sup> from the html that will be saved
            const sup_close_end = advance(sup_open_end, sup_close, html) + sup_close.length

            // Must now detect the next heading or verse to know the end of this current verse
            let vend = sup_close_end
            while (vend < html.length){
                // WARN What follows must be same logic as parent loop
                if (para_open.includes(html.slice(vend, vend+3))){
                    const p_open_end = advance(vend, '>', html) + 1
                    last_p = html.slice(vend, p_open_end)
                    vend = p_open_end
                } else if (html.slice(vend, vend + sup_open.length) === sup_open ||
                        headings.includes(html.slice(vend+1, vend+3))){
                    break
                } else {
                    vend = advance(vend+1, '<', html)  // WARN Must +1 to not get stuck at same pos
                }
            }

            // Repair the verse's html by ensuring it has opening and closing paragraph tags
            // NOTE Verse markers are always located within a paragraph
            let verse_html = last_p + html.slice(sup_close_end, vend).trim()
            if (verse_html.endsWith(last_p)){
                // Verse ending straight after starting a new <p> so remove it
                verse_html = verse_html.slice(0, last_p.length * -1)
            } else if (!verse_html.endsWith('</p>')){
                // Need to close the previous <p>
                verse_html += '</p>'
            }

            // Add the verse to the list
            items.push({
                id,
                chapter,
                verse,
                html: verse_html,
            })

            // Update trackers
            i = vend
            last_id = id

        } else if (headings.includes(html.slice(i+1, i+3))){
            // This is a heading

            // Locate end of heading
            const h_close = `</h${html[i+2]!}>`
            const after_h = advance(i, h_close, html) + h_close.length

            // Add one for each consecutive heading (assumed no more than 9!)
            last_id += 1

            // Add to the list
            items.push({
                id: last_id,
                heading: html.slice(i, after_h),
            })

            // Move i to end of the heading
            i = after_h

        } else {
            // Move on to next tag open
            // WARN Must +1 or will simply match same position again
            i = advance(i+1, '<', html)
        }
    }

    // If attribution, append it to the last verse
    if (attribution){
        for (let i = items.length - 1; i >= 0; i--){
            if ('verse' in items[i]!){
                ;(items[i] as SeparatedVerse).html += attribution
                break
            }
        }
    }

    return items
}


// Utility for syncing the verses of multiple translations
export function sync_verses(verses:(SeparatedVerse|SeparatedHeading)[][]):SyncedVerses{

    // Keep track of each translation's index separately in an array
    const indexes = verses.map(() => 0)

    // Keep track of current lowest id
    let lowest = 0

    // Keep adding items until all lists exhausted
    const items = []
    while (lowest < Infinity){

        // Determine the lowest id
        // NOTE This is necessary if other translations have extra or missing verses
        lowest = Math.min(...verses.map((trans_verses, trans) => {

            // Keep going through translation's verses until reach a verse (i.e. skip headings)
            while (indexes[trans]! < trans_verses.length){

                // Consider the item this translation is up to
                const item = trans_verses[indexes[trans]!]!
                if ('heading' in item && trans !== 0){
                    // This is a secondary translation's heading, so skip and try again
                    indexes[trans] += 1
                } else {
                    return item.id
                }
            }

            // If translation's list is exhausted, return Infinity
            return Infinity
        }))

        // If lowest is Infinity then all lists exhausted
        if (lowest === Infinity){
            break
        }

        // If lowest id doesn't end with 0 then it is a heading for the first translation
        if (lowest % 10 !== 0){

            // A heading
            items.push({
                ...(verses[0]![indexes[0]!] as SeparatedHeading),
            })

            // Increment translation's index
            indexes[0] += 1

        } else {
            // A verse

            // Let chapter/verse numbers be set by any one of the translations' matching verses
            let chapter = 0
            let verse = 0

            // Form an array for the html of each matching verse
            const html = indexes.map((index, trans) => {

                // Get the translation's next verse
                const item = verses[trans]![index] as SeparatedVerse|undefined

                // See if the verse matches the current one being considered
                if (item && item.id === lowest){

                    // Ensure chapter/verse set (at least once)
                    chapter = item.chapter
                    verse = item.verse

                    // Increment index for this trans
                    indexes[trans] += 1

                    return item.html
                }

                // This translation doesn't have this verse, so provide empty string
                return ''
            })

            // Add to the list
            items.push({chapter, verse, html, id: lowest})
        }
    }

    return items
}
