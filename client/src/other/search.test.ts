
import {describe, it} from 'vitest'
import {PassageReference} from '@gracious.tech/bible-references'

import {SearchWords} from './search.js'


const search = new SearchWords(JSON.stringify({
    id: 'nt_test',
    source: 'Test',
    url: 'https://source',
    books: {
        jhn: [[], ['', 'G1 G2,G3', 'G3,G3,G4']],
        rom: [[], ['', 'G3']],
    },
}))


describe('SearchWords', () => {

    it("Exposes source metadata", ({expect}) => {
        expect([search.id, search.source, search.source_url])
            .toEqual(['nt_test', 'Test', 'https://source'])
    })

    it("Gets the words of a verse as a copy", ({expect}) => {
        const words = search.get_words_for_ref(new PassageReference('jhn', 1, 2))
        expect(words).toEqual(['G3', 'G3', 'G4'])
        words.push('changed')
        expect(search.get_words_for_ref(new PassageReference('jhn', 1, 2))).toHaveLength(3)
        expect(search.get_words_for_ref(new PassageReference('jhn', 1, 9))).toEqual([])
        expect(search.get_words_for_ref(new PassageReference('mat', 1, 1))).toEqual([])
    })

    it("Finds verses containing any of the values, most matches first", ({expect}) => {
        const results = search.search('G3', 'G4').map(result =>
            [result.verse.toString(), result.word_indexes])
        expect(results).toEqual([
            ['John 1:2', [0, 1, 2]],
            ['John 1:1', [1]],
            ['Romans 1:1', [0]],
        ])
        expect(search.search('G9')).toEqual([])
    })
})
