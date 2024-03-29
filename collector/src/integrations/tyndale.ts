
import {join} from 'node:path'
import {existsSync, readFileSync} from 'node:fs'

import {DOMParser, XMLSerializer} from '@xmldom/xmldom'
import {select} from 'xpath'


// Types

interface MultiVerseNote {
    start_c:number
    start_v:number
    end_c:number
    end_v:number
    contents:string  // HTML
}

export interface StudyNotes {
    verses:Record<string, Record<string, string>>  // Single verses organised by chapter and verse
    ranges:MultiVerseNote[]  // Notes that span multiple verses and/or chapters
}


// Get notes if determined to be in Tyndale format
export function get_notes(id:string){
    const notes_path = join('sources', 'notes', id, 'StudyNotes.xml')
    if (!existsSync(notes_path)){
        return null  // Not a Tyndale format
    }
    return study_notes_to_json(readFileSync(notes_path, {encoding: 'utf8'}))
}


/**
 * Extract study notes from Tyndale XML and convert to standard HTML/JSON
 * Source: StudyNotes.xml from https://tyndaleopenresources.com/
 *
 * @param xml The XML to parse
 *
 * @returns The data to be converted to JSON
 */
export function study_notes_to_json(xml:string):Record<string, StudyNotes> {

    // Set up the intial data with empty values
    const output:Record<string, StudyNotes> = {}
    for (const usx_book of Object.values(tyndale_to_usx_book)) {
        // Result is keyed by USX book ids, not Tyndale's
        output[usx_book] = {
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
            if (!(reference.start_chapter in output[reference.usx]!.verses)){
                // Chapter object doesn't exist yet, so init
                output[reference.usx]!.verses[reference.start_chapter] = {}
            }
            output[reference.usx]!.verses[reference.start_chapter]![reference.start_verse] = body
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

    // Remove books with no notes
    for (const book in output){
        if (!output[book]!.ranges.length && !Object.keys(output[book]!.verses).length){
            delete output[book]
        }
    }

    // Sort our ranges
    for (const key in output) {
        output[key]!.ranges.sort((a: MultiVerseNote, b: MultiVerseNote) => {
            return ((a.start_c - b.start_c) || (a.start_v - b.start_v))
        })
    }
    return output
}


/**
 * An interface describing the extracted Bible reference
 */
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
    let book = matches[0] || ''
    let usx = tyndale_to_usx_book[book] || ''
    if (usx === '') {
        // Check the alternatives
        book = refs_to_tyndale[book] || ''
        usx = tyndale_to_usx_book[book] || ''
    }
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


/*
Common Span Classes
===================
span.ital Italic text (converted)
span.ital-bold Italic bold text (converted)
span.sc Small caps text (keep)
span.sc-ital Small caps italic text (converted to span.sc with em)
span.sup Superscript text (converted)
span.bold Bold text (converted)
span.bold-sc Bold small caps text (converted to span.sc with strong)
span.greek Greek language text (keep)
span.hebrew Hebrew language text (keep)
span.aramaic Aramaic text (keep)
span.latin Latin language text (keep)
span.sub Subscript text (converted)
span.divine-name The divine name, usually set as small caps (keep)
span.divine-name-ital divine name but set as italic (converted divine-name wrapped in em)
span.sn-excerpt-divine-name The divine name, usually set as small caps and excerpt (convert to
    .excerpt.divine-name)
span.era Marks BC/AD era designations, usually set as small caps (keep)
span.bold-era Same as era but set as bold (converted to era wrapped in strong)

StudyNotes
==========
p.sn-list-1 First level list indent within a study note (converted to .list-1)
p.sn-list-2 Second level list indent within a study note (converted to .list-2)
p.sn-list-3 Third level list indent within a study note (converted to .list-3)
p.sn-text Normal study note text (removed)

span.sn-excerpt Bible text excerpt within a study note (converted to .excerpt)
span.sn-excerpt-roman Text within a study note excerpt set off as roman when study note
    excerpts are set as italic by default. Otherwise set as italic. (converted to .excerpt.roman)
span.sn-excerpt-sc Small cap text within a study note excerpt (converted to .excerpt.sc)
span.sn-hebrew-chars Hebrew language characters within a study note (converted to span.hebrew)
span.sn-ref Bible reference to which the study note is connected (removed)
span.sn-ref-sc Small caps text within a study note reference (converted to .sc)
span.sn-sc Small caps text within a study note (converted to .sc)
*/


/**
 * Extract the body of the note and transform it to align with our requirements.
 *
 * @param body The body of the note
 *
 * @returns The transformed text
 */
export function clean_note(body: string): string {

    let cleaned = body

    // Remove wrapper
    cleaned = cleaned.replace(/^<p(?:\s+class="[^"]+")?>([\s\S]+)<\/p>$/, '$1')

    // Remove links that refer this verse
    cleaned = cleaned.replace(/<span class="sn-ref">.*?<\/span>/g, '')

    // Transform non-standard markup into HTML
    const elements = {
        'bold': '<strong>$1</strong>',
        'bold-era': '<span class="era"><strong>$1</strong></span>',
        'bold-sc': '<span class="sc"><strong>$1</strong></span>',
        'sn-excerpt': '<span class="excerpt">$1</span>',
        'sn-excerpt-divine-name': '<span class="excerpt divine-name">$1</span>',
        'sn-excerpt-roman': '<span class="excerpt roman">$1</span>',
        'sn-excerpt-sc': '<span class="excerpt sc">$1</span>',
        'sn-hebrew-chars': '<span class="hebrew">$1</span>',
        'sn-list-1': '<span class="list-1">$1</span>',
        'sn-list-2': '<span class="list-2">$1</span>',
        'sn-list-3': '<span class="list-3">$1</span>',
        'sn-ref-sc': '<span class="sc">$1</span>',
        'sn-sc': '<span class="sc">$1</span>',
        'divine-name-ital': '<span class="divine-name"><em>$1</em></span>',
        'ital': '<em>$1</em>',
        'ital-bold': '<em><strong>$1</strong></em>',
        'sc-ital': '<span class="sc"><em>$1</em></span>',
        'sub': '<sub>$1</sub>',
        'sup': '<sup>$1</sup>',
    }
    Object.entries(elements).forEach(([klass, replacement]) => {
        const pattern = new RegExp(`<span class="${klass}">(.*?)</span>`, 'g')
        cleaned = cleaned.replace(pattern, replacement)
    })

    // convert reference links to data tags
    let pattern = /<a href="\?bref=([^"]*)">([^<]*)<\/a>/g
    cleaned = cleaned.replace(pattern, (match: string, reference: string, text: string) => {
        const scripture = extract_reference(reference)
        if (!scripture) {
            return ''
        }
        let format = `${scripture.usx},${scripture.start_chapter},${scripture.start_verse}`
        if (scripture.is_range) {
            format += `,${scripture.end_chapter},${scripture.end_verse}`
        }
        return `<span data-ref="${format}">${text}</span>`
    })

    // strip remaining links
    pattern = /<a\b[^>]*>(.*?)<\/a>/gi
    cleaned = cleaned.replace(pattern, '$1')

    // trim the result
    return cleaned.trim()
}


/**
 * Some times Tyndale uses an alternative book name for books.
 * (ie. 1Kgs instead of IKgs).  This list allows us to look up
 * the tyndale based on the alternative.
 */
export const refs_to_tyndale: Record<string, string> = {
    '1Sam': 'ISam',
    '2Sam': 'IISam',
    '1Kgs': 'IKgs',
    '2Kgs': 'IIKgs',
    '1Chr': 'IChr',
    '2Chr': 'IIChr',
    '1Cor': 'ICor',
    '2Cor': 'IICor',
    '1Thes': 'IThes',
    '2Thes': 'IIThes',
    '1Tim': 'ITim',
    '2Tim': 'IITim',
    '1Pet': 'IPet',
    '2Pet': 'IIPet',
    '1Jn': 'IJn',
    '2Jn': 'IIJn',
    '3Jn': 'IIIJn',
}


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
