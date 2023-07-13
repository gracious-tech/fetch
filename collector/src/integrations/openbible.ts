
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
    'Exo': 'exo',
    'Lev': 'lev',
    'Num': 'num',
    'Deu': 'deu',
    'Jos': 'jos',
    'Jdg': 'jdg',
    'Rut': 'rut',
    '1sa': '1sa',
    '2sa': '2sa',
    '1ki': '1ki',
    '2ki': '2ki',
    '1ch': '1ch',
    '2ch': '2ch',
    'Ezr': 'ezr',
    'Neh': 'neh',
    'Est': 'est',
    'Job': 'job',
    'Psa': 'psa',
    'Pro': 'pro',
    'Ecc': 'ecc',
    'Sng': 'sng',
    'Isa': 'isa',
    'Jer': 'jer',
    'Lam': 'lam',
    'Ezk': 'ezk',
    'Dan': 'dan',
    'Hos': 'hos',
    'Jol': 'jol',
    'Amo': 'amo',
    'Oba': 'oba',
    'Jon': 'jon',
    'Mic': 'mic',
    'Nam': 'nam',
    'Hab': 'hab',
    'Zep': 'zep',
    'Hag': 'hag',
    'Zec': 'zec',
    'Mal': 'mal',
    'Mat': 'mat',
    'Mrk': 'mrk',
    'Luk': 'luk',
    'Jhn': 'jhn',
    'Act': 'act',
    'Rom': 'rom',
    '1co': '1co',
    '2co': '2co',
    'Gal': 'gal',
    'Eph': 'eph',
    'Php': 'php',
    'Col': 'col',
    '1th': '1th',
    '2th': '2th',
    '1ti': '1ti',
    '2ti': '2ti',
    'Tit': 'tit',
    'Phm': 'phm',
    'Heb': 'heb',
    'Jas': 'jas',
    '1pe': '1pe',
    '2pe': '2pe',
    '1jn': '1jn',
    '2jn': '2jn',
    '3jn': '3jn',
    'Jud': 'jud',
    'Rev': 'rev',
}
