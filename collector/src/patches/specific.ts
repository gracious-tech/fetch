// Quirk fixes that are only ever relevant to a single translation
//
// These mirror the structure of generic.ts (one function per pipeline stage) but each block is gated
// on a specific translation id. generic.ts delegates to these after its generic/multi-translation
// handling. Idempotent helpers live in usx.ts (converted USX3) and usfm.ts (raw USFM). Every fix
// MUST be conditional — detect whether the upstream quirk is still present and apply only if so — so
// a freshly downloaded source can be re-patched without the fix corrupting an already-correct (e.g.
// upstream-fixed) future revision.

import {
    append_empty_verses,
    collapse_para_leading_ws,
    drop_chapter_tail,
    fold_verse,
    insert_empty_verse,
    merge_overrange_verses,
    relabel_verse,
    remove_verse_span,
    renumber_chapter_range,
} from './usx.js'
import {
    usfm_displace_range,
    usfm_drop_chapter_tail,
    usfm_fold_verse,
    usfm_insert_empty_verse,
    usfm_move_verse,
    usfm_reorder_verse,
    usfm_super_to_title,
} from './usfm.js'


// eng_bstj / eng_bstjb PSA: a Brenton-Septuagint psalter that uses LXX *chapter* numbers but
// Hebrew/English *verse* divisions (titles as unnumbered \d, not counted as verses). Remap the
// chapters to standard English so reverse_usx — which expects either a pure LXX psalter or an
// eng one — can pass it through. Split LXX Ps 9 into eng 9 (vv1-20) + eng 10 (vv21-38 -> 1-18,
// dropping the LXX-numbering note); fold eng 11:1 (LXX Ps 10 prints it as two verses); shift LXX
// 11-145 up to eng 12-146; merge LXX 146+147 into eng 147; and drop the apocryphal Ps 151. The
// verses are already eng-divided, so footnote \fr references are left as the source has them.
// Idempotent: gated on the still-present Ps 151 marker, so it runs exactly once.
function brenton_psalter(usfm:string):string{

    // Split into preamble + per-chapter bodies, keyed by the LXX chapter number
    const parts = usfm.split(/(\\c \d+[^\n]*\n)/)
    const body_by:Record<number, string> = {}
    for (let i = 1; i < parts.length; i += 2){
        body_by[parseInt(/\\c (\d+)/.exec(parts[i]!)![1]!)] = parts[i + 1] ?? ''
    }
    // Only the un-fixed LXX-numbered psalter has Ps 151; once dropped this is a no-op
    if (!(151 in body_by)){
        return usfm
    }
    // Shift every verse number in a body by delta (single pass — used only where non-overlapping)
    const renum = (body:string, delta:number) =>
        body.replace(/\\v (\d+)/g, (_m, n:string) => `\\v ${parseInt(n) + delta}`)
    const out:string[] = [parts[0]!]
    const emit = (num:number, body:string) => {
        out.push(`\\c ${num}  \n`, body)
    }

    // eng 1-8 = LXX 1-8
    for (let c = 1; c <= 8; c++){
        emit(c, body_by[c]!)
    }
    // LXX 9 -> eng 9 (vv1-20) + eng 10 (vv21-38 -> 1-18; the LXX-vs-Hebrew numbering note removed)
    const b9 = body_by[9]!
    const note = /\n\\b {2}\n\\q1 \(Psalm 9a\\f \+ \\fr 9:20[\s\S]*?\\f\*\) {2}\n(?=\\v 21 )/.exec(b9)!
    emit(9, `${b9.slice(0, note.index)}\n`)
    out.push(`\\c 10  \n\\b  \n\\q1\n${renum(b9.slice(note.index + note[0].length), -20)}`)
    // LXX 10 -> eng 11: fold v1+v2 onto one line, then shift v3-8 down to v2-7 (v1 unchanged)
    let b11 = body_by[10]!.replace(/[ \t]*\n\\q1\n\\v 2 /, ' ')
    b11 = b11.replace(/\\v (\d+)/g,
        (m, n:string) => parseInt(n) >= 3 ? `\\v ${parseInt(n) - 1}` : m)
    emit(11, b11)
    // LXX 11-145 -> eng 12-146 (chapter +1, verses unchanged)
    for (let c = 11; c <= 145; c++){
        emit(c + 1, body_by[c]!)
    }
    // LXX 146 + 147 -> eng 147 (146 keeps vv1-11 and its \d; 147 drops its \d, vv1-9 -> 12-20)
    emit(147, body_by[146]! + renum(body_by[147]!.replace(/^\\d [^\n]*\n/, ''), 11))
    // LXX 148-150 -> eng 148-150 (the apocryphal Ps 151 is dropped)
    for (let c = 148; c <= 150; c++){
        emit(c, body_by[c]!)
    }
    return out.join('')
}


