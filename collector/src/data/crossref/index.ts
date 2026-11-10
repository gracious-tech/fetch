
import {detect_quotations, detect_parallels} from './textual.js'
import {detect_bsb} from './bsb.js'
import {judged_categories, drop_algorithmic_variants, link_score, algorithmic_in_size}
    from './judged.js'
import {merge_ranges} from './merge.js'
import {distribute} from './distribute.js'

import type {MasterList, Span} from './types'


// An algorithmic parallel must be a sustained multi-verse retelling, not a lone formulaic verse
// match; judged parallels are semantic so may be single verses (e.g. matching gospel sayings)
const PARALLEL_MIN_VERSES = 3


// Generate cross-reference data (categories: quotation, parallel, allusion, mention, relevant)
// NOTE Stage A detectors build canonical master lists; Stage B distributes them to per-book files
// NOTE Two sources feed the categories: our own text analysis + BSB footnotes, plus the OpenBible
// pairs; the recorded LLM judgments (see judge/README.md) score both and decide the OpenBible
// pairs' categories — only those recorded results are interpreted here, no LLM is run
export function crossref_process():void{

    // The algorithmic links plus the recorded LLM judgments, interpreted into categories
    const {algo_quotation, algo_parallel, algo_allusion} = algorithmic_links()
    const {sizes: judged_sizes, scores} = judged_categories()

    // Publish each size separately: "full" to {category}/, "small" to {category}_small/
    for (const size of ['full', 'small'] as const){
        const suffix = size === 'full' ? '' : `_${size}`

        // Our own links that belong in this size (by their judged salience, if judged yet)
        const in_size = (links:MasterList) =>
            links.filter(link => algorithmic_in_size(link, size, scores))

        // Resolve near-duplicate variants between our own links and this size's judged links
        const {algo, judged} = drop_algorithmic_variants({
            quotation: in_size(algo_quotation),
            parallel: in_size(algo_parallel),
            allusion: in_size(algo_allusion),
            mention: [],
            relevant: [],
        }, judged_sizes[size])

        // Merge algorithmic and judged links per category, deduping across categories in
        // priority order so each pair is published once, under its strongest category
        // NOTE Links are ordered by score (best first), which distribution preserves per verse
        const seen = new Set<string>()
        const emit = (category:string, links:MasterList):MasterList => {
            const unique = finalize(links).filter(link => !seen.has(link_key(link)))
            for (const link of unique){
                seen.add(link_key(link))
            }
            const ranked = unique
                .map(link => ({link, score: link_score(link, scores)}))
                .sort((x, y) => y.score - x.score)
                .map(({link}) => link)
            distribute(category + suffix, ranked)
            return ranked
        }
        const quotation = emit('quotation', [...algo.quotation, ...judged.quotation])
        const parallel = emit('parallel', [...algo.parallel, ...judged.parallel])
        const allusion = emit('allusion', [...algo.allusion, ...judged.allusion])
        const mention = emit('mention', judged.mention)
        const relevant = emit('relevant', judged.relevant)

        console.info(`crossref (${size}): ${quotation.length} quotation, `
            + `${parallel.length} parallel, ${allusion.length} allusion, `
            + `${mention.length} mention, ${relevant.length} relevant links`)
    }
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
