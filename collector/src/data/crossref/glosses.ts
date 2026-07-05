
import {readFileSync, existsSync} from 'node:fs'
import {join} from 'node:path'

import {PKG_PATH} from '../../parts/utils.js'

import type {BookTokens} from './sources'


// English glosses (Global Bible Tools) for every original-language word, both testaments
const GLOSSES_DIR =
    join(PKG_PATH, '..', 'collection_official', 'dist', 'glosses', 'eng_gbt', 'json')

// Common English words carrying no distinguishing meaning when matching glosses
const STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
    'into', 'unto', 'out', 'up', 'down', 'over', 'under', 'is', 'was', 'were', 'be', 'been', 'are',
    'am',
    'will', 'shall', 'would', 'should', 'may', 'might', 'have', 'has', 'had', 'do', 'did', 'not',
    'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'i', 'me', 'my', 'we',
    'us', 'our', 'you', 'your', 'that', 'this', 'these', 'those', 'who', 'whom', 'which', 'what',
    'when', 'then', 'there', 'here', 'so', 'but', 'or', 'if', 'than', 'all', 'any', 'no', 'o',
])


// Load English-gloss content tokens per verse for the given books (book id → BookTokens)
export function load_gloss_tokens(books:string[]):Record<string, BookTokens>{
    const result:Record<string, BookTokens> = {}
    for (const book of books){
        const path = join(GLOSSES_DIR, `${book}.json`)
        if (!existsSync(path)){
            continue
        }
        const data = JSON.parse(readFileSync(path, 'utf-8')) as {contents:[string, string][][][]}
        const verses = data.contents.map(chapter => chapter.map(verse => gloss_tokens(verse)))
        result[book] = {book, verses}
    }
    return result
}


// Reduce a verse's [original_word, english_gloss] pairs to a list of content gloss tokens
function gloss_tokens(words:[string, string][]):string[]{
    const tokens:string[] = []
    for (const pair of words){
        // Each gloss phrase may hold several English words; keep the content (non-stopword) ones
        for (const word of pair[1].toLowerCase().split(/[^a-z]+/)){
            if (word && !STOPWORDS.has(word)){
                tokens.push(word)
            }
        }
    }
    return tokens
}
