
import {describe, it} from 'vitest'
import {PassageReference} from '@gracious.tech/bible-references'

import {BookCrossref} from './crossref.js'


const crossref = new BookCrossref({1: {1: [['gen', 1, 1], ['jhn', 1, 1, 1, 3]]}})


describe('BookCrossref', () => {

    it("Gets single and range references for a verse", ({expect}) => {
        const refs = crossref.get_refs(1, 1).map(ref => ref.toString())
        expect(refs).toEqual(['Genesis 1:1', 'John 1:1-3'])
        expect(crossref.get_refs(new PassageReference('jhn', 1, 1)).map(ref => ref.toString()))
            .toEqual(refs)
    })

    it("Returns no references for a verse without any", ({expect}) => {
        expect(crossref.get_refs(1, 2)).toEqual([])
        expect(crossref.get_refs(2, 1)).toEqual([])
    })
})
