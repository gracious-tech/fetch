import {books_ordered} from '../parts/bible.js'

// Types
// I initially store the votes in position 0, and replace it with relevance when I buuild the output
type CrossRefSingle = [number, string, number, number]  // relevance/votes, book, start_c, start_v
type CrossRefRange = [...CrossRefSingle, number, number]  // ..., end_c, end_v

// book -> chapter -> verse -> references
type CrossReferences =
    Record<string, Record<number, Record<number, (CrossRefSingle|CrossRefRange)[]>>>

/**
 * An interface used for our hash table to enable sorting
 */
interface CrossRefItem {
    from: OBBibleReference,
    cross_references: (CrossRefSingle|CrossRefRange)[],
}

/**
 * Prepare the OB cross reference data to be converted to JSON
 *
 * @param content The Open Bible cross reference content to parse
 *
 * @returns The data prepared for JSON conversion
 */
export function cross_references_to_json(content:string): CrossReferences {
    const output: CrossReferences = {}
    // openbible_to_usx_book is defined at the bottom of the file
    for (const book of Object.keys(openbible_to_usx_book)) {
        // Result is keyed by USX ids, not OpenBible's
        output[openbible_to_usx_book[book]!] = {}
    }
    /**
     * We will store the cross references in this table, so we can sort them.
     * Then we will add them to the output. The key is [book_start_chapter_start_verse].
     */
    const cross_ref_table = new Map<string, CrossRefItem>()
    const total_votes: number[] = []
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
        if (votes < 0) {
            // ignore negative voted references
            continue
        }
        total_votes.push(votes)
        // We hold votes in relevance position for now
        let cross_ref: CrossRefSingle|CrossRefRange = [
            votes, to.usx, to.start_chapter, to.start_verse,
        ]
        if (to.is_range) {
            cross_ref = [...cross_ref, to.end_chapter, to.end_verse]
        }
        const key = `${from.usx}_${from.start_chapter}_${from.start_verse}`
        if (cross_ref_table.has(key)) {
            const existing = cross_ref_table.get(key)
            existing!.cross_references.push(cross_ref)
            cross_ref_table.set(key, existing!)
            continue
        }
        const item: CrossRefItem = {
            from,
            cross_references: [cross_ref],
        }
        cross_ref_table.set(key, item)
    }
    // Set up the results
    total_votes.sort((a: number, b: number) => a - b)
    cross_ref_table.forEach((item: CrossRefItem) => {
        // Sort the results
        item.cross_references = item.cross_references
            .map((ref: CrossRefSingle|CrossRefRange) => {
                // Calculate relevance
                ref[0] = calculate_relevance(total_votes, ref[0], false)
                return ref
            })
            .sort(
                (a: CrossRefSingle|CrossRefRange, b: CrossRefSingle|CrossRefRange) => {
                    const a_index = books_ordered.indexOf(a[1])
                    const b_index = books_ordered.indexOf(b[1])
                    const a_chapter = a[2]
                    const b_chapter = b[2]
                    const a_verse = a[3]
                    const b_verse = b[3]
                    if (a_index === b_index) {
                        if (a_chapter === b_chapter) {
                            return a_verse - b_verse
                        }
                        return a_chapter - b_chapter
                    }
                    // Sort by book
                    return a_index - b_index
                })
        const from = item.from
        if (!(from.start_chapter in output[from.usx]!)) {
            output[from.usx]![from.start_chapter] = {}
        }
        if (!(from.start_verse in output[from.usx]![from.start_chapter]!)) {
            output[from.usx]![from.start_chapter]![from.start_verse] = []
        }
        output[from.usx]![from.start_chapter]![from.start_verse] = item.cross_references
    })

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
 * Calculate the relevance score of the cross reference
 *
 * 1: Very relevant
 * 2: Quite relevant
 * 3: Somewhat relevant
 *
 * @param votes All the votes for all the cross references
 * @param vote The actual vote for the current cross reference
 * @param needs_sorting Do we need to sort the votes? (preferably no.
 * You do not want to sort on every check)
 *
 * @returns A score of 1, 2, or 3
 */
export function calculate_relevance(votes: number[], vote: number, needs_sorting = false): number {
    if (needs_sorting) {
        votes.sort((a: number, b: number) => a-b)
    }
    const group_size = Math.ceil(votes.length / 3)
    const groups = Array.from({ length: 3 }, (_, index) => {
        return votes.slice(index * group_size, (index + 1) * group_size)
    })
    if (groups[0]!.includes(vote)) {
        // Somewhat relevant
        return 3
    }
    if (groups[1]!.includes(vote)) {
        // Quite relevant
        return 2
    }
    // Very relevant
    return 1
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