// Single-translation quirk fixes that must run BEFORE conversion/reversal (on the raw source)
export function pre_convert_specific(translation:string, book:string, contents:string):string{

    // hil_bib's USX omits every book's chapter-1 START marker (only the "<chapter eid='BOOK 1' />"
    // end marker is present; ch2+ are fine), so the validity check sees ch2 as the first chapter and
    // rejects the whole book. Inject the marker before the paragraph that holds the book's first
    // verse (matching where ch2+ markers sit — between the prior para and the verse content).
    if (translation === 'hil_bib' && !/<chapter[^>]+number="1"/.test(contents)){
        const first_verse = contents.search(/<verse\b/)
        const para_start = first_verse === -1 ? -1 : contents.lastIndexOf('<para', first_verse)
        if (para_start !== -1){
            const marker = `<chapter number="1" style="c" sid="${book.toUpperCase()} 1" />\n  `
            contents = contents.slice(0, para_start) + marker + contents.slice(para_start)
        }
    }

    // The fixes below act on raw USFM (so usfmtc converts once and emits clean paragraph vids).
    // Each folds a displaced/spurious verse into the preceding text; reorders also add an empty
    // placeholder at the verse's correct position so the chapter reads ascending.

    // eng_toe EXO 16:3 was split by a spurious \v 0 — fold it back into v3 (no placeholder)
    if (translation === 'eng_toe' && book === 'exo'){
        contents = usfm_fold_verse(contents, 16, 0)
    }

    // usa_wbt 1TI has a spurious verse 3:17 — fold it into v16 (3 has only 16 verses)
    if (translation === 'usa_wbt' && book === '1ti'){
        contents = usfm_fold_verse(contents, 3, 17)
    }

    // tcz_cho SNG has a spurious verse 6:14 — fold it into v13
    if (translation === 'tcz_cho' && book === 'sng'){
        contents = usfm_fold_verse(contents, 6, 14)
    }

    // bjr_wbt prints several single verses out of sequence
    if (translation === 'bjr_wbt'){
        if (book === 'mrk'){
            contents = usfm_reorder_verse(contents, 3, 30, 29)
        }
        if (book === 'act'){
            contents = usfm_reorder_verse(contents, 10, 46, 45)
        }
        if (book === '1co'){
            contents = usfm_reorder_verse(contents, 11, 7, 6)
            contents = usfm_reorder_verse(contents, 15, 24, 23)
        }
        if (book === 'eph'){
            contents = usfm_reorder_verse(contents, 5, 12, 11)
        }
        if (book === 'jhn'){
            contents = usfm_reorder_verse(contents, 11, 57, 56)
        }
    }

    // msy_pbt EZK has an <optbreak/> sitting where a URL's "//" belongs (http:<optbreak/>www) in
    // translator-remark paragraphs — restore the "//" so the link is valid
    if (translation === 'msy_pbt' && book === 'ezk'){
        contents = contents.replace(/(https?):<optbreak\s*\/>/g, '$1://')
    }

    // por_tft MAT 14:21 ("5.000 homens"): the ".000" was misread as a \v 000 verse marker, so the
    // "000" digits were lost from the number — restore them (drop the marker, rejoin "5.000")
    if (translation === 'por_tft' && book === 'mat'){
        contents = contents.replace(/(\d)\.\s*\\v 000\s+/, '$1.000 ')
    }

    // bqc_sim ISA prints 38:21-22 out of order between v6 and v7 — fold them into v6 (this edition
    // then ends ch38 at v20, with no placeholders)
    if (translation === 'bqc_sim' && book === 'isa'){
        contents = usfm_fold_verse(contents, 38, 21)
        contents = usfm_fold_verse(contents, 38, 22)
    }

    // gup_bsa ISA has two footnotes at 9:6-7 opened with \fe but closed with \f* — normalise to \f
    if (translation === 'gup_bsa' && book === 'isa'){
        contents = contents.replace(/\\fe /g, '\\f ')
    }

    // ukr_pan / ukr_ufb LEV omit/merge some trailing verses vs the eng standard — add empty
    // placeholders (in source numbering) so the count aligns (the LEV 5/6 boundary itself is
    // handled by a reverse-usx rule). Positions: 6:23, 14:56-57, 17:16, 21:24.
    if ((translation === 'ukr_pan' || translation === 'ukr_ufb') && book === 'lev'){
        contents = usfm_insert_empty_verse(contents, 6, 23, 22)
        contents = usfm_insert_empty_verse(contents, 14, 56, 55)
        contents = usfm_insert_empty_verse(contents, 14, 57, 56)
        contents = usfm_insert_empty_verse(contents, 17, 16, 15)
        contents = usfm_insert_empty_verse(contents, 21, 24, 23)
    }

    // kij_png / bba_sim / bis_obb ZEC 4 print the lampstand-vision tail (10b-14) before the "Not by
    // might" oracle (6-10) — fold the displaced 10b-14 into the preceding verse and add empty
    // placeholders 11-14 after the real v10 (bis_obb is USX3, handled in pre_reverse_specific)
    if ((translation === 'kij_png' || translation === 'bba_sim') && book === 'zec'){
        contents = usfm_displace_range(contents, 4, ['10b', 11, 12, 13, 14], 10)
    }

    // bba_sim ISA 38:21-22 sit out of order between v6 and v7 — fold into v6, placeholders after v20
    if (translation === 'bba_sim' && book === 'isa'){
        contents = usfm_reorder_verse(contents, 38, 21, 20)
        contents = usfm_reorder_verse(contents, 38, 22, 21)
    }

    // eng_bstj / eng_bstjb JOS 9: this Brenton edition appends the Alexandrine-codex duplicate of the
    // Ebal-altar passage as 9:30-33 (already present at 8:30-35), introduced by a footnote on the
    // merged 9:27-29. Relabel 9:27-29 (eng 9:27) to 9:27 and drop the footnote + the duplicate tail.
    if ((translation === 'eng_bstj' || translation === 'eng_bstjb') && book === 'jos'){
        contents = contents
            .replace('\\v 27-29 ', '\\v 27 ')
            .replace(/[ \t]*\\f \+ \\fr 9:27-29[\s\S]*?(?=\\c 10)/, '\n')
    }

    // eng_bstj / eng_bstjb PSA: remap the LXX-chapter / Hebrew-verse psalter to standard English
    if ((translation === 'eng_bstj' || translation === 'eng_bstjb') && book === 'psa'){
        contents = brenton_psalter(contents)
    }

    // eng_drae / lat_clv PSA: Vulgate-numbered psalter (LXX chapter scheme handled by reverse-usx).
    // A few psalms don't match the standard verse counts so the system mapping can't apply cleanly —
    // normalise them at source: convert Ps 10's superscription (numbered as v1) to a \d title, and
    // fold each psalm's split final verse back into the preceding verse. (src/LXX chapter numbers.)
    if ((translation === 'eng_drae' || translation === 'lat_clv') && book === 'psa'){
        contents = usfm_super_to_title(contents, 10)
        const folds:Record<string, [number, number][]> = {
            eng_drae: [[2, 13], [4, 10], [42, 6], [125, 7], [135, 27]],
            lat_clv: [[2, 13], [4, 10]],
        }
        for (const [chapter, verse] of folds[translation]!){
            contents = usfm_fold_verse(contents, chapter, verse)
        }
    }

    // uig_cyr PSA: Slavonic/LXX-numbered psalter (chapter scheme handled by reverse-usx). Each
    // titled psalm bundles its superscription with the first body verse as an opening range marker.
    // Split off the body verse, placing a \v marker BEFORE the existing first body line (the LXX
    // subtitle rule then turns the leading title verse(s) into a \d). The four psalms with a
    // two-verse historical title keep a \v 1-2 title and start the body at \v 3; every other titled
    // psalm gets a \v 1 title with the body at \v 2. (Not duplicating the body line — the original
    // manual edit copied it, a bug we correct here.) Done per-chapter so the right split is applied.
    if (translation === 'uig_cyr' && book === 'psa'){
        const two_verse_title = new Set(['50', '51', '53', '59'])
        const parts = contents.split(/(\\c \d+)/)
        for (let i = 1; i < parts.length; i += 2){
            const chapter = parts[i]!.slice(3).trim()
            parts[i + 1] = two_verse_title.has(chapter)
                ? parts[i + 1]!.replace(/\\v 1-3 ([\s\S]*?\n)\\m /, '\\v 1-2 $1\\m \\v 3 ')
                : parts[i + 1]!.replace(/\\v 1-[23] ([\s\S]*?\n)\\m /, '\\v 1 $1\\m \\v 2 ')
        }
        contents = parts.join('')
    }

    // grc_lxx 1SA 18 prints verses 20-22 after v29 — fold them into v29 (numbers left as a clean
    // gap, no placeholders, matching this edition)
    if (translation === 'grc_lxx' && book === '1sa'){
        contents = usfm_fold_verse(contents, 18, 20)
        contents = usfm_fold_verse(contents, 18, 21)
        contents = usfm_fold_verse(contents, 18, 22)
    }

    // srp_dkc JOB 38 has a spurious modern-rendered duplicate of 38:39-41 appended (duplicating the
    // canonical Daničić 39:1-3) — drop it so ch38 ends at v38
    if (translation === 'srp_dkc' && book === 'job'){
        contents = usfm_drop_chapter_tail(contents, 38, 38)
    }

    // aer_wbt MAT 14:1-2 were printed after v12 (the chapter opened at v3) — fold them into v12 and
    // add empty placeholders 1-2 at the chapter start
    if (translation === 'aer_wbt' && book === 'mat'){
        contents = usfm_reorder_verse(contents, 14, 1, 0)
        contents = usfm_reorder_verse(contents, 14, 2, 1)
    }

    // wrk_wbt JHN 9:14 was printed several verses too early (between v1 and v2) — move it back to
    // its correct position after v13
    if (translation === 'wrk_wbt' && book === 'jhn'){
        contents = usfm_move_verse(contents, 9, 14, 13)
    }

    // hrv_iva prints single verses out of sequence in several books (and folds a couple of split
    // verses); each reorder folds the displaced verse into the one it follows and adds a placeholder
    if (translation === 'hrv_iva'){
        if (book === 'nam'){
            contents = usfm_reorder_verse(contents, 2, 2, 1)
        }
        if (book === '1sa'){
            contents = usfm_reorder_verse(contents, 9, 9, 8)
        }
        if (book === 'hab'){
            contents = usfm_reorder_verse(contents, 2, 18, 17)
        }
        if (book === 'isa'){
            // 8:24 (the second half of eng 9:1) is folded into 8:23; 33:22 sits after v23
            contents = usfm_fold_verse(contents, 8, 24)
            contents = usfm_reorder_verse(contents, 33, 22, 21)
        }
        if (book === 'jer'){
            contents = usfm_reorder_verse(contents, 29, 8, 7)
            contents = usfm_reorder_verse(contents, 29, 9, 8)
            contents = usfm_reorder_verse(contents, 36, 9, 8)
        }
        if (book === 'job'){
            contents = usfm_reorder_verse(contents, 36, 31, 30)
        }
    }

    return contents
}


