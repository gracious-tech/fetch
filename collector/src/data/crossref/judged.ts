
// Interpretation of the recorded LLM judgments (judge/results.json) into categories.
// The record itself is permanent — produced once by the judge/ campaign and committed — while
// everything in this file is freely iterable: thresholds, caps, and future cross-checks against
// our own original-language analysis can change without ever re-running the LLM.

import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {PKG_PATH, read_json} from '../../parts/utils.js'

import type {Span, MasterLink, MasterList, CrossrefCategory} from './types'


// The permanent record of judgments — the src copy is canonical and is where the campaign
// writes; the dist copy (created by the build) only serves npm installs without src
export const RESULTS_SRC = join(PKG_PATH, 'src', 'data', 'crossref', 'judge', 'results.json')
const RESULTS_DIST = join(PKG_PATH, 'dist', 'data', 'crossref', 'judge', 'results.json')

// The record to read (resolved at call time so a record created mid-session is picked up)
export function results_path():string{
    return existsSync(RESULTS_SRC) ? RESULTS_SRC : RESULTS_DIST
}

// The categories the judge may assign (matching CrossrefCategory; 'none' marks rejection)
export const CATEGORIES:CrossrefCategory[] =
    ['quotation', 'parallel', 'allusion', 'mention', 'relevant']

// Minimum salience per published size — the 1k-pair pilot showed the judge parks weak thematic
// pairs at salience 2 rather than rejecting them, and 3+ is where quality holds up; the small
// size keeps only the strongest (4+). Adjustable without re-judging since salience is recorded.
export const SIZE_MIN_SALIENCE = {full: 3, small: 4} as const
export type CrossrefSize = keyof typeof SIZE_MIN_SALIENCE

// Priority of categories when choosing between near-duplicate variants (strongest kind first)
const CATEGORY_PRIORITY:CrossrefCategory[] =
    ['quotation', 'parallel', 'allusion', 'mention', 'relevant']


// One recorded judgment for a candidate pair
// NOTE 'theme' records a loose topical tie — never its own published category, but strong ones
// (salience 3+) publish as 'relevant'; 'none' means no meaningful connection at all
export interface Judgment {
    category:CrossrefCategory|'theme'|'none'
    point:string
    salience:number
}

// The full record, keyed by pair key ("book,sc,sv,ec,ev>book,sc,sv,ec,ev")
export type Judged = Record<string, Judgment>


// A publishable judged link (category already resolved from the judgment)
interface JudgedLink {
    key:string
    pair:MasterLink
    category:CrossrefCategory
    salience:number
}


// The interpreted judgments: per-size category lists, plus every recorded pair's salience
// (keyed like the record; 'none' counts as 0 so it never passes a size threshold)
export interface JudgedInterpretation {
    sizes:Record<CrossrefSize, Record<CrossrefCategory, MasterList>>
    scores:Map<string, number>
}


// Interpret the recorded judgments into per-category master lists for each published size
// NOTE Pair spans are encoded in the record's keys, so no other data source is needed
export function judged_categories():JudgedInterpretation{
    const empty = ():Record<CrossrefCategory, MasterList> =>
        ({quotation: [], parallel: [], allusion: [], mention: [], relevant: []})
    const sizes = {full: empty(), small: empty()}
    const scores = new Map<string, number>()
    if (!existsSync(results_path())){
        console.warn('crossref: no judge results recorded yet (judge/results.json missing)')
        return {sizes, scores}
    }

    // Collect every judgment strong enough for the full size, publishing 'theme' as relevant
    const judged = read_json<Judged>(results_path())
    const links:JudgedLink[] = []
    for (const [key, judgment] of Object.entries(judged)){
        scores.set(key, judgment.category === 'none' ? 0 : judgment.salience)
        if (judgment.category === 'none' || judgment.salience < SIZE_MIN_SALIENCE.full){
            continue
        }
        const category = judgment.category === 'theme' ? 'relevant' : judgment.category
        links.push({key, pair: key_to_pair(key), category, salience: judgment.salience})
    }

    // Drop near-duplicate variants, then split by size (small is a subset of full)
    for (const link of drop_near_duplicates(links)){
        for (const size of Object.keys(SIZE_MIN_SALIENCE) as CrossrefSize[]){
            if (link.salience >= SIZE_MIN_SALIENCE[size]){
                sizes[size][link.category].push(link.pair)
            }
        }
    }
    return {sizes, scores}
}


// Whether a link from our own detectors belongs in a size — judged ones follow the same salience
// thresholds as OpenBible pairs, while any not yet judged are kept (they are verified textual
// matches or translator footnotes)
export function algorithmic_in_size(link:MasterLink, size:CrossrefSize,
        scores:Map<string, number>):boolean{
    const score = scores.get(link.map(span => span.join(',')).join('>'))
    return score === undefined || score >= SIZE_MIN_SALIENCE[size]
}


