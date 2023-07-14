import {number_of_verses} from './stats.js'

export interface BibleHtmlJson {
    // chapter -> verse -> [opening_tags, verse, closing_tags]
    contents:Record<number, Record<number, [string, string, string]>>
}

// Convert USX to HTML organised by verse in a JSON structure
/* TODO Requirements:

    First read README.md in this dir

    Study how HTML conversion has been done in `collector/assets/usx_transforms/usx_to_html.xslt`
        Also checkout HTML files in `collection/dist` (though they have been minified)
        Can skip `control_chars.xslt` but `ignore.xslt` is important
        Generally follow the same rules, unless stated otherwise below

    Verse markers -- <verse number="..." sid="...">
        See https://ubsicap.github.io/usx/elements.html#verse
        Only parse `number` since `sid` only exists for USX3+
        Number may be a range (e.g. 1-2), in which case put under verse 1 and leave verse 2 empty
        <verse eid="..."> should be listened to when present (USX3+)
            Any extra-biblical content between that and the next verse should be ignored
                UNLESS They are headings, in which case keep

    All verses should exist
        Use `number_of_verses` to ensure every verse exists, and leave as empty string if it doesn't
*/
export function usx_to_html(xml:string): BibleHtmlJson {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const usx_tag = doc.documentElement
    if ((!usx_tag) || (usx_tag.nodeName !== 'usx')) {
        throw Error('Invalid markup. Missing usx tag.')
    }
    // Retrieve the book to build out our output
    const book_node = usx_tag.getElementsByTagName('book')
    if ((!book_node) || (book_node.length === 0)) {
        throw Error('Invalid markup. Missing book tag.')
    }
    let usx_code = book_node[0]!.getAttribute('code')
    if (!usx_code) {
        throw Error('Invalid markup. Missing book code attribute.')
    }
    usx_code = usx_code.toLowerCase()
    if (!(usx_code in number_of_verses)) {
        throw Error('Invalid book. The book code does not exist.')
    }
    // Build out the object
    const output: BibleHtmlJson = {
        contents: {
            0: {},
        },
    }
    number_of_verses[usx_code]!.forEach((total_verses: number, index: number) => {
        const chapter: Record<number, [string, string, string]> = {}
        const chapter_number = index + 1
        for (let i = 1; i <= total_verses; i++) {
            chapter[i] = ['', '', '']
        }
        output.contents[chapter_number] = chapter
    })
    // Fill in the object
    const children = Array.from(usx_tag.children)
    let current_chapter = -1
    let current_verse = -1
    for (const child of children) {
        if (child.nodeName === 'chapter') {
            const chapter_attr = child.getAttribute('number')
            if (!chapter_attr) {
                // We are at the end of a chapter
                continue
            }
            current_chapter = parseInt(chapter_attr, 10)
        }
        if (child.nodeName === 'para') {
            const style_attr = child.getAttribute('style')
            const style = style_attr || ''
            if (['h', 'mt1', 'toc1', 'toc2'].includes(style)) {
                // skip these styles
                continue
            }
            const childNodes = Array.from(child.childNodes)
            let para_html = `<p class="fb-${style}">`
            for (const para_child of childNodes) {
                if (
                    (para_child.nodeName === 'verse') &&
                    (para_child.nodeType === Node.ELEMENT_NODE)
                ) {
                    const verse_attr = (para_child as Element).getAttribute('number')
                    if (!verse_attr) {
                        // We are at the end of the verse
                        continue
                    }
                    const current_verse = parseInt(verse_attr, 10)
                    para_html += `<sup>${current_verse}</sup>`
                    // Add the starting tag

                }
                if (
                    (para_child.nodeName === 'char') &&
                    (para_child.nodeType === Node.ELEMENT_NODE)
                ) {
                    const strong_attr = (para_child as Element).getAttribute('strong')
                    const char_text = (para_child as Element).textContent || ''
                    if (strong_attr) {
                        para_html += `<span data-s="${strong_attr}">${char_text}</span>`
                    } else {
                        para_html += char_text
                    }
                }
                if (para_child.nodeType === Node.TEXT_NODE) {
                    const text_node = para_child as Text
                    para_html += text_node.textContent
                }
            }
            para_html += '</p>'
        }
    }
    return output
}
