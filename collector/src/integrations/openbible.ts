
import {books_ordered} from '../parts/bible.js'


// Types

type CrossRefSingle = [number, string, number, number]  // relevance, book, start_c, start_v
type CrossRefRange = [...CrossRefSingle, number, number]  // ..., end_c, end_v

// book -> chapter -> verse -> references
type CrossReferences =
    Record<string, Record<number, Record<number, (CrossRefSingle|CrossRefRange)[]>>>


export function cross_references_to_json(tsv:string):CrossReferences{
    // Parse cross-references data from openbible.info and output JSON data

    /* TODO Requirements:
        See raw data at: https://a.openbible.info/data/cross-references.zip
            This should take the data as a string, not read a file
            But you can set it up to read the file during development if wanting to test on all data

        Convert book codes to our format (USX), see below

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

    return {
        // TODO Example output:
        "exo": {
            "28": {
                "2": [
                    [1, "exo", 35, 35, 36, 2],  // Exod.28.2  Exod.35.35-Exod.36.2  50
                    [2, "gal", 3, 27],  // Exod.28.2  Gal.3.27  10
                ],
            }
        },
    }
}


// Map openbible book ids to USX ids
const openbible_to_usx_book:Record<string, string> = {
    // TODO These have not been checked (left-side need updating to match openbible's form)
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
