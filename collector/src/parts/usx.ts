
import {basename} from 'node:path'
import {readFileSync} from 'node:fs'

import xpath from 'xpath'
import {DOMParser} from '@xmldom/xmldom'
import {number_of_verses} from 'usx-to-json'

import type {BookExtracts} from './types'


export function extract_meta(path:string):BookExtracts{
    // Extract meta data from a single USX book

    const book = basename(path, '.usx')
    const meta:BookExtracts = {
        name: null,
        sections: [],  // TODO
        chapter_headings: [],  // TODO
        missing_verses: {},
    }

    // Parse the file
    const doc = new DOMParser().parseFromString(readFileSync(path, 'utf-8'))

    // Extract local for book
    type Xout = Element|undefined
    meta.name =
        (xpath.select('(//para[@style="toc2"]/text())[1]', doc)[0] as Xout)?.nodeValue
        || (xpath.select('(//para[@style="h"]/text())[1]', doc)[0] as Xout)?.nodeValue
        || (xpath.select('(//para[@style="toc1"]/text())[1]', doc)[0] as Xout)?.nodeValue
        || null


    // Missing verses object with every verse expected to exist
    const missing_verses = Object.fromEntries(number_of_verses[book]!.map((ch_verses, ch_i) => {
        const tmp_array = [...Array<unknown>(ch_verses)]
        const obj_verse_nums = Object.fromEntries(tmp_array.map((trash, v_i) => {
            return [v_i+1, null as null|[number, number]]
        }))
        return [ch_i+1, obj_verse_nums]
    }))

    // Extract last verse number for every chapter
    for (const match of xpath.select('//verse/@sid', doc)){
        const sid = (match as {value:string}).value
        const regex = /... ?(\d+):(\d+)\D*-?(\d+)?/.exec(sid)
        if (!regex){
            console.warn(`Ignoring invalid verse reference: ${sid}`)
            continue
        }
        const chapter = parseInt(regex[1]!)
        const start_verse = parseInt(regex[2]!)
        const end_verse = regex[3] && parseInt(regex[3]) || start_verse
        if (! (chapter in missing_verses) || start_verse > end_verse){
            console.warn(`Ignoring invalid verse reference: ${sid}`)
            continue
        }

        // First verse exists so delete entry
        delete missing_verses[chapter]![start_verse]

        // Any other verses in the range should point back to the first verse
        for (let i = start_verse + 1; i <= end_verse; i++){
            missing_verses[chapter]![i] = [chapter, start_verse]
        }
    }

    // Remove chapters with no missing verses to report
    for (const ch in missing_verses){
        if (!Object.keys(missing_verses[ch]!).length){
            delete missing_verses[ch]
        }
    }
    meta.missing_verses = missing_verses

    return meta
}
