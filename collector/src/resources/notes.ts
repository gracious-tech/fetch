
import {join} from 'node:path'
import {existsSync} from 'node:fs'

import {convert as html_to_text} from 'html-to-text'

import * as tyndale from '../integrations/tyndale.js'
import {clean_dir, list_dirs, list_dirs_if, mkdir_exist, write_json} from '../parts/utils.js'
import {update_manifest} from '../parts/manifest.js'
import {add_unpublished} from '../parts/unpublished.js'

import type {NotesData} from '../parts/shared_types'


// At the moment only have support for Tyndale notes
export async function update_notes(redownload:boolean){
    if (!existsSync(tyndale.tyndale_source_dir) || redownload){
        await tyndale.download_notes()
    }
    await notes_process()

    // Update manifest whenever dist files change
    await update_manifest()
}


// Process available notes in sources dir and convert to publishable formats
export async function notes_process(){

    // Capture existing IDs before wiping so deletions can be tracked
    const prev_ids = list_dirs_if(join('dist', 'notes'))

    // Clean existing notes dir in dist
    // NOTE Would find a way to append instead if many notes available
    clean_dir(join('dist', 'notes'))

    // Loop through available notes
    // NOTE So far hardcoded to just check for tyndale notes
    for (const id of list_dirs(join('sources', 'notes', 'tyndale'))){
        const notes = tyndale.sources_to_dist()
        if (notes){

            // Separate into individual books
            const html_dir = join('dist', 'notes', id, 'html')
            const txt_dir = join('dist', 'notes', id, 'txt')
            mkdir_exist(html_dir)
            mkdir_exist(txt_dir)
            for (const book of Object.keys(notes)){
                write_json(join(html_dir, `${book}.json`), notes[book])
                // Also write plain text version
                write_json(join(txt_dir, `${book}.json`), notes_to_txt(notes[book]!))
            }
        }
    }

    // Mark previous and current IDs unpublished (prev handles deletions, current handles updates)
    const curr_ids = list_dirs_if(join('dist', 'notes'))
    add_unpublished([...new Set([...prev_ids, ...curr_ids])].map(id => `notes/${id}`))
}


// Convert HTML notes to plain text
function notes_to_txt(notes:NotesData):NotesData{

    const plain:NotesData = {
        notes_id: notes.notes_id,
        book: notes.book,
        verses: {},
        ranges: [],
    }

    for (const range of notes.ranges){
        plain.ranges.push({
            ...range,
            contents: html_to_text(range.contents, {wordwrap: false}),
        })
    }

    for (const ch in notes.verses){
        plain.verses[ch] = {}
        for (const verse in notes.verses[ch]){
            plain.verses[ch]![verse] =
                html_to_text(notes.verses[ch]![verse]!, {wordwrap: false})
        }
    }

    return plain
}
