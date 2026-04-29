
import {describe, it} from 'vitest'

import {PassageReference, _detect_book, _verses_str_to_obj} from './passage.js'
import {book_names_english, book_abbrev_english, english_abbrev_include} from './data.js'


function simple(start_chapter:number, start_verse:number, end_chapter?:number, end_verse?:number){
    return {
        start_chapter,
        start_verse,
        end_chapter: end_chapter ?? start_chapter,
        end_verse: end_verse ?? start_verse,
    }
}


describe('_verses_str_to_obj', () => {

    it("Parses a single chapter", ({expect}) => {
        expect(_verses_str_to_obj('1')).toEqual({
            start_chapter: 1,
            start_verse: undefined,
            end_chapter: undefined,
            end_verse: undefined,
        })
    })

    it("Parses multiple chapters", ({expect}) => {
        expect(_verses_str_to_obj('1-2')).toEqual({
            start_chapter: 1,
            start_verse: undefined,
            end_chapter: 2,
            end_verse: undefined,
        })
    })

    it("Parses a single verse", ({expect}) => {
        expect(_verses_str_to_obj('1:1')).toEqual({
            start_chapter: 1,
            start_verse: 1,
            end_chapter: undefined,
            end_verse: undefined,
        })
    })

    it("Parses multiple verses", ({expect}) => {
        expect(_verses_str_to_obj('1:1-2')).toEqual({
            start_chapter: 1,
            start_verse: 1,
            end_chapter: undefined,
            end_verse: 2,
        })
    })

    it("Parses verses across chapters", ({expect}) => {
        expect(_verses_str_to_obj('1:1-2:2')).toEqual({
            start_chapter: 1,
            start_verse: 1,
            end_chapter: 2,
            end_verse: 2,
        })
    })

    it("Salvages what it can from invalid references", ({expect}) => {
        expect(_verses_str_to_obj('x')).toEqual({
            start_chapter: undefined,
            start_verse: undefined,
            end_chapter: undefined,
            end_verse: undefined,
        })
        expect(_verses_str_to_obj('1:x')).toEqual({
            start_chapter: 1,
            start_verse: undefined,
            end_chapter: undefined,
            end_verse: undefined,
        })
        expect(_verses_str_to_obj('1:1-x')).toEqual({
            start_chapter: 1,
            start_verse: 1,
            end_chapter: undefined,
            end_verse: undefined,
        })
        expect(_verses_str_to_obj('1:1-1:x')).toEqual({
            start_chapter: 1,
            start_verse: 1,
            end_chapter: 1,
            end_verse: undefined,
        })
        expect(_verses_str_to_obj('1-2:1')).toEqual({
            start_chapter: 1,
            start_verse: undefined,
            end_chapter: 2,
            end_verse: 1,
        })
    })

})


describe('_detect_book', () => {

    const book_names = [...Object.entries(book_names_english), ...english_abbrev_include]

    for (const [code, name] of book_names){
        it(`Identifies "${name}" as '${code}'`, ({expect}) => {
            expect(_detect_book(name, book_names)).toEqual(code)
        })
    }

    for (const [code, abbrevs] of Object.entries(book_name_abbreviations)){
        for (const abbrev of abbrevs){
            it(`Identifies "${abbrev}" as '${code}'`, ({expect}) => {
                expect(_detect_book(abbrev, book_names)).toEqual(code)
            })
        }
    }

    it("Returns null if can't match", ({expect}) => {
        expect(_detect_book('nothing', book_names)).toEqual(null)
    })

    it("Returns null if multiple matches", ({expect}) => {
        expect(_detect_book('j', book_names)).toEqual(null)
    })

    it("Requires second char at start if first char is number", ({expect}) => {
        expect(_detect_book('1am', book_names)).toEqual(null)
        expect(_detect_book('1sam', book_names)).toEqual('1sa')
    })

    it("Still parses some kinds of ambiguous references", ({expect}) => {
        // Phil could be Philemon or Philippians but is generally understood to be the later
        expect(_detect_book("Phil", book_names)).toEqual('php')
    })

    it("Detects abbreviations within words for languages that require it", ({expect}) => {
        expect(_detect_book("伯", [['job', "約伯記"]], undefined, false)).toBe('job')
    })
})


