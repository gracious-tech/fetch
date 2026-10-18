
import {escape_typst, escape_typst_postfix} from 'typst-utils'

import {parse_usx} from './common.js'
import {ignored_elements, ignored_para_styles, ignored_char_styles, ignored_note_styles,
    headings_major, headings_regular, headings_minor, non_para_para} from './elements.js'
import type {BibleJsonTypst} from './shared_types.js'


// Para styles wrapped as #<family>(N)[...] (for leveled families) or #<family>[...] so
// consumers can style with #let definitions. Regular prose paras (p, m, po, etc.) are
// not wrapped — they emit text + a blank line.
const wrapped_para_styles = [
    'q', 'q1', 'q2', 'q3', 'q4',  // Poetry
    'qc',  // Centered poetry
    'qr',  // Poetic refrain
    'qm', 'qm1', 'qm2', 'qm3',  // Embedded poetry
    'qd',  // Hebrew musical notation
    'li', 'li1', 'li2', 'li3', 'li4',  // List item
    'lim', 'lim1', 'lim2', 'lim3', 'lim4',  // Embedded list item
    'lh',  // List header
    'lf',  // List footer
    'd',  // Descriptive title (e.g. psalm superscription) — stays body text, not a heading
]


// Wrapped families that take a level argument (q1/q2/... → #q(2)[…]). Plain `q` defaults
// to level 1. Other wrapped families (qc, qr, qd, lh, lf) have no level variants and emit
// #<style>[…] with no argument.
const leveled_para_families = ['q', 'qm', 'li', 'lim']


// Char styles that map directly to Typst built-in functions, keyed by USX style and giving
// [open, close] fragments to wrap around the inner content
// NOTE Never `*…*`/`_…_` shorthand — Typst reads those as literal when touching a word character
// (intraword styling, or scripts without spaces), leaving the delimiter unclosed
const char_builtins:Record<string, [string, string]> = {
    bd: ['#strong[', ']'],  // Strong (bold)
    em: ['#emph[', ']'],  // Emphasis (italic)
    it: ['#emph[', ']'],  // Italic
    bdit: ['#strong[#emph[', ']]'],  // Strong + emphasis
    k: ['#strong[#emph[', ']]'],  // Keyword (bold italic by convention)
    sc: ['#smallcaps[', ']'],  // Small caps (built-in)
    nd: ['#smallcaps[', ']'],  // Name of deity (small caps by convention)
    sup: ['#super[', ']'],  // Superscript (built-in)
    ord: ['#super[', ']'],  // Ordinal indicator (superscript)
}


// Char styles surfaced as consumer-defined #<style>[...] — no native Typst equivalent
const kept_char_styles = [
    'wj',  // Words of Jesus (red)
    'qac',  // Acrostic letter
    'qs',  // Selah
    'bk',  // Quoted book title
    'tl',  // Transliterated word
    'add',  // Translational addition
    'sig',  // Author's signature
]


// Every consumer-bound marker name this converter can currently emit (structural markers,
// wrapped paragraph styles, and kept char styles) — the authoritative vocabulary, derived from
// the USX styles this converter is aware of rather than sampled from any particular collection.
export const emittable_typst_markers = [
    'ch', 'vn', 'b',
    ...wrapped_para_styles,
    ...kept_char_styles,
]


// Typst built-ins called directly rather than through a consumer-defined marker (#footnote,
// #emph, #strong, #smallcaps, #super). A consumer wanting to restyle or suppress one of these
// must shadow the built-in itself (or use a show rule), since there's no #let indirection for
// it — see `char_builtins` above and the `#footnote[...]` call in `process_contents` below.
export const typst_builtins_used = ['footnote', 'emph', 'strong', 'smallcaps', 'super']


