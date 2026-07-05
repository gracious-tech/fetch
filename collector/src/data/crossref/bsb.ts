
import {readFileSync, existsSync} from 'node:fs'
import {join} from 'node:path'

import {detect_references, books_ordered} from '@gracious.tech/bible-references'

import {PKG_PATH} from '../../parts/utils.js'
import {canonical_pair} from './merge.js'

import type {Span, MasterLink, MasterList} from './types'


// Berean Standard Bible footnotes (per-verse text), both testaments
const BSB_TXT = join(PKG_PATH, '..', 'collection_official', 'dist', 'bibles', 'eng_bsb', 'txt')

// Footnotes that are translation notes or textual/name-variant apparatus — not semantic citations
const SKIP_START = /^(literally|or[ ,]|that is|the meaning|possibly|probably|i\.e)/i
const APPARATUS = new RegExp([
    'variant', 'manuscript', '\\bLXX\\b', '\\bMT\\b', 'Syriac', 'Vulgate', 'Dead Sea', 'Masoretic',
    'is also called', 'spelling', 'Septuagint', 'Targum', 'Samaritan', 'Hebrew', 'Greek', 'Aramaic',
].join('|'), 'i')

// Cue phrases that split a footnote into typed segments ("see also" before "see" so it wins)
const CUE = /\b(cited in|see also|see|compare|cf\.?)\b/ig

// References found in a footnote, split by relationship type
type NoteRefs = {quotation:MasterLink[], allusion:MasterLink[]}


// Build quotation and allusion links from BSB footnote cross-references
// NOTE OT verses are marked "Cited in <NT ref>" (quotation); "see [also]" marks allusions
export function detect_bsb():{quotation:MasterList, allusion:MasterList}{
    const quotation:MasterList = []
    const allusion:MasterList = []
    for (const book of books_ordered){
        const path = join(BSB_TXT, `${book}.json`)
        if (!existsSync(path)){
            continue
        }
        const data = JSON.parse(readFileSync(path, 'utf-8')) as {contents:unknown[][][]}
        data.contents.forEach((chapter, ch) => {
            chapter.forEach((items, v) => {
                for (const item of items){
                    const note = item as {type?:string, contents?:string}
                    if (typeof item !== 'object' || item === null || note.type !== 'note'
                            || !note.contents){
                        continue
                    }
                    const classified = classify_note(note.contents, [book, ch, v, ch, v])
                    quotation.push(...classified.quotation)
                    allusion.push(...classified.allusion)
                }
            })
        })
    }
    return {quotation, allusion}
}


// Parse one footnote, routing its references to quotation or allusion by the cue that precedes them
export function classify_note(raw:string, host:Span):NoteRefs{
    const quotation:MasterLink[] = []
    const allusion:MasterLink[] = []

    // Drop the leading "ch:v" label; ignore translation notes and textual/name-variant apparatus
    const text = raw.replace(/^\s*\d+:\d+[a-c]?\s*/, '')
    if (SKIP_START.test(text) || APPARATUS.test(text)){
        return {quotation, allusion}
    }

    // Segment the note by cue phrase: text before the first cue is the "primary" reference
    const markers = [...text.matchAll(CUE)]
    const segments:{cue:string, text:string}[] = [
        {cue: 'primary', text: text.slice(0, markers[0]?.index ?? text.length)},
    ]
    for (let i = 0; i < markers.length; i++){
        const start = markers[i]!.index + markers[i]![0].length
        const end = markers[i + 1]?.index ?? text.length
        segments.push({cue: markers[i]![1]!.toLowerCase(), text: text.slice(start, end)})
    }

    // A primary or "cited in" reference is a quotation; "see"/"compare" is an allusion
    for (const segment of segments){
        const target = (segment.cue === 'primary' || segment.cue === 'cited in')
            ? quotation : allusion
        for (const match of detect_references(segment.text)){
            const r = match.ref
            if (!r.book || !r.start_chapter || !r.start_verse){
                continue
            }
            const ref:Span = [r.book, r.start_chapter, r.start_verse,
                r.end_chapter ?? r.start_chapter, r.end_verse ?? r.start_verse]
            target.push(canonical_pair(host, ref))
        }
    }
    return {quotation, allusion}
}