describe('get_prev_verse', () => {

    it("Accounts for chapters", ({expect}) => {
        expect(new PassageReference('2th', 1, 1).get_prev_verse()).toBe(null)
        expect(new PassageReference('2th', 1, 2).get_prev_verse()).toMatchObject(simple(1, 1))
        expect(new PassageReference('2th', 2, 1).get_prev_verse()).toMatchObject(simple(1, 12))
    })

    it("Gets previous from end when arg passed", ({expect}) => {
        expect(new PassageReference({book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 2,
            end_verse: 1}).get_prev_verse(true))
            .toMatchObject(simple(1, 12))
    })

    it("Expands book/chapter type to actual end when prev_to_end=true", ({expect}) => {
        // Book type: expands to last verse (2th 3:18), so prev is 3:17
        expect(new PassageReference('2th').get_prev_verse(true)).toMatchObject(simple(3, 17))
        // Chapter type: expands to last verse of chapter (2th ch1 = 1:12), so prev is 1:11
        expect(new PassageReference('2th', 1).get_prev_verse(true)).toMatchObject(simple(1, 11))
    })
})


describe('get_next_verse', () => {

    it("Accounts for chapters", ({expect}) => {
        expect(new PassageReference('2th', 1, 1).get_next_verse()).toMatchObject(simple(1, 2))
        expect(new PassageReference('2th', 1, 12).get_next_verse()).toMatchObject(simple(2, 1))
        expect(new PassageReference('2th', 3, 18).get_next_verse()).toBe(null)
    })

    it("Gets next from end when arg passed", ({expect}) => {
        expect(new PassageReference({book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 2,
            end_verse: 1}).get_next_verse(true))
            .toMatchObject(simple(2, 2))
    })

    it("Expands book/chapter type to actual end when after_end=true", ({expect}) => {
        // Book type: expands to last verse (2th 3:18), so next is null
        expect(new PassageReference('2th').get_next_verse(true)).toBe(null)
        // Chapter type: expands to last verse of chapter (2th ch1 = 1:12), so next is 2:1
        expect(new PassageReference('2th', 1).get_next_verse(true)).toMatchObject(simple(2, 1))
    })
})


describe('constructor', () => {

    it("Interprets basic args", ({expect}) => {
        expect(new PassageReference('2th')).toMatchObject({type: 'book', range: false,
            book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1})
        expect(new PassageReference('2th', 1)).toMatchObject({type: 'chapter', range: false,
            book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1})
        expect(new PassageReference('2th', 1, 1)).toMatchObject({type: 'verse', range: false,
            book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1})
    })

    it("Interprets invalid basic args", ({expect}) => {
        expect(new PassageReference('invalid')).toMatchObject({type: 'book', range: false,
            book: 'gen', start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1})
        expect(new PassageReference('2th', -1)).toMatchObject({type: 'chapter', range: false,
            book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1})
        expect(new PassageReference('2th', 99)).toMatchObject({type: 'chapter', range: false,
            book: '2th', start_chapter: 3, start_verse: 18, end_chapter: 3, end_verse: 18})
        expect(new PassageReference('2th', 2, -1)).toMatchObject({type: 'verse', range: false,
            book: '2th', start_chapter: 2, start_verse: 1, end_chapter: 2, end_verse: 1})
        expect(new PassageReference('2th', 2, 99)).toMatchObject({type: 'verse', range: false,
            book: '2th', start_chapter: 2, start_verse: 17, end_chapter: 2, end_verse: 17})
    })

    it("Interprets range args", ({expect}) => {
        expect(new PassageReference(
            {book: '2th', start_chapter: 2, end_chapter: 3}
        )).toMatchObject({type: 'range_chapters', range: true,
            book: '2th', start_chapter: 2, start_verse: 1, end_chapter: 3, end_verse: 18})
        expect(new PassageReference(
            {book: '2th', start_chapter: 2, start_verse: 1, end_verse: 2}
        )).toMatchObject({type: 'range_verses', range: true,
            book: '2th', start_chapter: 2, start_verse: 1, end_chapter: 2, end_verse: 2})
        expect(new PassageReference(
            {book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 2, end_verse: 1}
        )).toMatchObject({type: 'range_multi', range: true,
            book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 2, end_verse: 1})
    })

    it("Interprets invalid range args", ({expect}) => {
        expect(new PassageReference(
            {book: '2th', start_chapter: 2, end_chapter: 1}
        )).toMatchObject({type: 'chapter', range: false,
            book: '2th', start_chapter: 2, start_verse: 1, end_chapter: 2, end_verse: 1})
        expect(new PassageReference(
            {book: '2th', start_chapter: 2, start_verse: 1, end_chapter: 2, end_verse: 99}
        )).toMatchObject({type: 'range_verses', range: true,
            book: '2th', start_chapter: 2, start_verse: 1, end_chapter: 2, end_verse: 17})
    })

    it("Interprets non-sensical args", ({expect}) => {
        expect(new PassageReference({book: '2th', start_verse: 1}
        )).toMatchObject({type: 'book', range: false,
            book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1})
        expect(new PassageReference({book: '2th', start_chapter: 2, end_verse: 5}))
            .toMatchObject({type: 'range_verses', range: true,
            book: '2th', start_chapter: 2, start_verse: 1, end_chapter: 2, end_verse: 5})
        expect(new PassageReference({book: '2th', start_chapter: 1, start_verse: 1,
            end_chapter: 2}))
            .toMatchObject({type: 'range_chapters', range: true,
            book: '2th', start_chapter: 1, start_verse: 1, end_chapter: 2, end_verse: 17})
    })

    it("Produces consistent results for single chapter books", ({expect}) => {
        expect(new PassageReference({book: 'jud'}))
            .toMatchObject({type: 'book'})
        expect(new PassageReference({book: 'jud', start_chapter: 1}))
            .toMatchObject({type: 'book'})
        expect(new PassageReference({book: 'jud', start_chapter: 1, start_verse: 1}))
            .toMatchObject({type: 'verse'})
        expect(new PassageReference({book: 'jud', start_chapter: 1, start_verse: 1, end_verse: 2}))
            .toMatchObject({type: 'range_verses'})
        // The following not actually valid but see if can force a range of chapters
        expect(new PassageReference({book: 'jud', start_chapter: 1, end_chapter: 2}))
            .toMatchObject({type: 'range_verses'})
        expect(new PassageReference({book: 'jud', start_chapter: 1, start_verse: 2, end_chapter: 2, end_verse: 2}))
            .toMatchObject({type: 'range_verses'})
    })

})


