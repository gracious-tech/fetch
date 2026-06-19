// USX3 quirk-fix helpers (operate on converted USX3 with sid/eid verse markers)
//
// Used by both the generic (index.ts) and translation-specific (specific.ts) fixes. The raw-USFM
// counterparts (run in pre_convert, before usfmtc) live in ./usfm.ts. Every helper is idempotent:
// it detects whether the quirk is still present and is a no-op otherwise, so a freshly downloaded
// source can be safely re-patched and a future upstream-corrected revision is left untouched.

import {last_verse} from '@gracious.tech/bible-references'


// Escape a literal string for use inside a RegExp
function esc(s:string):string{
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}


// Fold a verse's text into the verse that physically precedes it, by dropping the folded verse's
// start/end markers and moving the preceding verse's end marker to after the folded text. Operates
// on converted USX3 (sid/eid markers). `into_sid`/`sid` are full ids e.g. "1CO 11:9" / "1CO 11:7".
// No-op (returns input unchanged) if any of the three markers is absent, so re-running on an
// already-fixed or upstream-corrected source is safe.
export function fold_verse(usx:string, into_sid:string, sid:string):string{
    const start_m = new RegExp(`<verse [^>]*sid="${esc(sid)}"[^>]*/>`).exec(usx)
    const end_m = new RegExp(`<verse eid="${esc(sid)}"\\s*/>`).exec(usx)
    const into_end = new RegExp(`<verse eid="${esc(into_sid)}"\\s*/>`)
    if (!start_m || !end_m || !into_end.test(usx)){
        return usx
    }
    // Idempotency guard: only fold when the verse actually has text between its markers. On an
    // already-fixed source the verse is an empty placeholder (its text already folded away), so
    // this is a no-op — likewise if a future upstream revision drops the verse entirely.
    const content = usx.slice(start_m.index + start_m[0].length, end_m.index)
    if (!/\S/.test(content)){
        return usx
    }
    // Drop the folded verse's markers (moving into_sid's end marker to after the folded text) and
    // retarget any paragraph vids that referenced it — a stale vid would make usfmtc regenerate the
    // verse when deriving USFM. Reuse the folded verse's own end marker text so the new end marker
    // keeps the document's existing self-closing style (e.g. "/>" vs " />").
    return usx
        .replace(into_end, '')
        .replace(start_m[0], '')
        .replace(end_m[0], end_m[0].replace(sid, into_sid))
        .replace(new RegExp(`vid="${esc(sid)}"`, 'g'), `vid="${into_sid}"`)
}


// Insert an empty placeholder verse immediately after another verse's end marker. Used to keep a
// chapter's numbering ascending after an out-of-order verse has been folded away with fold_verse.
// No-op if the new verse already exists or the anchor is missing.
export function insert_empty_verse(usx:string, after_sid:string, new_sid:string,
        number:string):string{
    const anchor = new RegExp(`<verse eid="${esc(after_sid)}"\\s*/>`)
    if (new RegExp(`sid="${esc(new_sid)}"`).test(usx) || !anchor.test(usx)){
        return usx
    }
    return usx.replace(anchor, match =>
        `${match}<verse number="${number}" style="v" sid="${new_sid}" />`
        + `<verse eid="${new_sid}" />`)
}


// Remove indentation between a paragraph's opening tag and immediately-following TEXT (not a child
// tag). fold_verse can leave a now-continuation paragraph that begins "<para ...>\n    text" where
// a removed verse marker used to sit; some sources join that whitespace away. Normal paragraphs
// open onto a child element (<verse>/<char>/…), so the negative lookahead leaves them untouched.
export function collapse_para_leading_ws(usx:string):string{
    return usx.replace(/(<para\b[^>]*>)\s+(?=[^<\s])/g, '$1')
}


