
import {books_ordered} from '../../parts/bible.js'

import type {MasterList, MasterLink, Span} from './types'


// Order a pair of spans so the canonically-earlier passage comes first (the detector convention)
export function canonical_pair(a:Span, b:Span):MasterLink{
    const a_index = books_ordered.indexOf(a[0])
    const b_index = books_ordered.indexOf(b[0])
    const a_first = a_index !== b_index ? a_index < b_index
        : (a[1] !== b[1] ? a[1] < b[1] : a[2] <= b[2])
    return a_first ? [a, b] : [b, a]
}


// Merge single-verse links that are adjacent on BOTH sides into one range link — e.g. a quotation
// spanning several verses (Acts 2:17-21 ← Joel 2:28-32). Only merges within one source and target
// chapter; this also absorbs the off-by-one cross-pairings that per-verse matching produces.
export function merge_ranges(links:MasterList):MasterList{

    // Single-verse links can fold; pass any existing ranges straight through
    const merged:MasterList = []
    const groups = new Map<string, [number, number][]>()  // key → [source_verse, target_verse]
    const group_meta = new Map<string, {sbook:string, sc:number, tbook:string, tc:number}>()
    for (const link of links){
        if (!is_single(link[0]) || !is_single(link[1])){
            merged.push(link)
            continue
        }
        const [s, t] = link
        const key = `${s[0]}|${s[1]}|${t[0]}|${t[1]}`  // source book/chapter + target book/chapter
        let pairs = groups.get(key)
        if (!pairs){
            pairs = []
            groups.set(key, pairs)
            group_meta.set(key, {sbook: s[0], sc: s[1], tbook: t[0], tc: t[1]})
        }
        pairs.push([s[2], t[2]])
    }

    // Within each group, fold diagonal runs (source+1 → target+1) into ranges
    for (const [key, pairs] of groups){
        const {sbook, sc, tbook, tc} = group_meta.get(key)!
        pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
        const present = new Set(pairs.map(([sv, tv]) => `${sv},${tv}`))
        const consumed = new Set<string>()
        for (const [sv, tv] of pairs){
            if (consumed.has(`${sv},${tv}`)){
                continue
            }
            // Extend the diagonal while consecutive source AND target verses both exist
            let end_sv = sv
            let end_tv = tv
            while (present.has(`${end_sv + 1},${end_tv + 1}`)){
                end_sv += 1
                end_tv += 1
            }
            if (end_sv > sv){
                // A real multi-verse run: absorb every pair inside its box and emit one range
                for (const [psv, ptv] of pairs){
                    if (psv >= sv && psv <= end_sv && ptv >= tv && ptv <= end_tv){
                        consumed.add(`${psv},${ptv}`)
                    }
                }
                merged.push([[sbook, sc, sv, sc, end_sv], [tbook, tc, tv, tc, end_tv]])
            } else {
                // Isolated single verse → keep as-is
                consumed.add(`${sv},${tv}`)
                merged.push([[sbook, sc, sv, sc, sv], [tbook, tc, tv, tc, tv]])
            }
        }
    }
    return merged
}


// Fold links that share one identical span and whose other side is consecutive single verses
// into a single range link — OpenBible stores a range relationship as repeated per-verse rows
// (Gen 1:1→Jhn 1:1-3, Gen 1:2→Jhn 1:1-3 …), so this recovers the underlying range→range link.
// `shared` names the side that must be identical; the other side's verse runs fold.
export function fold_shared_side(links:MasterList, shared:0|1):MasterList{
    const other = shared === 0 ? 1 : 0

    // Group foldable links by shared span + the folding side's book and chapter
    const result:MasterList = []
    const groups = new Map<string, {fixed:Span, book:string, ch:number, verses:number[]}>()
    for (const link of links){
        const fold_side = link[other]!
        if (!is_single(fold_side)){
            result.push(link)
            continue
        }
        const key = `${link[shared]!.join(',')}|${fold_side[0]}|${fold_side[1]}`
        let group = groups.get(key)
        if (!group){
            group = {fixed: link[shared]!, book: fold_side[0], ch: fold_side[1], verses: []}
            groups.set(key, group)
        }
        group.verses.push(fold_side[2])
    }

    // Fold each group's consecutive verse runs into range spans
    for (const {fixed, book, ch, verses} of groups.values()){
        verses.sort((x, y) => x - y)
        let start = verses[0]!
        let end = start
        const emit = () => {
            const folded:Span = [book, ch, start, ch, end]
            result.push(shared === 0 ? [fixed, folded] : [folded, fixed])
        }
        for (const verse of verses.slice(1)){
            if (verse === end || verse === end + 1){
                end = verse
            } else {
                emit()
                start = verse
                end = verse
            }
        }
        emit()
    }
    return result
}


// Whether a span covers exactly one verse
function is_single(span:Span):boolean{
    return span[1] === span[3] && span[2] === span[4]
}