describe('ranges', () => {

    it("Interprets ranges reliably", ({expect}) => {
        const tests:[string, string, number, number, number, number, string?][] = [
            // Each type
            ["Titus", 'book', 1, 1, 1, 1],
            ["Titus 1", 'chapter', 1, 1, 1, 1],
            ["Titus 1:1", 'verse', 1, 1, 1, 1],
            ["Titus 1:1-2", 'range_verses', 1, 1, 1, 2],
            ["Titus 1-2", 'range_chapters', 1, 1, 2, 15],
            ["Titus 1:1-2:2", 'range_multi', 1, 1, 2, 2],
            // Ranges that should be simplified to a range of chapters
            ["Titus 1:1-2:15", 'range_chapters', 1, 1, 2, 15, "Titus 1-2"],  // Range of entire chapters
            ["Titus 1:1-3:15", 'range_chapters', 1, 1, 3, 15, "Titus 1-3"],  // Range of entire book
            // Ranges that should NOT be simplified
            // as would then cause ambiguity as to whether they represent a range or an identifier
            ["Titus 1:1-16", 'range_verses', 1, 1, 1, 16],  // Whole chapter
            ["Titus 1-3", 'range_chapters', 1, 1, 3, 15],  // Whole book

            // Each type
            ["Jude", 'book', 1, 1, 1, 1],
            ["Jude 1", 'verse', 1, 1, 1, 1, "Jude 1:1"],
            ["Jude 1:1", 'verse', 1, 1, 1, 1],
            ["Jude 1:1-2", 'range_verses', 1, 1, 1, 2],
            ["Jude 1-2", 'range_verses', 1, 1, 1, 2, "Jude 1:1-2"],
            ["Jude 1:1-2:2", 'range_verses', 1, 1, 1, 25, "Jude 1:1-25"],  // Actually invalid but still test
            // Ranges that should NOT be simplified
            // as would then cause ambiguity as to whether they represent a range or an identifier
            ["Jude 1:1-25", 'range_verses', 1, 1, 1, 25],  // Whole chapter
        ]

        for (const [string, type, start_chapter, start_verse, end_chapter, end_verse, new_string] of tests){
            const ref_obj = PassageReference.from_string(string)!
            expect(ref_obj).toMatchObject(
                {type, start_chapter, start_verse, end_chapter, end_verse})
            expect(ref_obj.toString()).toBe(new_string ?? string)
        }
    })
})


