
import {join} from 'node:path'

import {books_ordered} from '../parts/bible.js'
import {download_data} from '../integrations/openbible.js'
import {mkdir_exist, write_json} from '../parts/utils.js'
import {add_unpublished} from '../parts/unpublished.js'

import type {BookCrossReferences} from '../integrations/openbible'
import type {CrossrefData, CrossrefRange, CrossrefSingle} from '../parts/shared_types'


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
        write_json(join(dir_small, `${book}.json`), filter_refs_by_relevance(book_refs, 1))
        write_json(join(dir_medium, `${book}.json`), filter_refs_by_relevance(book_refs, 2))
        write_json(join(dir_large, `${book}.json`), filter_refs_by_relevance(book_refs, 3))
    }

    add_unpublished(['crossref/small', 'crossref/medium', 'crossref/large'])
}


// Get only refs that match the desired relevance for an individual book
function filter_refs_by_relevance(refs_for_book:BookCrossReferences, max_rel:number):CrossrefData{
    const filtered: CrossrefData = {}
    for (const ch in refs_for_book){
        for (const verse in refs_for_book[ch]){

            // Filter by relevance and then remove the score from the data
            const refs = refs_for_book[ch]![verse]!.filter(ref => ref[0] <= max_rel)
                .map(ref => ref.slice(1) as CrossrefSingle|CrossrefRange)

            // Add refs for verse if any are chosen
            if (refs.length){
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
