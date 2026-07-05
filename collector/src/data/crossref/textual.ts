
import {books_ordered} from '../../parts/bible.js'
import {load_tokens} from './sources.js'
import {load_gloss_tokens} from './glosses.js'
import {canonical_pair} from './merge.js'

import type {BookTokens} from './sources'
import type {MasterList} from './types'


// Minimum length of a contiguous run of identical tokens to count as a quotation
const QUOTE_MIN_RUN = 5
// A parallel needs a strong shared run (higher than a quotation, to curb formulaic noise)
const PARALLEL_MIN_RUN = 6
// MT pass: accept only if at least this many glosses align in the same order between the two verses
const MT_MIN_ORDERED = 3
// MT pass: the ordered match must also cover at least this fraction of the shorter verse's glosses,
// so a few glosses shared incidentally between two long verses are not mistaken for a quotation
const MT_MIN_COVERAGE = 0.5
// A matched run must contain at least this many distinct content (non-stopword) tokens, so that
// formulaic function-word runs ("and it came to pass in the") are not mistaken for quotations
const QUOTE_MIN_CONTENT = 2
// Ignore non-discriminative bigrams (extremely common ones) when gathering candidates
const MAX_POSTINGS = 2000

// Ultra-common Greek function words / narrative formulae (normalised), excluded from the content
// count. Not exhaustive — just the high-frequency tokens that otherwise dominate spurious runs.
const STOPWORDS = new Set([
    'ΚΑΙ', 'ΔΕ', 'Ο', 'Η', 'ΤΟ', 'ΤΟΥ', 'ΤΗΣ', 'ΤΩΝ', 'ΤΟΝ', 'ΤΗΝ', 'ΤΑ', 'ΤΩ', 'ΤΗ', 'ΟΙ', 'ΑΙ',
    'ΕΝ', 'ΕΙΣ', 'ΕΚ', 'ΕΞ', 'ΑΠΟ', 'ΕΠΙ', 'ΠΡΟΣ', 'ΔΙΑ', 'ΜΕΤΑ', 'ΠΕΡΙ', 'ΥΠΟ', 'ΠΑΡΑ', 'ΚΑΤΑ',
    'ΓΑΡ', 'ΟΥ', 'ΟΥΚ', 'ΟΥΧ', 'ΜΗ', 'ΩΣ', 'ΟΤΙ', 'ΕΑΝ', 'ΑΝ', 'ΗΝ', 'ΕΣΤΙΝ', 'ΕΙΣΙΝ', 'ΕΓΕΝΕΤΟ',
    'ΕΙΠΕΝ', 'ΑΥΤΟΥ', 'ΑΥΤΟΝ', 'ΑΥΤΩ', 'ΑΥΤΟΣ', 'ΑΥΤΗΣ', 'ΑΥΤΩΝ', 'ΑΥΤΟΙΣ', 'ΑΥΤΗΝ', 'ΟΣ', 'ΗΣ',
])


// A location of a verse within a loaded text
interface Posting {
    book:string
    ch:number
    v:number
}


// Detect quotations: New Testament (grc_sr) citing the Septuagint/Old Testament (grc_bre)
// NOTE PoC matches normalised surface forms (Greek↔Greek); both texts share a versification
export function detect_quotations():MasterList{

    // Old Testament books are the source/origin; New Testament books are the citing side
    const split = books_ordered.indexOf('mat')
    const ot_books = books_ordered.slice(0, split)
    const nt_books = books_ordered.slice(split)
    const ot = load_tokens('grc_bre', ot_books)
    const nt = load_tokens('grc_sr', nt_books)

    // Index OT bigrams so each NT verse only scores a handful of plausible OT verses
    const index = build_bigram_index(ot)

    // For each NT verse, find OT verses sharing a long contiguous run of words
    const links:MasterList = []
    const seen = new Set<string>()
    for (const bt of Object.values(nt)){
        for (let ch = 1; ch < bt.verses.length; ch++){
            const chapter = bt.verses[ch]!
            for (let v = 1; v < chapter.length; v++){
                const tokens = chapter[v]!
                if (tokens.length < QUOTE_MIN_RUN){
                    continue
                }
                for (const cand of gather_candidates(tokens, index)){
                    const ot_tokens = ot[cand.book]!.verses[cand.ch]![cand.v]!
                    const run = best_common_run(tokens, ot_tokens)
                    if (run.length < QUOTE_MIN_RUN || count_content(run) < QUOTE_MIN_CONTENT){
                        continue
                    }
                    // Store in canonical order (OT origin first, NT citation second), once per pair
                    const key = `${cand.book}${cand.ch}:${cand.v}>${bt.book}${ch}:${v}`
                    if (seen.has(key)){
                        continue
                    }
                    seen.add(key)
                    links.push([
                        [cand.book, cand.ch, cand.v, cand.ch, cand.v],
                        [bt.book, ch, v, ch, v],
                    ])
                }
            }
        }
    }
    return links
}