describe('from_string', () => {

    it("Interprets single digits as verses for single chapter books", ({expect}) => {

        // To confirm multi-chapter books are interpreted as chapter
        expect(PassageReference.from_string("1 John 1")!.type).toBe('chapter')
        expect(PassageReference.from_string("1 John 2-3"))
            .toMatchObject({start_chapter: 2, start_verse: 1, end_chapter: 3, end_verse: 24})

        // Single chapter books
        // NOTE It's still expected to re-render these with toString() as 1:1 for clarity
        expect(PassageReference.from_string("Obadiah 1")!.type).toBe('verse')
        expect(PassageReference.from_string("Philemon 1")!.type).toBe('verse')
        expect(PassageReference.from_string("2 John 1")!.type).toBe('verse')
        expect(PassageReference.from_string("3 John 1")!.type).toBe('verse')
        expect(PassageReference.from_string("Jude 1")!.type).toBe('verse')

        expect(PassageReference.from_string("Obadiah 2-3"))
            .toMatchObject({start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3})
        expect(PassageReference.from_string("Philemon 2-3"))
            .toMatchObject({start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3})
        expect(PassageReference.from_string("2 John 2-3"))
            .toMatchObject({start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3})
        expect(PassageReference.from_string("3 John 2-3"))
            .toMatchObject({start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3})
        expect(PassageReference.from_string("Jude 2-3"))
            .toMatchObject({start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3})
    })

    it("Does not detect single letter English names", ({expect}) => {
        // NOTE O for Obadiah seems to be the only unique one
        expect(PassageReference.from_string("O 1")).toBe(null)
        expect(PassageReference.from_string("O. 1")?.book).toBe('oba')
    })

})

describe('toString', () => {

    it("Renders when coercing to a string", ({expect}) => {
        expect(`${new PassageReference('tit')}`).toBe('Titus')
    })

    it("Renders passage types correctly", ({expect}) => {
        expect(new PassageReference('tit').toString()).toBe('Titus')
        expect(new PassageReference('tit', 1).toString()).toBe('Titus 1')
        expect(new PassageReference('tit', 1, 1).toString()).toBe('Titus 1:1')
        expect(new PassageReference({book: 'tit', start_chapter: 1, start_verse: 1, end_verse: 2})
            .toString()).toBe('Titus 1:1-2')
        expect(new PassageReference({book: 'tit', start_chapter: 1, end_chapter: 2}).toString())
            .toBe('Titus 1-2')
        expect(new PassageReference({book: 'tit', start_chapter: 1, start_verse: 1, end_chapter: 2,
            end_verse: 1}).toString()).toBe('Titus 1:1-2:1')
    })

    it("Uses abbreviation when passed the hardcoded data", ({expect}) => {
        expect(new PassageReference('ezk').toString(book_abbrev_english)).toBe('Ezek')
    })

    it("Restores original valid string", ({expect}) => {
        expect(PassageReference.from_string('Titus')!.toString()).toBe('Titus')
        expect(PassageReference.from_string('Titus 1')!.toString()).toBe('Titus 1')
        expect(PassageReference.from_string('Titus 1:1')!.toString()).toBe('Titus 1:1')
        expect(PassageReference.from_string('Titus 1:1-2')!.toString()).toBe('Titus 1:1-2')
        expect(PassageReference.from_string('Titus 1:1-2:2')!.toString()).toBe('Titus 1:1-2:2')
        expect(PassageReference.from_string('Titus 1-2')!.toString()).toBe('Titus 1-2')
        // Also test Jude since had bug with single chapter books earlier
        expect(PassageReference.from_string('Jude')!.toString()).toBe('Jude')
    })

})


