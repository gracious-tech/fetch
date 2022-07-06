
import {readFileSync} from 'fs'

import xpath from 'xpath'
import {DOMParser} from '@xmldom/xmldom'
import type {BookExtracts} from './types'


export function extract_meta(path:string):BookExtracts{
    // Extract meta data from a single USX book
    const meta:BookExtracts = {
        name: null,
        sections: [],  // TODO
        chapter_headings: [],  // TODO
        last_verse: [],
    }

    // Parse the file
    const doc = new DOMParser().parseFromString(readFileSync(path, 'utf-8'))

    // Extract autonym for book
    meta.name = (xpath.select('(//para[@style="h"]/text())[1]', doc)[0] as Element).nodeValue

    // Extract last verse number for every chapter
    for (const match of xpath.select('//verse/@sid', doc)){
        const regex = /(\d+):(\d+)/.exec((match as {value:string}).value) as string[]
        const chapter = parseInt(regex[1]!)
        const verse = parseInt(regex[2]!)
        if (chapter > meta.last_verse.length){
            // Starting a new chapter
            meta.last_verse.push(verse)
        } else if (verse > meta.last_verse[chapter-1]!){
            // Verse number greater than ones before
            meta.last_verse[chapter-1] = verse
        }
    }

    return meta
}