// Append a NEW paragraph of empty placeholder verses right after `after_eid`'s closing </para>.
// For editions that fold a displaced block elsewhere but should keep ascending numbering, where the
// hand edit groups the placeholders in their own paragraph (vs insert_empty_verse, which adds one
// inline). `verses` is a list of [number, sid]. No-op if the first placeholder exists already or the
// anchor is missing, so re-running on an already-fixed source is safe.
export function append_empty_verses(usx:string, after_eid:string,
        verses:[string, string][]):string{
    const first = verses[0]
    if (!first || new RegExp(`sid="${esc(first[1])}"`).test(usx)){
        return usx
    }
    const anchor = new RegExp(`<verse eid="${esc(after_eid)}"\\s*/>\\s*</para>`)
    const m = anchor.exec(usx)
    if (!m){
        return usx
    }
    const para = '\n  <para style="p">' + verses.map(([number, sid]) =>
        `<verse number="${number}" style="v" sid="${sid}" /><verse eid="${sid}" />`).join('')
        + '</para>'
    const end = m.index + m[0].length
    return usx.slice(0, end) + para + usx.slice(end)
}


// The "standard fix" for a single out-of-order verse: fold its text into the verse it physically
// follows (`fold_into`) and add an empty placeholder at its correct numeric position (after
// `place_after`), so the chapter reads ascending without relocating any text.
export function reorder_verse(usx:string, book_ch:string, verse:number, fold_into:number,
        place_after:number):string{
    const sid = `${book_ch}:${verse}`
    usx = fold_verse(usx, `${book_ch}:${fold_into}`, sid)
    usx = insert_empty_verse(usx, `${book_ch}:${place_after}`, sid, String(verse))
    return usx
}


// Relabel a mis-numbered verse (its start marker, end marker and any continuation-paragraph vids)
// in converted USX3. Only the occurrence AFTER `after_sid` is touched, so an identically-numbered
// real verse earlier in the chapter is left alone. Idempotent (no-op once relabelled/absent).
export function relabel_verse(usx:string, book_ch:string, from_v:string, to_v:string,
        after_sid:string):string{
    const from_sid = `${book_ch}:${from_v}`
    const to_sid = `${book_ch}:${to_v}`
    const anchor = new RegExp(`sid="${esc(after_sid)}"`).exec(usx)
    if (!anchor){
        return usx
    }
    const head = usx.slice(0, anchor.index)
    let tail = usx.slice(anchor.index)
    const start = new RegExp(`<verse number="${from_v}"([^>]*)sid="${esc(from_sid)}"([^>]*)/>`)
    if (!start.test(tail)){
        return usx
    }
    tail = tail
        .replace(start, `<verse number="${to_v}"$1sid="${to_sid}"$2/>`)
        .replace(new RegExp(`<verse eid="${esc(from_sid)}"(\\s*)/>`), `<verse eid="${to_sid}"$1/>`)
        .replace(new RegExp(`vid="${esc(from_sid)}"`, 'g'), `vid="${to_sid}"`)
    return head + tail
}


// Remove a spurious verse span (its start marker, text, and end marker), but only the occurrence
// AFTER `after_eid` — so a legitimately same-numbered verse earlier in the chapter is left alone.
// Used to delete an accidental re-rendering/duplicate of a verse. No-op if no such span follows the
// anchor, so re-running on an already-fixed or upstream-corrected source is safe.
export function remove_verse_span(usx:string, sid:string, after_eid:string):string{
    const anchor = new RegExp(`<verse eid="${esc(after_eid)}"\\s*/>`).exec(usx)
    if (!anchor){
        return usx
    }
    const cut = anchor.index + anchor[0].length
    const head = usx.slice(0, cut)
    const tail = usx.slice(cut)
    const span = new RegExp(
        `<verse [^>]*sid="${esc(sid)}"[^>]*/>[\\s\\S]*?<verse eid="${esc(sid)}"\\s*/>`)
    if (!span.test(tail)){
        return usx
    }
    return head + tail.replace(span, '')
}


