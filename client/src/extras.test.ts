
import {describe, it} from 'vitest'

import {passage_obj_to_str, passage_str_to_obj, book_name_to_code} from './extras.js'


describe('passage_obj_to_str', () => {

    it("Renders a single chapter reference", ({expect}) => {
        expect(passage_obj_to_str({chapter_start: 1})).toEqual('1')
        expect(passage_obj_to_str({chapter_start: 1, chapter_end: 1})).toEqual('1')
    })

    it("Renders a multi-chapter reference", ({expect}) => {
        expect(passage_obj_to_str({chapter_start: 1, chapter_end: 2})).toEqual('1-2')
    })

    it("Renders a single verse reference", ({expect}) => {
        expect(passage_obj_to_str({chapter_start: 1, verse_start: 1})).toEqual('1:1')
        expect(passage_obj_to_str({chapter_start: 1, verse_start: 1, chapter_end: 1, verse_end: 1})).toEqual('1:1')
    })

    it("Renders a multi-verse reference", ({expect}) => {
        expect(passage_obj_to_str({chapter_start: 1, verse_start: 1, chapter_end: 1, verse_end: 2})).toEqual('1:1-2')
        expect(passage_obj_to_str({chapter_start: 1, verse_start: 1, verse_end: 2})).toEqual('1:1-2')
    })

    it("Renders a cross-chapter reference", ({expect}) => {
        expect(passage_obj_to_str({chapter_start: 1, verse_start: 1, chapter_end: 2, verse_end: 2})).toEqual('1:1-2:2')
    })

    it("Does not render when params invalid", ({expect}) => {
        expect(passage_obj_to_str({chapter_start: 1, verse_end: 2})).toEqual(null)
        expect(passage_obj_to_str({chapter_start: 2, chapter_end: 1})).toEqual(null)
        expect(passage_obj_to_str({chapter_start: 1, verse_start: 2, verse_end: 1})).toEqual(null)
    })

})


describe('passage_str_to_obj', () => {

    it("Parses a single chapter", ({expect}) => {
        expect(passage_str_to_obj('1')).toEqual({
            chapter_start: 1,
            chapter_end: 1,
            verse_start: null,
            verse_end: null,
        })
    })

    it("Parses multiple chapters", ({expect}) => {
        expect(passage_str_to_obj('1-2')).toEqual({
            chapter_start: 1,
            chapter_end: 2,
            verse_start: null,
            verse_end: null,
        })
    })

    it("Parses a single verse", ({expect}) => {
        expect(passage_str_to_obj('1:1')).toEqual({
            chapter_start: 1,
            chapter_end: 1,
            verse_start: 1,
            verse_end: 1,
        })
    })

    it("Parses multiple verses", ({expect}) => {
        expect(passage_str_to_obj('1:1-2')).toEqual({
            chapter_start: 1,
            chapter_end: 1,
            verse_start: 1,
            verse_end: 2,
        })
    })

    it("Parses verses across chapters", ({expect}) => {
        expect(passage_str_to_obj('1:1-2:2')).toEqual({
            chapter_start: 1,
            chapter_end: 2,
            verse_start: 1,
            verse_end: 2,
        })
    })

    it("Does not parse invalid references", ({expect}) => {
        expect(passage_str_to_obj('nothing')).toEqual(null)
    })

})


describe('book_name_to_code', () => {

    for (const [code, name] of Object.entries(book_names)){
        it(`Identifies "${name}" as '${code}'`, ({expect}) => {
            expect(book_name_to_code(name, book_names)).toEqual(code)
        })
    }

    for (const [code, abbrevs] of Object.entries(book_name_abbreviations)){
        for (const abbrev of abbrevs){
            it(`Identifies "${abbrev}" as '${code}'`, ({expect}) => {
                expect(book_name_to_code(abbrev, book_names)).toEqual(code)
            })
        }
    }

    it("Returns null if can't match", ({expect}) => {
        expect(book_name_to_code('nothing', book_names)).toEqual(null)
    })

    it("Returns null if multiple matches", ({expect}) => {
        expect(book_name_to_code('j', book_names)).toEqual(null)
    })
})


