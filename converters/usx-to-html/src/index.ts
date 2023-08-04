
import {escape_text} from './utils.js'
import {number_of_verses} from './stats.js'
import {ignored_elements, ignored_para_styles, ignored_char_styles} from './ignore.js'


// Types
export interface BibleHtmlJson {
    contents: (string[][])[]
}


// `Node` isn't available outside browsers, and we just need nodeType integers anyway
const ELEMENT_NODE = 1
const TEXT_NODE = 3


// Convert USX to HTML-JSON
export function usx_to_html(xml:string, parser=DOMParser): BibleHtmlJson {

    // Parse XML
    const doc = new parser().parseFromString(xml, 'application/xml')

    // Confirm was given a USX doc
    const usx_element = doc.documentElement as Element
    if (!usx_element || usx_element.nodeName !== 'usx') {
        throw new Error("Contents is not USX (missing <usx> root element)")
    }

    // Identity book so can determine expected chapter/verse numbers
    const book_element = usx_element.getElementsByTagName('book')[0]
    if (!book_element){
        throw new Error("USX is missing <book> element")
    }
    const book_code = book_element.getAttribute('code')?.toLowerCase()
    if (!book_code || !(book_code in number_of_verses)){
        throw Error(`Book code invalid: ${book_code!}`)
    }

    // Prepare state tracking
    const state = {
        chapter: 1,
        verse: 1,
        verse_html: '',  // Buffer for verse contents until next verse reached
        prepend: '',  // Content that should be prepended to next verse if current verse ended
        // Prepare output with empty strings for every verse
        contents: [
            [],  // Chapter 0
            ...number_of_verses[book_code]!.map(num_verses => {
                // NOTE +1 for verse 0
                return Array(num_verses + 1).fill(['', '', '']) as string[][]
            }),
        ] as BibleHtmlJson['contents'],
    }

    // Iterate over <usx> children (elements only, text nodes not allowed at root level)
    for (const child of Array.from(usx_element.children)){

        // Ignore extra-biblical elements
        if (ignored_elements.includes(child.nodeName)){
            continue
        }

        // Handle chapter markers
        // NOTE Paragraphs never flow over chapters in USX
        if (child.nodeName === 'chapter') {
            const chapter_number = child.getAttribute('number')
            if (!chapter_number){
                continue  // Chapter end markers don't have `number`; just ignore
            }
            state.chapter = parseInt(chapter_number, 10)
            // Add a heading for the chapter start
            state.prepend += `<h3 data-c="${state.chapter}">${state.chapter}</h3>`
        }

        // The only element type remaining should be <para>, so skip all others to keep logic simple
        // NOTE <para> elements cannot be nested
        if (child.nodeName !== 'para'){
            console.warn(`Ignoring non-para element at document root level: ${child.nodeName}`)
            continue
        }

        // Get <para> style, which greatly determines how it should be processed
        const style = child.getAttribute('style') || ''

        // Ignore extra-biblical content
        if (ignored_para_styles.includes(style)) {
            continue
        }

        // Convert major headings to <h2>
        // TODO Not currently supporting nested elements within heading contents (like <char>)
        if (['ms', 'ms1', 'ms2', 'ms3', 'ms4', 'mr'].includes(style)){
            state.prepend += `<h2 class="fb-${style}">${escape_text(child.textContent)}</h2>`
            continue
        }

        // Convert section headings to <h4>
        if (['s', 's1', 's2', 's3', 's4', 'sr'].includes(style)) {
            state.prepend += `<h4 class="fb-${style}">${escape_text(child.textContent)}</h4>`
            continue
        }

        // Convert minor headings to <h5>
        if (['sp'].includes(style)) {
            state.prepend += `<h5 class="fb-${style}">${escape_text(child.textContent)}</h5>`
            continue
        }

        // Breaks are not allowed to have contents
        // See https://ubsicap.github.io/usx/parastyles.html#b
        if (style === 'b') {
            state.prepend += `<p class="fb-b"></p>`
            continue
        }

        const childNodes = Array.from(child.childNodes)

        // Build up the paragraph HTML by iterating all children of the para tag
        let para_html = `${state.prepend}<p class="fb-${style}">`
        for (let index = 0; index < childNodes.length; index++) {
            const para_child = childNodes[index]!
            if (
                (para_child.nodeName === 'verse') &&
                (para_child.nodeType === ELEMENT_NODE)
            ) {
                // We are handling a verse element
                const verse_attr = (para_child as Element).getAttribute('number')
                const eid_attr = (para_child as Element).getAttribute('eid')
                if ((!verse_attr)) {
                    if (eid_attr) {
                        // We are at the end of the verse
                        state.verse_html += para_html.replace('\n', '')
                        state.contents[state.chapter]![state.verse]![1] = state.verse_html
                        if ((index + 1) === childNodes.length) {
                            // We have no more children so close the tag here.
                            state.contents[state.chapter]![state.verse]![1] += '</p>'
                        } else {
                            // We are in the middle of a verse
                            state.contents[state.chapter]![state.verse]![2] = '</p>'
                        }
                        para_html = ''
                        state.verse_html = ''
                    }
                    continue
                }

                // Start a new verse
                state.verse = parseInt(verse_attr, 10)
                para_html += `<sup data-v="${state.chapter}:${state.verse}">${state.verse}</sup>`
                state.prepend = ''
                if (index > 0) {
                    // Our verse starts in the middle of a paragraph
                    state.contents[state.chapter]![state.verse]![0] = `<p class="fb-${style}">`
                }
            }

            if (
                (para_child.nodeName === 'char') &&
                (para_child.nodeType === ELEMENT_NODE)
            ) {
                // We are handling a char element
                const char_style = (para_child as Element).getAttribute('style') ?? ''
                if (ignored_char_styles.includes(char_style)){
                    continue
                }
                const strong_attr = (para_child as Element).getAttribute('strong')
                const char_text = (para_child as Element).textContent || ''
                if (strong_attr) {
                    para_html += `<span data-s="${strong_attr}">${char_text}</span>`
                } else {
                    para_html += char_text
                }
            }

            if (
                (para_child.nodeName === 'note') &&
                (para_child.nodeType === ELEMENT_NODE)
            ) {
                // We are handling a note element
                para_html += '<span class="fb-note">* <span>'
                // Iterate all the child nodes of the note element and build up the content
                for (const noteChild of Array.from(para_child.childNodes)) {
                    const ele = noteChild as Element
                    if (
                        (ele.nodeName === 'char') &&
                        (ele.nodeType === ELEMENT_NODE)
                    ) {
                        const style = ele.getAttribute('style')
                        const char_text = ele.textContent || ''
                        if (style) {
                            para_html += `<span class="fb-${style}">${char_text}</span>`
                        } else {
                            para_html += char_text
                        }
                    }
                }
                para_html += '</span></span>'
            }

            if (para_child.nodeType === TEXT_NODE) {
                // We are handling a text node
                const text_node = para_child as Text
                para_html += text_node.textContent
            }
        }

        if (para_html.trim() !== '') {
            // Close up the para tag
            state.verse_html += `${para_html}</p>`.replace('\n', '')
            // Reset everything
            para_html = ''
        }
    }

    return {contents: state.contents}
}
