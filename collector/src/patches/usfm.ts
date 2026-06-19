// Raw-USFM quirk-fix helpers (run in pre_convert, before usfmtc converts to USX)
//
// Doing folds/placeholders here lets usfmtc convert once and emit correct paragraph vids, so the
// derived USFM/USX/HTML/TXT all come out clean (a post-conversion fold leaves stale vids that make
// usfmtc regenerate spurious \v markers). All are idempotent: they key on the displaced verse still
// carrying text, so once it is an empty placeholder (or absent) they are no-ops. The USX3-level
// counterparts live in ./usx.ts.


// Find the position just past a verse's content within a chapter slice: its \v line plus any
// following body-continuation lines that CARRY TEXT (poetry \q, \p with text, …). Stops before an
// empty setup marker, a heading/verse marker, or chapter end — i.e. where a placeholder for the
// next verse belongs. Returns -1 if the verse marker is absent.
function verse_block_end(chap:string, after_verse:number):number{
    const m = new RegExp(
        `\\\\v ${after_verse}(?!\\d)[^\\n]*\\n`
        + `(?:\\\\(?:q\\d*|p|m|mi|pi\\d*|pc|pm|pmo|li\\d*|nb)\\b[ \\t]*\\S[^\\n]*\\n)*`).exec(chap)
    return m ? m.index + m[0].length : -1
}


// Return [start, end] string offsets spanning a chapter (its \c marker up to the next \c), or null
function usfm_chapter_bounds(usfm:string, chapter:number):[number, number]|null{
    const start = new RegExp(`\\\\c ${chapter}(?!\\d)`).exec(usfm)
    if (!start){
        return null
    }
    const rest = usfm.slice(start.index + start[0].length)
    const next = new RegExp(`\\\\c ${chapter + 1}(?!\\d)`).exec(rest)
    const end = next ? start.index + start[0].length + next.index : usfm.length
    return [start.index, end]
}


// Drop the \v marker for a displaced/spurious verse (the copy still followed by text) so its text
// folds into the preceding verse. `verse` may be a number or a string like '0'. No placeholder.
export function usfm_fold_verse(usfm:string, chapter:number, verse:number|string):string{
    const bounds = usfm_chapter_bounds(usfm, chapter)
    if (!bounds){
        return usfm
    }
    const [s, e] = bounds
    const chap = usfm.slice(s, e)
    const displaced = new RegExp(`\\\\v ${verse}(?!\\d)[ \\t]+(?=\\S)`)
    if (!displaced.test(chap)){
        return usfm
    }
    return usfm.slice(0, s) + chap.replace(displaced, '') + usfm.slice(e)
}


// USFM: insert an empty \v placeholder for `verse` right after `after_verse`'s content (before the
// next line-level marker, or at chapter end). For editions that omit/merge verses but should keep
// the standard numbering. No-op if the verse already exists.
export function usfm_insert_empty_verse(usfm:string, chapter:number, verse:number,
        after_verse:number):string{
    const bounds = usfm_chapter_bounds(usfm, chapter)
    if (!bounds){
        return usfm
    }
    const [s, e] = bounds
    let chap = usfm.slice(s, e)
    if (new RegExp(`\\\\v ${verse}(?!\\d)`).test(chap)){
        return usfm
    }
    const pos = verse_block_end(chap, after_verse)
    if (pos === -1){
        return usfm
    }
    chap = chap.slice(0, pos) + `\\v ${verse}\n` + chap.slice(pos)
    return usfm.slice(0, s) + chap + usfm.slice(e)
}


// The "standard fix" for a single out-of-order verse at raw-USFM level: drop the displaced \v
// marker (folding its text into the preceding verse) and insert an empty \v placeholder before the
// first verse marker after `place_after`, so the chapter reads ascending without moving text.
export function usfm_reorder_verse(usfm:string, chapter:number, verse:number,
        place_after:number):string{
    const bounds = usfm_chapter_bounds(usfm, chapter)
    if (!bounds){
        return usfm
    }
    const [s, e] = bounds
    let chap = usfm.slice(s, e)
    const displaced = new RegExp(`\\\\v ${verse}(?!\\d)[ \\t]+(?=\\S)`)
    if (!displaced.test(chap)){
        return usfm  // already folded — no text-bearing copy remains
    }
    chap = chap.replace(displaced, '')
    // Insert the empty placeholder right after place_after's text — i.e. before the next line-level
    // marker (\s, \p, \v, …), or at the chapter's end if place_after is the last verse — so any
    // following heading/paragraph keeps attaching to the next verse, matching the hand edits.
    // place_after === 0 means the verse belongs at the chapter start (right after the \c marker).
    if (place_after === 0){
        const cm = new RegExp(`\\\\c ${chapter}(?!\\d)[^\\n]*\\n`).exec(chap)
        if (cm){
            const pos = cm.index + cm[0].length
            chap = chap.slice(0, pos) + `\\v ${verse}\n` + chap.slice(pos)
        }
    } else {
        const pos = verse_block_end(chap, place_after)
        if (pos !== -1){
            chap = chap.slice(0, pos) + `\\v ${verse}\n` + chap.slice(pos)
        }
    }
    return usfm.slice(0, s) + chap + usfm.slice(e)
}


// USFM: handle a displaced block of verses (e.g. ZEC 4's 10b-14 printed before the 6-10 oracle):
// fold each listed verse's marker into the preceding text, then add empty numeric placeholders
// after `placeholder_after` (chained) so the chapter reads ascending. String entries (sub-verses
// like "10b") are folded but get no placeholder. Idempotent (folds key on text-bearing markers).
export function usfm_displace_range(usfm:string, chapter:number,
        verses:(number|string)[], placeholder_after:number):string{
    for (const v of verses){
        usfm = usfm_fold_verse(usfm, chapter, v)
    }
    let after = placeholder_after
    for (const v of verses){
        if (typeof v === 'number'){
            usfm = usfm_insert_empty_verse(usfm, chapter, v, after)
            after = v
        }
    }
    return usfm
}


