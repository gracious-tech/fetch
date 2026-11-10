
// Interpretation of the recorded LLM judgments (judge/results.json) into categories.
// The record itself is permanent — produced once by the judge/ campaign and committed — while
// everything in this file is freely iterable: thresholds, sizes, and future cross-checks against
// our own original-language analysis can change without ever re-running the LLM.

import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {z} from 'zod'

import {PKG_PATH, read_json} from '../../parts/utils.js'

import type {Span, MasterLink, MasterList} from './types'
import type {CrossrefCategory} from '../../parts/shared_types'


// The permanent record of judgments, read from the repo's source tree
// NOTE Not shipped in the npm package: generating crossrefs also needs the repo's
//      collection_official data alongside the collector, so it only runs from a repo checkout
export const RESULTS_SRC = join(PKG_PATH, 'src', 'data', 'crossref', 'judge', 'results.json')

// The categories the judge may assign (matching CrossrefCategory; 'none' marks rejection)
export const CATEGORIES:CrossrefCategory[] =
    ['quotation', 'parallel', 'allusion', 'mention', 'relevant']

// Minimum salience to publish at all — the 1k-pair pilot showed the judge parks weak thematic
// pairs at salience 2 rather than rejecting them, and 3+ is where quality holds up. Adjustable
// without re-judging since salience is recorded.
export const MIN_SALIENCE = 3

// Priority of categories when choosing between near-duplicate variants (strongest kind first)
const CATEGORY_PRIORITY:CrossrefCategory[] =
    ['quotation', 'parallel', 'allusion', 'mention', 'relevant']


// One recorded judgment for a candidate pair
// NOTE 'theme' records a loose topical tie — never its own published category, but strong ones
// (salience 3+) publish as 'relevant'; 'none' means no meaningful connection at all
export const judgment_schema = z.strictObject({
    category: z.enum(['quotation', 'parallel', 'allusion', 'mention', 'relevant', 'theme', 'none']),
    point: z.string(),
    salience: z.number(),
})
export type Judgment = z.infer<typeof judgment_schema>

// The full record, keyed by pair key ("book,sc,sv,ec,ev>book,sc,sv,ec,ev")
export const judged_schema = z.record(z.string(), judgment_schema)
export type Judged = z.infer<typeof judged_schema>


// Salience given to a detector link not yet judged (e.g. after re-tuning a detector) — it is a
// verified textual match or translator footnote, so is treated as strong until judged
const UNJUDGED_SALIENCE = 4


// A publishable link with its resolved category and salience
export interface ScoredLink {
    key:string
    pair:MasterLink
    category:CrossrefCategory
    salience:number
}


// Interpret the recorded judgments plus our own detectors' links into one list of publishable
// links, ordered best-first and free of duplicates
// NOTE A judged link always takes the judge's category and salience (it read both passages,
//      whereas e.g. the Greek wording detector often mistakes stock phrases for quotations);
//      only detector links not yet judged keep the detector's category.
export function interpret_links(detected:Partial<Record<CrossrefCategory, MasterList>>)
        :ScoredLink[]{

    // Collect every judgment strong enough to publish, publishing 'theme' as relevant
    const judged = existsSync(RESULTS_SRC) ? read_json(RESULTS_SRC, judged_schema) : {}
    if (!Object.keys(judged).length){
        console.warn('crossref: no judge results recorded yet (judge/results.json missing)')
    }
    const links = new Map<string, ScoredLink>()
    for (const [key, judgment] of Object.entries(judged)){
        if (judgment.category === 'none' || judgment.salience < MIN_SALIENCE){
            continue
        }
        const category = judgment.category === 'theme' ? 'relevant' : judgment.category
        links.set(key, {key, pair: key_to_pair(key), category, salience: judgment.salience})
    }

    // Add detector links not yet judged (judged ones are already handled above, including any
    // the judge rejected); a pair found by several detectors keeps the strongest category
    for (const category of CATEGORY_PRIORITY){
        for (const pair of detected[category] ?? []){
            const key = pair_key(pair)
            if (!(key in judged) && !links.has(key)){
                links.set(key, {key, pair, category, salience: UNJUDGED_SALIENCE})
            }
        }
    }

    // Drop near-duplicate variants, best first
    return drop_near_duplicates([...links.values()]).sort((a, b) => b.salience - a.salience)
}


// A pair's key, matching the record's keys ("book,sc,sv,ec,ev>book,sc,sv,ec,ev")
function pair_key(pair:MasterLink):string{
    return `${pair[0].join(',')}>${pair[1].join(',')}`
}


