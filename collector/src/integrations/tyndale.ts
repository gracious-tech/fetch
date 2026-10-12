
import {join} from 'node:path'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'

import StreamZip from 'node-stream-zip'
import {DOMParser, XMLSerializer} from '@xmldom/xmldom'
import {select} from 'xpath'

import {mkdir_exist, request, write_json} from '../parts/utils.js'

import type {CommonSourceMeta} from '../parts/types'
import type {NotesData, MultiVerseNote} from '../parts/shared_types'


export const tyndale_source_dir = join('sources', 'notes', 'tyndale')


// Exact-match corrections for typos in the source XML (misplaced/missing spaces around excerpts)
const source_fixes:[string, string][] = [
    // 1 Sam 4:10 — space misplaced before rather than after "had"
    ['as many as  had<span class="sn-excerpt">died</span>',
        'as many as had <span class="sn-excerpt">died</span>'],
    // 2 Sam 22:34
    ['<span class="sn-excerpt">deer</span>during', '<span class="sn-excerpt">deer</span> during'],
    // Ezra 3:10-11 — stray excerpt "sing" (NLT has "sang"), leaving "give praise and thanks"
    ['to give<span class="sn-excerpt">sing</span> ', 'to give '],
]


// Generate the meta.json
function _generate_meta(url:string, revision:number):CommonSourceMeta{
    return {
        name: {
            english: "Tyndale Open Study Notes",
            english_abbrev: "TOSN",
            local: '',
            local_abbrev: '',
        },
        year: 2022,
        direction: 'ltr',
        copyright: {
            attribution: "Tyndale House Publishers",
            attribution_url: 'https://tyndaleopenresources.com/',
            licenses: [{
                license: 'cc-by-sa',
                url: 'https://creativecommons.org/licenses/by-sa/4.0/',
            }],
        },
        ids: {},
        source: {
            service: 'manual',
            format: null,  // A proprietary format
            revision,
            updated: new Date().toISOString().slice(0, 10),
            url,
        },
        tags: [],
    }
}


// Download latest copy of Tyndale English study notes
export async function download_notes(){

    // WARN This URL will probably change...
    const url = 'https://tyndaleopenresources.com/wp-content/themes/tyndale-openresources/files/tyndale_open-studynotes.zip'

    // Download zip
    const zip_buffer = await request(url, 'arrayBuffer')
    mkdir_exist(join(tyndale_source_dir, 'eng_tyndale'))
    const zip_path = join(tyndale_source_dir, 'eng_tyndale', 'source.zip')
    writeFileSync(zip_path, Buffer.from(zip_buffer))

    // Extract
    const extractor = new StreamZip.async({file: zip_path})
    const xml_file_out = join(tyndale_source_dir, 'eng_tyndale', 'StudyNotes.xml')
    await extractor.extract('Tyndale Open Study Notes/StudyNotes.xml', xml_file_out)

    // Create meta file if doesn't exist yet
    const meta_path = join(tyndale_source_dir, 'eng_tyndale', 'meta.json')
    if (!existsSync(meta_path)){
        const xml = readFileSync(xml_file_out, {encoding: 'utf8'})
        const revision = parseFloat(/^<items release="(.*?)">/.exec(xml.trim())?.[1] ?? '')
        const meta_data = _generate_meta(url, revision)
        write_json(meta_path, meta_data, true)
    }
}


// Read study notes from disk and convert to standard HTML/JSON
export function sources_to_dist():Record<string, NotesData> {
    const notes_id = 'eng_tyndale'
    const notes_path = join(tyndale_source_dir, notes_id, 'StudyNotes.xml')
    let xml = readFileSync(notes_path, {encoding: 'utf8'})

    // Correct known source typos, warning when one no longer matches (e.g. fixed upstream)
    for (const [find, replace] of source_fixes){
        if (!xml.includes(find)){
            console.warn(`Tyndale source fix no longer applies: ${find}`)
            continue
        }
        xml = xml.replace(find, replace)
    }

    return study_notes_to_json(xml, notes_id)
}


// Extract study notes from Tyndale XML and convert to standard HTML/JSON
export function study_notes_to_json(xml:string, notes_id:string):Record<string, NotesData> {

    // Set up the intial data with empty values
    const output:Record<string, NotesData> = {}
    for (const usx_book of Object.values(tyndale_to_usx_book)) {
        // Result is keyed by USX book ids, not Tyndale's
        output[usx_book] = {
            notes_id,
            book: usx_book,
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
                start_chapter: reference.start_chapter,
                start_verse: reference.start_verse,
                end_chapter: reference.end_chapter,
                end_verse: reference.end_verse,
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
            return ((a.start_chapter - b.start_chapter) || (a.start_verse - b.start_verse))
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

    // Prefix all span classes
    cleaned = cleaned.replace(/<span class="(.*?)">/g, '<span class="fbn-$1">')

    // Transform non-standard markup into HTML
    const elements = {
        'bold': '<strong>$1</strong>',
        'bold-era': '<strong class="fbn-era">$1</strong>',
        'bold-sc': '<strong class="fbn-sc">$1</strong>',
        'sn-excerpt': '<span class="fbn-excerpt">$1</span>',
        'sn-excerpt-divine-name': '<span class="fbn-excerpt fbn-yhwh">$1</span>',
        'sn-excerpt-roman': '<span class="fbn-excerpt fbn-roman">$1</span>',
        'sn-excerpt-sc': '<span class="fbn-excerpt fbn-sc">$1</span>',
        'sn-hebrew-chars': '<span class="fbn-hebrew">$1</span>',
        'sn-list-1': '<span class="fbn-list-1">$1</span>',
        'sn-list-2': '<span class="fbn-list-2">$1</span>',
        'sn-list-3': '<span class="fbn-list-3">$1</span>',
        'sn-ref-sc': '<span class="fbn-sc">$1</span>',
        'sn-sc': '<span class="fbn-sc">$1</span>',
        'divine-name-ital': '<em class="fbn-yhwh">$1</em>',
        'ital': '<em>$1</em>',
        'ital-bold': '<em><strong>$1</strong></em>',
        'sc-ital': '<em class="fbn-sc">$1</em>',
        'sub': '<sub>$1</sub>',
        'sup': '<sup>$1</sup>',
    }
    // Iterate until no more replacements occur so nested spans are handled (innermost first)
    // NOTE Non-greedy (.*?) on nested spans only consumes through the inner </span>; repeated
    //      passes peel off each layer until all are resolved.
    let prev:string
    do {
        prev = cleaned
        Object.entries(elements).forEach(([klass, replacement]) => {
            const pattern = new RegExp(`<span class="fbn-${klass}">((?:(?!<span).)*?)</span>`, 'g')
            cleaned = cleaned.replace(pattern, replacement)
        })
    } while (cleaned !== prev)

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
