
import {describe, it} from 'vitest'

import {pre_convert, pre_reverse, post_reverse} from './generic'


// Build a converted-USX3 verse (start marker + text + end marker)
function v(sid:string, num:string, text=''):string{
    return `<verse number="${num}" style="v" sid="${sid}" />${text}<verse eid="${sid}" />`
}


describe('pre_convert', () => {

    it("Drops the LXX Exodus tabernacle recension (ch35+) and leaves a note", ({expect}) => {
        const usfm = '\\c 34\n\\p\n\\v 1 kept\n\\c 35\n\\p\n\\v 1 tabernacle recension\n'
        const out = pre_convert('grc_lxx', 'exo', usfm)
        expect(out).not.toContain('tabernacle recension')
        expect(out).toContain('\\c 35')
        expect(out).toContain('Chapters 35-40 are not included')
    })

    it("Is idempotent for the LXX Exodus fix", ({expect}) => {
        const usfm = '\\c 34\n\\p\n\\v 1 kept\n\\c 35\n\\p\n\\v 1 tabernacle recension\n'
        const once = pre_convert('grc_lxx', 'exo', usfm)
        expect(pre_convert('grc_lxx', 'exo', once)).toEqual(once)
    })

    it("Swaps LXX 1 Kings chapters 20 and 21 back to English order", ({expect}) => {
        const usfm = '\\c 20\n\\p\n\\v 1 a1\n'
            + '\\c 21\n\\p\n\\v 1 b1\n\\v 2 b2\n\\v 3 b3\n'
            + '\\c 22\n\\p\n\\v 1 c1\n'
        const out = pre_convert('grc_lxx', '1ki', usfm)
        expect(out).toMatch(/\\c 20\n\\p\n\\v 1 b1\n\\v 2 b2\n\\v 3 b3\n\\c 21/)
        expect(out).toMatch(/\\c 21\n\\p\n\\v 1 a1\n\\c 22/)
    })

    it("Leaves an unrelated translation/book untouched", ({expect}) => {
        const usfm = '\\c 1\n\\p\n\\v 1 hello\n'
        expect(pre_convert('xyz_abc', 'exo', usfm)).toEqual(usfm)
    })

})