// Default Typst definitions for all of the consumer-defined functions emitted by this
// converter (`#ch`, `#vn`, `#q`, `#wj`, etc). Append (or prepend) this string to the
// joined verse output if you don't want to define your own — every function the emitter
// calls is covered, so the result compiles standalone.
// Values approximate the Paratext USFM default stylesheet (usfm.sty) — inches for
// margins/indents, points for vertical spacing, bold/italic/colour as documented there.
// See https://github.com/ubsicap/usfm/blob/master/sty/usfm.sty
// NOTE Every function takes a trailing `..rest` sink. Typst has no unknown-function or
// unknown-argument fallback — a marker name or argument a consumer's own definitions don't
// accept is a fatal compile error for the whole book, not a degradation. A `..rest` sink
// turns a future extra argument (e.g. a verse label, a heading kind) into a silent no-op
// instead of a break, so consumer preambles should always define markers this way too.
export const default_typst_definitions = `
// Chapter number — Bold, FontSize 18, SpaceBefore 8pt, SpaceAfter 4pt
#let ch(n, ..rest) = block(above: 8pt, below: 4pt, text(size: 18pt, weight: "bold", str(n)))

// Verse number — Superscript (named vn to avoid shadowing Typst's builtin v() spacing)
#let vn(n, ..rest) = super(str(n))

// Blank-line separator — used between poetry stanzas, list items, or prose scene breaks, or
// forced at a boundary between poetry/list content and regular prose. Not a Typst builtin
// (verified #b() alone errors "unknown variable: b" on a clean document).
#let b(..rest) = v(1em)

// Poetry — LeftMargin .75in, hanging indent depending on level
//     q1: first line .25in / wrap .75in
//     q2: first line .375in / wrap .75in
//     q3: first line .5in / wrap .75in
//     q4: first line .625in / wrap .75in
#let q(n, c, ..rest) = pad(
    left: 0.25in + (n - 1) * 0.125in,
    par(hanging-indent: 0.75in - (0.25in + (n - 1) * 0.125in), c),
)

// Embedded poetry — LeftMargin 1in, hanging indent depending on level
#let qm(n, c, ..rest) = pad(
    left: 0.25in + (n - 1) * 0.25in,
    par(hanging-indent: 1in - (0.25in + (n - 1) * 0.25in), c),
)

// List entry — LeftMargin .5in × level, hanging indent for wrapped lines
#let li(n, c, ..rest) = pad(
    left: (n - 1) * 0.25in + 0.125in,
    par(hanging-indent: 0.375in, c),
)

// Embedded list entry — like li but deeper
#let lim(n, c, ..rest) = pad(
    left: (n - 1) * 0.25in + 0.375in,
    par(hanging-indent: 0.375in, c),
)

// Non-leveled wrapped paragraphs
#let qc(c, ..rest) = align(center, c)  // Centered poetry
#let qr(c, ..rest) = align(right, c)  // Right-aligned poetry
#let qd(c, ..rest) = pad(left: 0.25in, emph(c))  // Hebrew musical notation — Italic
#let lh(c, ..rest) = strong(c)  // List header
#let lf(c, ..rest) = c  // List footer (no special styling)

// Descriptive title (e.g. psalm superscription, musical/liturgical notation) — Italic, kept
// as ordinary body text rather than a heading: it is original wording, not a modern section
// title, so it should read as prose that happens to be set apart, not jump the heading hierarchy
#let d(c, ..rest) = emph(c)

// Character styles (no native Typst equivalent)
#let wj(c, ..rest) = text(fill: red, c)  // Words of Jesus
#let qac(c, ..rest) = emph(c)  // Acrostic letter — Italic
#let qs(c, ..rest) = emph(c)  // Selah — Italic
#let bk(c, ..rest) = emph(c)  // Quoted book title — Italic
#let tl(c, ..rest) = emph(c)  // Transliterated word — Italic
#let add(c, ..rest) = emph(c)  // Translational addition — Italic
#let sig(c, ..rest) = emph(c)  // Author's signature — Italic
`


interface ParserState {
    book:string
    chapter:number
    verse:number
    para_open:string  // Opening fragment for current <para> (e.g. '#q1[' or '' for regular)
    para_close:string  // Closing fragment for current <para> (e.g. ']\n' or '\n\n')
    para_owned:boolean  // True once current para's open fragment is in a real verse (not buffered)
    buffer_para:boolean  // Whether current <para>'s body should buffer rather than drop at v0
    after_inline_expr:boolean  // True if the last chunk closed an inline code expr (#vn(N), #wj[…])
    unknown_owner:string
    contents:BibleJsonTypst['contents']
    last_content_category:'non_para'|'para'|'heading'|null  // Category of the most recent
        // non-ignored para (content or heading); null until the first is seen
    pending_b:boolean  // Whether a <para style="b"/> was seen since last_content_category was
        // last updated, and hasn't yet been resolved (emitted or dropped)
}


