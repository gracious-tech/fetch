
import {readFileSync, existsSync} from 'node:fs'
import {join} from 'node:path'

import {JSDOM} from 'jsdom'
import {usx_to_json_txt} from 'usx-to-json'

import {PKG_PATH, word_to_original} from '../../parts/utils.js'


// jsdom DOM parser (matches the setup in commands/process.ts)
const DOMParser = new JSDOM().window.DOMParser

// The original-language texts live in the official collection, beside the collector package
const OFFICIAL_BIBLES = join(PKG_PATH, '..', 'collection_official', 'dist', 'bibles')


// Normalised per-verse tokens for a book, indexed verses[chapter][verse] (chapter/verse 0 unused)
export interface BookTokens {
    book:string
    verses:string[][][]
}


// Load a translation's books as per-verse normalised token lists (book id → BookTokens)
// NOTE Texts are read from dist, where versification is already normalised, so refs need no mapping
export function load_tokens(trans_id:string, books:string[]):Record<string, BookTokens>{
    const result:Record<string, BookTokens> = {}
    for (const book of books){
        const path = join(OFFICIAL_BIBLES, trans_id, 'usx', `${book}.usx`)
        // Skip books a translation doesn't include (e.g. NT books absent from an OT-only text)
        if (!existsSync(path)){
            continue
        }
        // Reuse the txt converter for robust per-verse extraction (verse milestones, notes, etc.)
        const json = usx_to_json_txt(readFileSync(path, 'utf-8'), DOMParser, () => {})
        const verses = json.contents.map(chapter => chapter.map(verse => verse_to_tokens(verse)))
        result[book] = {book, verses}
    }
    return result
}


// Reduce a verse's mixed content to a list of normalised original-language tokens (words only)
function verse_to_tokens(contents:readonly unknown[]):string[]{
    const tokens:string[] = []
    for (const item of contents){
        // Only plain strings are scripture text; skip heading/note objects
        if (typeof item !== 'string'){
            continue
        }
        // Normalise each whitespace-separated word (strip diacritics/punctuation, fold case/sigma)
        for (const raw of item.split(/\s+/)){
            const token = word_to_original(raw)
            if (token){
                tokens.push(token)
            }
        }
    }
    return tokens
}
