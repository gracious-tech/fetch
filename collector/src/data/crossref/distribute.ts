
import {join} from 'node:path'

import {mkdir_exist, write_json} from '../../parts/utils.js'
import {add_unpublished} from '../../parts/unpublished.js'

import type {Span} from './types'
import type {ScoredLink} from './judged'
import type {CrossrefPair, CrossrefSpan, CrossrefStrength, CrossrefsData}
    from '../../parts/shared_types'


// Where the published files go (relative to the collection's dist dir)
const PUBLISH_DIR = join('crossref', 'categorised')

// The published strength for each internal salience (salience stays internal to the collector)
// NOTE Strongest first, which is also the order strengths appear in each published file
const STRENGTHS:{strength:CrossrefStrength, min_salience:number}[] = [
    {strength: 'very_high', min_salience: 5},
    {strength: 'high', min_salience: 4},
    {strength: 'medium', min_salience: 3},
]


// Stage B: write the whole-Bible files, one per minimum strength, each with and without relevant
// NOTE Strength and kind are independent choices — some apps never want "relevant" however
//      strong, so each minimum strength is published both ways
export function distribute(links:ScoredLink[]):void{
    mkdir_exist(join('dist', PUBLISH_DIR))
    for (const {strength, min_salience} of STRENGTHS){
        for (const relevant of [true, false]){
            const name = `${crossref_file_name(strength, relevant)}.json`
            const included = links.filter(link => link.salience >= min_salience
                && (relevant || link.category !== 'relevant'))
            write_json(join('dist', PUBLISH_DIR, name), group_links(included))
        }
    }
    add_unpublished([PUBLISH_DIR])
}


// File name for a minimum strength — "_plus" since each file also holds every stronger link
// (the strongest level has nothing above it, so needs no suffix)
// NOTE Must match the client's `fetch_crossrefs()`
export function crossref_file_name(min_strength:CrossrefStrength, relevant:boolean):string{
    const plus = min_strength === STRENGTHS[0]!.strength ? '' : '_plus'
    return `${min_strength}${plus}${relevant ? '' : '_no_relevant'}`
}


// The published strength of a link
export function link_strength(salience:number):CrossrefStrength{
    const match = STRENGTHS.find(({min_salience}) => salience >= min_salience)
    if (!match){
        throw new Error(`Salience ${salience} is too low to publish`)
    }
    return match.strength
}


// Group links by category then strength (strongest first), keeping their order
export function group_links(links:ScoredLink[]):CrossrefsData{
    const data:CrossrefsData = {}
    for (const link of links){
        const by_strength = data[link.category] ??=
            Object.fromEntries(STRENGTHS.map(({strength}) => [strength, []]))
        by_strength[link_strength(link.salience)]!.push(link.pair.map(compact_span) as CrossrefPair)
    }

    // Leave out strengths with no links
    for (const by_strength of Object.values(data)){
        for (const strength of Object.keys(by_strength) as CrossrefStrength[]){
            if (!by_strength[strength]?.length){
                delete by_strength[strength]
            }
        }
    }
    return data
}


// A span in published form, collapsing a single verse to [book, ch, v]
export function compact_span(span:Span):CrossrefSpan{
    const [book, sc, sv, ec, ev] = span
    return (sc === ec && sv === ev) ? [book, sc, sv] : [book, sc, sv, ec, ev]
}