// Classify a <para> style for b-boundary purposes only (separate from how it actually renders
// below — e.g. psalm 'd' superscriptions render as wrapped #d[...] body text, not a real
// heading, but are treated as heading-like here so a boundary isn't force-inserted around
// every psalm's title, matching txt.ts's existing precedent for 'd'). Reuses non_para_para
// (poetry + list styles, which flow tightly together) as the "non_para" bucket, matching
// txt.ts's own spacing distinction
function classify_b_category(style:string, book:string):'non_para'|'para'|'heading'{
    if (headings_major.includes(style) || headings_regular.includes(style)
            || headings_minor.includes(style)){
        return 'heading'
    }
    if (book === 'psa' && style === 'd'){
        return 'heading'
    }
    if (non_para_para.includes(style)){
        return 'non_para'
    }
    return 'para'
}


// Whether a <para> contains a verse start marker (distinguishes verse-less paras)
function para_has_verse(para:Element):boolean{
    return Array.from(para.childNodes).some(
        node => node.nodeName === 'verse' && !(node as Element).hasAttribute('eid'))
}


// Convert USX to Typst-JSON
export function usx_to_json_typst(xml:string, parser=DOMParser,
        on_warning:(message:string)=>void = console.warn):BibleJsonTypst {

    // Parse USX
    const {usx_element, num_verses, book_code, book_name} = parse_usx(xml, parser)

    // Prepare state tracking
    const state:ParserState = {
        book: book_code,
        chapter: 0,
        verse: 0,
        para_open: '',
        para_close: '',
        para_owned: false,
        buffer_para: false,  // Whether current <para>'s body should buffer rather than drop at v0
        after_inline_expr: false,
        unknown_owner: '',  // Content that should be prepended to next verse if current verse done
        last_content_category: null,
        pending_b: false,
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
        ] as BibleJsonTypst['contents'],
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
            // Allow gaps (missing chapters) so partial translations can still be converted; the
            // skipped chapters are simply left empty. Completeness is the consumer's concern.
            if (chapter_number <= state.chapter){
                throw new Error(`Chapter ${chapter_number} isn't after previous ${state.chapter}`)
            }
            state.chapter = chapter_number
            state.verse = 0
            // Add chapter marker (consumer-defined #ch function)
            add_typst(state, `#ch(${state.chapter})\n`, true)
            continue
        }

        // Ignore any nodes before the first chapter marker
        if (state.chapter === 0){
            continue
        }

        // The only element type remaining should be <para>, so skip all others to keep logic simple
        // NOTE <para> elements cannot be nested
        if (child.nodeName !== 'para'){
            on_warning(`[typst] Ignoring non-para root element: ${child.nodeName}`)
            continue
        }

        // Get <para> style, which greatly determines how it should be processed
        const style = child.getAttribute('style') || ''

        // Ignore extra-biblical content
        if (ignored_para_styles.includes(style)) {
            continue
        }

        // Blank-line marker — buffer it, don't emit yet. Whether it becomes a `#b()` call,
        // passes through, or gets dropped depends on what comes before/after it (decided
        // below when the next content para or heading is reached)
        if (style === 'b'){
            state.pending_b = true
            continue
        }

        // Classify this para for b-boundary purposes only (separate from how it actually
        // renders below — e.g. psalm 'd' superscriptions still render as plain prose text,
        // but are treated as heading-like here so a boundary isn't force-inserted around
        // every psalm's title). A `b` adjacent to a heading (either side) is dropped; a `b`
        // at a genuine non_para (poetry/list) ↔ regular-prose boundary is forced whether or
        // not the source had one; a `b` between two paras of the same category passes
        // through only if present
        const category = classify_b_category(style, state.book)
        if (category !== 'heading' && state.last_content_category !== null
                && state.last_content_category !== 'heading'){
            if (state.last_content_category === category){
                if (state.pending_b){
                    add_typst(state, '#b()\n', true)  // Passthrough — source signal only
                }
            } else {
                add_typst(state, '#b()\n', true)  // Real boundary — always forced
            }
        }
        state.pending_b = false
        state.last_content_category = category

        // Convert major headings to `= ...`
        // TODO Not currently supporting nested elements within heading contents (like <char>)
        if (headings_major.includes(style)){
            add_typst(state, `= ${escape_text(child.textContent ?? '')}\n`, true)
            continue
        }

        // Convert section headings to `== ...`
        if (headings_regular.includes(style)) {
            add_typst(state, `== ${escape_text(child.textContent ?? '')}\n`, true)
            continue
        }

        // Convert minor headings to `=== ...`
        if (headings_minor.includes(style)) {
            add_typst(state, `=== ${escape_text(child.textContent ?? '')}\n`, true)
            continue
        }

        // All other styles are paragraphs — wrapped only for special ones (poetry,
        // lists, descriptive titles). Regular prose paras have no wrapper, just a trailing
        // blank line. For leveled families (q, qm, li, lim) the digit becomes a function
        // argument: q1 → #q(1)[…], q4 → #q(4)[…], plain q → #q(1)[…] (defaults to level 1).
        // Other wrapped styles (qc, qr, qd, lh, lf, d) emit #<style>[…] with no argument.
        const wrapped = wrapped_para_styles.includes(style)
        let para_open = ''
        if (wrapped){
            const match = /^([a-z]+?)(\d*)$/.exec(style)!
            const family = match[1]!
            const level = match[2] || '1'
            para_open = leveled_para_families.includes(family)
                ? `#${family}(${level})[`
                : `#${family}[`
        }

        // Decide how the para relates to verse 1 (mirrors html): psalm `d` superscriptions buffer
        // onto verse 1; a verse-less body para drops whole to verse 0; otherwise buffer the opening
        // fragment so it attaches to verse 1 (pre-verse text still drops to verse 0, see add_typst)
        const has_verse = para_has_verse(child)
        const is_superscription =
            state.book === 'psa' && style === 'd' && !state.verse && !has_verse
        const verse_less = !state.verse && !has_verse && !is_superscription
        state.buffer_para = is_superscription
        state.para_open = para_open
        state.para_close = wrapped ? ']\n' : '\n\n'
        state.para_owned = false
        add_typst(state, state.para_open, !verse_less)
        process_contents(state, child.childNodes)
        add_typst(state, state.para_close)
        state.buffer_para = false
        state.para_open = ''
        state.para_close = ''
    }

    // Verify no content ended up in chapter 0 or a verse 0, as they should never be used
    if (state.contents[0]!.length){
        state.contents[0] = []
        on_warning('[typst] Ignoring content before chapter 1')
    }
    for (let ch = 1; ch < state.contents.length; ch++){
        const dropped = state.contents[ch]![0]!.join('')
        if (dropped){
            state.contents[ch]![0] = ['', '', '']
            // Only report if real text was dropped — strip structural markup (function calls,
            // brackets, heading markers, escapes) and warn only if anything remains
            const text_only = dropped
                .replace(/#[a-z]+(\([^)]*\))?/g, '')
                .replace(/[[\]=\\]/g, '')
            if (text_only.trim()){
                on_warning(`[typst] Ignoring content before verse ${ch}:1`)
            }
        }
    }

    return {
        book: book_code,
        name: book_name,
        contents: state.contents,
    }
}


