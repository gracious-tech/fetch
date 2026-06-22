
import {BookRuleSet, default_rules} from './rules.js'
import {eng_psa_max} from './systems.js'
import {strip_subverses} from './strip_subverses.js'
import {validate_numbering} from './validate.js'


// Build a per-psalm title-offset rule for a Psalms file that counts the Hebrew superscription as
// verse 1 (so each titled psalm has one more verse than eng). Such translations do this
// INCONSISTENTLY, so the org title-offset is filtered to only the psalms whose actual verse count
// matches org's title-counted length; the rest are left untouched.
function build_psa_title_rule(doc:XMLDocument):BookRuleSet|undefined{

    // Actual max verse number present per psalm in this file
    const actual:Record<number, number> = {}
    for (const verse of doc.getElementsByTagName('verse')){
        const sid = verse.getAttribute('sid')
        if (!sid){
            continue
        }
        const [ch, v] = sid.slice(4).split(':').map(n => parseInt(n)) as [number, number]
        actual[ch] = Math.max(actual[ch] ?? 0, v)
    }

    // For each psalm with more verses than eng, treat the leading `shift` verses as the (1- or
    // 2-verse) superscription and renumber the rest down. shift is read from THIS file, so a
    // psalter counting a title as 1 verse where another uses 2 is still handled. Returns undefined
    // when no psalm has extra verses, so eng-numbered Psalters are left untouched.
    const renumber:Record<string, string> = {}
    const subtitle:Record<string, number> = {}
    for (let ch = 1; ch <= eng_psa_max.length; ch++){
        const shift = (actual[ch] ?? 0) - eng_psa_max[ch - 1]!
        // Titles are 1-2 verses; a larger gap is some other issue (leave it to fail validation)
        if (shift < 1 || shift > 2){
            continue
        }
        subtitle[`PSA ${ch}`] = shift
        for (let v = shift + 1; v <= actual[ch]!; v++){
            renumber[`PSA ${ch}:${v}`] = `PSA ${ch}:${v - shift}`
        }
    }

    if (!Object.keys(renumber).length){
        return undefined
    }
    return {test: '', renumber, subtitle}
}


export function reverse_usx(xml:string, parser=DOMParser, serializer=XMLSerializer,
        rules=default_rules, on_warning:(message:string)=>void = console.warn):string{

    // Apply rules repeatedly until stable, as a book can have multiple independent versification
    // quirks (e.g. eng_tojb's Job has both the ch2/3 boundary and the ch38-41 boundary, each
    // handled by a different rule set). Each rule removes its own test marker so it can't re-match,
    // making this safe; the cap is just a guard against unforeseen ping-ponging rules.
    const max_passes = 5
    let result = xml
    let stable = false
    for (let pass = 0; pass < max_passes; pass++){
        const next = reverse_usx_once(result, parser, serializer, rules, on_warning)
        if (next === result){
            stable = true
            break
        }
        result = next
    }

    // If still changing after the cap, a rule is ping-ponging — throw so it can be diagnosed
    if (!stable){
        throw new Error(`reverse_usx did not stabilise after ${max_passes} passes (likely a `
            + `rule that keeps re-matching its own output)`)
    }

    // Finally strip any sub-verse markers so all distributed formats use consistent integer
    // numbering (runs on every file, independent of whether a versification rule matched)
    return strip_subverses(result, parser, serializer)
}


