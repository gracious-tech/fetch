
import {describe, it} from 'vitest'

import {book_has_text, build_native_book_extra, build_native_extra, extract_sections,
    generate_chapter_headings} from './sections.js'
import {use_temp_cwd, write_files} from './test_utils.js'

import type {BibleJsonTxt, TxtContent} from './shared_types'


// A txt book from the given chapters (chapter 0 and each verse 0 are prepended as empty)
function book(chapters:TxtContent[][][], code='rut'):BibleJsonTxt{
    return {
        book: code,
        name: {normal: "Ruth", long: "The Book of Ruth", abbrev: "Ru"},
        contents: [[], ...chapters.map(verses => [[], ...verses])],
    }
}

// A heading item
function heading(contents:string, level:1|2|3=2):TxtContent{
    return {type: 'heading', contents, level}
}

// Ruth with a variety of headings across three chapters
function ruth(){
    return book([
        [
            [heading("Major", 1), heading("Intro"),
                "In the days when the judges ruled there was a famine in the land"],
            ["text"],
            [heading("minor", 3), "x"],
            [heading("Second"), {type: 'note', contents: "a note"}, "y"],
        ],
        [["Naomi had a relative"], [heading("Third"), "z"]],
        [[heading("Fourth"), "w"], ["q"]],
    ])
}


describe('extract_sections', () => {

    it("Ends sections before the next and drops major/minor headings", ({expect}) => {
        expect(extract_sections(ruth())).toEqual([
            {start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 3, heading: "Intro"},
            {start_chapter: 1, start_verse: 4, end_chapter: 2, end_verse: 1, heading: "Second"},
            // Ends at the real last verse of Ruth 2 (versification, not the given contents)
            {start_chapter: 2, start_verse: 2, end_chapter: 2, end_verse: 23, heading: "Third"},
            // Last section ends at the last verse given
            {start_chapter: 3, start_verse: 1, end_chapter: 3, end_verse: 2, heading: "Fourth"},
        ])
    })

    it("Starts the first section at the beginning of the book", ({expect}) => {
        const sections = extract_sections(book([[["a"], [heading("Late"), "b"]]]))
        expect(sections).toEqual([
            {start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 2, heading: "Late"},
        ])
    })

    it("Returns nothing when there are no headings", ({expect}) => {
        expect(extract_sections(book([[["a"]]]))).toEqual([])
    })
})


describe('generate_chapter_headings', () => {

    it("Uses section headings that start or continue into a chapter", ({expect}) => {
        const json = ruth()
        const sections = extract_sections(json)
        expect(generate_chapter_headings(json, sections)).toEqual(
            ['', "Intro", "Second", "Fourth"])
        // Headings used for chapter starts are nulled to save data transfer
        expect(sections.map(s => s.heading)).toEqual([null, "Second", "Third", null])
    })

    it("Falls back to the start of verse 1 without ending mid-word", ({expect}) => {
        expect(generate_chapter_headings(ruth(), [])).toEqual([
            '',
            "In the days when the judges ruled there was a…",
            "Naomi had a…",
            "…",
        ])
    })
})


describe('build_native_book_extra', () => {

    it("Combines names, sections and chapter headings", ({expect}) => {
        const extra = build_native_book_extra(ruth())
        expect(extra.name.normal).toBe("Ruth")
        expect(extra.sections).toHaveLength(4)
        expect(extra.chapter_headings[1]).toBe("Intro")
    })
})


describe('build_native_extra', () => {

    use_temp_cwd()

    it("Returns empty data when there is no txt output", ({expect}) => {
        expect(build_native_extra('missing')).toEqual({
            extra: {book_names: {}, chapter_headings: {}, sections: {}, wj_markup: false},
            partial_books: [],
        })
    })

    it("Builds each book's extra, detecting partial books and words of Jesus", ({expect}) => {
        write_files({
            'x/txt/exo.json': book([[["a"]]], 'exo'),
            'x/usx/exo.usx': '<usx/>',
            // Chapter 2 has no verse content so is partial
            'x/txt/gen.json': {...book([[["a"]]], 'gen'),
                contents: [[], [[], ["a"]], [[], []]]},
            'x/usx/gen.usx': '<char style="wj">',
            'x/txt/lev.json': book([[["a"]]], 'lev'),
            'x/usx/lev.usx': '<usx/>',
        })
        const {extra, partial_books} = build_native_extra('x')
        expect(Object.keys(extra.book_names).sort()).toEqual(['exo', 'gen', 'lev'])
        expect(extra.wj_markup).toBe(true)
        expect(partial_books).toEqual(['gen'])
    })
})


describe('book_has_text', () => {

    it("Only counts non-whitespace verse text", ({expect}) => {
        expect(book_has_text(book([[[heading("H"), " "]]]))).toBe(false)
        expect(book_has_text(book([[[heading("H"), "a"]]]))).toBe(true)
    })
})