// Process the contents of a node (nested or not) within a <para> element
function process_contents(state:ParserState, nodes_raw:NodeListOf<ChildNode>,
        allow_nonbib=false){
    /* WARN It's important to call this between modifying state for opening/closing fragments
        e.g.
            add_typst(state, '#wj[')
            process_contents(state, element.childNodes)
            add_typst(state, ']')

    `allow_nonbib` is set when recursing into footnote contents — it allows <ref>
    elements (passage references) to contribute their text instead of being dropped.
    */

    // Drop any preceeding whitespace at the beginning of a paragraph as messes up later logic
    const nodes = Array.from(nodes_raw)
    if (nodes[0]?.nodeType === 3 && !nodes[0].textContent?.trim()){
        nodes.shift()
    }

    for (let index = 0; index < nodes.length; index++){
        const node = nodes[index]!

        // If first node is not a verse element, then any headings/etc being held in unknown_owner
        //     belong to current verse and not the next one
        // NOTE Verifying verse != 0 important so superscriptions in psalms prepended to verse 1
        if (index === 0 && node.nodeName !== 'verse' && state.verse){
            state.contents[state.chapter]![state.verse]![1] += state.unknown_owner
            state.unknown_owner = ''
            state.para_owned = true
        }

        // Handle text nodes
        if (node.nodeType === 3){
            add_typst(state, escape_text(node.textContent ?? ''))
            continue
        }

        // Allow <ref> when in non-biblical content (e.g. footnotes) — passes its text through
        if (allow_nonbib && node.nodeName === 'ref'){
            process_contents(state, node.childNodes, true)
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
            // NOTE Some translations have 1a 1b, in which case ignore 'b' onwards to concat
            const digits = /^\d+/.exec(element.getAttribute('number') ?? '')
            const new_number = parseInt(digits?.[0] ?? '-1', 10)
            if (new_number === state.verse){
                continue  // Ignore as probably '1b' after a '1a', etc.
            }
            if (new_number < 0 || new_number >= state.contents[state.chapter]!.length){
                throw new Error(`Invalid verse: ${state.book} ${state.chapter}:${new_number}`)
            }
            if (new_number < state.verse){
                throw new Error(
                    `${new_number} less than ${state.book} ${state.chapter}:${state.verse}`)
            }

            // If the para was already opened in a prior verse, close it there and reopen below
            // NOTE Otherwise the open fragment is still buffered (e.g. only a footnote or
            //      whitespace preceded this verse) and flushes into the new verse below
            const continuing = state.para_owned
            if (continuing){
                state.contents[state.chapter]![state.verse]![2] = state.para_close
            }

            // Switch to new verse
            state.verse = new_number

            // Any unknown owner data is now known to belong to the new verse
            state.contents[state.chapter]![state.verse]![1] += state.unknown_owner
            state.unknown_owner = ''

            // Add verse marker inline (consumer-defined #vn function)
            add_typst(state, `#vn(${state.verse})`)

            // If continuing a para, the new verse needs the para's open fragment in [0]
            if (continuing){
                state.contents[state.chapter]![state.verse]![0] = state.para_open
            }
            state.para_owned = true
            continue
        }

        // Handle char elements
        if (element.nodeName === 'char'){

            // Get the char's style
            const char_style = element.getAttribute('style') ?? ''
            if (ignored_char_styles.includes(char_style)){
                continue
            }

            const builtin = char_builtins[char_style]
            if (builtin){
                // Native Typst syntax or built-in function
                add_typst(state, builtin[0])
                process_contents(state, element.childNodes, allow_nonbib)
                add_typst(state, builtin[1])
            } else if (kept_char_styles.includes(char_style)){
                // Consumer-defined function (no native equivalent)
                add_typst(state, `#${char_style}[`)
                process_contents(state, element.childNodes, allow_nonbib)
                add_typst(state, ']')
            } else {
                // Unknown / semantic-only / wordlist / ruby / footnote-internal
                //     (fr, ft, fk, fq, fqa, fl, fw, fp, fv, cat) — emit children only
                process_contents(state, element.childNodes, allow_nonbib)
            }
        }

        // Handle note elements — recurse so char styles inside the note (it, bd, sc, etc.)
        //     are preserved instead of flattened to text
        if (element.nodeName === 'note'){

            // Get the note's style
            const note_style = element.getAttribute('style') ?? ''
            if (ignored_note_styles.includes(note_style)){
                continue
            }

            add_typst(state, '#footnote[')
            process_contents(state, element.childNodes, true)
            add_typst(state, ']')
        }
    }
}