// Detect quotations where the NT follows the Hebrew (MT) rather than the LXX (e.g. Matt 2:15 ←
// Hos 11:1). Greek and Hebrew can't be matched directly, so bridge via English glosses: an NT and
// OT verse that share several distinctive glosses are quoting the same text.
export function detect_quotations_mt():MasterList{

    // English glosses exist per word for both testaments (Global Bible Tools)
    const split = books_ordered.indexOf('mat')
    const ot_books = books_ordered.slice(0, split)
    const nt_books = books_ordered.slice(split)
    const ot = load_gloss_tokens(ot_books)
    const nt = load_gloss_tokens(nt_books)

    // Gather candidates by shared gloss bigrams (discriminative and bounded), reusing the surface
    // index; a single common gloss like "son" is too vague to gather on, but "egypt|called" is not
    const index = build_bigram_index(ot)

    // For each NT verse, accept OT verses whose glosses align in order and cover much of the clause
    const links:MasterList = []
    const seen = new Set<string>()
    for (const bt of Object.values(nt)){
        for (let ch = 1; ch < bt.verses.length; ch++){
            const chapter = bt.verses[ch]!
            for (let v = 1; v < chapter.length; v++){
                const nt_seq = chapter[v]!  // full content-gloss sequence for this NT verse
                if (nt_seq.length < MT_MIN_ORDERED){
                    continue
                }
                for (const cand of gather_candidates(nt_seq, index)){
                    const ot_seq = ot[cand.book]!.verses[cand.ch]![cand.v]!
                    const ordered = lcs_length(nt_seq, ot_seq)
                    const coverage = ordered / Math.min(nt_seq.length, ot_seq.length)
                    if (ordered < MT_MIN_ORDERED || coverage < MT_MIN_COVERAGE){
                        continue
                    }
                    const key = `${cand.book}${cand.ch}:${cand.v}>${bt.book}${ch}:${v}`
                    if (seen.has(key)){
                        continue
                    }
                    seen.add(key)
                    links.push([
                        [cand.book, cand.ch, cand.v, cand.ch, cand.v],
                        [bt.book, ch, v, ch, v],
                    ])
                }
            }
        }
    }
    return links
}


// Length of the longest common subsequence of two token sequences (order preserved, gaps allowed)
export function lcs_length(a:string[], b:string[]):number{
    let prev = new Array<number>(b.length + 1).fill(0)
    for (let i = 1; i <= a.length; i++){
        const cur = new Array<number>(b.length + 1).fill(0)
        for (let j = 1; j <= b.length; j++){
            cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!)
        }
        prev = cur
    }
    return prev[b.length]!
}


// Detect same-language parallels: retellings/doublets where neither is the source (Synoptic
// gospels; Samuel-Kings // Chronicles; parallel Psalms). Matched by same-language surface overlap;
// a downstream multi-verse filter separates them from formulaic noise.
export function detect_parallels():MasterList{
    const split = books_ordered.indexOf('mat')
    const links:MasterList = []
    parallels_in_corpus('hbo_wlc', books_ordered.slice(0, split), links)  // Hebrew Old Testament
    parallels_in_corpus('grc_sr', books_ordered.slice(split), links)      // Greek New Testament
    return links
}


