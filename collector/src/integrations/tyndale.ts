
import {DOMParser, XMLSerializer} from '@xmldom/xmldom'


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


export function study_notes_to_json(xml:string):Record<string, StudyNotes>{
    // Parse Tyndale's study notes XML into a JSON object with HTML contents
    /* TODO Requirements:
        Parse <item name="..."> to get the verse range
            Single verse notes go into `verses` object; notes that cover ranges go into `ranges`
            Account for following forms: ICor.1.10-15.58, Gen.1.3-13, Matt.17.9
            WARN <refs> is incorrect for some notes so don't use (e.g. 1Cor.3.1-9)
        Extract html contents from <p class="sn-text">
            Contents should be html with no container element
                e.g. "Some <span>uncontained</span> text"
                So users can wrap in their own <div> or <p>
            Remove leading verse reference since users can reconstruct that from the range data
                e.g. Remove `<span class="sn-ref"><a href="?bref=Matt.17.9">17:9</a></span> `
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

    // Parse the XML
    const doc = new DOMParser().parseFromString(xml)

    // Organise by book
    const output:Record<string, StudyNotes> = {}
    for (const tyndale_book of Object.keys(tyndale_to_usx_book)){
        // Result is keyed by USX ids, not Tyndale's
        output[tyndale_to_usx_book[tyndale_book]!] = {
            verses: {},
            ranges: [],  // Sorted by start_c/start_v
        }
    }

    return output
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
const tyndale_to_usx_book:Record<string, string> = {
    // TODO These have not been checked (left-side need updating to match Tyndale's form)
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
    'IKgs': '1ki',  // WARN Tyndale uses 'IKgs' in `name`, not '1Kgs' as in `<refs>` (use 'IKgs')
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
