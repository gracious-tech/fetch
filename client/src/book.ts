
// Access to the HTML text of a Bible book
export class BibleBookHtml {

    // @internal
    _html:string

    // @internal
    constructor(html:string){
        this._html = html
    }

    // Get the HTML for the entire book
    get_whole(){
        return this._html
    }

    // Get HTML for a specific passage
    get_passage(start_chapter:number, start_verse:number, end_chapter:number, end_verse:number)
            :string|null{
        // NOTE Simple plain text matching is used as much faster than parsing the HTML
        // NOTE Assumes chapter headings are top-level but verse markers are always within <p>
        // NOTE end_verse can be 0 to signify non-inclusion of the first verse/heading of chapter

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
            const data_ch = this._html.indexOf(`data-chapter="${start_chapter}"`)
            if (data_ch === -1){
                return null  // Chapter number must be higher than available chapters
            }
            start = this._html.indexOf('</h2>', data_ch) + '</h2>'.length
        } else {
            // Will start from a certain verse within a paragraph so must reconstruct <p> start
            prefix = '<p>'  // TODO Confirm will always be a <p>
            const data_v = this._html.indexOf(`data-verse="${start_chapter}:${start_verse}"`)
            if (data_v === -1){
                return null  // Verse doesn't exist
            }
            start = this._html.lastIndexOf('<sup ', data_v)
        }

        // Identify end
        let end = this._html.length

        if (end_verse === 0){
            // Want to end before end_chapter begins
            const data_ch = this._html.indexOf(`data-chapter="${end_chapter}"`)
            if (data_ch !== -1){
                // end_chapter exists
                end = this._html.lastIndexOf('<h2 ', data_ch)
            } else {
                // end_chapter does not exist (last chapter probably end_chapter-1)
            }
        } else {
            const end_verse_plus1 =
                this._html.indexOf(`data-verse="${end_chapter}:${end_verse + 1}"`)
            if (end_verse_plus1 !== -1){
                // end_verse is not the last verse of the chapter
                suffix = '</p>'  // TODO Chance of having an empty <p></p> at end due to this
                end = this._html.lastIndexOf('<sup ', end_verse_plus1)
            } else {
                const end_chapter_plus1 = this._html.indexOf(`data-chapter="${end_chapter + 1}"`)
                if (end_chapter_plus1 !== -1){
                    // end_verse is last verse of chapter but not of book
                    end = this._html.lastIndexOf('<h2 ', end_chapter_plus1)
                } else {
                    // end_verse is last verse of book
                }
            }
        }

        // Return html
        return prefix + this._html.slice(start, end) + suffix
    }

    // Get HTML for multiple chapters
    get_chapters(first:number, last:number){
        first = typeof first === 'number' ? first : parseInt(first)
        last = typeof last === 'number' ? last : parseInt(last)
        return this.get_passage(first, 1, last + 1, 0)
    }

    // Get HTML for a single chapter
    get_chapter(chapter:number){
        return this.get_chapters(chapter, chapter)
    }

}


// Access to the USX3+ text of a Bible book
export class BibleBookUsx {

    // @internal
    _usx:string

    // @internal
    constructor(usx:string){
        this._usx = usx
    }

    // Get the USX for the entire book
    get_whole(){
        return this._usx
    }
}