// Find surface parallels within one translation's corpus, appending canonical single-verse links
function parallels_in_corpus(trans_id:string, books:string[], out:MasterList):void{
    const corpus = load_tokens(trans_id, books)
    const index = build_bigram_index(corpus)
    const seen = new Set<string>()
    for (const bt of Object.values(corpus)){
        for (let ch = 1; ch < bt.verses.length; ch++){
            const chapter = bt.verses[ch]!
            for (let v = 1; v < chapter.length; v++){
                const tokens = chapter[v]!
                if (tokens.length < PARALLEL_MIN_RUN){
                    continue
                }
                for (const cand of gather_candidates(tokens, index)){
                    // Skip a verse matching itself or another verse in its own chapter (refrains)
                    if (cand.book === bt.book && cand.ch === ch){
                        continue
                    }
                    const cand_tokens = corpus[cand.book]!.verses[cand.ch]![cand.v]!
                    const run = best_common_run(tokens, cand_tokens)
                    if (run.length < PARALLEL_MIN_RUN || count_content(run) < 2){
                        continue
                    }
                    const pair = canonical_pair([bt.book, ch, v, ch, v],
                        [cand.book, cand.ch, cand.v, cand.ch, cand.v])
                    const key = `${pair[0].join(',')}>${pair[1].join(',')}`
                    if (seen.has(key)){
                        continue
                    }
                    seen.add(key)
                    out.push(pair)
                }
            }
        }
    }
}


// Build a map of "tokenA|tokenB" → the verses containing that adjacent token pair
function build_bigram_index(text:Record<string, BookTokens>):Map<string, Posting[]>{
    const index = new Map<string, Posting[]>()
    for (const bt of Object.values(text)){
        for (let ch = 1; ch < bt.verses.length; ch++){
            const chapter = bt.verses[ch]!
            for (let v = 1; v < chapter.length; v++){
                const tokens = chapter[v]!
                for (let i = 0; i + 1 < tokens.length; i++){
                    const key = `${tokens[i]!}|${tokens[i + 1]!}`
                    const postings = index.get(key)
                    if (postings){
                        postings.push({book: bt.book, ch, v})
                    } else {
                        index.set(key, [{book: bt.book, ch, v}])
                    }
                }
            }
        }
    }
    return index
}


// Gather candidate OT verses sharing at least two (discriminative) bigrams with the given tokens
function gather_candidates(tokens:string[], index:Map<string, Posting[]>):Posting[]{
    const counts = new Map<string, {posting:Posting, shared:number}>()
    for (let i = 0; i + 1 < tokens.length; i++){
        const postings = index.get(`${tokens[i]!}|${tokens[i + 1]!}`)
        // Skip missing or non-discriminative (very common) bigrams
        if (!postings || postings.length > MAX_POSTINGS){
            continue
        }
        for (const posting of postings){
            const key = `${posting.book}${posting.ch}:${posting.v}`
            const existing = counts.get(key)
            if (existing){
                existing.shared += 1
            } else {
                counts.set(key, {posting, shared: 1})
            }
        }
    }
    const candidates:Posting[] = []
    for (const {posting, shared} of counts.values()){
        if (shared >= 2){
            candidates.push(posting)
        }
    }
    return candidates
}


// The longest run of identical tokens common to both sequences (the longest common substring)
export function best_common_run(a:string[], b:string[]):string[]{
    let best_len = 0
    let best_end = 0  // index in `a` just past the end of the best run
    let prev = new Array<number>(b.length + 1).fill(0)
    for (let i = 1; i <= a.length; i++){
        const cur = new Array<number>(b.length + 1).fill(0)
        for (let j = 1; j <= b.length; j++){
            if (a[i - 1] === b[j - 1]){
                cur[j] = prev[j - 1]! + 1
                if (cur[j]! > best_len){
                    best_len = cur[j]!
                    best_end = i
                }
            }
        }
        prev = cur
    }
    return a.slice(best_end - best_len, best_end)
}


// Count the distinct content (non-stopword) tokens in a run
export function count_content(run:string[]):number{
    const content = new Set<string>()
    for (const token of run){
        if (!STOPWORDS.has(token)){
            content.add(token)
        }
    }
    return content.size
}
