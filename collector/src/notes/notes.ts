
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'

import * as tyndale from '../integrations/tyndale.js'
import {clean_dir, mkdir_exist, read_dir, read_json} from '../parts/utils.js'

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
