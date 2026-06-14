// Patches for translations that should really be fixed upstream


// Books that have a substantial amount of poetry (not just a stanza here and there)
// NOTE Taken from paper.bible
const lots_of_poetry = [
    'job',  // Job
    'psa',  // Psalms
    'pro',  // Proverbs
    'ecc',  // Ecclesiastes
    'sng',  // Song of Songs
    'isa',  // Isaiah
    'jer',  // Jeremiah
    'lam',  // Lamentations
    'ezk',  // Ezekiel
    // 'dan',  Daniel       (some stanzas but still part of the narrative)
    'hos',  // Hosea
    'jol',  // Joel
    'amo',  // Amos
    'oba',  // Obadiah
    // 'jon',  Jonah        (just one prayer)
    'mic',  // Micah
    'nam',  // Nahum
    'hab',  // Habakkuk
    'zep',  // Zephaniah
    'hag',  // Haggai
    'zec',  // Zechariah
    // 'mal',  Malachi      (dialogue, not stanzas)
]


export function pre_usx_to_json(translation:string, book:string, usx:string){

    // BSB uses blank lines between titles and paragraphs etc. resulting in too much space
    // But they are important to preserve for poetry, so target only non-poetry books
    if (translation === 'eng_bsb' && !lots_of_poetry.includes(book)){
        usx = usx.replaceAll('<para style="b"/>', '')
    }

    // nmq_wft has a typo in MRK where 11:30 is numbered 11:3
    // NOTE Anchored to preceding 11:29 eid so the real 11:3 earlier in the chapter is untouched
    if (translation === 'nmq_wft' && book === 'mrk'){
        usx = usx.replace(
            /(<verse eid="MRK 11:29" \/>)<verse number="3" style="v" sid="MRK 11:3" \/>([^<]*)<verse eid="MRK 11:3" \/>/,
            '$1<verse number="30" style="v" sid="MRK 11:30" />$2<verse eid="MRK 11:30" />')
    }

    // mpz_ea has an empty verse marker in MRK after 2:12
    if (translation === 'mpz_ea' && book === 'mrk'){
        usx = usx.replace('<verse number="" style="v" sid="MRK 2:" /><verse eid="MRK 2:" />', '')
    }

    // hau_bib includes deuterocanonical Daniel 14 (Bel and the Dragon) which 66-book can't keep
    if (translation === 'hau_bib' && book === 'dan'){
        usx = usx.replace(/<chapter number="14"[\s\S]*<chapter eid="DAN 14"[^>]*\/>/, '')
    }

    // Some translations include empty chapter markers with no verses at all, usually a trailing
    // chapter of a versification that splits the last chapter (e.g. JOL 4 in cmn_csbs/bel_bbb)
    usx = usx.replace(
        /<chapter[^>]*sid="[A-Z0-9]{3} (\d+)"[^>]*\/>\s*<chapter[^>]*eid="[A-Z0-9]{3} \1"[^>]*\/>/g,
        '')

    // cmn_bib has moved ISA 38:21-22 to after ISA 38:6 for text critical reasons
    // Preserve their text but merge the verses into 38:6 so numbering stays sequential
    if (translation === 'cmn_bib' && book === 'isa'){
        usx = usx
            .replace('<verse eid="ISA 38:6"/>', '')
            .replace('<verse number="21" style="v" sid="ISA 38:21"/>', '')
            .replace('<verse eid="ISA 38:21"/>', '')
            .replace('<verse number="22" style="v" sid="ISA 38:22"/>', '')
            .replace('<verse eid="ISA 38:22"/>', '<verse eid="ISA 38:6"/>')
    }

    return usx
}
