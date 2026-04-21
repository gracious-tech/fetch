
import {PassageReference} from '@gracious.tech/bible-references'

import type {NotesData} from '../assets/shared_types'


export interface RelevantNotes {
    reference:PassageReference
    contents:string
}


export class NotesBook {

    _data:NotesData

    constructor(json:string){
        this._data = JSON.parse(json) as NotesData
    }

    // Get notes for single verse (empty string if none)
    get_verse_notes(chapter:number, verse:number):string{
        return this._data.verses[chapter]?.[verse] ?? ''
    }

    // Get all notes that include given verse (whether specific or as part of a range)
    get_relevant_notes(chapter:number, verse:number):RelevantNotes[]{
        const relevant:RelevantNotes[] = []

        // Add exact verse note if present
        const verse_note = this._data.verses[chapter]?.[verse]
        if (verse_note){
            relevant.push({
                reference: new PassageReference(this._data.book, chapter, verse),
                contents: verse_note,
            })
        }

        // Also add any ranges that include the verse
        for (const range of this._data.ranges){
            const reference = new PassageReference({book: this._data.book, ...range})
            if (reference.includes(chapter, verse)){
                relevant.push({
                    reference,
                    contents: range.contents,
                })
            }
        }

        // Sort by range size
        relevant.sort((a, b) => a.reference.total_verses() - b.reference.total_verses())

        return relevant
    }

    // TODO get_notes_within_range(ref)
    // TODO get_notes_overlapping_range(ref)

}