// USFM: swap the bodies of two adjacent chapters a and b (a<b) while keeping the \c markers in
// ascending order — for LXX editions that print two chapters in the opposite order. Idempotent via
// a verse-count guard: only swaps while chapter a has FEWER verses than b (the wrong order).
export function usfm_swap_chapters(usfm:string, a:number, b:number):string{
    const re = new RegExp(
        `(\\\\c ${a}(?!\\d))([\\s\\S]*?)(\\\\c ${b}(?!\\d))([\\s\\S]*?)(?=\\\\c ${b + 1}(?!\\d)|$)`)
    const m = re.exec(usfm)
    if (!m){
        return usfm
    }
    const [full, ca, content_a, cb, content_b] = m
    const max_v = (s:string) =>
        Math.max(0, ...[...s.matchAll(/\\v (\d+)/g)].map(x => parseInt(x[1]!)))
    if (max_v(content_a!) >= max_v(content_b!)){
        return usfm
    }
    return usfm.slice(0, m.index) + ca! + content_b! + cb! + content_a!
        + usfm.slice(m.index + full.length)
}


// USFM: move a verse that was misplaced earlier in the chapter to its correct slot (right after
// `after_verse`). Relocates the verse's text block (\v … up to the next \v). Idempotent: no-op once
// the verse already sits after `after_verse`.
export function usfm_move_verse(usfm:string, chapter:number, verse:number,
        after_verse:number):string{
    const bounds = usfm_chapter_bounds(usfm, chapter)
    if (!bounds){
        return usfm
    }
    const [s, e] = bounds
    let chap = usfm.slice(s, e)
    const vpos = new RegExp(`\\\\v ${verse}(?!\\d)`).exec(chap)
    const apos = new RegExp(`\\\\v ${after_verse}(?!\\d)`).exec(chap)
    if (!vpos || !apos || vpos.index > apos.index){
        return usfm
    }
    const block_m = new RegExp(`\\\\v ${verse}(?!\\d)[\\s\\S]*?(?=\\\\v \\d)`).exec(chap)
    if (!block_m){
        return usfm
    }
    chap = chap.slice(0, block_m.index) + chap.slice(block_m.index + block_m[0].length)
    const a2 = new RegExp(`\\\\v ${after_verse}(?!\\d)`).exec(chap)!
    const nextv = /\\v \d/.exec(chap.slice(a2.index + a2[0].length))
    const pos = nextv ? a2.index + a2[0].length + nextv.index : chap.length
    return usfm.slice(0, s) + chap.slice(0, pos) + block_m[0] + chap.slice(pos) + usfm.slice(e)
}


// USFM: a psalm whose Hebrew superscription was numbered as verse 1 (inconsistently — the edition
// elsewhere uses unnumbered \d titles) so it has one verse too many for the standard versification.
// Convert that \v 1 to a \d descriptive title and renumber the body verses down by one. Idempotent
// via a \d guard: once the title exists (so the superscription is no longer a verse) it is a no-op.
export function usfm_super_to_title(usfm:string, chapter:number):string{
    const bounds = usfm_chapter_bounds(usfm, chapter)
    if (!bounds){
        return usfm
    }
    const [s, e] = bounds
    let chap = usfm.slice(s, e)
    // Already converted (a \d title is present) or no leading verse to convert — nothing to do
    if (/\\d /.test(chap) || !/\\v 1(?!\d)/.test(chap)){
        return usfm
    }
    // Convert the superscription's \v 1 marker to a \d title, then shift the body verses down one.
    // The shift is a single left-to-right pass over the original numbers, so it can't collide.
    chap = chap
        .replace(/\\v 1(?!\d)[ \t]+/, '\\d ')
        .replace(/\\v (\d+)/g, (_m, n:string) => `\\v ${parseInt(n) - 1}`)
    return usfm.slice(0, s) + chap + usfm.slice(e)
}


// USFM: drop a chapter and everything after it (e.g. an appended alternate recension). No-op if
// the chapter marker is absent.
export function usfm_drop_from_chapter(usfm:string, chapter:number):string{
    const m = new RegExp(`\\\\c ${chapter}(?!\\d)`).exec(usfm)
    if (!m){
        return usfm
    }
    return usfm.slice(0, m.index).replace(/\s+$/, '') + '\n'
}


// USFM: drop the trailing verses of a chapter beyond `last_keep` (with any structural markers that
// precede the first dropped verse), e.g. to remove an appended duplicate passage. Idempotent.
export function usfm_drop_chapter_tail(usfm:string, chapter:number, last_keep:number):string{
    const bounds = usfm_chapter_bounds(usfm, chapter)
    if (!bounds){
        return usfm
    }
    const [s, e] = bounds
    const chap = usfm.slice(s, e)
    // Consume any EMPTY structural markers (e.g. \b, \q1 with no text) before the first dropped
    // verse, but never a marker carrying text (that belongs to the kept verse)
    const tail = new RegExp(
        `(?:\\n\\\\(?!v )[a-z]+\\d*[ \\t]*(?=\\n))*\\n\\\\v ${last_keep + 1}(?!\\d)[\\s\\S]*$`)
    if (!tail.test(chap)){
        return usfm
    }
    return usfm.slice(0, s) + chap.replace(tail, '\n') + usfm.slice(e)
}