describe('serialized', () => {

    it("Is deterministic", ({expect}) => {

        // Expected code and props
        const props_tit:[string, Record<string, unknown>][] = [
            ['tit', {book: 'tit', type: 'book',
                start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1}],
            ['tit2', {book: 'tit', type: 'chapter',
                start_chapter: 2, start_verse: 1, end_chapter: 2, end_verse: 1}],
            ['tit2:2', {book: 'tit', type: 'verse',
                start_chapter: 2, start_verse: 2, end_chapter: 2, end_verse: 2}],
            ['tit2:2-3', {book: 'tit', type: 'range_verses',
                start_chapter: 2, start_verse: 2, end_chapter: 2, end_verse: 3}],
            ['tit2-3', {book: 'tit', type: 'range_chapters',
                start_chapter: 2, start_verse: 1, end_chapter: 3, end_verse: 15}],
            ['tit2:2-3:3', {book: 'tit', type: 'range_multi',
                start_chapter: 2, start_verse: 2, end_chapter: 3, end_verse: 3}],
        ]

        // Also test single chapter books like Jude
        // Produces code with chapter number included for clarity
        //    even if parsing 'jud1' is possible and results in a verse ref (not chapter)
        const props_jud:[string, Record<string, unknown>][] = [
            ['jud', {book: 'jud', type: 'book',
                start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1}],
            // NOTE 'chapter' is not possible
            ['jud1:2', {book: 'jud', type: 'verse',
                start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 2}],
            ['jud1:2-3', {book: 'jud', type: 'range_verses',
                start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3}],
            // NOTE 'range_chapters' is not possible
            // NOTE 'range_multi' is not possible
        ]

        for (const test_props of [props_tit, props_jud]){
            for (const [code, props] of test_props){
                const ref_produced = PassageReference.from_serialized(code)
                expect(ref_produced).toMatchObject(props)
                const code_produced = ref_produced.to_serialized()
                expect(code_produced).toBe(code)
            }
        }
    })

})


describe('total_verses', () => {

    it("Sums for each verse type", ({expect}) => {
        expect(PassageReference.from_string('2 Tim')!.total_verses()).toBe(18 + 26 + 17 + 22)
        expect(PassageReference.from_string('2 Tim 2')!.total_verses()).toBe(26)
        expect(PassageReference.from_string('2 Tim 2:4')!.total_verses()).toBe(1)
        expect(PassageReference.from_string('2 Tim 2:4-5')!.total_verses()).toBe(2)
        expect(PassageReference.from_string('2 Tim 2-3')!.total_verses()).toBe(26 + 17)
        expect(PassageReference.from_string('2 Tim 2:2-3:3')!.total_verses()).toBe(25 + 3)
        // Also test with multiple middle chapters
        expect(PassageReference.from_string('2 Tim 1:2-4:3')!.total_verses()).toBe(17 + 26 + 17 + 3)
    })

})


describe('is_before', () => {

    it("Returns true when ref ends before the given chapter/verse", ({expect}) => {
        expect(new PassageReference('gen', 1, 5).is_before(1, 6)).toBe(true)
        expect(new PassageReference('gen', 1, 5).is_before(1, 5)).toBe(false)
        expect(new PassageReference('gen', 1, 6).is_before(1, 5)).toBe(false)
    })

    it("Returns true when ref ends before the given ref starts", ({expect}) => {
        const a = new PassageReference('gen', 1, 5)
        const b = new PassageReference('gen', 1, 6)
        expect(a.is_before(b)).toBe(true)
        expect(b.is_before(a)).toBe(false)
        expect(a.is_before(a)).toBe(false)
    })

    it("Expands book/chapter type to actual end for ref", ({expect}) => {
        // Chapter type expands to end of chapter (gen ch1 = 1:31)
        // so is_before(1:31) should be false (ends at, not before)
        expect(new PassageReference('gen', 1).is_before(1, 31)).toBe(false)
        // and is_before(1:15) should be false (1:31 is not before 1:15)
        expect(new PassageReference('gen', 1).is_before(1, 15)).toBe(false)
        // but is_before(2:1) should be true (1:31 is before 2:1)
        expect(new PassageReference('gen', 1).is_before(2, 1)).toBe(true)
    })

    it("Uses canonical book order for cross-book comparison", ({expect}) => {
        expect(new PassageReference('gen').is_before(new PassageReference('mat'))).toBe(true)
        expect(new PassageReference('mat').is_before(new PassageReference('gen'))).toBe(false)
    })
})


