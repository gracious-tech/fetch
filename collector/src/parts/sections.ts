
import {join} from 'node:path'
import {existsSync, readFileSync} from 'node:fs'

import {PassageReference} from '@gracious.tech/bible-references'

import {read_json, list_files} from './utils.js'

import type {BibleJsonTxt, BookSection, DistTranslationExtra} from './shared_types'


export function extract_sections(json_txt:BibleJsonTxt){
    // Extract sections/headings for a book

    const sections:BookSection[] = []
    for (let ch = 1; ch < json_txt.contents.length; ch++){
        for (let v = 1; v < json_txt.contents[ch]!.length; v++){

            // Iterate items in the verse
            for (const item of json_txt.contents[ch]![v]!){

                // Ignore anything that's not a heading
                if (typeof item === 'string' || item.type !== 'heading'){
                    continue
                }

                // Also ignore minor headings as don't help to navigate a book
                if (item.level === 3){
                    continue
                }

                // If previous section is same verse then probably a major heading (drop it)
                let previous = sections.at(-1)
                if (previous?.start_chapter === ch && previous?.start_verse === v){
                    sections.pop()
                    previous = sections.at(-1)
                }

                // Update previous with end values, now know where next section begins
                if (previous){
                    const prev_verse = new PassageReference(json_txt.book, ch, v)
                        .get_prev_verse()!
                    previous.end_chapter = prev_verse.start_chapter
                    previous.end_verse = prev_verse.start_verse
                }

                // Add section
                sections.push({
                    start_chapter: ch,
                    start_verse: v,
                    end_chapter: ch,
                    end_verse: v,
                    heading: item.contents,
                })
            }
        }
    }

    // Ensure start and end ranges valid
    if (sections.length){

        // Ensure first section starts at beginning of book
        sections[0]!.start_chapter = 1
        sections[0]!.start_verse = 1

        // Add end values for last section
        sections.at(-1)!.end_chapter = json_txt.contents.length - 1
        sections.at(-1)!.end_verse = json_txt.contents.at(-1)!.length - 1
    }

    return sections
}


export function generate_chapter_headings(json_txt:BibleJsonTxt, sections:BookSection[]){
    // Generate chapter headings by consulting section headings

    // Start with all chapters as empty string (index 1 is chapter 1)
    const chapters = new Array(json_txt.contents.length).fill('') as string[]

    // Use nearest section headings if available
    for (const section of sections){

        // NOTE Below is intended to leave some chapters blank if sections span multiple

        // If section starts directly at first verse of a chapter, take its heading
        if (section.start_verse === 1){
            chapters[section.start_chapter] = section.heading!
            // WARN Removing heading from section object to reduce data transfer
            section.heading = null

        // If section spans multiple chapters, use its heading for next chapter (but not later ones)
        // NOTE This section is gauranteed not to start at v1 of its start chapter due to above
        } else if (section.end_chapter !== section.start_chapter){
            chapters[section.start_chapter + 1] = section.heading!
        }
    }

    // Use first sentence of chapter for any chapters still lacking a heading
    for (let ch = 1; ch < json_txt.contents.length; ch++){
        if (!chapters[ch]){
            // Get text of verse 1
            const v1 = json_txt.contents[ch]![1]!
            const v1_str = v1.filter(part => typeof part === 'string').join('')
            // Trim to less than 50 chars without ending within a word
            const v1_trimmed = v1_str.slice(0, 50)  // Slightly too long as will cut last word
            const last_space = v1_trimmed.lastIndexOf(' ')  // else -1
            chapters[ch] = v1_trimmed.slice(0, last_space) + '…'
        }
    }

    return chapters
}


export function build_native_book_extra(json_txt:BibleJsonTxt){
    // Build the native (own-source) extra data (names/sections/chapter headings) for a single book
    const sections = extract_sections(json_txt)
    // WARN generate_chapter_headings mutates `sections`, nulling chapter-start headings
    const chapter_headings = generate_chapter_headings(json_txt, sections)
    return {name: json_txt.name, sections, chapter_headings}
}


export function build_native_extra(dist_dir:string):
        {extra:DistTranslationExtra, partial_books:string[]}{
    // Build a translation's native (own-source only) extra data from its dist txt/usx output
    // NOTE Shared by the per-translation processing pass and the cross-translation overlay pass
    const extra:DistTranslationExtra = {book_names: {}, chapter_headings: {}, sections: {},
        wj_markup: false}
    const partial_books:string[] = []
    const txt_dir = join(dist_dir, 'txt')
    if (!existsSync(txt_dir)){
        return {extra, partial_books}
    }

    // Assemble each book's native extra from its txt JSON
    for (const filename of list_files(txt_dir)){
        const book = filename.split('.')[0]!
        const json_txt = read_json<BibleJsonTxt>(join(txt_dir, filename))

        // Names/sections/chapter headings (WARN also nulls chapter-start headings to save transfer)
        const book_extra = build_native_book_extra(json_txt)
        extra.book_names[book] = book_extra.name
        extra.sections[book] = book_extra.sections
        extra.chapter_headings[book] = book_extra.chapter_headings

        // Flag the book as partial if it is missing whole chapters of content
        if (_book_is_partial(json_txt)){
            partial_books.push(book)
        }

        // Detect words of Jesus (char style "wj") from the finalised USX, stopping once found
        if (!extra.wj_markup
                && readFileSync(join(dist_dir, 'usx', `${book}.usx`), {encoding: 'utf8'})
                    .includes('style="wj"')){
            extra.wj_markup = true
        }
    }
    return {extra, partial_books}
}


function _book_is_partial(json_txt:BibleJsonTxt):boolean{
    // A book is partial if any standard chapter has no verse content at all (a missing chapter)
    for (let ch = 1; ch < json_txt.contents.length; ch++){
        if (!json_txt.contents[ch]?.some(verse => verse.length > 0)){
            return true
        }
    }
    return false
}
