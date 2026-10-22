
import {describe, it} from 'vitest'
import {PassageReference} from '@gracious.tech/bible-references'

import {GlossesBook} from './glosses.js'


const glosses = new GlossesBook(JSON.stringify({
    trans_id: 'test',
    book: 'jhn',
    contents: [[], [[], [['Ἐν', 'In'], ['ἀρχῇ,', 'beginning']]]],
}))


describe('GlossesBook', () => {

    it("Gets words with glosses and their original form", ({expect}) => {
        const expected = [
            {word: 'Ἐν', gloss: 'In', original: 'ΕΝ'},
            {word: 'ἀρχῇ,', gloss: 'beginning', original: 'ΑΡΧΗ'},
        ]
        expect(glosses.get_words(1, 1)).toEqual(expected)
        expect(glosses.get_words(new PassageReference('jhn', 1, 1))).toEqual(expected)
    })

    it("Returns no words for a missing verse", ({expect}) => {
        expect(glosses.get_words(1, 2)).toEqual([])
        expect(glosses.get_words(5, 1)).toEqual([])
    })
})