describe('is_after', () => {

    it("Returns true when ref starts after the given chapter/verse", ({expect}) => {
        expect(new PassageReference('gen', 1, 6).is_after(1, 5)).toBe(true)
        expect(new PassageReference('gen', 1, 5).is_after(1, 5)).toBe(false)
        expect(new PassageReference('gen', 1, 5).is_after(1, 6)).toBe(false)
    })

    it("Returns true when ref starts after the given ref ends", ({expect}) => {
        const a = new PassageReference('gen', 1, 5)
        const b = new PassageReference('gen', 1, 6)
        expect(b.is_after(a)).toBe(true)
        expect(a.is_after(b)).toBe(false)
        expect(a.is_after(a)).toBe(false)
    })

    it("Expands book/chapter type to actual end for ref arg", ({expect}) => {
        // Chapter type arg expands to end of chapter (gen ch1 = 1:31)
        // so a verse within ch1 should NOT be after ch1
        expect(new PassageReference('gen', 1, 15).is_after(new PassageReference('gen', 1))).toBe(false)
        // the last verse of ch1 should NOT be after ch1
        expect(new PassageReference('gen', 1, 31).is_after(new PassageReference('gen', 1))).toBe(false)
        // but the first verse of ch2 SHOULD be after ch1
        expect(new PassageReference('gen', 2, 1).is_after(new PassageReference('gen', 1))).toBe(true)
    })

    it("Uses canonical book order for cross-book comparison", ({expect}) => {
        expect(new PassageReference('mat').is_after(new PassageReference('gen'))).toBe(true)
        expect(new PassageReference('gen').is_after(new PassageReference('mat'))).toBe(false)
    })
})


describe('includes', () => {

    it("Returns true when the given chapter/verse is within ref", ({expect}) => {
        const ref = new PassageReference({book: 'gen', start_chapter: 1, start_verse: 5,
            end_chapter: 2, end_verse: 10})
        expect(ref.includes(1, 5)).toBe(true)   // start boundary
        expect(ref.includes(2, 10)).toBe(true)  // end boundary
        expect(ref.includes(1, 10)).toBe(true)  // middle
        expect(ref.includes(1, 4)).toBe(false)  // before start
        expect(ref.includes(2, 11)).toBe(false) // after end
    })

    it("Returns true when the argument ref is fully within the calling ref", ({expect}) => {
        const outer = new PassageReference({book: 'gen', start_chapter: 1, start_verse: 1,
            end_chapter: 5, end_verse: 32})
        const inner = new PassageReference({book: 'gen', start_chapter: 1, start_verse: 5,
            end_chapter: 2, end_verse: 10})
        expect(outer.includes(inner)).toBe(true)
        expect(inner.includes(outer)).toBe(false)
    })

    it("Returns true when refs are identical", ({expect}) => {
        const ref = new PassageReference({book: 'gen', start_chapter: 1, start_verse: 5,
            end_chapter: 2, end_verse: 10})
        expect(ref.includes(ref)).toBe(true)
    })

    it("Returns false when ref only partially overlaps", ({expect}) => {
        const ref = new PassageReference({book: 'gen', start_chapter: 2, start_verse: 5,
            end_chapter: 3, end_verse: 10})
        // Arg starts before the calling ref
        expect(ref.includes(new PassageReference({book: 'gen', start_chapter: 1,
            start_verse: 1, end_chapter: 2, end_verse: 10}))).toBe(false)
        // Arg ends after the calling ref
        expect(ref.includes(new PassageReference({book: 'gen', start_chapter: 3,
            start_verse: 5, end_chapter: 4, end_verse: 1}))).toBe(false)
    })

    it("Expands book/chapter type to full range for the calling ref", ({expect}) => {
        // Book type includes any verse within the book
        expect(new PassageReference('gen').includes(new PassageReference('gen', 5, 1))).toBe(true)
        // Chapter type includes verses within the chapter
        expect(new PassageReference('gen', 1).includes(new PassageReference('gen', 1, 15))).toBe(true)
        expect(new PassageReference('gen', 1).includes(new PassageReference('gen', 2, 1))).toBe(false)
    })

    it("Returns false for different books", ({expect}) => {
        expect(new PassageReference('gen').includes(new PassageReference('mat', 1, 1))).toBe(false)
    })
})