// USX3: drop a chapter's trailing verses beyond `last_keep` — everything from verse (last_keep+1)'s
// start marker up to the chapter's <chapter eid/> marker (spanning any intervening paragraphs and
// headings) — and close the kept verses' paragraph. The chapter end marker (and its indentation) is
// preserved. `chapter_sid` is like "MAL 3". Used to strip appended duplicate/alternate-numbering
// material. No-op if that verse or the end marker is absent, so re-running on an already-fixed or
// upstream-corrected source is safe.
export function drop_chapter_tail(usx:string, chapter_sid:string, last_keep:number):string{
    const start = new RegExp(
        `<verse number="${last_keep + 1}"[^>]*sid="${esc(chapter_sid)}:${last_keep + 1}"[^>]*/>`)
    const sm = start.exec(usx)
    if (!sm){
        return usx
    }
    const ch_end = new RegExp(`\\s*<chapter eid="${esc(chapter_sid)}"\\s*/>`)
    const em = ch_end.exec(usx.slice(sm.index))
    if (!em){
        return usx
    }
    // Keep the matched whitespace + chapter-end marker (and anything after), just close the para
    return usx.slice(0, sm.index) + '</para>' + usx.slice(sm.index + em.index)
}


// USX3: shift a contiguous run of verse numbers in a chapter by `delta` (e.g. -5), updating each
// verse's number/sid start marker plus its eid and any continuation-paragraph vids. Done in one
// pass so an overlapping source/target range can't collide. `book_ch` is like "EZK 21". The CALLER
// must gate this on a still-present marker of the un-fixed state (it is not self-idempotent — a
// second run would shift the already-shifted verses again).
export function renumber_chapter_range(usx:string, book_ch:string, from_start:number,
        from_end:number, delta:number):string{
    const in_range = (n:number) => n >= from_start && n <= from_end
    // Verse start markers (number must equal the sid's verse so a stray number= isn't touched)
    usx = usx.replace(
        new RegExp(`<verse number="(\\d+)"([^>]*?)sid="${esc(book_ch)}:(\\d+)"`, 'g'),
        (match, num:string, mid:string, sid_n:string) => {
            const n = parseInt(sid_n)
            return in_range(n) && num === sid_n
                ? `<verse number="${n + delta}"${mid}sid="${book_ch}:${n + delta}"`
                : match
        })
    // End markers (eid) and continuation-paragraph references (vid)
    return usx.replace(new RegExp(`(eid|vid)="${esc(book_ch)}:(\\d+)"`, 'g'),
        (match, attr:string, sid_n:string) => {
            const n = parseInt(sid_n)
            return in_range(n) ? `${attr}="${book_ch}:${n + delta}"` : match
        })
}


// Drop a chapter and everything after it (closing the document), e.g. to remove an appended
// alternate recension. No-op if the chapter marker is absent.
export function drop_from_chapter(usx:string, book:string, chapter:number):string{
    const m = new RegExp(`<chapter [^>]*sid="${esc(book)} ${chapter}"[^>]*/>`).exec(usx)
    if (!m){
        return usx
    }
    return usx.slice(0, m.index) + '</usx>'
}


// Merge any verses numbered beyond a chapter's standard last verse into that last verse, by
// dropping their start/end markers so text simply appends to the previous (valid) verse, not moved.
// Used for LXX Proverbs, whose chapter 24 carries the appendix/ch30 material as extra verses.
export function merge_overrange_verses(book:string, usx:string):string{
    const max_per_ch = last_verse[book]
    if (!max_per_ch){
        return usx
    }
    // Verse markers are self-describing (sid/eid carry the full chapter:verse), so no need to track
    // chapter context — drop any whose verse number exceeds the chapter's standard maximum
    return usx.replace(/<verse\b[^>]*\b(?:sid|eid)="[A-Z0-9]{3} (\d+):(\d+)"[^>]*>/g,
        (match, chapter:string, verse:string) => {
            const max = max_per_ch[parseInt(chapter) - 1]
            return max !== undefined && parseInt(verse) > max ? '' : match
        })
}

