
import {DOMParser} from '@xmldom/xmldom'
import {escape_typst, escape_typst_postfix} from 'typst-utils'


// State threaded through the recursive walk (mirrors usx-to-json's typst converter)
interface State {
    out:string
    // True if the last chunk closed an inline code expr (#foo[…]) — a following `(` or `.`
    // would be read as call args / field access, so it needs escaping to stay literal
    after_inline_expr:boolean
}


// Semantic span classes mapped to consumer-defined Typst wrapper functions. Checked in this
// order (first = outermost) since a single <span> can carry more than one (e.g.
// "fbn-excerpt fbn-sc"). `sc`/`yhwh`/`divine-name`/`era` all render as small caps by convention
// (see tyndale.ts doc comment), so they share the native #smallcaps[…] builtin.
const span_class_wraps:[string, string, string][] = [
    ['fbn-greek', '#greek[', ']'],
    ['fbn-hebrew', '#hebrew[', ']'],
    ['fbn-aramaic', '#aramaic[', ']'],
    ['fbn-latin', '#latin[', ']'],
    ['fbn-sc', '#smallcaps[', ']'],
    ['fbn-yhwh', '#smallcaps[', ']'],
    ['fbn-divine-name', '#smallcaps[', ']'],
    ['fbn-era', '#smallcaps[', ']'],
]


// Elements that map to native Typst functions, wrapping outside any semantic classes
// NOTE Never `*…*`/`_…_` shorthand — Typst reads those as literal when touching a word character
// (e.g. intraword "_Priest_s"), leaving the delimiter unclosed and the whole document failing
const native_wraps:Record<string, [string, string]> = {
    strong: ['#strong[', ']'],
    em: ['#emph[', ']'],
    sup: ['#super[', ']'],
    sub: ['#sub[', ']'],
}


// Default Typst definitions for every consumer-defined function this converter emits (#greek,
// #hebrew, #aramaic, #latin). Native builtins (#emph, #strong, #smallcaps, ...) need none.
// Append to converted note output to compile it standalone.
export const default_notes_typst_definitions = `
#let greek(c) = c
#let hebrew(c) = c
#let aramaic(c) = c
#let latin(c) = c
`


// Convert a single study note's cleaned HTML fragment (see tyndale.ts's clean_note) to Typst
export function html_note_to_typst(html:string):string{
    const doc = new DOMParser().parseFromString(`<x>${html}</x>`, 'text/xml')
    const state:State = {out: '', after_inline_expr: false}
    process_children(state, doc.documentElement.childNodes)
    return state.out
}


// Process every child of a node
function process_children(state:State, nodes:NodeListOf<ChildNode>):void{
    for (const node of Array.from(nodes)){
        process_node(state, node)
    }
}


// Process a single node (text, element, or ignored otherwise)
function process_node(state:State, node:ChildNode):void{

    // Text nodes are the only leaf content
    if (node.nodeType === 3){
        add(state, escape_text(node.textContent ?? ''))
        return
    }

    // Ignore non-element nodes (comments, etc)
    if (node.nodeType !== 1){
        return
    }
    const element = node as unknown as Element

    // A stray inner <p> — clean_note only strips a single wrapping <p>, so a note body with
    // multiple sibling paragraphs (e.g. the rare sn-list-N chiasm layout) leaks inner <p>s
    // through untouched. No special styling for whatever class it carries, but still needs a
    // break so lines don't run together.
    if (element.nodeName === 'p'){
        process_children(state, element.childNodes)
        add(state, '\n\n')
        return
    }
    const classes = (element.getAttribute('class') ?? '').split(' ').filter(Boolean)

    // NOTE data-ref (bible reference links, see tyndale.ts's clean_note) is intentionally not
    // handled here — it was only ever clickable in HTML, so it renders as plain text in print

    // Semantic classes can appear on <strong>/<em> (e.g. "bold-sc") as well as bare <span>s
    // (e.g. "sn-sc") — may stack (e.g. excerpt + sc), first matched wraps outermost
    const matched = span_class_wraps.filter(([cls]) => classes.includes(cls))

    // Bible text excerpt — plain native italic (like <em>), no consumer function needed.
    // Only ever appears on a bare <span> (never combined with <strong>/<em>), so it's safe to
    // take priority over the tag-based lookup below
    const [native_open, native_close] = classes.includes('fbn-excerpt')
        ? native_wraps['em']!
        : native_wraps[element.nodeName] ?? ['', '']

    add(state, native_open)
    for (const [, open] of matched){
        add(state, open)
    }
    process_children(state, element.childNodes)
    for (const [, , close] of matched.slice().reverse()){
        add(state, close)
    }
    add(state, native_close)
}


// Add a chunk of already-Typst-ready content to the output, escaping the seam after an
// inline code expression so a leading `(`/`.` isn't read as continuing it
function add(state:State, content:string):void{
    if (!content){
        return  // No-op — must not clear after_inline_expr (e.g. an element with no wrapper)
    }
    if (state.after_inline_expr){
        content = escape_typst_postfix(content)
    }
    state.after_inline_expr =
        content.endsWith(']') || (content.startsWith('#') && content.endsWith(')'))
    state.out += content
}


// Condense whitespace runs then escape Typst markup specials
function escape_text(text:string):string{
    return escape_typst(text.replaceAll(/\s+/g, ' '))
}
