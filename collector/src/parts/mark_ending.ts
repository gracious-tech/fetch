
// Remove second ending of Mark if given (16:21-22)
// Including long or short is ok at 16:9-20 but adding both is illogical
export function rm_mark_second_ending(xml:string){
    // Match end marker for 16:20 regardless of serialization (usfmtc uses ` />`, jsdom uses `/>`)
    const last_eid = /<verse\s[^>]*eid="MRK 16:20"[^>]*\/>/.exec(xml)
    if (last_eid && xml.slice(last_eid.index + last_eid[0].length).includes('<verse')){
        // Verse markers exist after long ending (whether 16:21 or a repeat of 16:9)
        const ending = '</para>\n  <chapter eid="MRK 16"/>\n</usx>'
        xml = xml.slice(0, last_eid.index + last_eid[0].length) + ending
    }
    return xml
}
