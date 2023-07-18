
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'

import {convert as html_to_text} from 'html-to-text'

import * as tyndale from '../integrations/tyndale.js'
import {clean_dir, mkdir_exist, read_dir, read_json} from '../parts/utils.js'

import type {StudyNotes} from '../integrations/tyndale.js'
import type {NotesSourceMeta} from '../parts/types.js'
import type {DistNotesManifest} from '../parts/shared_types.js'


// Process available notes in sources dir and convert to publishable formats
export function notes_process(){

    // Clean existing notes dir in dist
    // NOTE Would find a way to append instead if many notes available
    clean_dir(join('dist', 'notes'))

    const manifest:DistNotesManifest = {notes: {}}

    // Loop through available notes
    for (const id of read_dir(join('sources', 'notes'))){

        // See if a Tyndale format
        const notes = tyndale.get_notes(id)
        // NOTE If notes null then would try other processors here...

        // If managed to process the notes, store them in dist
        if (notes){

            // Separate into individual books
            const html_dir = join('dist', 'notes', id, 'html')
            const txt_dir = join('dist', 'notes', id, 'txt')
            mkdir_exist(html_dir)
            mkdir_exist(txt_dir)
            for (const book of Object.keys(notes)){
                writeFileSync(join(html_dir, `${book}.json`), JSON.stringify(notes[book]))
                // Also write plain text version
                writeFileSync(join(txt_dir, `${book}.json`),
                    JSON.stringify(notes_to_txt(notes[book]!)))
            }

            // Load meta from file
            const meta = read_json<NotesSourceMeta>(join('sources', 'notes', id, 'meta.json'))
            manifest.notes[id] = {
                ...meta,
                year: meta.year ?? new Date().getFullYear(),
                language: id.split('_')[0]!,
                books: Object.keys(notes),
            }
        }
    }

    // Save the notes manifest
    writeFileSync(join('dist', 'notes', 'manifest.json'), JSON.stringify(manifest))
}


// Convert HTML notes to plain text
function notes_to_txt(notes:StudyNotes):StudyNotes{

    const plain:StudyNotes = {verses: {}, ranges: []}

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
