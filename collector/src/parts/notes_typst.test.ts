
import {describe, it} from 'vitest'

import {html_note_to_typst, default_notes_typst_definitions} from './notes_typst.js'


describe('html_note_to_typst', () => {

    it('escapes plain text and condenses whitespace', ({expect}) => {
        expect(html_note_to_typst('uses  #hash   and [bracket]'))
            .toEqual('uses \\#hash and \\[bracket\\]')
    })

    it('converts <strong> to native #strong[…]', ({expect}) => {
        expect(html_note_to_typst('The <strong>title</strong> of')).toEqual('The #strong[title] of')
    })

    it('converts <em> to native #emph[…]', ({expect}) => {
        expect(html_note_to_typst('Beelzeboul; <em>see</em> note'))
            .toEqual('Beelzeboul; #emph[see] note')
    })

    it('converts nested <em><strong> (ital-bold)', ({expect}) => {
        expect(html_note_to_typst('<em><strong>Peace</strong></em>'))
            .toEqual('#emph[#strong[Peace]]')
    })

    it('converts <sup> and <sub> to native super/sub', ({expect}) => {
        expect(html_note_to_typst('On another note <sup>look at this</sup>'))
            .toEqual('On another note #super[look at this]')
        expect(html_note_to_typst('42 <sub>is the answer</sub>'))
            .toEqual('42 #sub[is the answer]')
    })

    it('converts fbn-sc spans (and strong/em variants) to #smallcaps[…]', ({expect}) => {
        expect(html_note_to_typst('<span class="fbn-sc">title</span> was'))
            .toEqual('#smallcaps[title] was')
        expect(html_note_to_typst('The Lord <strong class="fbn-sc">Jesus</strong> is King'))
            .toEqual('The Lord #strong[#smallcaps[Jesus]] is King')
        expect(html_note_to_typst('The Lord <em class="fbn-sc">Jesus</em> is King'))
            .toEqual('The Lord #emph[#smallcaps[Jesus]] is King')
    })

    it('converts fbn-yhwh (divine name) and fbn-era to #smallcaps[…]', ({expect}) => {
        expect(html_note_to_typst('The Lord <em class="fbn-yhwh">Jesus</em> is King'))
            .toEqual('The Lord #emph[#smallcaps[Jesus]] is King')
        expect(html_note_to_typst('The year 2300 <strong class="fbn-era">AD</strong> it'))
            .toEqual('The year 2300 #strong[#smallcaps[AD]] it')
    })

    it('converts original-language spans (greek/hebrew/aramaic/latin) to consumer functions',
            ({expect}) => {
        // Marked up so consumers can style them, but render as plain text by default
        expect(html_note_to_typst('<span class="fbn-greek">Beelzeboul</span>'))
            .toEqual('#greek[Beelzeboul]')
        expect(html_note_to_typst('<span class="fbn-hebrew">א</span>')).toEqual('#hebrew[א]')
        expect(html_note_to_typst('<span class="fbn-aramaic">talitha</span>'))
            .toEqual('#aramaic[talitha]')
        expect(html_note_to_typst('<span class="fbn-latin">vulgate</span>'))
            .toEqual('#latin[vulgate]')
    })

    it('default_notes_typst_definitions renders original-language words as plain text',
            ({expect}) => {
        for (const name of ['greek', 'hebrew', 'aramaic', 'latin']){
            expect(default_notes_typst_definitions).toMatch(new RegExp(`#let ${name}\\(c\\) = c\\b`))
        }
    })

    it('converts fbn-excerpt to native #emph[…], no consumer function', ({expect}) => {
        expect(html_note_to_typst('In <span class="fbn-excerpt">the beginning God</span> created'))
            .toEqual('In #emph[the beginning God] created')
        expect(default_notes_typst_definitions).not.toContain('excerpt')
    })

    it('stacks fbn-excerpt with a nested semantic class (yhwh/sc)', ({expect}) => {
        expect(html_note_to_typst('The <span class="fbn-excerpt fbn-yhwh">Jesus</span> is King'))
            .toEqual('The #emph[#smallcaps[Jesus]] is King')
        expect(html_note_to_typst('<span class="fbn-excerpt fbn-sc">Mene, Tekel,</span> and'))
            .toEqual('#emph[#smallcaps[Mene, Tekel,]] and')
    })

    it('ignores fbn-roman (occurs once in the whole source) — falls back to plain excerpt',
            ({expect}) => {
        expect(html_note_to_typst('lots were called <span class="fbn-excerpt fbn-roman">purim</span>'))
            .toEqual('lots were called #emph[purim]')
    })

    it('renders fbn-list-N spans as regular text, no special indent handling', ({expect}) => {
        expect(html_note_to_typst('<span class="fbn-list-1">Reasons to be a geek</span>'))
            .toEqual('Reasons to be a geek')
        expect(html_note_to_typst('<span class="fbn-list-2">Collections</span>'))
            .toEqual('Collections')
    })

    it('separates sibling <p> lines with a break instead of running them together', ({expect}) => {
        // clean_note only strips a single wrapping <p> — multi-paragraph note bodies (e.g. the
        // sn-list-N chiasm layout) leak inner <p>s through untouched, so they need a break here
        const chiasm = '<p class="sn-list-1">A God judges everyone the same</p>'
            + '<p class="sn-list-2">B Life is the reward</p>'
        expect(html_note_to_typst(chiasm))
            .toEqual('A God judges everyone the same\n\nB Life is the reward\n\n')
    })

    it('renders data-ref spans as plain text (was clickable in HTML only)', ({expect}) => {
        expect(html_note_to_typst('cp. <span data-ref="dan,4,27">4:27</span>.'))
            .toEqual('cp. 4:27.')
        expect(html_note_to_typst('<span data-ref="dan,5,22,5,24">5:22-24</span> here.'))
            .toEqual('5:22\\-24 here.')
    })

    it('drops unrecognised elements/classes but keeps their text content', ({expect}) => {
        expect(html_note_to_typst('<span class="fbn-mystery">plain</span>')).toEqual('plain')
    })

    it('escapes a leading "(" right after a closing inline expression', ({expect}) => {
        // #super[…] closes with `]` — a following `(` would otherwise be read as a call
        expect(html_note_to_typst('<sup>note</sup>(an aside)'))
            .toEqual('#super[note]\\(an aside)')
    })

    it('escapes a leading "." right after a closing inline expression', ({expect}) => {
        expect(html_note_to_typst('<span class="fbn-sc">Sc</span>...trailing'))
            .toEqual('#smallcaps[Sc]\\...trailing')
    })

    it('emits emphasis as calls so it survives touching word characters', ({expect}) => {
        // Shorthand `_…_` is literal next to a letter, leaving an unclosed delimiter
        expect(html_note_to_typst('<span class="fbn-excerpt">Priest</span>s also'))
            .toEqual('#emph[Priest]s also')
        expect(html_note_to_typst('a <em>Bath</em>sheba’s name'))
            .toEqual('a #emph[Bath]sheba’s name')
        expect(html_note_to_typst('make just <span class="fbn-excerpt">decision</span>s. As'))
            .toEqual('make just #emph[decision]s. As')
    })

    it('escapes a "." or "(" directly after a closing #emph[…]', ({expect}) => {
        expect(html_note_to_typst('<em>died</em>.Then')).toEqual('#emph[died]\\.Then')
        expect(html_note_to_typst('<em>died</em>(4:2)')).toEqual('#emph[died]\\(4:2)')
    })

    it('default_notes_typst_definitions covers every consumer function the converter emits',
            ({expect}) => {
        const defs = default_notes_typst_definitions
        const expected_names = ['greek', 'hebrew', 'aramaic', 'latin']
        for (const name of expected_names){
            expect(defs).toMatch(new RegExp(`#let ${name}\\(`))
        }
    })

})
