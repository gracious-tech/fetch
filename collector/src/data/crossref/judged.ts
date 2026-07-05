
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

// Judgments below this salience are discarded — the 1k-pair pilot showed the judge parks weak
// thematic pairs at salience 2 rather than rejecting them, and 3+ is where quality holds up.
// Adjustable without re-judging since every judgment (with salience) is recorded.
const MIN_SALIENCE = 3

// Only "relevant" is capped (per verse endpoint, ranked by the judge's salience) since it is the
// judgment-based tier most prone to theme-dump re-expansion; other categories are factual
const RELEVANT_VERSE_CAP = 3


// One recorded judgment for a candidate pair
// NOTE 'theme' records a loose topical tie — kept in the record for possible later use, but
// never published as a category; 'none' means no meaningful connection at all
export interface Judgment {
    category:CrossrefCategory|'theme'|'none'
    point:string
    salience:number
}

// The full record, keyed by pair key ("book,sc,sv,ec,ev>book,sc,sv,ec,ev")
export type Judged = Record<string, Judgment>


// Interpret the recorded judgments into per-category master lists
// NOTE Pair spans are encoded in the record's keys, so no other data source is needed
export function judged_categories():Record<CrossrefCategory, MasterList>{
    const result:Record<CrossrefCategory, MasterList> =
        {quotation: [], parallel: [], allusion: [], mention: [], relevant: []}
    if (!existsSync(results_path())){
        console.warn('crossref: no judge results recorded yet (judge/results.json missing)')
        return result
    }
    const judged = read_json<Judged>(results_path())
    const relevant:{pair:MasterLink, salience:number}[] = []
    for (const [key, judgment] of Object.entries(judged)){
        if (judgment.category === 'none' || judgment.category === 'theme'
                || judgment.salience < MIN_SALIENCE){
            continue
        }
        const pair = key_to_pair(key)
        if (judgment.category === 'relevant'){
            relevant.push({pair, salience: judgment.salience})
        } else {
            result[judgment.category].push(pair)
        }
    }
    result.relevant = cap_relevant(relevant)
    return result
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


// Cap relevant links per verse endpoint, keeping the most salient (prevents theme-dumps)
function cap_relevant(accepted:{pair:MasterLink, salience:number}[]):MasterList{
    accepted.sort((x, y) => y.salience - x.salience)
    const counts = new Map<string, number>()
    const links:MasterList = []
    for (const {pair} of accepted){
        const [a, b] = pair
        const key_a = `${a[0]},${a[1]},${a[2]}`
        const key_b = `${b[0]},${b[1]},${b[2]}`
        const count_a = counts.get(key_a) ?? 0
        const count_b = counts.get(key_b) ?? 0
        if (count_a >= RELEVANT_VERSE_CAP || count_b >= RELEVANT_VERSE_CAP){
            continue
        }
        counts.set(key_a, count_a + 1)
        counts.set(key_b, count_b + 1)
        links.push(pair)
    }
    return links
}