// Add content to current verse, possibly buffering if may belong to next verse
function add_typst(state:ParserState, content:string, may_belong_to_next_verse=false):void{
    // A leading `(` or `.` right after an inline code expression (#vn(N), #wj[…], #super[…]) would
    // be read as call args / field access (#vn(8)(…), #vn(8).foo) and error, so escape it to keep it
    // literal (parens/dots elsewhere in prose stay untouched — that's why this is seam-only).
    if (state.after_inline_expr){
        content = escape_typst_postfix(content)
    }
    // Track whether this chunk closed an inline code expr, so the next chunk's leading `(`/`.` can
    // be guarded. Code exprs are the only structural fragments here: a `#…(…)` call (starts `#`,
    // ends `)`) or a `…]` close. Escaped text never starts with a bare `#` nor ends in a bare `]`.
    state.after_inline_expr =
        content.endsWith(']') || (content.startsWith('#') && content.endsWith(')'))

    // Add to current verse, or buffer for the next verse if a heading/superscription. Plain body
    // content before verse 1 falls through to verse 0, where it is later dropped and reported.
    if (may_belong_to_next_verse || state.buffer_para || (state.unknown_owner && state.verse)){
        state.unknown_owner += content
    } else {
        state.contents[state.chapter]![state.verse]![1] += content
    }
}


// Condense source whitespace runs (USX preserves them) then escape Typst markup specials.
// The seam issue (a leading `(`/`.` directly after a code expr like `#vn(8)`) is handled
// separately by escape_typst_postfix in add_typst, not here.
function escape_text(text:string):string{
    return escape_typst(text.replaceAll(/\s+/g, ' '))
}
