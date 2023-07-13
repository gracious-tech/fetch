import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { select } from 'xpath'
// Types

interface MultiVerseNote {
    start_c:number
    start_v:number
    end_c:number
    end_v:number
    contents:string  // HTML
}

interface StudyNotes {
    verses:Record<number, Record<number, string>>  // Single verses organised by chapter and verse
    ranges:MultiVerseNote[]  // Notes that span multiple verses and/or chapters
}

/**
 * Extract the study notes XML and prepare for JSON conversion
 *
 * @param xml The XML to parse
 *
 * @returns The data to be converted to JSON
 */
export function study_notes_to_json(xml:string):Record<string, StudyNotes> {
    // Set up the intial data with empty values. We want to be in book order
    const output:Record<string, StudyNotes> = {}
    // tyndale_to_usx_book is defined at the bottom of the file
    for (const tyndale_book of Object.keys(tyndale_to_usx_book)) {
        // Result is keyed by USX ids, not Tyndale's
        output[tyndale_to_usx_book[tyndale_book]!] = {
            verses: {},
            ranges: [],
        }
    }
    // Parse the XML
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const elements = select('//item', doc) as Element[]
    const serializer = new XMLSerializer()
    elements.forEach((element: Element) => {
        const name = element.getAttribute('name') ?? ''
        const reference = extract_reference(name)
        if ((!reference) || (reference.usx === '')) {
            // Move on. Unable to determine reference
            return
        }
        const body_element = select('body/p', element)[0] as Element
        let body = (body_element !== undefined) ? serializer.serializeToString(body_element) : ''
        body = clean_note(body)
        if (!reference.is_range) {
            // Handle single verse
            const note: Record<number, string> = {}
            note[reference.start_verse] = body
            output[reference.usx]!.verses[reference.start_chapter] = note
        } else {
            // Range of verses
            const note: MultiVerseNote = {
                start_c: reference.start_chapter,
                start_v: reference.start_verse,
                end_c: reference.end_chapter,
                end_v: reference.end_verse,
                contents: body,
            }
            output[reference.usx]!.ranges.push(note)
        }
    })

    // Sort our ranges
    for (const key in output) {
        output[key]!.ranges.sort((a: MultiVerseNote, b: MultiVerseNote) => {
            return ((a.start_c - b.start_c) || (a.start_v - b.start_v))
        })
    }
    return output
}

export interface TyndaleBibleReference {
    book: string,
    usx: string,
    start_chapter: number,
    start_verse: number,
    end_chapter: number,
    end_verse: number,
    // Does it cover multiple verses?
    is_range: boolean,
}

/**
 * Extract the scripture reference based on Tyndale format
 * 
 * @param reference The reference string
 *
 * @returns The extracted verse details
 */
export function extract_reference(reference: string): TyndaleBibleReference|null {
    const regex = /\b\w+\b/g
    const parts = reference.split('-')
    if (parts.length === 0) {
        return null
    }
    // Handle the starting parts (before -)
    const matches = parts[0]!.match(regex) || []
    if (matches.length < 3) {
        return null
    }
    const book = matches[0] || ''
    const usx = tyndale_to_usx_book[book] || ''
    const start_chapter = parseInt(matches[1]!, 10) || 0
    const start_verse = parseInt(matches[2]!, 10) || 0
    let end_chapter = 0
    let end_verse = 0
    // handle the ending parts (after -)
    if (parts.length === 2) {
        const matches = parts[1]!.match(regex) || []
        if (matches.length === 2) {
            end_chapter = parseInt(matches[0]!, 10) || 0
            end_verse = parseInt(matches[1]!, 10) || 0
        } else {
            end_chapter = start_chapter
            end_verse = parseInt(matches[0]!, 10) || 0
        }
    } else {
        end_chapter = start_chapter
        end_verse = start_verse
    }
    const is_range = ((start_chapter !== end_chapter) || (start_verse !== end_verse))
    const result: TyndaleBibleReference = {
        book,
        start_chapter,
        start_verse,
        end_chapter,
        end_verse,
        usx,
        is_range,
    }
    return result
}

/**
 * Extract the body of the note and transform it to align with our requirements.
 *
 * @param body The body of the note
 *
 * @returns The transformed text
 */
