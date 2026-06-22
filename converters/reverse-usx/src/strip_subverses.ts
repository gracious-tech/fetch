
// Parse the integer span [lo, hi] out of a verse number, ignoring any alpha sub-verse suffixes
// (e.g. "6a" -> [6, 6], "6b-11" -> [6, 11], "2-6a" -> [2, 6], "1i" -> [1, 1])
function parse_span(number:string):[number, number]{
    const ints = number.match(/\d+/g)?.map(n => parseInt(n)) ?? []
    const lo = ints[0] ?? 0
    const hi = ints[ints.length - 1] ?? lo
    return [lo, hi]
}


// Remove sub-verse markers (e.g. "6a", "6b-11") so distributed formats use consistent integer
// verse numbering. A verse whose number carries an alpha suffix (or is an alpha-bearing range) is
// normalised to the lowest standard verse number not already used in its chapter: "1a" becomes "1"
// and a following "1b" is merged into it (its markers dropped so the text is appended), while a
// range like "6b-11" becomes "7-11". Plain integer verses are left untouched — including genuinely
// out-of-order ones (real content reorders), which therefore still fail validation rather than
// being silently mis-merged here.
export function strip_subverses(xml:string, parser=DOMParser, serializer=XMLSerializer):string{

    // Nothing to do unless a verse number actually carries an alpha sub-verse marker
    if (!/ number="[^"]*[a-z]/i.test(xml)){
        return xml
    }

    // Parse the USX document
    const doc:XMLDocument = new parser().parseFromString(xml, 'application/xml')
    const usx_element = doc.documentElement as Element
    if (!usx_element || usx_element.nodeName !== 'usx'){
        throw new Error("Contents is not USX (missing <usx> root element)")
    }
    const book_code = usx_element.getElementsByTagName('book')[0]?.getAttribute('code')
    if (!book_code){
        throw new Error("USX is missing <book> element")
    }

    // Map from each original verse id string to the final id its content belongs to, used at the
    // end to repoint <para vid="..."> attributes after markers have been renumbered/removed
    const id_map:Record<string, string> = {}

    // State while walking verse markers in document order
    let cur_ch = 0  // Chapter currently being processed (resets prev_max per chapter)
    let prev_max = 0  // Highest verse number already assigned in the current chapter
    let prev_new_id = ''  // Final id of the currently-open verse (what an eid / merge points to)
    let last_kept_eid:Element|undefined  // eid of the last kept verse (removed when next merges)

    // Walk every verse marker (copy to array so removals don't disturb iteration)
    for (const verse of [...doc.getElementsByTagName('verse')]){

        // An eid just closes the currently-open verse — repoint it to that verse's final id
        if (verse.hasAttribute('eid')){
            const orig_eid = verse.getAttribute('eid')!
            verse.setAttribute('eid', prev_new_id)
            id_map[orig_eid] = prev_new_id
            last_kept_eid = verse
            continue
        }

        // A sid starts a verse — work out its chapter and integer span
        const orig_sid = verse.getAttribute('sid') ?? ''
        const number = verse.getAttribute('number') ?? ''
        const ch = parseInt(orig_sid.slice(book_code.length + 1))
        const [lo, hi] = parse_span(number)

        // Reset the per-chapter counter when entering a new chapter
        if (ch !== cur_ch){
            cur_ch = ch
            prev_max = 0
            last_kept_eid = undefined
        }

        // Plain integer verses (and plain numeric ranges) pass through untouched, so genuine
        // content reorders are left to fail validation rather than being silently merged
        if (!/[a-z]/i.test(number)){
            prev_max = Math.max(prev_max, hi)
            prev_new_id = orig_sid
            continue
        }

        // Sub-verse marker: assign the lowest standard verse number not yet used this chapter
        const new_lo = Math.max(lo, prev_max + 1)

        if (new_lo > hi){
            // Wholly within an already-emitted verse → merge: drop this sid and the previous
            // verse's eid so the text joins the previous verse (its own eid will close the merge)
            verse.remove()
            last_kept_eid?.remove()

        } else {
            // Renumber to the standard integer (or numeric range) and drop the alpha suffix
            const new_id = new_lo === hi
                ? `${book_code} ${ch}:${new_lo}`
                : `${book_code} ${ch}:${new_lo}-${hi}`
            verse.setAttribute('sid', new_id)
            verse.setAttribute('number', new_lo === hi ? `${new_lo}` : `${new_lo}-${hi}`)
            prev_max = hi
            prev_new_id = new_id
        }
    }

    // Repoint paragraph vids that referenced a renumbered or merged verse
    for (const para of [...doc.getElementsByTagName('para')]){
        const vid = para.getAttribute('vid')
        if (vid && id_map[vid]){
            para.setAttribute('vid', id_map[vid])
        }
    }

    // NOTE Deliberately no validate_numbering here — strip_subverses is a pure marker-renumbering
    // pass and must not drop a book on its own. Some books are intentionally non-monotonic at this
    // stage (e.g. Mark's bracketed second ending, removed later by rm_mark_second_ending); the real
    // gate is usx_to_json downstream, which rejects genuinely invalid numbering.
    return new serializer().serializeToString(doc)
}