describe('overlaps', () => {

    it("Returns true when ranges share verses", ({expect}) => {
        const ref = new PassageReference({book: 'gen', start_chapter: 2, start_verse: 5,
            end_chapter: 3, end_verse: 10})
        // Partial overlap at start
        expect(ref.overlaps(new PassageReference({book: 'gen', start_chapter: 1,
            start_verse: 1, end_chapter: 2, end_verse: 10}))).toBe(true)
        // Partial overlap at end
        expect(ref.overlaps(new PassageReference({book: 'gen', start_chapter: 3,
            start_verse: 5, end_chapter: 4, end_verse: 1}))).toBe(true)
        // One contains the other
        expect(ref.overlaps(new PassageReference({book: 'gen', start_chapter: 1,
            start_verse: 1, end_chapter: 5, end_verse: 32}))).toBe(true)
        // Same ref
        expect(ref.overlaps(ref)).toBe(true)
    })

    it("Returns false when ranges do not share verses", ({expect}) => {
        const ref = new PassageReference({book: 'gen', start_chapter: 2, start_verse: 5,
            end_chapter: 3, end_verse: 10})
        // Ends just before ref starts
        expect(ref.overlaps(new PassageReference({book: 'gen', start_chapter: 1,
            start_verse: 1, end_chapter: 2, end_verse: 4}))).toBe(false)
        // Starts just after ref ends
        expect(ref.overlaps(new PassageReference({book: 'gen', start_chapter: 3,
            start_verse: 11, end_chapter: 4, end_verse: 1}))).toBe(false)
    })

    it("Returns false for different books", ({expect}) => {
        expect(new PassageReference('gen').overlaps(new PassageReference('mat'))).toBe(false)
    })

    it("Expands book/chapter types to full range", ({expect}) => {
        // Book type overlaps with a verse within it
        expect(new PassageReference('gen').overlaps(new PassageReference('gen', 5, 1))).toBe(true)
        // Chapter type overlaps with a verse within it but not one outside
        expect(new PassageReference('gen', 1).overlaps(new PassageReference('gen', 1, 15))).toBe(true)
        expect(new PassageReference('gen', 1).overlaps(new PassageReference('gen', 2, 1))).toBe(false)
    })
})