export function clean_note(body: string): string {
    /* TODO Requirements:
            Keep references to other verses though
                Transform them to a <span> so users can customise if clickable or not
                Transform the ref to own format: book,start_c,start_v[,end_c,end_v]
                <a href="?bref=Matt.12.20">12:20</a>  ->  <span data-ref='mat,12,20'>12:20</span>
                <a href="?bref=Matt.12.20-21">12:20-21</a>  ->  <span data-ref='mat,12,20,12,21'>12:20-21</span>
            Remove <a> if no verse ref
                e.g. <a href="?item=TheDayOfTheLord_ThemeNote_Filament">
            Transform non-standard markup to standard HTML
                See below for notes on Tyndale's classes
    */
    let cleaned = body
    // Remove wrapper
    cleaned = cleaned.replace(/^<p(?:\s+class="[^"]+")?>([\s\S]+)<\/p>$/, '$1')
    // Remove links that refer this verse
    cleaned = cleaned.replace(/<span class="sn-ref">.*?<\/span>/g, '')
    // Transform non-standard markup into HTML
    const elements = {
        'bold': '<strong>$1</strong>',
        'ital': '<em>$1</em>',
        'ital-bold': '<em><strong>$1</strong></em>',
        'sup': '<sup>$1</sup>',
    }
    Object.entries(elements).forEach(([klass, replacement]) => {
        const pattern = new RegExp(`<span class="${klass}">(.*?)<\/span>`, 'g')
        cleaned = cleaned.replace(pattern, replacement)
    })
    // trim the result
    return cleaned.trim()
}

/* TODO Notes from Tyndle on what their classes are for

For each, decide whether to:
    1. Convert to HTML element (e.g. <span class="sup"> -> <sup>)
    2. Keep as is (e.g. <span class="greek">)
    3. Strip if not useful at all

Common Span Classes
===================
span.ital Italic text
span.ital-bold Italic bold text
span.sc Small caps text
span.sc-ital Small caps italic text
span.sup Superscript text
span.bold Bold text
span.bold-sc Bold small caps text
span.greek Greek language text
span.hebrew Hebrew language text
span.aramaic Aramaic text
span.latin Latin language text
span.sub Subscript text
span.divine-name The divine name, usually set as small caps
span.divine-name-ital Same as the divine name but set as italic
span.era Marks BC/AD era designations, usually set as small caps
span.bold-era Same as era but set as bold

StudyNotes
==========
p.sn-list-1 First level list indent within a study note
p.sn-list-2 Second level list indent within a study note
p.sn-list-3 Third level list indent within a study note
p.sn-text Normal study note text

span.sn-excerpt Bible text excerpt within a study note
span.sn-excerpt-roman Text within a study note excerpt set off as roman when study note excerpts are set as italic by default. Otherwise set as italic.
span.sn-excerpt-sc Small cap text within a study note excerpt
span.sn-excerpt-divine-name The divine name within a study note excerpt, usually set as small caps
span.sn-hebrew-chars Hebrew language characters within a study note
span.sn-ref Bible reference to which the study note is connected
span.sn-ref-sc Small caps text within a study note reference
span.sn-sc Small caps text within a study note
*/

// Map Tyndale book ids to USX ids
export const tyndale_to_usx_book:Record<string, string> = {
    'Gen': 'gen',
    'Exod': 'exo',
    'Lev': 'lev',
    'Num': 'num',
    'Deut': 'deu',
    'Josh': 'jos',
    'Judg': 'jdg',
    'Ruth': 'rut',
    'ISam': '1sa',
    'IISam': '2sa',
    'IKgs': '1ki',  // WARN Tyndale uses 'IKgs' in `name`, not '1Kgs' as in `<refs>` (use 'IKgs')
    'IIKgs': '2ki',
    'IChr': '1ch',
    'IIChr': '2ch',
    'Ezra': 'ezr',
    'Neh': 'neh',
    'Esth': 'est',
    'Job': 'job',
    'Ps': 'psa',
    'Pr': 'pro',
    'Eccl': 'ecc',
    'Song': 'sng',
    'Isa': 'isa',
    'Jer': 'jer',
    'Lam': 'lam',
    'Ezek': 'ezk',
    'Dan': 'dan',
    'Hos': 'hos',
    'Joel': 'jol',
    'Amos': 'amo',
    'Obad': 'oba',
    'Jon': 'jon',
    'Mic': 'mic',
    'Nah': 'nam',
    'Hab': 'hab',
    'Zeph': 'zep',
    'Hagg': 'hag',
    'Zech': 'zec',
    'Mal': 'mal',
    'Matt': 'mat',
    'Mark': 'mrk',
    'Luke': 'luk',
    'John': 'jhn',
    'Acts': 'act',
    'Rom': 'rom',
    'ICor': '1co',
    'IICor': '2co',
    'Gal': 'gal',
    'Eph': 'eph',
    'Phil': 'php',
    'Col': 'col',
    'IThes': '1th',
    'IIThes': '2th',
    'ITim': '1ti',
    'IITim': '2ti',
    'Titus': 'tit',
    'Phlm': 'phm',
    'Heb': 'heb',
    'Jas': 'jas',
    'IPet': '1pe',
    'IIPet': '2pe',
    'IJn': '1jn',
    'IIJn': '2jn',
    'IIIJn': '3jn',
    'Jude': 'jud',
    'Rev': 'rev',
}