export const book_names:Record<string, string> = {
    'gen': "Genesis",
    'exo': "Exodus",
    'lev': "Leviticus",
    'num': "Numbers",
    'deu': "Deuteronomy",
    'jos': "Joshua",
    'jdg': "Judges",
    'rut': "Ruth",
    '1sa': "1 Samuel",
    '2sa': "2 Samuel",
    '1ki': "1 Kings",
    '2ki': "2 Kings",
    '1ch': "1 Chronicles",
    '2ch': "2 Chronicles",
    'ezr': "Ezra",
    'neh': "Nehemiah",
    'est': "Esther",
    'job': "Job",
    'psa': "Psalms",
    'pro': "Proverbs",
    'ecc': "Ecclesiastes",
    'sng': "Song of Songs",
    'isa': "Isaiah",
    'jer': "Jeremiah",
    'lam': "Lamentations",
    'ezk': "Ezekiel",
    'dan': "Daniel",
    'hos': "Hosea",
    'jol': "Joel",
    'amo': "Amos",
    'oba': "Obadiah",
    'jon': "Jonah",
    'mic': "Micah",
    'nam': "Nahum",
    'hab': "Habakkuk",
    'zep': "Zephaniah",
    'hag': "Haggai",
    'zec': "Zechariah",
    'mal': "Malachi",
    'mat': "Matthew",
    'mrk': "Mark",
    'luk': "Luke",
    'jhn': "John",
    'act': "Acts",
    'rom': "Romans",
    '1co': "1 Corinthians",
    '2co': "2 Corinthians",
    'gal': "Galatians",
    'eph': "Ephesians",
    'php': "Philippians",
    'col': "Colossians",
    '1th': "1 Thessalonians",
    '2th': "2 Thessalonians",
    '1ti': "1 Timothy",
    '2ti': "2 Timothy",
    'tit': "Titus",
    'phm': "Philemon",
    'heb': "Hebrews",
    'jas': "James",
    '1pe': "1 Peter",
    '2pe': "2 Peter",
    '1jn': "1 John",
    '2jn': "2 John",
    '3jn': "3 John",
    'jud': "Jude",
    'rev': "Revelation",
}