// Single-translation quirk fixes that must run BEFORE reverse_usx
export function pre_reverse_specific(translation:string, book:string, usx:string):string{

    // eng_aila / eng_ailb LUK 22:1: a stray verse marker splits the cross-reference citation under
    // the Lord's-Supper heading (duplicating the real 22:1) — drop the markers and rejoin the two
    // citation <char> runs into one so it stays as prose
    if ((translation === 'eng_aila' || translation === 'eng_ailb') && book === 'luk'){
        usx = usx.replace(
            /<char style="it">([^<]*)<\/char>\s*<verse number="1" style="v" sid="LUK 22:1"\/>\s*<char style="it">([^<]*)<\/char>\s*<verse eid="LUK 22:1"\/>/,
            '<char style="it">$1$2</char>')
    }

    // eng_aipa / eng_aipb JHN 5: a text-critical note about the omitted verse 4 is parked at the end
    // of the chapter wrapped in a duplicate 5:3 verse marker — drop the markers so it stays as prose
    if ((translation === 'eng_aipa' || translation === 'eng_aipb') && book === 'jhn'){
        usx = usx.replace(
            /<verse number="3" style="v" sid="JHN 5:3"\/>(\s*Some ancient manuscripts add verse 4[\s\S]*?)<verse eid="JHN 5:3"\/>/,
            '$1')
    }

    // cmn_bib / cmn_bibs / cab_sblg print ISA 38:21-22 out of order between v6 and v7 — fold them
    // back into v6 (no text moved), leaving the chapter ascending
    if (['cmn_bib', 'cmn_bibs', 'cab_sblg'].includes(translation) && book === 'isa'){
        usx = fold_verse(usx, 'ISA 38:6', 'ISA 38:21')
        usx = fold_verse(usx, 'ISA 38:6', 'ISA 38:22')
    }

    // akp_seed ISA 13:14 is mis-numbered as a second 13:1 (after 13:13) — relabel it to 13:14
    if (translation === 'akp_seed' && book === 'isa'){
        usx = relabel_verse(usx, 'ISA 13', '1', '14', 'ISA 13:13')
    }

    // wol_rwnt JHN: the Pericope Adulterae's lead verse (7:53) was mislabeled 8:53 at the start of
    // ch8, duplicating the real 8:53 — move it to the end of ch7 as 7:53 (standard placement). Only
    // the copy sitting before 8:1 is matched, so the real 8:53 later in the chapter is untouched.
    if (translation === 'wol_rwnt' && book === 'jhn'){
        const span =
            /<verse number="53" style="v" sid="JHN 8:53" \/>([\s\S]*?)<verse eid="JHN 8:53" \/>(?=<verse number="1" style="v" sid="JHN 8:1" \/>)/
        const m = span.exec(usx)
        if (m){
            usx = usx.replace(span, '').replace('<verse eid="JHN 7:52" />',
                `<verse eid="JHN 7:52" /><verse number="53" style="v" sid="JHN 7:53" />${m[1] ?? ''}`
                + '<verse eid="JHN 7:53" />')
        }
    }

    // nat_wft LUK 1: the prologue (1:1-4) is duplicated — after the clean first copy (whose v4 is
    // left unclosed) a second messier draft of vv2-4 appears under a repeated section heading. Close
    // the first copy's v4 and drop the duplicate heading + redraft paragraph.
    if (translation === 'nat_wft' && book === 'luk'){
        usx = usx.replace(
            /(<verse number="4" style="v" sid="LUK 1:4" \/>[^<]*)<\/para>\s*<para style="s" vid="LUK 1:4">[\s\S]*?<verse eid="LUK 1:4" \/><\/para>/,
            '$1<verse eid="LUK 1:4" /></para>')
    }

    // nat_wft 1TH 4: an alternate rendering of v14 is inserted between v14 and v15 mislabelled as a
    // second verse 1 (with a stray "4" in the text) — drop the duplicate (the real 4:1 is untouched)
    if (translation === 'nat_wft' && book === '1th'){
        usx = remove_verse_span(usx, '1TH 4:1', '1TH 4:14')
    }

    // bis_obb (USX3 source) prints several passages out of order or grouped into letter-suffixed
    // verse ranges that reverse-usx/usfmtc reject — fold the displaced material into its proper
    // verse (content kept in place) and add empty placeholders so each chapter reads ascending.
    if (translation === 'bis_obb'){
        // ISA 38: the fig-poultice sign (21-22) sat between v6 and v7 — fold into v6, placeholders
        // 21-22 (in their own paragraph) after v20
        if (book === 'isa'){
            usx = fold_verse(usx, 'ISA 38:6', 'ISA 38:21')
            usx = fold_verse(usx, 'ISA 38:6', 'ISA 38:22')
            usx = append_empty_verses(usx, 'ISA 38:20',
                [['21', 'ISA 38:21'], ['22', 'ISA 38:22']])
            usx = collapse_para_leading_ws(usx)
            // The fig-poultice footnote's origin reference still points at its old verse — retarget
            // it to v6 where the text now sits (matches the hand edit)
            usx = usx.replace('<char style="fr" closed="false">38.22: </char>',
                '<char style="fr" closed="false">38.6: </char>')
        }
        // ZEC 4: the lampstand-vision tail (10b-14) was placed after v5 — fold it into v5, relabel
        // 10a to 10, and add empty placeholders 11-14 (own paragraph) after v10
        if (book === 'zec'){
            for (const v of ['10b', '11', '12', '13', '14']){
                usx = fold_verse(usx, 'ZEC 4:5', `ZEC 4:${v}`)
            }
            usx = relabel_verse(usx, 'ZEC 4', '10a', '10', 'ZEC 4:9')
            usx = append_empty_verses(usx, 'ZEC 4:10',
                [['11', 'ZEC 4:11'], ['12', 'ZEC 4:12'], ['13', 'ZEC 4:13'], ['14', 'ZEC 4:14']])
            usx = collapse_para_leading_ws(usx)
        }
        // MAT 1: the genealogy was grouped into letter-suffixed ranges (2-6a, 6b-11, 12-16) — relabel
        // each range to its first verse and add inline empty placeholders for the rest of the range
        if (book === 'mat'){
            const ranges:[string, string, number[]][] = [
                ['2-6a', '2', [3, 4, 5]],
                ['6b-11', '6', [7, 8, 9, 10, 11]],
                ['12-16', '12', [13, 14, 15, 16]],
            ]
            for (const [from_v, to_v, fill] of ranges){
                usx = relabel_verse(usx, 'MAT 1', from_v, to_v, `MAT 1:${parseInt(to_v) - 1}`)
                let prev = to_v
                for (const n of fill){
                    usx = insert_empty_verse(usx, `MAT 1:${prev}`, `MAT 1:${n}`, String(n))
                    prev = String(n)
                }
            }
            // The 6b-11 range's cross-reference origin still carries the old range label — retarget
            // it to the relabelled verse 6 (matches the hand edit)
            usx = usx.replace('<char style="xo" closed="false">1.6b-11: </char>',
                '<char style="xo" closed="false">1.6: </char>')
        }
    }

    // shr_mkb prints several books' endings under both BHS and WLC/eng numbering, leaving appended
    // duplicate/filler material past the canonical last verse — drop the tail (keep the chapter)
    if (translation === 'shr_mkb'){
        // GEN 44:35 was a bracketed editorial placeholder (no scripture) — end ch44 at v34
        if (book === 'gen'){
            usx = drop_chapter_tail(usx, 'GEN 44', 34)
        }
        // 2CH 14:15-23 were spurious filler/debug verses after the real text ends at v14
        if (book === '2ch'){
            usx = drop_chapter_tail(usx, '2CH 14', 14)
        }
        // MAL ch3 was duplicated under BHS (3:19-24) and WLC (4:1-6) numbering — drop the BHS tail
        // so ch3 ends at v18 (the same content remains as the separate ch4)
        if (book === 'mal'){
            usx = drop_chapter_tail(usx, 'MAL 3', 18)
        }
        // EZK printed the 20/21 boundary under both numberings: a 21:1a BHS/WLC note verse, a
        // duplicate of eng 20:45-49 as 21:1b-5, then the BHS-numbered 21:6-37. Drop the note and the
        // duplicate, and renumber 21:6-37 to the standard eng 21:1-32 (20:45-49 keeps that content).
        // Gated on the 21:1a note verse so the renumber runs exactly once (it is not self-idempotent).
        if (book === 'ezk' && /sid="EZK 21:1a"/.test(usx)){
            usx = usx
                .replace(
                    /<para style="p">\s*<verse number="1a"[^>]*sid="EZK 21:1a"[^>]*\/>[\s\S]*?<verse eid="EZK 21:1a"\s*\/><\/para>\s*/,
                    '')
                .replace(
                    /<para style="p">\s*<verse number="1b"[^>]*sid="EZK 21:1b"[^>]*\/>[\s\S]*?<verse eid="EZK 21:5"\s*\/><\/para>\s*/,
                    '')
            usx = renumber_chapter_range(usx, 'EZK 21', 6, 37, -5)
        }
    }

    // snw_seed ISA 50:9 & 56:8 have the first word "SAATEKplɛ" glued onto the verse number
    // (number="9SAATEKplɛ" …) — restore the numeric markers and move the word into the verse text
    if (translation === 'snw_seed' && book === 'isa'){
        usx = usx.replace(
            /<verse number="(\d+)SAATEKplɛ" style="v" sid="(ISA \d+:\d+)SAATEKplɛ" \/>/g,
            '<verse number="$1" style="v" sid="$2" />SAATEKplɛ ')
        usx = usx.replace(/((?:eid|vid)="ISA \d+:\d+)SAATEKplɛ"/g, '$1"')
    }

    return usx
}


// Single-translation quirk fixes that must run AFTER reverse_usx, on the normalised USX that is
// written to every dist format (usx/usfm/html/txt) so the correction is consistent across all four
export function post_reverse_specific(translation:string, book:string, usx:string):string{

    // fra_ncl's Acts ends with a spurious verse 10:49 (just a stray quote mark); fold it into the
    // last valid verse so the chapter matches the standard 48-verse count
    if (translation === 'fra_ncl' && book === 'act'){
        usx = merge_overrange_verses(book, usx)
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

    return usx
}
