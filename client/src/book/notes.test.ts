
import {describe, it} from 'vitest'

import {NotesBook} from './notes.js'


const notes = new NotesBook(JSON.stringify({
    notes_id: 'test',
    book: 'jhn',
    verses: {3: {16: 'God so loved'}},
    ranges: [
        {start_chapter: 3, start_verse: 1, end_chapter: 3, end_verse: 21, contents: 'Nicodemus'},
        {start_chapter: 3, start_verse: 14, end_chapter: 3, end_verse: 18, contents: 'Lifted up'},
        {start_chapter: 4, start_verse: 1, end_chapter: 4, end_verse: 5, contents: 'Samaria'},
    ],
}))


describe('NotesBook', () => {

    it("Gets a single verse's note (empty if none)", ({expect}) => {
        expect(notes.get_verse_notes(3, 16)).toBe('God so loved')
        expect(notes.get_verse_notes(3, 17)).toBe('')
        expect(notes.get_verse_notes(9, 1)).toBe('')
    })

    it("Gets all relevant notes, smallest range first", ({expect}) => {
        const relevant = notes.get_relevant_notes(3, 16)
        expect(relevant.map(note => note.contents)).toEqual(['God so loved', 'Lifted up',
            'Nicodemus'])
        expect(relevant[0]!.reference.toString()).toBe('John 3:16')
        expect(notes.get_relevant_notes(3, 2).map(note => note.contents)).toEqual(['Nicodemus'])
        expect(notes.get_relevant_notes(9, 1)).toEqual([])
    })
})