describe('pre_reverse', () => {

    it("Truncates an LXX-ordered Jeremiah at 25:13 and leaves a note", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="25" style="c" sid="JER 25" />`
            + `<para style="p">${v('JER 25:13', '13', 'thirteen ')}`
            + `${v('JER 25:14', '14', 'divergent material ')}</para>`
            + `<chapter eid="JER 25" /></usx>`
        const out = pre_reverse('eng_bst', 'jer', usx)
        expect(out).not.toContain('divergent material')
        expect(out).toContain('25:14 onwards is not included')
    })

    it("Truncates the combined Ezra+Nehemiah book after Ezra ch10", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="10" style="c" sid="EZR 10" />`
            + `${v('EZR 10:1', '1', 'ezra ')}<chapter eid="EZR 10" />`
            + `<chapter number="11" style="c" sid="EZR 11" />${v('EZR 11:1', '1', 'neh ')}</usx>`
        const out = pre_reverse('eng_bst', 'ezr', usx)
        expect(out).not.toContain('EZR 11')
        expect(out).toContain('sid="EZR 10"')
        expect(out.endsWith('</usx>')).toBe(true)
    })

    it("Truncates the Greek additions to Esther after 10:3", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="10" style="c" sid="EST 10" />`
            + `<para style="p">${v('EST 10:3', '3', 'canonical ')}`
            + `${v('EST 10:4', '4', 'addition F ')}</para></usx>`
        const out = pre_reverse('eng_drae', 'est', usx)
        expect(out).not.toContain('addition F')
        expect(out).toContain('canonical ')
        expect(out.endsWith('</usx>')).toBe(true)
    })

    it("Drops the deuterocanonical Psalm 151 by truncating after Psalm 150", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="150" style="c" sid="PSA 150" />`
            + `${v('PSA 150:1', '1', 'praise ')}<chapter eid="PSA 150" />`
            + `<chapter number="151" style="c" sid="PSA 151" />${v('PSA 151:1', '1', 'extra ')}</usx>`
        const out = pre_reverse('grc_lxx', 'psa', usx)
        expect(out).not.toContain('PSA 151')
        expect(out).toContain('sid="PSA 150"')
    })

    it("Strips the deuterocanonical additions to Daniel", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="3" style="c" sid="DAN 3" />`
            + `<para style="p">${v('DAN 3:23', '23', 'twenty-three ')}`
            + `${v('DAN 3:24', '24', 'song of the three ')}`
            + `${v('DAN 3:90', '90', 'still song ')}`
            + `${v('DAN 3:91', '91', 'canonical resume ')}`
            + `${v('DAN 3:92', '92', 'next ')}</para><chapter eid="DAN 3" />`
            + `<chapter number="13" style="c" sid="DAN 13" />${v('DAN 13:1', '1', 'susanna ')}`
            + `</usx>`
        const out = pre_reverse('eng_drae', 'dan', usx)
        // The Song of the Three (3:24-90) is removed
        expect(out).not.toContain('song of the three')
        expect(out).not.toContain('still song')
        // The canonical tail is shifted back by 67 (3:91 -> 3:24, 3:92 -> 3:25)
        expect(out).toContain('<verse number="24" style="v" sid="DAN 3:24" />canonical resume ')
        expect(out).toContain('<verse number="25" style="v" sid="DAN 3:25" />next ')
        // Susanna (ch13) is dropped
        expect(out).not.toContain('DAN 13')
    })

    it("Leaves an unrelated translation/book untouched", ({expect}) => {
        const usx = `<usx>${v('GEN 1:1', '1', 'hello ')}</usx>`
        expect(pre_reverse('xyz_abc', 'gen', usx)).toEqual(usx)
    })

})


describe('post_reverse', () => {

    it("Removes a second/short ending of Mark after 16:20", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="16" style="c" sid="MRK 16" />`
            + `<para style="p">${v('MRK 16:20', '20', 'long ending ')}`
            + `${v('MRK 16:21', '21', 'spurious extra ')}</para><chapter eid="MRK 16" /></usx>`
        const out = post_reverse('xyz_abc', 'mrk', usx)
        expect(out).not.toContain('spurious extra')
        expect(out).toContain('long ending ')
        expect(out.endsWith('</usx>')).toBe(true)
    })

    it("Is a no-op for a Mark that already ends at 16:20", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="16" style="c" sid="MRK 16" />`
            + `<para style="p">${v('MRK 16:20', '20', 'long ending ')}</para>`
            + `<chapter eid="MRK 16" /></usx>`
        expect(post_reverse('xyz_abc', 'mrk', usx)).toEqual(usx)
    })

    it("Removes trailing empty chapter markers", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="3" style="c" sid="JOL 3" />`
            + `<para style="p">${v('JOL 3:1', '1', 'real ')}</para><chapter eid="JOL 3" />`
            + `<chapter number="4" style="c" sid="JOL 4" /><chapter eid="JOL 4" /></usx>`
        const out = post_reverse('xyz_abc', 'jol', usx)
        expect(out).not.toContain('JOL 4')
        expect(out).toContain('sid="JOL 3"')
    })

    it("Keeps an interior empty chapter intact", ({expect}) => {
        const usx = `<usx version="3.0"><chapter number="3" style="c" sid="JOL 3" />`
            + `<chapter eid="JOL 3" />`
            + `<chapter number="4" style="c" sid="JOL 4" />`
            + `<para style="p">${v('JOL 4:1', '1', 'real ')}</para><chapter eid="JOL 4" /></usx>`
        const out = post_reverse('xyz_abc', 'jol', usx)
        expect(out).toContain('sid="JOL 3"')
        expect(out).toContain('sid="JOL 4"')
    })

    it("Merges LXX Proverbs over-range verses into the last valid verse", ({expect}) => {
        // Proverbs ch24 has 34 standard verses; a verse 35 is the appendix material
        const usx = `<usx version="3.0">${v('PRO 24:34', '34', 'last ')}`
            + `${v('PRO 24:35', '35', 'appendix ')}</usx>`
        const out = post_reverse('grc_lxx', 'pro', usx)
        expect(out).not.toContain('sid="PRO 24:35"')
        expect(out).toContain('appendix ')
    })

})
