
import {detect_quotations, detect_quotations_mt, detect_parallels} from './textual.js'
import {detect_bsb} from './bsb.js'
import {judged_categories} from './judged.js'
import {merge_ranges} from './merge.js'
import {distribute} from './distribute.js'

import type {MasterList, Span} from './types'


// An algorithmic parallel must be a sustained multi-verse retelling, not a lone formulaic verse
// match; judged parallels are semantic so may be single verses (e.g. matching gospel sayings)
const PARALLEL_MIN_VERSES = 3


// Generate cross-reference data (categories: quotation, parallel, allusion, mention, relevant)
// NOTE Stage A detectors build canonical master lists; Stage B distributes them to per-book files
// NOTE Two sources feed the categories: our own text analysis + BSB footnotes (trusted, computed
// first), plus the recorded LLM judgments of the OpenBible pairs (see judge/README.md — the
// judging itself was a one-time campaign; only its recorded results are interpreted here)
export function crossref_process():void{

    // The algorithmic links plus the recorded LLM judgments, interpreted into categories
    const {algo_quotation, algo_parallel, algo_allusion} = algorithmic_links()
    const judged = judged_categories()

    // Merge algorithmic and judged links per category, deduping across categories in priority
    // order so each pair is published once, under its strongest category
    const seen = new Set<string>()
    const emit = (category:string, links:MasterList):MasterList => {
        const unique = finalize(links).filter(link => !seen.has(link_key(link)))
        for (const link of unique){
            seen.add(link_key(link))
        }
        distribute(category, unique)
        return unique
    }
    const quotation = emit('quotation', [...algo_quotation, ...judged.quotation])
    const parallel = emit('parallel', [...algo_parallel, ...judged.parallel])
    const allusion = emit('allusion', [...algo_allusion, ...judged.allusion])
    const mention = emit('mention', judged.mention)
    const relevant = emit('relevant', judged.relevant)

    console.info(`crossref: ${quotation.length} quotation, ${parallel.length} parallel, `
        + `${allusion.length} allusion, ${mention.length} mention, `
        + `${relevant.length} relevant links`)
}


// The algorithmic (non-LLM) links per category — LXX (surface) + MT (gloss bridge) quotations,
// BSB footnote citations and allusions, and same-language retellings kept only where a sustained
// multi-verse diagonal survives. Also used by the judge campaign to exclude covered pairs, so
// exactly the links that get PUBLISHED define what is not judged.
export function algorithmic_links():
        {algo_quotation:MasterList, algo_parallel:MasterList, algo_allusion:MasterList}{
    const bsb = detect_bsb()
    const algo_quotation = finalize(
        [...detect_quotations(), ...detect_quotations_mt(), ...bsb.quotation])
    const algo_parallel = merge_ranges(dedupe_links(detect_parallels()))
        .filter(link => span_verses(link[0]) >= PARALLEL_MIN_VERSES)
    const algo_allusion = finalize(bsb.allusion)
    return {algo_quotation, algo_parallel, algo_allusion}
}


// Number of verses a span covers (within one chapter); cross-chapter spans are always multi-verse
function span_verses(span:Span):number{
    return span[1] === span[3] ? span[4] - span[2] + 1 : 999
}


// Deduplicate then merge multi-verse runs into ranges
function finalize(links:MasterList):MasterList{
    return merge_ranges(dedupe_links(links))
}


// A stable key identifying a link's two spans (for de-duplication within and across categories)
function link_key(link:MasterList[number]):string{
    return `${link[0].join(',')}>${link[1].join(',')}`
}


// Remove duplicate links (the same pair can be found by more than one pass)
function dedupe_links(links:MasterList):MasterList{
    const seen = new Set<string>()
    const unique:MasterList = []
    for (const link of links){
        const key = `${link[0].join(',')}>${link[1].join(',')}`
        if (!seen.has(key)){
            seen.add(key)
            unique.push(link)
        }
    }
    return unique
}