const book_name_abbreviations = {
    "gen": ["Gen.", "Ge.", "Gn."],
    "exo": ["Ex.", "Exod.", "Exo."],
    "lev": ["Lev.", "Le.", "Lv."],
    "num": ["Num.", "Nu.", "Nm.", "Nb."],
    "deu": ["Deut.", "De.", "Dt."],
    "jos": ["Josh.", "Jos.", "Jsh."],
    "jdg": ["Judg.", "Jdg.", "Jg.", "Jdgs."],
    "rut": ["Ruth", "Rth.", "Ru."],
    "1sa": ["1 Sam.", "1 Sm.", "1 Sa.", "1 S.", "I Sam.", "I Sa.", "1Sam.", "1Sa.", "1S.", "1st Samuel", "1st Sam.", "First Samuel", "First Sam."],
    "2sa": ["2 Sam.", "2 Sm.", "2 Sa.", "2 S.", "II Sam.", "II Sa.", "2Sam.", "2Sa.", "2S.", "2nd Samuel", "2nd Sam.", "Second Samuel", "Second Sam."],
    "1ki": ["1 Kings", "1 Kgs", "1 Ki", "1Kgs", "1Kin", "1Ki", "1K", "I Kgs", "I Ki", "1st Kings", "1st Kgs", "First Kings", "First Kgs"],
    "2ki": ["2 Kings", "2 Kgs.", "2 Ki.", "2Kgs.", "2Kin.", "2Ki.", "2K.", "II Kgs.", "II Ki.", "2nd Kings", "2nd Kgs.", "Second Kings", "Second Kgs."],
    "1ch": ["1 Chron.", "1 Chr.", "1 Ch.", "1Chron.", "1Chr.", "1Ch.", "I Chron.", "I Chr.", "I Ch.", "1st Chronicles", "1st Chron.", "First Chronicles", "First Chron."],
    "2ch": ["2 Chron.", "2 Chr.", "2 Ch.", "2Chron.", "2Chr.", "2Ch.", "II Chron.", "II Chr.", "II Ch.", "2nd Chronicles", "2nd Chron.", "Second Chronicles", "Second Chron."],
    "ezr": ["Ezra", "Ezr.", "Ez."],
    "neh": ["Neh.", "Ne."],
    "est": ["Est.", "Esth.", "Es."],
    "job": ["Job", "Jb."],
    "psa": ["Ps.", "Psalm", "Pslm.", "Psa.", "Psm.", "Pss."],
    "pro": ["Prov", "Pro.", "Prv.", "Pr."],
    "ecc": ["Eccles.", "Eccle.", "Ecc.", "Ec."],
    "sng": ["Song", "Song of Songs", "SOS.", "So."],
    "isa": ["Isa.", "Is."],
    "jer": ["Jer.", "Je.", "Jr."],
    "lam": ["Lam.", "La."],
    "ezk": ["Ezek.", "Eze.", "Ezk."],
    "dan": ["Dan.", "Da.", "Dn."],
    "hos": ["Hos.", "Ho."],
    "jol": ["Joel", "Jl."],
    "amo": ["Amos", "Am."],
    "oba": ["Obad.", "Ob."],
    "jon": ["Jonah", "Jnh.", "Jon."],
    "mic": ["Mic.", "Mc."],
    "nam": ["Nah.", "Na."],
    "hab": ["Hab.", "Hb."],
    "zep": ["Zeph.", "Zep.", "Zp."],
    "hag": ["Hag.", "Hg."],
    "zec": ["Zech.", "Zec.", "Zc."],
    "mal": ["Mal.", "Ml."],
    "mat": ["Matt.", "Mt."],
    "mrk": ["Mark", "Mrk", "Mar", "Mk", "Mr"],
    "luk": ["Luke", "Luk", "Lk"],
    "jhn": ["John", "Joh", "Jhn", "Jn"],
    "act": ["Acts", "Act", "Ac"],
    "rom": ["Rom.", "Ro.", "Rm."],
    "1co": ["1 Cor.", "1 Co.", "I Cor.", "I Co.", "1Cor.", "1Co.", "I Corinthians", "1Corinthians", "1st Corinthians", "First Corinthians"],
    "2co": ["2 Cor.", "2 Co.", "II Cor.", "II Co.", "2Cor.", "2Co.", "II Corinthians", "2Corinthians", "2nd Corinthians", "Second Corinthians"],
    "gal": ["Gal.", "Ga."],
    "eph": ["Eph.", "Ephes."],
    "php": ["Phil.", "Php.", "Pp."],
    "col": ["Col.", "Co."],
    "1th": ["1 Thess.", "1 Thes.", "1 Th.", "I Thessalonians", "I Thess.", "I Thes.", "I Th.", "1Thessalonians", "1Thess.", "1Thes.", "1Th.", "1st Thessalonians", "1st Thess.", "First Thessalonians", "First Thess."],
    "2th": ["2 Thess.", "2 Thes.", "2 Th.", "II Thessalonians", "II Thess.", "II Thes.", "II Th.", "2Thessalonians", "2Thess.", "2Thes.", "2Th.", "2nd Thessalonians", "2nd Thess.", "Second Thessalonians", "Second Thess."],
    "1ti": ["1 Tim.", "1 Ti.", "I Timothy", "I Tim.", "I Ti.", "1Timothy", "1Tim.", "1Ti.", "1st Timothy", "1st Tim.", "First Timothy", "First Tim."],
    "2ti": ["2 Tim.", "2 Ti.", "II Timothy", "II Tim.", "II Ti.", "2Timothy", "2Tim.", "2Ti.", "2nd Timothy", "2nd Tim.", "Second Timothy", "Second Tim."],
    "tit": ["Titus", "Tit", "ti"],
    "phm": ["Philem.", "Phm.", "Pm."],
    "heb": ["Heb."],
    "jas": ["James", "Jas", "Jm"],
    "1pe": ["1 Pet.", "1 Pe.", "1 Pt.", "1 P.", "I Pet.", "I Pt.", "I Pe.", "1Peter", "1Pet.", "1Pe.", "1Pt.", "1P.", "I Peter", "1st Peter", "First Peter"],
    "2pe": ["2 Pet.", "2 Pe.", "2 Pt.", "2 P.", "II Peter", "II Pet.", "II Pt.", "II Pe.", "2Peter", "2Pet.", "2Pe.", "2Pt.", "2P.", "2nd Peter", "Second Peter"],
    "1jn": ["1 John", "1 Jhn.", "1 Jn.", "1 J.", "1John", "1Jhn.", "1Joh.", "1Jn.", "1Jo.", "1J.", "I John", "I Jhn.", "I Joh.", "I Jn.", "I Jo.", "1st John", "First John"],
    "2jn": ["2 John", "2 Jhn.", "2 Jn.", "2 J.", "2John", "2Jhn.", "2Joh.", "2Jn.", "2Jo.", "2J.", "II John", "II Jhn.", "II Joh.", "II Jn.", "II Jo.", "2nd John", "Second John"],
    "3jn": ["3 John", "3 Jhn.", "3 Jn.", "3 J.", "3John", "3Jhn.", "3Joh.", "3Jn.", "3Jo.", "3J.", "III John", "III Jhn.", "III Joh.", "III Jn.", "III Jo.", "3rd John", "Third John"],
    "jud": ["Jude", "Jud.", "Jd."],
    "rev": ["Rev", "Re"],
}
