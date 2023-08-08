
import {get_num_verses} from './common.js'
import {ignored_elements, ignored_para_styles, ignored_char_styles, headings_major,
    headings_regular, headings_minor} from './elements.js'


// Types
export interface BibleJsonHtml {
    contents: string[][][]
}

interface ParserState {
    chapter:number
    verse:number
    para_open:string
    unknown_owner:string
    contents:BibleJsonHtml['contents']
    alignment:boolean
}


// Convert USX to HTML-JSON
export function usx_to_json_html(xml:string, alignment=true, parser=DOMParser): BibleJsonHtml {

    // Parse XML
    const doc = new parser().parseFromString(xml, 'application/xml')
    const usx_element = doc.documentElement as Element

    // Detect book and expected number of verses
    const num_verses = get_num_verses(usx_element)

    // Util for escaping text
    function escape_text(text:string|undefined|null){
        if (!text){
            return ''
        }
        const div = doc.createElement('div')
        div.appendChild(doc.createTextNode(text))
        return div.innerHTML
    }

    // Prepare state tracking
    const state:ParserState = {
        chapter: 0,
        verse: 0,
        para_open: '',  // The opening tag of the current <para> element
        unknown_owner: '',  // Content that should be prepended to next verse if current verse done
        // Prepare output with empty strings for every verse
        contents: [
            [],  // Chapter 0
            ...num_verses.map(num_verses_in_ch => {
                const array = []
                // NOTE +1 for verse 0
                for (let i = 0; i < num_verses_in_ch + 1; i++){
                    array.push(['', '', ''])
                }
                return array
            }),
        ] as BibleJsonHtml['contents'],
        alignment,  // So available to `process_contents()`
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

            if (child.hasAttribute('eid')){
                continue  // Ignore chapter end markers
            }

            const chapter_number = parseInt(child.getAttribute('number') ?? '0', 10)
            if (chapter_number < 1 || chapter_number >= state.contents.length){
                throw new Error(`Chapter number isn't valid for the book: ${chapter_number}`)
            }
            if (chapter_number !== state.chapter + 1){
                throw new Error(`Chapter ${chapter_number} isn't +1 previous ${state.chapter}`)
            }
            state.chapter = chapter_number
            state.verse = 0
            // Add a heading for the chapter start
            add_html(state, `<h3 data-c="${state.chapter}">${state.chapter}</h3>`, true)
            continue
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
        if (headings_major.includes(style)){
            add_html(state, `<h2 class="fb-${style}">${escape_text(child.textContent)}</h2>`, true)
            continue
        }

        // Convert section headings to <h4>
        if (headings_regular.includes(style)) {
            add_html(state, `<h4 class="fb-${style}">${escape_text(child.textContent)}</h4>`, true)
            continue
        }

        // Convert minor headings to <h5>
        if (headings_minor.includes(style)) {
            add_html(state, `<h5 class="fb-${style}">${escape_text(child.textContent)}</h5>`, true)
            continue
        }

        // All other styles are standard <p> elements, so start one
        state.para_open = `<p class="fb-${style}">`
        add_html(state, state.para_open, true)
        process_contents(state, child.childNodes, escape_text)
        add_html(state, '</p>')
        state.para_open = ''
    }

    return {contents: state.contents}
}


