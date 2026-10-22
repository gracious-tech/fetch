// Patches for translations that should really be fixed upstream
//
// This module holds the generic and multi-translation quirk fixes. Fixes that only ever apply to a
// single translation live in specific.ts, which each stage function below delegates to. Idempotent
// helpers live in usx.ts (converted USX3) and usfm.ts (raw USFM). Every fix MUST be conditional
// (detect the quirk, then apply) so a freshly downloaded source can be safely re-patched and a
// future upstream-corrected revision is left untouched.

import {merge_overrange_verses, psalm_superscriptions_to_d} from './usx.js'
import {usfm_drop_from_chapter, usfm_swap_chapters} from './usfm.js'
import {
    pre_convert_specific,
    pre_reverse_specific,
    post_reverse_specific,
} from './specific.js'


// Translations that follow Septuagint (LXX) versification/ordering rather than the standard 66-book
// Masoretic numbering, so need LXX-specific handling (Proverbs appendix, Jeremiah reordering)
const lxx_translations = ['eng_bst', 'eng_bstb', 'eng_bstj', 'eng_bstjb', 'grc_bre', 'grc_lxx']


// LXX-recension translations whose Exodus carries the Septuagint tabernacle account (ch35-40), a
// different recension that doesn't align to the standard chapter/verse structure — published as 1-34
const lxx_exo_translations = ['eng_bstj', 'eng_bstjb', 'grc_lxx']


// Translations that carry the deuterocanonical additions to Daniel (Song of the Three at 3:24-90,
// Susanna as ch13, Bel and the Dragon as ch14) which the 66-book structure can't hold
const daniel_deuterocanon_translations =
    ['eng_drae', 'fra_ncl', 'lat_clv', 'shr_mkb', 'hrv_iva', 'mhr_mmu']


// Translations carrying the Greek additions to Esther (addition F at 10:4-13, then ch 11-16)
const esther_deuterocanon_translations = ['eng_drae', 'fra_ncl', 'lat_clv', 'hrv_hrsdc']


// Translations that combine Ezra + Nehemiah into one 23-chapter book (LXX 2 Esdras). They also
// publish Nehemiah separately as `neh`, so the trailing chapters (11-23) are a duplicate.
const ezra_nehemiah_translations = ['eng_bst', 'eng_bstb', 'grc_bre']


// Translations whose Psalter appends the deuterocanonical Psalm 151, which the standard 150-psalm
// structure can't hold (so it is pruned, flagged via meta.json `partial`)
const psalm_151_translations = ['eng_bst', 'eng_bstb', 'grc_bre', 'grc_lxx', 'mhr_mmu']


// Strip the deuterocanonical additions from Daniel so the canonical text fits standard numbering:
// drop the Song of the Three (3:24-90) and shift the canonical tail (3:91+) back by 67 so it
// resumes at 3:24, and drop the trailing Susanna (ch13) and Bel and the Dragon (ch14) chapters.
// The shifted tail (3:24-33) is left in Slavonic/rsc numbering for reverse_usx to normalise to eng.
function omit_daniel_deuterocanon(usx:string):string{

    // Remove the Song of the Three: cut from verse 3:24's start marker up to verse 3:91's start
    // marker (3:23 and 3:91 share a paragraph with the removed span, so the paragraph stays valid)
    const start = /<verse [^>]*sid="DAN 3:24"[^>]*\/>/.exec(usx)
    const resume = /<verse [^>]*sid="DAN 3:91"[^>]*\/>/.exec(usx)
    if (start && resume && resume.index > start.index){
        usx = usx.slice(0, start.index) + usx.slice(resume.index)
    }

    // Shift the canonical tail (originally 3:91 onwards) back by 67 so it resumes at 3:24
    usx = usx.replace(/<verse ([^>]*)sid="DAN 3:(\d+)"([^>]*)\/>/g,
        (match, pre:string, num:string, post:string) => {
            const verse = parseInt(num)
            if (verse < 91){
                return match
            }
            const shifted = verse - 67
            return `<verse ${pre}sid="DAN 3:${shifted}"${post}/>`.replace(
                `number="${verse}"`, `number="${shifted}"`)
        })
    usx = usx.replace(/<verse eid="DAN 3:(\d+)"\s*\/>/g, (match, num:string) => {
        const verse = parseInt(num)
        return verse >= 91 ? `<verse eid="DAN 3:${verse - 67}" />` : match
    })

    // Drop Susanna (ch13) and Bel and the Dragon (ch14), which are the final chapters
    const ch13 = /<chapter [^>]*sid="DAN 13"[^>]*\/>/.exec(usx)
    if (ch13){
        usx = usx.slice(0, ch13.index) + '</usx>'
    }

    return usx
}


