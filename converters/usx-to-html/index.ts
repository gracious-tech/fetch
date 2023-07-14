
import {number_of_verses} from './stats.js'


export interface BibleHtmlJson {
    // chapter -> verse -> [opening_tags, verse, closing_tags]
    contents:Record<number, Record<number, [string, string, string]>>
}


// Convert USX to HTML organised by verse in a JSON structure
/* TODO Requirements:

    First read README.md in this dir

    Study how HTML conversion has been done in `collector/assets/usx_transforms/usx_to_html.xslt`
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
export function usx_to_html(xml:string):BibleHtmlJson{
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    return {contents: []}
}