// Score used to order a published link (higher first) — the judge's salience where recorded
// NOTE A range merged from judged single-verse pairs takes the best of its parts; a link only our
//      own detectors found and not yet judged ranks just below 5 (a verified textual match)
export function link_score(link:MasterLink, scores:Map<string, number>):number{
    const exact = scores.get(link.map(span => span.join(',')).join('>'))
    if (exact !== undefined){
        return exact
    }

    // Look up the single-verse pairs a merged range could have been built from
    const [a, b] = link
    let best:number|undefined
    if (a[1] === a[3] && b[1] === b[3]){
        for (let av = a[2]; av <= a[4]; av++){
            for (let bv = b[2]; bv <= b[4]; bv++){
                const key = `${a[0]},${a[1]},${av},${a[1]},${av}>${b[0]},${b[1]},${bv},${b[1]},${bv}`
                const score = scores.get(key)
                if (score !== undefined){
                    best = Math.max(best ?? 0, score)
                }
            }
        }
    }
    return best ?? 4.5
}


// Drop links that a near-duplicate variant beats — OpenBible often holds both a verse-level and
// a range row for the same connection (gen 2:1-2 > heb 4:3-4 vs gen 2:1-2 > heb 4:4)
// NOTE Variants share one side exactly while the other side contains the other. Each link is
//      compared pairwise (not clustered) so two distinct links inside one wide variant both
//      survive when they each beat it.
function drop_near_duplicates(links:JudgedLink[]):JudgedLink[]{

    // Index links by each side's exact span, so variants are found by the shared side
    const by_side = [new Map<string, JudgedLink[]>(), new Map<string, JudgedLink[]>()]
    for (const link of links){
        for (const side of [0, 1] as const){
            const span_key = link.pair[side].join(',')
            const group = by_side[side]!.get(span_key) ?? []
            group.push(link)
            by_side[side]!.set(span_key, group)
        }
    }

    // A link is dropped if any variant whose other side contains or is contained by its own wins
    const dropped = new Set<string>()
    for (const side of [0, 1] as const){
        const other = side === 0 ? 1 : 0
        for (const group of by_side[side]!.values()){
            for (const x of group){
                for (const y of group){
                    if (x !== y && related_spans(x.pair[other], y.pair[other])
                            && beats(y, x)){
                        dropped.add(x.key)
                    }
                }
            }
        }
    }
    return links.filter(link => !dropped.has(link.key))
}


// Resolve near-duplicate variants between algorithmic and judged links (one size's lists)
// NOTE A variant pair shares one side exactly while the other side contains the other. The
//      stronger category wins; on a tie the judged link wins since the judge saw both texts.
export function drop_algorithmic_variants(algo:Record<CrossrefCategory, MasterList>,
        judged:Record<CrossrefCategory, MasterList>):
        {algo:Record<CrossrefCategory, MasterList>, judged:Record<CrossrefCategory, MasterList>}{

    // Index judged links by each side's exact span
    interface Entry {pair:MasterLink, category:CrossrefCategory}
    const by_side = [new Map<string, Entry[]>(), new Map<string, Entry[]>()]
    for (const category of CATEGORY_PRIORITY){
        for (const pair of judged[category]){
            for (const side of [0, 1] as const){
                const span_key = pair[side].join(',')
                const group = by_side[side]!.get(span_key) ?? []
                group.push({pair, category})
                by_side[side]!.set(span_key, group)
            }
        }
    }

    // Compare each algorithmic link against the judged links sharing one of its sides
    const dropped = new Set<MasterLink>()
    for (const category of CATEGORY_PRIORITY){
        for (const pair of algo[category]){
            for (const side of [0, 1] as const){
                const other = side === 0 ? 1 : 0
                for (const variant of by_side[side]!.get(pair[side].join(',')) ?? []){
                    if (!related_spans(pair[other], variant.pair[other])){
                        continue
                    }
                    const stronger = CATEGORY_PRIORITY.indexOf(category)
                        < CATEGORY_PRIORITY.indexOf(variant.category)
                    dropped.add(stronger ? variant.pair : pair)
                }
            }
        }
    }

    // Filter both sides' lists by what was dropped
    const filter = (lists:Record<CrossrefCategory, MasterList>) =>
        Object.fromEntries(CATEGORY_PRIORITY.map(category =>
            [category, lists[category].filter(pair => !dropped.has(pair))]),
        ) as Record<CrossrefCategory, MasterList>
    return {algo: filter(algo), judged: filter(judged)}
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
function beats(a:JudgedLink, b:JudgedLink):boolean{
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