// Remove a second ending of Mark if present (16:21+). Including either the long (16:9-20) or short
// ending is fine, but carrying both is illogical, so keep only through 16:20. Generic: applies to
// any translation's Mark. Idempotent — once trimmed there are no verse markers after 16:20 so it is
// a no-op (and a future upstream-corrected source with a single ending is left untouched).
function rm_mark_second_ending(usx:string):string{
    // Match end marker for 16:20 regardless of serialization (usfmtc uses ` />`, jsdom uses `/>`)
    const last_eid = /<verse\s[^>]*eid="MRK 16:20"[^>]*\/>/.exec(usx)
    if (last_eid && usx.slice(last_eid.index + last_eid[0].length).includes('<verse')){
        // Verse markers exist after the long ending (whether 16:21 or a repeat of 16:9)
        const ending = '</para>\n  <chapter eid="MRK 16"/>\n</usx>'
        usx = usx.slice(0, last_eid.index + last_eid[0].length) + ending
    }
    return usx
}


// Note left in place of LXX Exodus's missing tabernacle recension (see pre_convert below)
const lxx_exo_note = '[Chapters 35-40 are not included for LXX-based translations due to major '
    + 'differences in the Septuagint text. Please search online for "Septuagint Exodus '
    + 'differences" to learn more about this.]'


// Note left in place of LXX Jeremiah's reordered material (see pre_reverse below)
const lxx_jeremiah_note = '[Verse 25:14 onwards is not included for LXX-based translations due to '
    + 'the major differences in verse numbering. Please search online for "Septuagint Jeremiah '
    + 'differences" to learn more about this.]'


// Apply quirk fixes that must run BEFORE conversion/reversal (e.g. inject a missing chapter-1
// marker). Runs in-memory during processing so only the dist output is corrected and the stored
// source stays unmodified; download applies it in-memory too, purely to evaluate the chapter-1
// validity check (otherwise the book would be wrongly marked .invalid and never reach processing).
export function pre_convert(translation:string, book:string, contents:string):string{

    // LXX Exodus: drop the Septuagint tabernacle recension (ch35-40), then leave a note at ch35:1
    if (lxx_exo_translations.includes(translation) && book === 'exo'){
        const before = contents
        contents = usfm_drop_from_chapter(contents, 35)
        if (contents !== before){
            contents = contents.trimEnd() + '\n\\c 35\n\\p\n\\v 1 ' + lxx_exo_note + '\n'
        }
    }

    // LXX 1 Kings prints the Naboth-vineyard narrative (eng ch21) before the Aramean-war narrative
    // (eng ch20) — swap the two chapter bodies back to standard English order (verse numbers kept)
    if (lxx_translations.includes(translation) && book === '1ki'){
        contents = usfm_swap_chapters(contents, 20, 21)
    }

    return pre_convert_specific(translation, book, contents)
}


