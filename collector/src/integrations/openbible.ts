
import {books_ordered} from '../parts/bible.js'


// Types

type CrossRefSingle = [number, string, number, number]  // relevance, book, start_c, start_v
type CrossRefRange = [...CrossRefSingle, number, number]  // ..., end_c, end_v

// book -> chapter -> verse -> references
type CrossReferences =
    Record<string, Record<number, Record<number, (CrossRefSingle|CrossRefRange)[]>>>

/**
 * Prepare the OB cross reference data to be converted to JSON
 *
 * @param content The Open Bible cross reference content to parse
 *
 * @returns The data prepared for JSON conversion
 */
export function cross_references_to_json(content:string): CrossReferences {
    const output: CrossReferences = {}
    // tyndale_to_usx_book is defined at the bottom of the file
    for (const book of Object.keys(openbible_to_usx_book)) {
        // Result is keyed by USX ids, not Tyndale's
        output[openbible_to_usx_book[book]!] = {}
    }
    /* TODO Requirements:
        See raw data at: https://a.openbible.info/data/cross-references.zip
            This should take the data as a string, not read a file
            But you can set it up to read the file during development if wanting to test on all data

        Collect references per verse, nested in objects for book+chapter+verse

        The data also includes votes for how relevant a reference is
            We'll use this data to:
                #1 Ignore references with negative votes
                #2 Create 3 classes of references, represented by a number:
                    1: Very relevant
                    2: Quite relevant
                    3: Somewhat relevant
            You should use a statistical method to rank the references before categorising them
                After removing ones with negative votes, each class should have around 1/3 of total
                    e.g. If 300 references, ~100 classed as very relevant, ~100 quite, ~100 somewhat
            Users will be able to use this to select only the most relevant references, if they wish

        Once organised, the array of references per verse should be sorted by book/chapter/verse
            You can use `books_ordered` to get the traditional ordering of books

    */

    // return {
    //     // TODO Example output:
    //     "exo": {
    //         "28": {
    //             "2": [
    //                 [1, "exo", 35, 35, 36, 2],  // Exod.28.2  Exod.35.35-Exod.36.2  50
    //                 [2, "gal", 3, 27],  // Exod.28.2  Gal.3.27  10
    //             ],
    //         }
    //     },
    // }
    const lines = content.split('\n')
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]
        if ((index === 0) || (!line)) {
            // Skip the header or empty lines
            continue
        }
        const parts = line.split('\t')
        const from = extract_reference(parts[0]!)
        const to = extract_reference(parts[1]!)
        if ((!from) || (!to)) {
            // Scripture is missing
            continue
        }
        const votes_string = parts[2] || '0'
        const votes = parseInt(votes_string, 10)
        // Fix relevance
        let cross_ref: CrossRefSingle|CrossRefRange = [
            1, to.usx, to.start_chapter, to.start_verse,
        ]
        if (to.is_range) {
            cross_ref = [...cross_ref, to.end_chapter, to.end_verse]
        }
        if (!(from.start_chapter in output[from.usx]!)) {
            output[from.usx]![from.start_chapter] = {}
        }
        if (!(from.start_verse in output[from.usx]![from.start_chapter]!)) {
            output[from.usx]![from.start_chapter]![from.start_verse] = []
        }
        output[from.usx]![from.start_chapter]![from.start_verse]!.push(cross_ref)
    }
    return output
}

/**
 * An interface for describing an extracted reference
 */
export interface OBBibleReference {
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
 * Extract the Bible reference
 *
 * @param reference The bible reference
 *
 * @returns Details about the passage
 */
export function extract_reference(reference: string): OBBibleReference|null {
    const pattern = /\b\w+\b/g
    const parts = reference.split('-')
    if (parts.length === 0) {
        return null
    }
    const matches = parts[0]!.match(pattern) || []
    if (matches.length < 3) {
        return null
    }
    const book = matches[0] || ''
    const usx = openbible_to_usx_book[book] || ''
    const start_chapter = parseInt(matches[1]!, 10) || 0
    const start_verse = parseInt(matches[2]!, 10) || 0
    let end_chapter = start_chapter
    let end_verse = start_verse
    if (parts.length === 2) {
        const second_matches = parts[1]!.match(pattern) || []
        if (second_matches.length === 3) {
            end_chapter = parseInt(second_matches[1]!, 10) || 0
            end_verse = parseInt(second_matches[2]!, 10) || 0
        }
    }
    const is_range = ((start_chapter !== end_chapter) || (start_verse !== end_verse))
    const result: OBBibleReference = {
        book,
        usx,
        start_chapter,
        start_verse,
        end_chapter,
        end_verse,
        is_range,
    }
    return result
}

// Map openbible book ids to USX ids
export const openbible_to_usx_book: Record<string, string> = {
    'Gen': 'gen',
    'Exod': 'exo',
    'Lev': 'lev',
    'Num': 'num',
    'Deut': 'deu',
    'Josh': 'jos',
    'Judg': 'jdg',
    'Ruth': 'rut',
    '1Sam': '1sa',
    '2Sam': '2sa',
    '1Kgs': '1ki',
    '2Kgs': '2ki',
    '1Chr': '1ch',
    '2Chr': '2ch',
    'Ezra': 'ezr',
    'Neh': 'neh',
    'Esth': 'est',
    'Job': 'job',
    'Ps': 'psa',
    'Prov': 'pro',
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
    'Jonah': 'jon',
    'Mic': 'mic',
    'Nah': 'nam',
    'Hab': 'hab',
    'Zeph': 'zep',
    'Hag': 'hag',
    'Zech': 'zec',
    'Mal': 'mal',
    'Matt': 'mat',
    'Mark': 'mrk',
    'Luke': 'luk',
    'John': 'jhn',
    'Acts': 'act',
    'Rom': 'rom',
    '1Cor': '1co',
    '2Cor': '2co',
    'Gal': 'gal',
    'Eph': 'eph',
    'Phil': 'php',
    'Col': 'col',
    '1Thess': '1th',
    '2Thess': '2th',
    '1Tim': '1ti',
    '2Tim': '2ti',
    'Titus': 'tit',
    'Phlm': 'phm',
    'Heb': 'heb',
    'Jas': 'jas',
    '1Pet': '1pe',
    '2Pet': '2pe',
    '1John': '1jn',
    '2John': '2jn',
    '3John': '3jn',
    'Jude': 'jud',
    'Rev': 'rev',
}
