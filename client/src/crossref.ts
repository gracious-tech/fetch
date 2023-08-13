
import type {CrossrefData} from './shared_types'


export interface CrossrefItem {
    book:string
    chapter_start:number
    chapter_end:number
    verse_start:number|null
    verse_end:number|null
    single_verse:boolean
}


// Access to cross-reference data for a book
export class BookCrossref {

    _data:CrossrefData

    constructor(data:CrossrefData){
        this._data = data
    }

    // Get cross-references for given verse of book
    get_refs(chapter:number, verse:number):CrossrefItem[]{
        return this._data[chapter]?.[verse]?.map(ref => {
            return {
                book: ref[0],
                chapter_start: ref[1],
                verse_start: ref[2],
                chapter_end: ref[3] ?? ref[1],
                verse_end: ref[4] ?? ref[2],
                single_verse: !!ref[2] && ref[3] === undefined,
            }
        }) ?? []
    }
}
