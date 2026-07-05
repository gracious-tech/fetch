
import {join} from 'node:path'

import {mkdir_exist, write_json} from '../../parts/utils.js'
import {add_unpublished} from '../../parts/unpublished.js'

import type {Span, MasterList, CrossrefCategoryData, CrossrefSource, CrossrefTarget}
    from './types'


// Stage B: explode a category's master list into per-book published files, both directions
// NOTE Each link is written into both the origin book's file and the reference book's file
export function distribute(category:string, links:MasterList):void{

    // Accumulate entries per book → chapter
    const per_book:Record<string, CrossrefCategoryData> = {}
    const add = (from:Span, to:Span) => {
        const book = from[0]
        const data = per_book[book] ?? (per_book[book] = {})
        const chapter = String(from[1])
        const entries = data[chapter] ?? (data[chapter] = [])
        entries.push([compact_source(from), compact_target(to, book)])
    }
    for (const [a, b] of links){
        add(a, b)
        add(b, a)
    }

    // Write each book file, sorting entries within each chapter by source start verse
    const dir = join('dist', 'crossref', category)
    mkdir_exist(dir)
    for (const [book, data] of Object.entries(per_book)){
        for (const entries of Object.values(data)){
            entries.sort((x, y) => x[0][1] - y[0][1])
        }
        write_json(join(dir, `${book}.json`), data)
    }
    add_unpublished([`crossref/${category}`])
}


// Source span relative to its own file (book implied); collapse to [ch, v] for a single verse
export function compact_source(span:Span):CrossrefSource{
    const [, sc, sv, ec, ev] = span
    return (sc === ec && sv === ev) ? [sc, sv] : [sc, sv, ec, ev]
}


// Target span; include the book id only if different to the file's book; collapse single verses
export function compact_target(span:Span, file_book:string):CrossrefTarget{
    const [book, sc, sv, ec, ev] = span
    const single = (sc === ec && sv === ev)
    if (book === file_book){
        return single ? [sc, sv] : [sc, sv, ec, ev]
    }
    return single ? [book, sc, sv] : [book, sc, sv, ec, ev]
}
