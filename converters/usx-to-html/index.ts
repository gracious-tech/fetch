import {number_of_verses} from './stats.js'

export interface BibleHtmlJson {
    contents: (string[][])[]
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
        contents: [
            [],
        ],
    }
    number_of_verses[usx_code]!.forEach((total_verses: number, index: number) => {
        const chapter = []
        const chapter_number = index + 1
        for (let i = 0; i <= total_verses; i++) {
            chapter[i] = ['', '', '']
        }
        output.contents[chapter_number] = chapter
    })
    // Fill in the object
    const children = Array.from(usx_tag.children)
    let current_chapter = -1
    // It will be -1 when we are between verses
    let current_verse = -1
    let content_between_paras = ''
    let verse_html = ''
    for (const child of children) {
        if (child.nodeName === 'chapter') {
            const chapter_attr = child.getAttribute('number')
            if (!chapter_attr) {
                // We are at the end of a chapter
                continue
            }
            current_chapter = parseInt(chapter_attr, 10)
            content_between_paras += `<h3 data-c=${current_chapter}>${current_chapter}</h3>`
        }
        if (child.nodeName === 'para') {
            // Open a new paragraph
            const style_attr = child.getAttribute('style')
            const style = style_attr || ''
            if (['h', 'mt1', 'r', 'toc1', 'toc2'].includes(style)) {
                // skip these styles
                continue
            }
            if (['s1', 's2', 's3', 's4'].includes(style)) {
                const header_text = child.textContent || ''
                content_between_paras += `<h4 class=fb-${style}>${header_text}</h4>`
                continue
            }
            const childNodes = Array.from(child.childNodes)
            // Build up the paragraph HTML
            let para_html = `${content_between_paras}<p class=fb-${style}>`
            for (let index = 0; index < childNodes.length; index++) {
                const para_child = childNodes[index]!
                if (
                    (para_child.nodeName === 'verse') &&
                    (para_child.nodeType === Node.ELEMENT_NODE)
                ) {
                    const verse_attr = (para_child as Element).getAttribute('number')
                    const eid_attr = (para_child as Element).getAttribute('eid')
                    if ((!verse_attr)) {
                        if (eid_attr) {
                            // We are at the end of the verse
                            verse_html += para_html.replace('\n', '')
                            output.contents[current_chapter]![current_verse]![1] = verse_html
                            if ((index + 1) === childNodes.length) {
                                // We have no more children so close the tag here.
                                output.contents[current_chapter]![current_verse]![1] += '</p>'
                            } else {
                                // We are in the middle of a verse
                                output.contents[current_chapter]![current_verse]![2] = '</p>'
                            }
                            para_html = ''
                            verse_html = ''
                        }
                        continue
                    }
                    // Start a new verse
                    current_verse = parseInt(verse_attr, 10)
                    para_html += `<sup data-v=${current_chapter}:${current_verse}>${current_verse}</sup>`
                    content_between_paras = ''
                    if (index > 0) {
                        // Our verse starts in the middle of a paragraph
                        output.contents[current_chapter]![current_verse]![0] = `<p class=fb-${style}>`
                    }
                    // Add the starting tag
                }
                if (
                    (para_child.nodeName === 'char') &&
                    (para_child.nodeType === Node.ELEMENT_NODE)
                ) {
                    const strong_attr = (para_child as Element).getAttribute('strong')
                    const char_text = (para_child as Element).textContent || ''
                    if (strong_attr) {
                        para_html += `<span data-s=${strong_attr}>${char_text}</span>`
                    } else {
                        para_html += char_text
                    }
                }
                if (
                    (para_child.nodeName === 'note') &&
                    (para_child.nodeType === Node.ELEMENT_NODE)
                ) {
                    para_html += '<span class=fb-note>* <span>'
                    for (const noteChild of Array.from(para_child.childNodes)) {
                        const ele = noteChild as Element
                        if (
                            (ele.nodeName === 'char') &&
                            (ele.nodeType === Node.ELEMENT_NODE)
                        ) {
                            const style = ele.getAttribute('style')
                            const char_text = ele.textContent || ''
                            if (style) {
                                para_html += `<span class=fb-${style}>${char_text}</span>`
                            } else {
                                para_html += char_text
                            }
                        }
                    }
                    para_html += '</span></span>'
                }
                if (para_child.nodeType === Node.TEXT_NODE) {
                    const text_node = para_child as Text
                    para_html += text_node.textContent
                }
            }
            if (para_html.trim() !== '') {
                verse_html += `${para_html}</p>`.replace('\n', '')
                para_html = ''
            }
        }
    }
    return output
}