// Drop links that a near-duplicate variant beats — OpenBible often holds both a verse-level and
// a range row for the same connection (gen 2:1-2 > heb 4:3-4 vs gen 2:1-2 > heb 4:4)
// NOTE Variants share one side exactly while the other side contains the other. Each link is
//      compared pairwise (not clustered) so two distinct links inside one wide variant both
//      survive when they each beat it.
export function drop_near_duplicates(links:ScoredLink[]):ScoredLink[]{

    // Index links by each side's exact span, so variants are found by the shared side
    const by_side = [new Map<string, ScoredLink[]>(), new Map<string, ScoredLink[]>()]
    for (const link of links){
        for (const side of [0, 1] as const){
            const span_key = link.pair[side].join(',')
            const group = by_side[side]!.get(span_key) ?? []
            group.push(link)
            by_side[side]!.set(span_key, group)
        }
    }

    // A wider link that ties with several narrower pieces inside it is kept over the pieces, since
    // together they only split it up (psa 91:11-12 > mat 4:6 vs psa 91:11 and psa 91:12)
    const dropped = new Set<string>()
    const kept = new Set<string>()
    for (const side of [0, 1] as const){
        const other = side === 0 ? 1 : 0
        for (const group of by_side[side]!.values()){
            for (const wide of group){
                const pieces = group.filter(piece => piece !== wide
                    && related_spans(wide.pair[other], piece.pair[other])
                    && contains(wide.pair[other], piece.pair[other])
                    && ties(wide, piece))
                if (pieces.length >= 2){
                    kept.add(wide.key)
                    for (const piece of pieces){
                        dropped.add(piece.key)
                    }
                }
            }
        }
    }

    // Otherwise a link is dropped if any variant whose other side contains or is contained by its
    // own wins — a wider link kept above wins (and cannot lose) every tie, as it represents the
    // connection, but still loses to a stronger variant
    const wins = (y:ScoredLink, x:ScoredLink) => ties(y, x)
        ? kept.has(y.key) || (!kept.has(x.key) && beats(y, x))
        : beats(y, x)
    for (const side of [0, 1] as const){
        const other = side === 0 ? 1 : 0
        for (const group of by_side[side]!.values()){
            for (const x of group){
                for (const y of group){
                    if (x !== y && !dropped.has(y.key)
                            && related_spans(x.pair[other], y.pair[other]) && wins(y, x)){
                        dropped.add(x.key)
                    }
                }
            }
        }
    }
    return links.filter(link => !dropped.has(link.key))
}


// Whether two variants are equally strong (same salience and category), differing only in width
function ties(a:ScoredLink, b:ScoredLink):boolean{
    return a.salience === b.salience && a.category === b.category
}


// Whether one span contains the other (same book, distinct spans)
function related_spans(a:Span, b:Span):boolean{
    return a[0] === b[0] && a.join(',') !== b.join(',') && (contains(a, b) || contains(b, a))
}


// Whether span `outer` fully covers span `inner` (same book assumed)
function contains(outer:Span, inner:Span):boolean{
    const start = (s:Span) => s[1] * 1000 + s[2]
    const end = (s:Span) => s[3] * 1000 + s[4]
    return start(outer) <= start(inner) && end(outer) >= end(inner)
}


// Whether variant `a` should be kept over `b`: higher salience, then stronger category, then the
// narrower (more specific) pair, then key order so the choice is always deterministic
function beats(a:ScoredLink, b:ScoredLink):boolean{
    if (a.salience !== b.salience){
        return a.salience > b.salience
    }
    const a_priority = CATEGORY_PRIORITY.indexOf(a.category)
    const b_priority = CATEGORY_PRIORITY.indexOf(b.category)
    if (a_priority !== b_priority){
        return a_priority < b_priority
    }
    const a_width = pair_width(a.pair)
    const b_width = pair_width(b.pair)
    if (a_width !== b_width){
        return a_width < b_width
    }
    return a.key < b.key
}


// Rough verse count of a pair (both sides), for preferring the more specific variant
function pair_width(pair:MasterLink):number{
    return pair.reduce((sum, s) => sum + (s[3] - s[1]) * 1000 + (s[4] - s[2]) + 1, 0)
}


// Decode a record key back into its pair of spans
export function key_to_pair(key:string):MasterLink{
    const [a, b] = key.split('>')
    return [key_span(a!), key_span(b!)]
}


// Decode one side of a record key ("book,sc,sv,ec,ev")
function key_span(part:string):Span{
    const [book, sc, sv, ec, ev] = part.split(',')
    return [book!, +sc!, +sv!, +ec!, +ev!]
}