// Apply quirk fixes that must run BEFORE reverse_usx (which would otherwise throw on the content)
export function pre_reverse(translation:string, book:string, usx:string):string{

    // LXX-ordered Jeremiah diverges wildly after 25:13 (the Oracles Against the Nations are
    // relocated and reordered, with chapters split mid-content). Rather than physically reorder the
    // text, truncate at 25:13 and leave a note pointing readers to the difference. Truncating also
    // removes chapter 30, so the org-Jeremiah reverse rule (gated on JER 30:25) no longer fires.
    if (lxx_translations.includes(translation) && book === 'jer'){

        // grc_lxx additionally prints 23:7-8 at the end of the chapter (after v40); fold them into
        // v40 by dropping its eid and their start/end markers, re-closing v40 after the folded text
        if (translation === 'grc_lxx'){
            usx = usx
                .replace(/<verse eid="JER 23:40"\s*\/>/, '')
                .replace(/<verse [^>]*sid="JER 23:7"[^>]*\/>/, '')
                .replace(/<verse eid="JER 23:7"\s*\/>/, '')
                .replace(/<verse [^>]*sid="JER 23:8"[^>]*\/>/, '')
                .replace(/<verse eid="JER 23:8"\s*\/>/, '<verse eid="JER 23:40" />')
        }

        const eid_13 = /<verse eid="JER 25:13"\s*\/>/.exec(usx)
        if (eid_13){
            const head = usx.slice(0, eid_13.index + eid_13[0].length)
            usx = head
                + '</para>'
                + '<para style="p"><verse style="v" number="14" sid="JER 25:14" />'
                + `${lxx_jeremiah_note}<verse eid="JER 25:14" /></para>`
                + '<chapter eid="JER 25" /></usx>'
        }
    }

    // Strip the deuterocanonical additions from Daniel before reverse_usx tries (and fails) to
    // renumber the inflated chapter 3 and the extra chapters 13/14
    if (daniel_deuterocanon_translations.includes(translation) && book === 'dan'){
        usx = omit_daniel_deuterocanon(usx)
    }

    // Strip the Greek additions to Esther by truncating after the last canonical verse (10:3),
    // dropping addition F (10:4-13) and the appended addition chapters (11-16)
    if (esther_deuterocanon_translations.includes(translation) && book === 'est'){
        const eid_103 = /<verse eid="EST 10:3"\s*\/>/.exec(usx)
        if (eid_103){
            usx = usx.slice(0, eid_103.index + eid_103[0].length)
                + '</para><chapter eid="EST 10" /></usx>'
        }
    }

    // Truncate the combined Ezra+Nehemiah book after Ezra's last chapter (10), dropping the
    // duplicate Nehemiah chapters (11-23) which are also published as the separate `neh` book
    if (ezra_nehemiah_translations.includes(translation) && book === 'ezr'){
        const ch11 = /<chapter [^>]*sid="EZR 11"[^>]*\/>/.exec(usx)
        if (ch11){
            usx = usx.slice(0, ch11.index) + '</usx>'
        }
    }

    // Drop the deuterocanonical Psalm 151 by truncating after Psalm 150
    if (psalm_151_translations.includes(translation) && book === 'psa'){
        const ch151 = /<chapter [^>]*sid="PSA 151"[^>]*\/>/.exec(usx)
        if (ch151){
            usx = usx.slice(0, ch151.index) + '</usx>'
        }
    }

    return pre_reverse_specific(translation, book, usx)
}


// Apply quirk fixes that must run AFTER reverse_usx, mutating the normalised USX that is written to
// every dist format (usx/usfm/html/txt) so the same correction reaches all four (the single
// post-reversal patch stage — there is no format-specific patching beyond this).
export function post_reverse(translation:string, book:string, usx:string):string{

    // LXX Proverbs folds the ch30 (Agur) appendix into ch24 as extra verses past the standard 34.
    // Append that material to the last valid verse rather than dropping the book (no text moved).
    if (lxx_translations.includes(translation) && book === 'pro'){
        usx = merge_overrange_verses(book, usx)
    }

    // Normalise psalm superscriptions (often mis-styled as plain body paras) to `d` titles so they
    // are kept in every dist format rather than dropped as verse-less content
    if (book === 'psa'){
        usx = psalm_superscriptions_to_d(usx)
    }

    // Drop a second/short ending of Mark appended after the long ending (16:20)
    if (book === 'mrk'){
        usx = rm_mark_second_ending(usx)
    }

    // Remove only TRAILING empty chapter markers (no verses at all), usually a trailing chapter of
    // a versification that splits the last chapter (e.g. JOL 4 in cmn_csbs/bel_bbb). Interior empty
    // chapters are kept so the chapter sequence stays intact — some paraphrases legitimately leave
    // a chapter empty, and usx_to_json only rejects a book whose chapter 1 is empty.
    const chapter_marker = '<chapter[^>]*'
    const trailing_empty_chapter = new RegExp(
        `${chapter_marker}sid="[A-Z0-9]{3} (\\d+)"[^>]*/>\\s*`
        + `${chapter_marker}eid="[A-Z0-9]{3} \\1"[^>]*/>(\\s*)(?=</usx>)`)
    let prev_usx
    do {
        prev_usx = usx
        usx = usx.replace(trailing_empty_chapter, '$2')
    } while (usx !== prev_usx)

    return post_reverse_specific(translation, book, usx)
}

