
import {PassageReference} from '@gracious.tech/bible-references'

import type {BibleJsonTxt, BookSection} from './shared_types'


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
