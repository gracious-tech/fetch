
// ONE-TIME LLM judging campaign (see README.md) — everything here exists to produce
// results.json, the permanent record of judgments. Future users of the codebase consume that
// record via ../judged.ts and never run this module.

import {readFileSync, existsSync, rmSync, readdirSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'

import StreamZip from 'node-stream-zip'

import {books_ordered} from '../../../parts/bible.js'
import {PKG_PATH, read_json, write_json} from '../../../parts/utils.js'
import {extract_reference} from '../../../integrations/openbible.js'
import {canonical_pair, merge_ranges, fold_shared_side} from '../merge.js'
import {algorithmic_links} from '../index.js'
import {CATEGORIES, RESULTS_SRC} from '../judged.js'

import type {Judged} from '../judged'
import type {Span, MasterLink} from '../types'


// All campaign working state lives here (gitignored); only results.json is permanent
const JUDGE_DIR = join(PKG_PATH, 'src', 'data', 'crossref', 'judge')
const STATE_DIR = join(JUDGE_DIR, 'state')

// Raw OpenBible data (the only external input to the campaign, apart from BSB text)
const CROSSREF_ZIP =
    join(PKG_PATH, '..', 'collection_official', 'sources', 'crossref', 'cross_references.zip')
const BSB_TXT = join(PKG_PATH, '..', 'collection_official', 'dist', 'bibles', 'eng_bsb', 'txt')

// Longest passage (in verses) included in a judging prompt before truncation
const MAX_PROMPT_VERSES = 15
// Pairs per subagent slice (large slices amortise per-agent overhead — pilot-tuned)
export const SLICE_SIZE = 400

// The classification criteria (the single source of truth — subagent prompts embed this)
// NOTE Tuned via a 1k-pair pilot: strict "none", kind/strength orthogonality, retelling rule
export const JUDGE_PROMPT = `
You classify pairs of Bible passages for a cross-reference dataset. Assign each pair exactly one
category, or none. The categories describe the KIND of connection, never an interpretation:

- quotation: one passage quotes the other's wording (a citation, even if altered in transmission
  or translation). Strong shared wording, e.g. Matthew 4:4 quoting Deuteronomy 8:3.
- parallel: symmetric retellings of the same account or saying where neither passage quotes the
  other as source — recension doublets (Kings/Chronicles, Ezra 2/Nehemiah 7, parallel Psalms) and
  synoptic gospel parallels. An INDEPENDENT retelling — a repetition, refrain, or restatement
  within one book's own flow of thought is not a parallel.
- allusion: a faint but real echo of the other passage's wording or imagery, without naming
  anyone (John 1:1 echoing Genesis 1:1; Revelation 21:4 echoing Isaiah 25:8). An allusion fades
  under translation; if the tie is a named person/place/event, it is mention, not allusion. The
  echo must be distinctive enough to suggest dependence on THAT passage — stock imagery or
  motifs shared by many passages (light, darkness, shepherds, harvest) is none.
- mention: one passage refers to a person, place, or event whose account is the other passage,
  without borrowing wording (Luke 17:32 "Remember Lot's wife" → Genesis 19; Jude 11 naming Cain,
  Balaam, Korah).
- relevant: the two passages engage the SAME SPECIFIC POINT — complementing or standing in
  tension — such that a reader of one would specifically want the other because it speaks to the
  exact claim at hand (James 2:14-26 with Romans 4:1-5 on faith/works; Romans 13:1 with
  Acts 5:29 on obeying authorities; Ezekiel 18:20 with Exodus 20:5 on inherited guilt). This is
  NOT broad topic membership.
- theme: the passages genuinely share a recognisable theme or topic (both teach on prayer, both
  describe God as shepherd) but fail every test above — no shared wording, no retelling, no
  named referent, and not the same specific point. This records "related, but only loosely".
- none: everything else — pairs whose only tie is a shared word, a name used incidentally, or a
  coincidental similarity; vague devotional associations. When a pair is not even clearly
  thematic, choose none.

Category and salience are independent. Category records the KIND of connection — choose the
best-fitting one even when the connection is weak (a faint allusion is still an allusion); use
theme or none only when no kind fits at all, never to mark weakness. Salience records strength:
rate 0-5 how much a reader studying one passage would want the other (5 = an essential
counterpart, 3 = clearly worthwhile, 1 = marginal, 0 = no value). Rate honestly — weak pairs
are filtered downstream by salience, so do not inflate it to save a pair or deflate it to
reject one.
`.trim()


// A pair prepared for judging (key + readable refs + BSB text)
export interface SlicePair {
    key:string
    ref_a:string
    text_a:string
    ref_b:string
    text_b:string
}


// Load the permanent results record ({} before the campaign starts)
// NOTE The campaign always uses the canonical src copy, never the dist build copy
export function load_results():Judged{
    return existsSync(RESULTS_SRC) ? read_json<Judged>(RESULTS_SRC) : {}
}


// Save the results record, canonically sorted so re-recordings diff cleanly
export function save_results(judged:Judged):void{
    const book_order = new Map(books_ordered.map((book, i) => [book, i]))
    const sorted = Object.keys(judged).sort((x, y) => {
        const [xb, xc, xv] = x.split(','), [yb, yc, yv] = y.split(',')
        return (book_order.get(xb!)! - book_order.get(yb!)!) || (+xc! - +yc!) || (+xv! - +yv!)
    })
    write_json(RESULTS_SRC, Object.fromEntries(sorted.map(key => [key, judged[key]!])))
}


// Build the full candidate pool: every canonical OpenBible pair, per-verse rows folded into
// range→range links, minus pairs already covered by the algorithmic detectors
// NOTE Votes are deliberately ignored entirely — the judge decides everything (pilot confirmed
// votes are too weak to filter on: 59% of good references sit in the 1-4 vote band)
export async function build_pool():Promise<Map<string, MasterLink>>{

    // Exclude pairs the PUBLISHED algorithmic links already cover (unpublished detector noise,
    // e.g. sub-threshold parallels, must not remove pairs from the judging pool)
    const {algo_quotation, algo_parallel, algo_allusion} = algorithmic_links()
    const algorithmic = [...algo_quotation, ...algo_parallel, ...algo_allusion]
    const covered = new Map<string, MasterLink[]>()
    for (const link of algorithmic){
        for (let ch = link[0][1]; ch <= link[0][3]; ch++){
            const key = `${link[0][0]}|${ch}`
            let list = covered.get(key)
            if (!list){
                list = []
                covered.set(key, list)
            }
            list.push(link)
        }
    }

    // Parse the raw OpenBible data
    const zip = new StreamZip.async({file: CROSSREF_ZIP})
    const content = (await zip.entryData('cross_references.txt')).toString('utf8')
    await zip.close()
    const raw = new Map<string, MasterLink>()
    for (const line of content.trim().split('\n').slice(1)){
        const [from_raw, to_raw] = line.split('\t')
        if (!from_raw || !to_raw){
            continue
        }
        const from = to_span(from_raw)
        const to = to_span(to_raw)
        if (!from || !to){
            continue
        }
        const pair = canonical_pair(from, to)
        if (!is_covered(covered, pair[0], pair[1])){
            raw.set(pair_key(pair), pair)
        }
    }

    // Fold per-verse rows back into range→range links before judging
    let links = merge_ranges([...raw.values()])
    links = fold_shared_side(links, 0)
    links = fold_shared_side(links, 1)

    // Exclude anything without BSB text on both sides — it can never be judged, and keeping it
    // would leave the campaign permanently short of 100%
    links = links.filter(([a, b]) => passage_text(a) && passage_text(b))
    return new Map(links.map(link => [pair_key(link), link]))
}


// Convert one OpenBible reference string ("Gen.1.1" or "Gen.1.1-Gen.1.3") to a Span
// NOTE A handful of raw ranges cross book boundaries ("Lev.27.34-Num.1.1"), which the parser
// returns as inverted spans — collapse those to their (valid) start verse
function to_span(raw:string):Span|null{
    const ref = extract_reference(raw)
    if (!ref || !ref.usx || !ref.start_chapter || !ref.start_verse){
        return null
    }
    const inverted = ref.end_chapter < ref.start_chapter
        || (ref.end_chapter === ref.start_chapter && ref.end_verse < ref.start_verse)
    if (inverted){
        return [ref.usx, ref.start_chapter, ref.start_verse, ref.start_chapter, ref.start_verse]
    }
    return [ref.usx, ref.start_chapter, ref.start_verse, ref.end_chapter, ref.end_verse]
}


// Whether both spans' starts fall inside an existing link's two spans
function is_covered(covered:Map<string, MasterLink[]>, a:Span, b:Span):boolean{
    for (const link of covered.get(`${a[0]}|${a[1]}`) ?? []){
        if (span_contains(link[0], a[1], a[2]) && b[0] === link[1][0]
                && span_contains(link[1], b[1], b[2])){
            return true
        }
    }
    return false
}


// Whether a chapter:verse position falls within a span (span's book already matched)
function span_contains(span:Span, ch:number, v:number):boolean{
    const after_start = ch > span[1] || (ch === span[1] && v >= span[2])
    const before_end = ch < span[3] || (ch === span[3] && v <= span[4])
    return after_start && before_end
}


// A stable key identifying a candidate pair (also the results record key)
function pair_key(pair:MasterLink):string{
    return `${pair[0].join(',')}>${pair[1].join(',')}`
}


// Write slice files of pending pairs (with BSB text) into state/ for subagents to judge
export async function make_slices(count:number, size=SLICE_SIZE):Promise<number>{
    mkdirSync(STATE_DIR, {recursive: true})

    // Merge any leftover wave outputs first — regenerating slices while out_ files exist would
    // invalidate those judgments (they are validated against their slice files)
    if (readdirSync(STATE_DIR).some(file => file.startsWith('out_'))){
        console.info('judge campaign: merging leftover wave outputs before slicing')
        merge_outputs()
    }
    const pool = await build_pool()
    const judged = load_results()
    const pending = [...pool.keys()].filter(key => !(key in judged))
    let written = 0
    for (let i = 0; i < count && i * size < pending.length; i++){
        const slice:SlicePair[] = []
        for (const key of pending.slice(i * size, (i + 1) * size)){
            const [a, b] = pool.get(key)!
            const text_a = passage_text(a)
            const text_b = passage_text(b)
            if (text_a && text_b){
                slice.push({key, ref_a: format_ref(a), text_a, ref_b: format_ref(b), text_b})
            }
        }
        write_json(join(STATE_DIR, `slice_${i}.json`), slice, true)
        written += 1
    }
    console.info(`judge campaign: ${pending.length} pending; wrote ${written} slices of ${size}`)
    return written
}


// Validate and merge subagent wave outputs (state/out_*.json) into the results record
export function merge_outputs():void{
    const judged = load_results()
    const valid_category = new Set([...CATEGORIES, 'theme', 'none'])
    let merged = 0
    let invalid = 0
    for (const file of existsSync(STATE_DIR) ? readdirSync(STATE_DIR) : []){
        if (!file.startsWith('out_')){
            continue
        }
        const slice_file = join(STATE_DIR, file.replace('out_', 'slice_'))
        const keys = existsSync(slice_file)
            ? new Set(read_json<SlicePair[]>(slice_file).map(pair => pair.key))
            : null
        const outputs = read_json<Judged>(join(STATE_DIR, file))
        for (const [key, judgment] of Object.entries(outputs)){
            // Reject anything malformed or not belonging to its slice; those pairs stay pending
            if ((keys && !keys.has(key)) || !valid_category.has(judgment.category)
                    || typeof judgment.point !== 'string'
                    || !Number.isInteger(judgment.salience)
                    || judgment.salience < 0 || judgment.salience > 5){
                invalid += 1
                continue
            }
            judged[key] = {category: judgment.category, point: judgment.point,
                salience: judgment.salience}
            merged += 1
        }
        rmSync(join(STATE_DIR, file))
        if (keys){
            rmSync(slice_file)
        }
    }
    save_results(judged)
    console.info(`judge campaign: merged ${merged} judgments`
        + (invalid ? ` (${invalid} invalid entries rejected)` : ''))
}


// Print campaign progress: judged vs pool, category tallies, salience histogram
export async function print_status():Promise<void>{
    const pool = await build_pool()
    const judged = load_results()
    const done = [...pool.keys()].filter(key => key in judged).length
    console.info(`judged ${done} of ${pool.size} (${(100 * done / pool.size).toFixed(1)}%)`)
    const tallies = new Map<string, number>()
    for (const judgment of Object.values(judged)){
        const label = `${judgment.category}`
        tallies.set(label, (tallies.get(label) ?? 0) + 1)
    }
    for (const [label, count] of [...tallies.entries()].sort((x, y) => y[1] - x[1])){
        console.info(`  ${label}: ${count}`)
    }
}


// Human-readable reference for a span ("gen 1:1" or "gen 1:1-2:3")
function format_ref(span:Span):string{
    const [book, sc, sv, ec, ev] = span
    if (sc === ec && sv === ev){
        return `${book} ${sc}:${sv}`
    }
    return sc === ec ? `${book} ${sc}:${sv}-${ev}` : `${book} ${sc}:${sv}-${ec}:${ev}`
}


// Cache of loaded BSB plain-text books (chapter → verse → text)
const bsb_cache = new Map<string, string[][]>()

// The English (BSB) text of a span, truncated if very long
export function passage_text(span:Span):string{
    const [book, sc, sv, ec, ev] = span
    let contents = bsb_cache.get(book)
    if (!contents){
        const path = join(BSB_TXT, `${book}.json`)
        if (!existsSync(path)){
            return ''
        }
        const data = JSON.parse(readFileSync(path, 'utf-8')) as {contents:unknown[][][]}
        // Keep only the plain string items of each verse (drop headings/notes objects)
        contents = data.contents.map(chapter => chapter.map(verse =>
            verse.filter(item => typeof item === 'string').join(' ')
                .replace(/\s+/g, ' ').trim()))
        bsb_cache.set(book, contents)
    }
    const texts:string[] = []
    for (let ch = sc; ch <= ec && ch < contents.length; ch++){
        const chapter = contents[ch]!
        const first = ch === sc ? sv : 1
        const last = ch === ec ? Math.min(ev, chapter.length - 1) : chapter.length - 1
        for (let v = first; v <= last; v++){
            if (texts.length >= MAX_PROMPT_VERSES){
                texts.push('…')
                return texts.join(' ')
            }
            texts.push(chapter[v] ?? '')
        }
    }
    return texts.join(' ')
}