function process_contents(state:ParserState, nodes:NodeListOf<ChildNode>,
        escape_text:(t:string|undefined|null)=>string, allow_nonbib=false){
    // Process the contents of a node (nested or not) within a <para> element
    /* WARN It's important to call this between modifying state for opening/closing tags
        e.g.
            add_html(state, '<sup>')
            process_contents(state, element.childNodes)
            add_html(state, '</sup>')

    */
    for (let index = 0; index < nodes.length; index++){
        const node = nodes[index]!

        // If first node and not a verse element, then reset unknown_owner
        if (index === 0 && node.nodeName !== 'verse'){
            state.contents[state.chapter]![state.verse]![1] += state.unknown_owner
            state.unknown_owner = ''
        }

        // Handle text nodes
        if (node.nodeType === 3){
            add_html(state, escape_text(node.textContent))
        }

        // Allow <ref> if within non-biblical content (e.g. a footnote)
        if (allow_nonbib && node.nodeName === 'ref'){
            // TODO Add loc metadata if come up with way to parse it
            process_contents(state, node.childNodes, escape_text, true)
            continue
        }

        // Ignore all other node types that aren't elements (e.g. comments), or on ignored list
        if (node.nodeType !== 1 || ignored_elements.includes(node.nodeName)){
            continue
        }
        const element = node as Element

        // Handle verse elements
        if (element.nodeName === 'verse'){

            // Ignore verse end markers
            // TODO Could ignore non-header content until next next start marker to be extra safe
            if (element.hasAttribute('eid')){
                continue
            }

            // Get the new verse number
            // NOTE If a range, stick everything in the first verse of the range (e.g. 17-18 -> 17)
            const new_number = parseInt(element.getAttribute('number')?.split('-')[0] ?? '0', 10)
            if (new_number < 0 || new_number >= state.contents[state.chapter]!.length){
                throw new Error(`Verse number isn't valid for the book: ${new_number}`)
            }
            if (new_number <= state.verse){
                throw new Error(`Verse ${new_number} is not greater than previous ${state.verse}`)
            }

            // If not at beginning of a <para> then verse now ending is mid-paragraph
            if (index > 0){
                state.contents[state.chapter]![state.verse]![2] = '</p>'
            }

            // Switch to new verse
            state.verse = new_number

            // Any unknown owner data is now known to belong to the new verse
            state.contents[state.chapter]![state.verse]![1] += state.unknown_owner
            state.unknown_owner = ''

            // Add verse number to contents
            add_html(state, `<sup data-v="${state.chapter}:${state.verse}">${state.verse}</sup>`)

            // If in middle of a <para> then need opening data
            if (index > 0){
                state.contents[state.chapter]![state.verse]![0] = state.para_open
            }
        }

        // Handle char elements
        if (element.nodeName === 'char'){

            // Get the char's style
            const char_style = element.getAttribute('style') ?? ''
            if (ignored_char_styles.includes(char_style)){
                continue
            }

            if (char_style === 'w'){
                // Handle alignment data
                if (state.alignment){
                    // TODO Convert strong/lemma data to actual word by consulting a critical text
                    add_html(state, '<span>')
                    process_contents(state, element.childNodes, escape_text)
                    add_html(state, '</span>')
                } else {
                    // Include element contents only
                    process_contents(state, element.childNodes, escape_text)
                }
            } else if (['ord', 'sup'].includes(char_style)){
                add_html(state, '<sup>')
                process_contents(state, element.childNodes, escape_text)
                add_html(state, '</sup>')
            } else if (char_style === 'rb'){
                add_html(state, '<ruby>')
                process_contents(state, element.childNodes, escape_text)
                // TODO Handle splitting of words with ':' (currently ignoring)
                const gloss = element.getAttribute('gloss')?.replaceAll(':', '')
                add_html(state, `<rt>${escape_text(gloss)}</rt>`)
                add_html(state, '</ruby>')
            } else {
                // Turn all other char styles into a <span>
                add_html(state, `<span class="fb-${char_style}">`)
                process_contents(state, element.childNodes, escape_text)
                add_html(state, '</span>')
            }
        }

        // Handle note elements
        if (element.nodeName === 'note'){
            add_html(state, '<span class="fb-note">*<span>')
            process_contents(state, element.childNodes, escape_text, true)
            add_html(state, '</span></span>')
        }
    }
}


function add_html(state:ParserState, content:string, may_belong_to_next_verse=false):void{
    // Add HTML to current verse, possibly buffering if may belong to next verse
    if (state.unknown_owner || may_belong_to_next_verse){
        state.unknown_owner += content
    } else {
        state.contents[state.chapter]![state.verse]![1] += content
    }
}