const book_name_abbreviations = {
    "gen": ["Gen.", "Ge.", "Gn."],
    "exo": ["Ex.", "Exod.", "Exo."],
    "lev": ["Lev.", "Le.", "Lv."],
    "num": ["Num.", "Nu.", "Nm.", "Nb."],
    "deu": ["Deut.", "De.", "Dt."],
    "jos": ["Josh.", "Jos.", "Jsh."],
    "jdg": ["Judg.", "Jdg.", "Jg.", "Jdgs."],
    "rut": ["Ruth", "Rth.", "Ru."],
    "1sa": ["1 Sam.", "1 Sm.", "1 Sa.", "1 S.", "I Sam.", "I Sa.", "1Sam.", "1Sa.", "1S.", "1st Samuel", "1st Sam.", "First Samuel", "First Sam."],
    "2sa": ["2 Sam.", "2 Sm.", "2 Sa.", "2 S.", "II Sam.", "II Sa.", "2Sam.", "2Sa.", "2S.", "2nd Samuel", "2nd Sam.", "Second Samuel", "Second Sam."],
    "1ki": ["1 Kings", "1 Kgs", "1 Ki", "1Kgs", "1Kin", "1Ki", "1K", "I Kgs", "I Ki", "1st Kings", "1st Kgs", "First Kings", "First Kgs"],
    "2ki": ["2 Kings", "2 Kgs.", "2 Ki.", "2Kgs.", "2Kin.", "2Ki.", "2K.", "II Kgs.", "II Ki.", "2nd Kings", "2nd Kgs.", "Second Kings", "Second Kgs."],
    "1ch": ["1 Chron.", "1 Chr.", "1 Ch.", "1Chron.", "1Chr.", "1Ch.", "I Chron.", "I Chr.", "I Ch.", "1st Chronicles", "1st Chron.", "First Chronicles", "First Chron."],
    "2ch": ["2 Chron.", "2 Chr.", "2 Ch.", "2Chron.", "2Chr.", "2Ch.", "II Chron.", "II Chr.", "II Ch.", "2nd Chronicles", "2nd Chron.", "Second Chronicles", "Second Chron."],
    "ezr": ["Ezra", "Ezr.", "Ez."],
    "neh": ["Neh.", "Ne."],
    "est": ["Est.", "Esth.", "Es."],
    "job": ["Job", "Jb."],
    "psa": ["Ps.", "Psalm", "Pslm.", "Psa.", "Psm.", "Pss."],
    "pro": ["Prov", "Pro.", "Prv.", "Pr."],
    "ecc": ["Eccles.", "Eccle.", "Ecc.", "Ec."],
    "sng": ["Song", "Song of Songs", "SOS.", "So."],
    "isa": ["Isa.", "Is."],
    "jer": ["Jer.", "Je.", "Jr."],
    "lam": ["Lam.", "La."],
    "ezk": ["Ezek.", "Eze.", "Ezk."],
    "dan": ["Dan.", "Da.", "Dn."],
    "hos": ["Hos.", "Ho."],
    "jol": ["Joel", "Jl."],
    "amo": ["Amos", "Am."],
    "oba": ["Obad.", "Ob."],
    "jon": ["Jonah", "Jnh.", "Jon."],
    "mic": ["Mic.", "Mc."],
    "nam": ["Nah.", "Na."],
    "hab": ["Hab.", "Hb."],
    "zep": ["Zeph.", "Zep.", "Zp."],
    "hag": ["Hag.", "Hg."],
    "zec": ["Zech.", "Zec.", "Zc."],
    "mal": ["Mal.", "Ml."],
    "mat": ["Matt.", "Mt."],
    "mrk": ["Mark", "Mrk", "Mar", "Mk", "Mr"],
    "luk": ["Luke", "Luk", "Lk"],
    "jhn": ["John", "Joh", "Jhn", "Jn"],
    "act": ["Acts", "Act", "Ac"],
    "rom": ["Rom.", "Ro.", "Rm."],
    "1co": ["1 Cor.", "1 Co.", "I Cor.", "I Co.", "1Cor.", "1Co.", "I Corinthians", "1Corinthians", "1st Corinthians", "First Corinthians"],
    "2co": ["2 Cor.", "2 Co.", "II Cor.", "II Co.", "2Cor.", "2Co.", "II Corinthians", "2Corinthians", "2nd Corinthians", "Second Corinthians"],
    "gal": ["Gal.", "Ga."],
    "eph": ["Eph.", "Ephes."],
    "php": ["Phil.", "Php.", "Pp."],
    "col": ["Col.", "Co."],
    "1th": ["1 Thess.", "1 Thes.", "1 Th.", "I Thessalonians", "I Thess.", "I Thes.", "I Th.", "1Thessalonians", "1Thess.", "1Thes.", "1Th.", "1st Thessalonians", "1st Thess.", "First Thessalonians", "First Thess."],
    "2th": ["2 Thess.", "2 Thes.", "2 Th.", "II Thessalonians", "II Thess.", "II Thes.", "II Th.", "2Thessalonians", "2Thess.", "2Thes.", "2Th.", "2nd Thessalonians", "2nd Thess.", "Second Thessalonians", "Second Thess."],
    "1ti": ["1 Tim.", "1 Ti.", "I Timothy", "I Tim.", "I Ti.", "1Timothy", "1Tim.", "1Ti.", "1st Timothy", "1st Tim.", "First Timothy", "First Tim."],
    "2ti": ["2 Tim.", "2 Ti.", "II Timothy", "II Tim.", "II Ti.", "2Timothy", "2Tim.", "2Ti.", "2nd Timothy", "2nd Tim.", "Second Timothy", "Second Tim."],
    "tit": ["Titus", "Tit", "ti"],
    "phm": ["Philem.", "Phm.", "Pm."],
    "heb": ["Heb."],
    "jas": ["James", "Jas", "Jm"],
    "1pe": ["1 Pet.", "1 Pe.", "1 Pt.", "1 P.", "I Pet.", "I Pt.", "I Pe.", "1Peter", "1Pet.", "1Pe.", "1Pt.", "1P.", "I Peter", "1st Peter", "First Peter"],
    "2pe": ["2 Pet.", "2 Pe.", "2 Pt.", "2 P.", "II Peter", "II Pet.", "II Pt.", "II Pe.", "2Peter", "2Pet.", "2Pe.", "2Pt.", "2P.", "2nd Peter", "Second Peter"],
    "1jn": ["1 John", "1 Jhn.", "1 Jn.", "1 J.", "1John", "1Jhn.", "1Joh.", "1Jn.", "1Jo.", "1J.", "I John", "I Jhn.", "I Joh.", "I Jn.", "I Jo.", "1st John", "First John"],
    "2jn": ["2 John", "2 Jhn.", "2 Jn.", "2 J.", "2John", "2Jhn.", "2Joh.", "2Jn.", "2Jo.", "2J.", "II John", "II Jhn.", "II Joh.", "II Jn.", "II Jo.", "2nd John", "Second John"],
    "3jn": ["3 John", "3 Jhn.", "3 Jn.", "3 J.", "3John", "3Jhn.", "3Joh.", "3Jn.", "3Jo.", "3J.", "III John", "III Jhn.", "III Joh.", "III Jn.", "III Jo.", "3rd John", "Third John"],
    "jud": ["Jude", "Jud.", "Jd."],
    "rev": ["Rev", "Re"],
}