function reverse_usx_once(xml:string, parser:typeof DOMParser, serializer:typeof XMLSerializer,
        rules:typeof default_rules, on_warning:(message:string)=>void):string{

    // Create parser
    const doc:XMLDocument = new parser().parseFromString(xml, 'application/xml')
    const usx_element = doc.documentElement as Element

    // Confirm was given a USX doc
    if (!usx_element || usx_element.nodeName !== 'usx') {
        throw new Error("Contents is not USX (missing <usx> root element)")
    }

    // Identify book
    const book_element = usx_element.getElementsByTagName('book')[0]
    if (!book_element){
        throw new Error("USX is missing <book> element")
    }
    const book_code = book_element.getAttribute('code')
    if (!book_code){
        throw Error("No book code found (this probably isn't USX)")
    }

    // Find rules for book and test if should apply (return now if not)
    // WARN This prevents reapplying same rules leading to potentially messy results
    let book_rules:BookRuleSet|undefined
    for (const possible_rules of (rules[book_code] ?? [])){
        // A test may be multiple refs which must all exist (to distinguish similar systems)
        const tests = Array.isArray(possible_rules.test)
            ? possible_rules.test : [possible_rules.test]
        // NOTE Must match 'ROM 14:24' itself and ranges like 'ROM 14:24-25' / 'ROM 14:23-24'
        if (tests.every(test => {
            const [ch_part, verse] = test.split(':') as [string, string]
            return new RegExp(`sid="${ch_part}:(?:\\d+-)?${verse}["-]`).test(xml)
        })){
            book_rules = possible_rules
            break
        }
    }

    // Psalms: unless this is an LXX psalter (handled by the lxx merge rule above), apply a
    // per-psalm title-offset. It supersedes the static org rule and runs even when no static rule
    // matched, because translations that count the Hebrew superscription as verse 1 do so
    // inconsistently. It is a no-op when no psalm has extra verses, so eng-numbered Psalters are
    // untouched.
    if (book_code === 'PSA' && !/sid="PSA 146:11/.test(xml)){
        const dynamic = build_psa_title_rule(doc)
        if (dynamic){
            book_rules = dynamic
        }
    }

    if (!book_rules){
        return xml
    }

    // Validate original first as confusing to debug if already numbering issues before conversion
    try {
        validate_numbering(doc, on_warning)
    } catch (error){
        on_warning('Issue with original numbering of file')
        throw error
    }

    // Util for splitting a para at given verse eid
    function force_para_end(para:Element, verse_eid:Element){

        // Find index of given verse eid in para's children and see if it's the last verse element
        const para_nodes = [...para.childNodes]
        const eid_index = para_nodes.findIndex(n => n === verse_eid)
        const last_index_of_para = para_nodes.findLastIndex(n => n.nodeName === 'verse')

        if (eid_index !== last_index_of_para){

            // Para has verses beyond given eid so create a new para for them with same style
            const new_para = doc.createElement('para')
            new_para.setAttribute('style', para.getAttribute('style') ?? 'p')
            for (let node_i = eid_index + 1; node_i < para_nodes.length; node_i++){
                new_para.appendChild(para_nodes[node_i]!)  // Removes from prev location
            }

            // Add new para to doc after the current one
            para.after(new_para)
        }
    }

    // Keep track of which chapter markers will need correcting
    const chapters_invalid = new Set<number>()
    const last_eid_for_ch:Record<number, [number, Element]> = {}

    // WARN Important to convert to array so `remove()` doesn't affect list
    const verses = [...doc.getElementsByTagName('verse')]
    for (let i = 0; i < verses.length; i++){
        const verse = verses[i]!

        // Identify the verse
        const id_type = verse.hasAttribute('eid') ? 'eid' : 'sid'
        const vid_orig = verse.getAttribute(id_type) ?? ''

        // Normalise to single verse (in case was a range)
        const vid_single = new RegExp(`^${book_code} \\d+:\\d+`).exec(vid_orig)?.[0]
        if (!vid_single){
            throw new Error(`Invalid ${id_type}: ${vid_orig}`)
        }

        // Extract actual numbers
        const [old_ch, old_v] =
            vid_single.slice(4).split(':').map(n => parseInt(n)) as [number, number]

        // See if verse marker should be part of a chapter subtitle
        // NOTE Only relevant for Psalms intros
        // If the verse number is 1 (or 2) then the marker will need removing depending on chapter
        const subtitle_end = book_rules.subtitle?.[`${book_code} ${old_ch}`]
        if (subtitle_end && old_v <= subtitle_end){

            // Need to ensure intro is separate para with style 'd'
            // Trigger when dealing with eid of last verse that will be part of subtitle
            // (Some psalms have no intro, some have 1 verse, some have 2 verses)
            if (id_type === 'eid' && old_v === subtitle_end){
                force_para_end(verse.parentElement!, verse)
                verse.parentElement!.setAttribute('style', 'd')
            }

            // Remove the marker
            verse.remove()
            continue
        }

        // Renumber verse if needed
        const final_id = book_rules.renumber[vid_single] ?? vid_single
        const [final_ch, final_v] =
                final_id.slice(4).split(':').map(n => parseInt(n)) as [number, number]

        // If starting a new verse and has same id as previous eid then need to merge them
        // Needed for back merges 1CH 12:4, 1KI 22:43, 1SA 20:42, and forward merge NUM 25:19
        const prev_verse = verses[i-1]
        if (id_type === 'sid' && final_id === prev_verse?.getAttribute('eid')
                && prev_verse.parentElement){  // No merge if previous was removed for subtitle
            prev_verse.remove()
            verse.remove()

        // If not merging and have renumbered, then update the value of sid/eid
        } else if (final_id !== vid_single){
            // Assign the new vid
            verse.setAttribute(id_type, final_id)

            // If reassigned first verse of chapter then will need to move chapter marker
            if (final_v === 1){
                chapters_invalid.add(final_ch)
            }
            if (old_v === 1){
                // While just checking new_v will match most, checking old needed to catch ch remove
                chapters_invalid.add(old_ch)
            }

            // If verse element had a number property need to update that too
            if (verse.hasAttribute('number')){
                verse.setAttribute('number', String(final_v))
            }
        }

        // Keep track of the last eid for a chapter
        if (final_v >= (last_eid_for_ch[final_ch]?.[0] ?? 0)){
            last_eid_for_ch[final_ch] = [final_v, verse]
        }
    }

    // Find all chapter markers
    const chapters = [...doc.getElementsByTagName('chapter')]

    // Handle special case of last chapter end marker of book
    const last_marker = chapters.pop()!
    const last_valid_ch = Math.max(...Object.keys(last_eid_for_ch).map(n => parseInt(n)))
    last_marker.setAttribute('eid', `${book_code} ${last_valid_ch}`)

    // Remove chapter markers that were affected by verse renumbering
    for (const chapter of chapters){
        const id_type = chapter.hasAttribute('eid') ? 'eid' : 'sid'
        const ch_num = parseInt(chapter.getAttribute(id_type)!.slice(3))

        if (id_type === 'sid' && ch_num > 1 && chapters_invalid.has(ch_num)){
            // NOTE Never remove chapter 1's start marker — it stays at the book start even if its
            // first verse was renumbered (there's no previous chapter to move it after)
            chapter.remove()
        } else if (id_type === 'eid' && chapters_invalid.has(ch_num + 1)){
            // The ending ids of prev chapters also need moving
            chapter.remove()
        }
    }

    // Restore markers in correct locations
    for (const ch_num of chapters_invalid.values()){

        // Ignore if chapter removed
        if (ch_num > last_valid_ch){
            continue
        }

        // Identify the previous present chapter — psalters may skip chapters (a selection of
        // psalms), so the previous chapter isn't always ch_num - 1
        let prev_ch = ch_num - 1
        while (prev_ch >= 1 && !last_eid_for_ch[prev_ch]){
            prev_ch -= 1
        }

        // Identify the para that contains the last verse of the previous chapter
        // Skip if there's no previous chapter recorded (e.g. chapter 1, whose marker doesn't move)
        const prev_ch_eid = last_eid_for_ch[prev_ch]
        if (!prev_ch_eid){
            continue
        }
        const last_eid_node = prev_ch_eid[1]
        const prev_para = last_eid_node.parentElement
        if (prev_para?.nodeName !== 'para'){
            throw new Error(`Expected a <para> (trying to restore chapter ${ch_num})`)
        }

        // If para contains verses of the next chapter then need to split it
        force_para_end(prev_para, last_eid_node)

        // Remove any existing markers we're about to recreate. When chapters are skipped the
        // removal loop above (keyed on ch_num + 1) won't have caught the real previous chapter's
        // eid, so clear it here to avoid leaving a duplicate behind
        for (const ch of [...doc.getElementsByTagName('chapter')]){
            if (ch.getAttribute('eid') === `${book_code} ${prev_ch}`
                    || ch.getAttribute('sid') === `${book_code} ${ch_num}`){
                ch.remove()
            }
        }

        // Create new chapter eid and sid elements
        const prev_ch_end = doc.createElement('chapter')
        prev_ch_end.setAttribute('eid', `${book_code} ${prev_ch}`)
        const ch_start = doc.createElement('chapter')
        ch_start.setAttribute('sid', `${book_code} ${ch_num}`)
        ch_start.setAttribute('number', String(ch_num))
        ch_start.setAttribute('style', 'c')

        // Add them after the last verse of previous chapter
        prev_para.after(prev_ch_end, ch_start)
    }

    // Serialize back to string
    const result = new serializer().serializeToString(doc)

    // Validate new numbering before returning
    try {
        validate_numbering(doc, on_warning)
    } catch (error){
        on_warning('Issue with numbering after re-versing file')
        throw error
    }

    return result
}
