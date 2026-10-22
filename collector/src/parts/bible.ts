import {last_verse} from '@gracious.tech/bible-references'


// TODO Get from client and publish separate to manifest as only needed for non-JS languages

// Bible book ids in traditional order
export const books_ordered = [
    'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch',
    '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk',
    'dan', 'hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal',
    'mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th',
    '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud',
    'rev',
]


// Usual English names of Bible books
export const book_names_english: Record<string, string> = {
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


// Whether a verse range exists in the standard versification (known book, chapters/verses in range,
// ascending). Used to reject references parsed from external data rather than store them blindly.
export function is_valid_range(book:string, start_chapter:number, start_verse:number,
        end_chapter:number, end_verse:number):boolean{
    const chapters = last_verse[book]
    const exists = (chapter:number, verse:number) => Number.isInteger(chapter)
        && Number.isInteger(verse) && chapter >= 1 && verse >= 1
        && verse <= (chapters?.[chapter - 1] ?? 0)
    return exists(start_chapter, start_verse) && exists(end_chapter, end_verse)
        && (end_chapter > start_chapter
            || (end_chapter === start_chapter && end_verse >= start_verse))
}
