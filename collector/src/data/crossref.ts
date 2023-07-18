
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'

import {books_ordered} from '../parts/bible.js'
import {download_data} from '../integrations/openbible.js'
import {mkdir_exist} from '../parts/utils.js'

import type {BookCrossReferences} from '../integrations/openbible.js'


// Generate cross-references data
export async function crossref_process(){

    // Download and process data
    const data = await download_data()

    // Create dirs
    const dir_small = join('dist', 'crossref', 'small')
    const dir_medium = join('dist', 'crossref', 'medium')
    const dir_large = join('dist', 'crossref', 'large')
    mkdir_exist(dir_small)
    mkdir_exist(dir_medium)
    mkdir_exist(dir_large)

    for (const book of books_ordered){
        const book_refs = data[book] ?? {}
        writeFileSync(join(dir_small, `${book}.json`),
            JSON.stringify(filter_refs_by_relevance(book_refs, 1)))
        writeFileSync(join(dir_medium, `${book}.json`),
            JSON.stringify(filter_refs_by_relevance(book_refs, 2)))
        writeFileSync(join(dir_large, `${book}.json`),
            JSON.stringify(filter_refs_by_relevance(book_refs, 3)))
    }
}


// Published data doesn't include relevance score at start of array
type CrossRefSingleDist = [string, number, number]
type CrossRefRangeDist = [...CrossRefSingleDist, number, number]
type FilteredReferences = Record<string, Record<string, (CrossRefSingleDist|CrossRefRangeDist)[]>>


// Get only refs that match the desired relevance for an individual book
function filter_refs_by_relevance(
        refs_for_book:BookCrossReferences,
        max_rel:number,
): FilteredReferences {
    const filtered: FilteredReferences = {}
    for (const ch in refs_for_book){
        for (const verse in refs_for_book[ch]){

            // Filter by relevance and then remove the score from the data
            const refs = refs_for_book[ch]![verse]!.filter(ref => ref[0] <= max_rel)
                .map(ref => ref.slice(1) as CrossRefSingleDist|CrossRefRangeDist)

            // Add refs for verse if any are chosen
            if (refs){
                // Ensure chapter object exists
                if (!(ch in filtered)){
                    filtered[ch] = {}
                }
                filtered[ch]![verse] = refs
            }
        }
    }
    return filtered
}
