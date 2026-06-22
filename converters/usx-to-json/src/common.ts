
import {last_verse} from '@gracious.tech/bible-references'


// Create parser for USX and return required elements for traversing doc
export function parse_usx(xml:string, parser:typeof DOMParser){

    // Create parser
    const doc:XMLDocument = new parser().parseFromString(xml, 'application/xml')
    const usx_element = doc.documentElement as Element

    // Confirm was given a USX doc
    if (!usx_element || usx_element.nodeName !== 'usx') {
        throw new Error("Contents is not USX (missing <usx> root element)")
    }

    // Identify book so can determine expected chapter/verse numbers
    const book_element = usx_element.getElementsByTagName('book')[0]
    if (!book_element){
        throw new Error("USX is missing <book> element")
    }
    const book_code = book_element.getAttribute('code')?.toLowerCase()
    if (!book_code || !(book_code in last_verse)){
        throw Error(`Book code invalid: ${book_code!}`)
    }

    // Extract book names in file
    const get_text = (style:string) =>
        usx_element.querySelector(`:root > para[style="${style}"]`)?.textContent?.trim()
    const para_h = get_text('h')  // Running header text
    const para_toc1 = get_text('toc1')  // Long name
    const para_toc2 = get_text('toc2')  // Short name
    const para_toc3 = get_text('toc3')  // Abbreviation

    // Ensure normal at least has a value, others may be empty
    const name_normal = para_toc2 || para_h || para_toc1 || para_toc3 || ''
    const name_long = para_toc1 || ''
    const name_abbrev = para_toc3 || ''

    // Return elements
    return {
        doc,
        usx_element,
        book_code,
        book_name: {
            normal: name_normal,
            long: name_long,
            abbrev: name_abbrev,
        },
        num_verses: last_verse[book_code]!,
    }
}
