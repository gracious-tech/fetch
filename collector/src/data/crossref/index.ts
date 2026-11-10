
import {detect_quotations, detect_parallels} from './textual.js'
import {detect_bsb} from './bsb.js'
import {interpret_links} from './judged.js'
import {merge_ranges} from './merge.js'
import {distribute} from './distribute.js'

import type {MasterList, Span} from './types'


// An algorithmic parallel must be a sustained multi-verse retelling, not a lone formulaic verse
// match; judged parallels are semantic so may be single verses (e.g. matching gospel sayings)
const PARALLEL_MIN_VERSES = 3


// Generate cross-reference data (categories: quotation, parallel, allusion, mention, relevant)
// NOTE Stage A detectors build canonical master lists; Stage B writes the whole-Bible files
// NOTE Two sources feed the categories: our own text analysis + BSB footnotes, plus the OpenBible
// pairs; the recorded LLM judgments (see judge/README.md) score both and decide the OpenBible
// pairs' categories — only those recorded results are interpreted here, no LLM is run
export function crossref_process():void{

    // Combine our own links with the recorded judgments into one best-first, duplicate-free list
    const {algo_quotation, algo_parallel, algo_allusion} = algorithmic_links()
    const links = interpret_links(
        {quotation: algo_quotation, parallel: algo_parallel, allusion: algo_allusion})

    // Write the published whole-Bible files
    distribute(links)
    const counts = new Map<string, number>()
    for (const link of links){
        counts.set(link.category, (counts.get(link.category) ?? 0) + 1)
    }
    console.info(`crossref: ${links.length} links (`
        + [...counts].map(([category, count]) => `${count} ${category}`).join(', ') + ')')
}


// The algorithmic (non-LLM) links per category — LXX (surface) quotations, BSB footnote
// citations and allusions, and same-language retellings kept only where a sustained multi-verse
// diagonal survives. Independent of the judge campaign (which judges every OpenBible pair,
// including ones these detectors also find) so thresholds here stay freely tunable.
// NOTE Quotations following the Hebrew rather than the LXX are covered by the judged OpenBible
//      pairs and BSB footnotes; an English-gloss bridge was tested and found to add mostly
//      coincidental matches (shared common words like "right hand"), so none is used
export function algorithmic_links():
        {algo_quotation:MasterList, algo_parallel:MasterList, algo_allusion:MasterList}{
    const bsb = detect_bsb()
    const algo_quotation = finalize([...detect_quotations(), ...bsb.quotation])
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
