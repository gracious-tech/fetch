
import {describe, it} from 'vitest'

import {
    pre_convert_specific,
    pre_reverse_specific,
    post_reverse_specific,
} from './specific'


// Build a converted-USX3 verse (start marker + text + end marker)
function v(sid:string, num:string, text=''):string{
    return `<verse number="${num}" style="v" sid="${sid}" />${text}<verse eid="${sid}" />`
}


describe('pre_convert_specific', () => {

    it("Injects a missing chapter-1 start marker for hil_bib", ({expect}) => {
        const usx = '<para style="p"><verse number="1" style="v" sid="MAT 1:1" />text'
            + '<verse eid="MAT 1:1" /></para><chapter eid="MAT 1" />'
        const out = pre_convert_specific('hil_bib', 'mat', usx)
        expect(out).toContain('<chapter number="1" style="c" sid="MAT 1" />')
    })

    it("Is a no-op for hil_bib when chapter 1 already has a start marker", ({expect}) => {
        const usx = '<chapter number="1" style="c" sid="MAT 1" /><para style="p">'
            + '<verse number="1" style="v" sid="MAT 1:1" />text<verse eid="MAT 1:1" /></para>'
        expect(pre_convert_specific('hil_bib', 'mat', usx)).toEqual(usx)
    })

    it("Folds eng_toe's spurious EXO 16 verse 0 into verse 3", ({expect}) => {
        const usfm = '\\c 16\n\\p\n\\v 3 part a\n\\v 0 part b\n'
        const out = pre_convert_specific('eng_toe', 'exo', usfm)
        expect(out).not.toContain('\\v 0')
        expect(out).toContain('part b')
    })

    it("Moves aai_wbt's misplaced ACT \\c 8 marker below verse 7:60's orphaned tail", ({expect}) => {
        const usfm = '\\v 60 ...tisisinaf hai\n\\c 8  \n\\p kakafih...morob.\n\\v 1 Stephen...\n'
        const out = pre_convert_specific('aai_wbt', 'act', usfm)
        // The orphan paragraph now precedes \c 8 (so it stays in 7:60), and verse 1 gets its own \p
        expect(out).toEqual(
            '\\v 60 ...tisisinaf hai\n\\p kakafih...morob.\n\\c 8  \n\\p\n\\v 1 Stephen...\n')
    })

    it("Is a no-op for aai_wbt ACT once the \\c 8 marker is already correctly placed", ({expect}) => {
        const usfm = '\\v 60 ...tisisinaf hai\n\\p kakafih...morob.\n\\c 8  \n\\p\n\\v 1 Stephen...\n'
        expect(pre_convert_specific('aai_wbt', 'act', usfm)).toEqual(usfm)
    })

    it("Restores the // in msy_pbt EZK URLs split by an optbreak", ({expect}) => {
        const usfm = '\\p see http:<optbreak/>www.example.com for more\n'
        const out = pre_convert_specific('msy_pbt', 'ezk', usfm)
        expect(out).toContain('http://www.example.com')
        expect(out).not.toContain('optbreak')
    })

    it("Restores the lost digits of por_tft MAT '5.000'", ({expect}) => {
        const usfm = '\\v 21 foram cinco 5.\\v 000 homens\n'
        const out = pre_convert_specific('por_tft', 'mat', usfm)
        expect(out).toContain('5.000 homens')
        expect(out).not.toContain('\\v 000')
    })

    it("Normalises gup_bsa ISA footnotes opened with \\fe to \\f", ({expect}) => {
        const usfm = '\\v 6 text\\fe + a footnote\\f* more\n'
        const out = pre_convert_specific('gup_bsa', 'isa', usfm)
        expect(out).not.toContain('\\fe ')
        expect(out).toContain('\\f + a footnote')
    })

    it("Relabels eng_bstj JOS 9:27-29 and drops the duplicate Ebal tail", ({expect}) => {
        const usfm = '\\c 9\n\\p\n\\v 27-29 merged text \\f + \\fr 9:27-29 footnote\\f*\n'
            + '\\v 30 duplicate ebal\n\\c 10\n\\p\n\\v 1 next\n'
        const out = pre_convert_specific('eng_bstj', 'jos', usfm)
        expect(out).toContain('\\v 27 merged text')
        expect(out).not.toContain('\\v 27-29')
        expect(out).not.toContain('9:27-29')
        expect(out).not.toContain('duplicate ebal')
    })

    it("Relabels gvn_wbt GEN's merged cross-chapter verses", ({expect}) => {
        const usfm = '\\c 4\n\\p\n\\v 4 (4.25-5.26) merged\n\\c 6\n\\p\n\\v 6 (6.22-7.9) merged\n'
        const out = pre_convert_specific('gvn_wbt', 'gen', usfm)
        expect(out).toContain('\\v 25-26 (4.25')
        expect(out).toContain('\\v 22 (6.22')
    })

    it("Drops grc_lxx PSA's spurious empty \\c 2 marker", ({expect}) => {
        const usfm = '\\c 1\n\\p\n\\v 1 one\n\\c 2\n\\q1\n\\c 2\n\\p\n\\v 1 two\n'
        const out = pre_convert_specific('grc_lxx', 'psa', usfm)
        expect(out.match(/\\c 2\b/g)).toHaveLength(1)
        expect(out).toContain('\\v 1 two')
    })

    it("Leaves an unrelated translation untouched", ({expect}) => {
        const usfm = '\\c 1\n\\p\n\\v 1 hello\n'
        expect(pre_convert_specific('xyz_abc', 'gen', usfm)).toEqual(usfm)
    })

})


describe('pre_reverse_specific', () => {

    it("Rejoins the eng_aila LUK 22:1 citation split by a stray verse marker", ({expect}) => {
        const usx = '<char style="it">first part</char>'
            + '<verse number="1" style="v" sid="LUK 22:1"/>'
            + '<char style="it">second part</char><verse eid="LUK 22:1"/>'
        const out = pre_reverse_specific('eng_aila', 'luk', usx)
        expect(out).toContain('<char style="it">first partsecond part</char>')
        expect(out).not.toContain('LUK 22:1')
    })

    it("Unwraps the eng_aipa JHN 5 text-critical note from a duplicate verse", ({expect}) => {
        const usx = '<verse number="3" style="v" sid="JHN 5:3"/>'
            + ' Some ancient manuscripts add verse 4 here<verse eid="JHN 5:3"/>'
        const out = pre_reverse_specific('eng_aipa', 'jhn', usx)
        expect(out).toContain('Some ancient manuscripts add verse 4')
        expect(out).not.toContain('sid="JHN 5:3"')
        expect(out).not.toContain('eid="JHN 5:3"')
    })

    it("Empties nyy_wft ACT 23 (a duplicate of ACT 10)", ({expect}) => {
        const usx = '<chapter number="23" style="c" sid="ACT 23" /><para style="p">'
            + `${v('ACT 23:1', '1', 'cornelius ')}</para><chapter eid="ACT 23" />`
        const out = pre_reverse_specific('nyy_wft', 'act', usx)
        expect(out).toContain('sid="ACT 23"')
        expect(out).not.toContain('<verse')
    })

    it("Folds cmn_bib ISA 38:21-22 back into verse 6", ({expect}) => {
        const usx = `<para style="p">${v('ISA 38:6', '6', 'six ')}${v('ISA 38:7', '7', 'seven ')}`
            + `${v('ISA 38:21', '21', 'poultice ')}${v('ISA 38:22', '22', 'sign ')}</para>`
        const out = pre_reverse_specific('cmn_bib', 'isa', usx)
        expect(out).not.toContain('sid="ISA 38:21"')
        expect(out).not.toContain('sid="ISA 38:22"')
        expect(out).toContain('poultice ')
        expect(out).toContain('sign ')
    })

    it("Relabels akp_seed's mis-numbered ISA 13:14", ({expect}) => {
        const usx = `${v('ISA 13:13', '13', 'thirteen ')}${v('ISA 13:1', '1', 'fourteen ')}`
        const out = pre_reverse_specific('akp_seed', 'isa', usx)
        expect(out).toContain('sid="ISA 13:14"')
    })

    it("Moves the wol_rwnt JHN pericope lead verse to the end of chapter 7", ({expect}) => {
        const usx = '<verse eid="JHN 7:52" /><chapter eid="JHN 7" />'
            + '<chapter number="8" style="c" sid="JHN 8" />'
            + '<verse number="53" style="v" sid="JHN 8:53" />pericope lead<verse eid="JHN 8:53" />'
            + '<verse number="1" style="v" sid="JHN 8:1" />real eight one<verse eid="JHN 8:1" />'
        const out = pre_reverse_specific('wol_rwnt', 'jhn', usx)
        expect(out).toContain('sid="JHN 7:53"')
        expect(out).toContain('pericope lead')
        expect(out).not.toContain('sid="JHN 8:53"')
        expect(out).toContain('real eight one')
    })

    it("Drops the nat_wft LUK 1 duplicate prologue redraft", ({expect}) => {
        const usx = '<para style="p"><verse number="4" style="v" sid="LUK 1:4" />prologue text'
            + '</para><para style="s" vid="LUK 1:4">redraft heading and text'
            + '<verse eid="LUK 1:4" /></para>'
        const out = pre_reverse_specific('nat_wft', 'luk', usx)
        expect(out).toContain('prologue text<verse eid="LUK 1:4" />')
        expect(out).not.toContain('redraft heading')
        expect(out).not.toContain('style="s"')
    })

    it("Removes the nat_wft 1TH 4 duplicate of verse 14", ({expect}) => {
        const usx = `${v('1TH 4:14', '14', 'fourteen ')}${v('1TH 4:1', '1', 'alternate redraft ')}`
            + `${v('1TH 4:15', '15', 'fifteen ')}`
        const out = pre_reverse_specific('nat_wft', '1th', usx)
        expect(out).not.toContain('alternate redraft')
        expect(out).toContain('fourteen ')
        expect(out).toContain('fifteen ')
    })

    it("Renumbers shr_mkb EZK 21 and drops its BHS note and duplicate", ({expect}) => {
        const usx = '<chapter number="21" style="c" sid="EZK 21" />'
            + '<para style="p"><verse number="1a" style="v" sid="EZK 21:1a" />note'
            + '<verse eid="EZK 21:1a" /></para>'
            + '<para style="p"><verse number="1b" style="v" sid="EZK 21:1b" />duplicate'
            + '<verse eid="EZK 21:5" /></para>'
            + `<para style="p">${v('EZK 21:6', '6', 'real content ')}</para>`
        const out = pre_reverse_specific('shr_mkb', 'ezk', usx)
        expect(out).not.toContain('EZK 21:1a')
        expect(out).not.toContain('EZK 21:1b')
        expect(out).toContain('<verse number="1" style="v" sid="EZK 21:1" />real content ')
    })

    it("Drops the shr_mkb MAL 3 BHS duplicate tail (keeps through v18)", ({expect}) => {
        const usx = `<para style="p">${v('MAL 3:18', '18', 'eighteen ')}`
            + `${v('MAL 3:19', '19', 'bhs duplicate ')}</para>\n  <chapter eid="MAL 3" />`
        const out = pre_reverse_specific('shr_mkb', 'mal', usx)
        expect(out).not.toContain('sid="MAL 3:19"')
        expect(out).toContain('eighteen ')
    })

    it("Restores snw_seed ISA verse numbers with a glued-on word", ({expect}) => {
        const usx = '<verse number="9SAATEKplɛ" style="v" sid="ISA 50:9SAATEKplɛ" />text'
            + '<verse eid="ISA 50:9SAATEKplɛ" />'
        const out = pre_reverse_specific('snw_seed', 'isa', usx)
        expect(out).toContain('<verse number="9" style="v" sid="ISA 50:9" />')
        expect(out).toContain('SAATEKplɛ text')
        expect(out).not.toContain('9SAATEKplɛ')
    })

    it("Leaves an unrelated translation untouched", ({expect}) => {
        const usx = `<usx>${v('GEN 1:1', '1', 'hello ')}</usx>`
        expect(pre_reverse_specific('xyz_abc', 'gen', usx)).toEqual(usx)
    })

})


describe('post_reverse_specific', () => {

    it("Fixes the nmq_wft MRK 11:30 mis-numbered as 11:3", ({expect}) => {
        const usx = `${v('MRK 11:3', '3', 'real three ')}${v('MRK 11:29', '29', 'twenty-nine ')}`
            + '<verse number="3" style="v" sid="MRK 11:3" />thirty text<verse eid="MRK 11:3" />'
        const out = post_reverse_specific('nmq_wft', 'mrk', usx)
        expect(out).toContain('<verse number="30" style="v" sid="MRK 11:30" />thirty text')
        // The genuine 11:3 earlier in the chapter is untouched
        expect(out).toContain('<verse number="3" style="v" sid="MRK 11:3" />real three ')
    })

    it("Removes the mpz_ea empty verse marker after MRK 2:12", ({expect}) => {
        const usx = `${v('MRK 2:12', '12', 'twelve ')}`
            + '<verse number="" style="v" sid="MRK 2:" /><verse eid="MRK 2:" />'
        const out = post_reverse_specific('mpz_ea', 'mrk', usx)
        expect(out).not.toContain('sid="MRK 2:"')
        expect(out).toContain('twelve ')
    })

    it("Removes hau_bib's deuterocanonical Daniel 14", ({expect}) => {
        const usx = `${v('DAN 12:1', '1', 'twelve ')}`
            + '<chapter number="14" style="c" sid="DAN 14" />'
            + `${v('DAN 14:1', '1', 'bel and the dragon ')}<chapter eid="DAN 14" />`
        const out = post_reverse_specific('hau_bib', 'dan', usx)
        expect(out).not.toContain('bel and the dragon')
        expect(out).not.toContain('DAN 14')
        expect(out).toContain('twelve ')
    })

    it("Folds fra_ncl's spurious trailing ACT 10:49 into the last valid verse", ({expect}) => {
        const usx = `${v('ACT 10:48', '48', 'forty-eight ')}${v('ACT 10:49', '49', 'stray quote ')}`
        const out = post_reverse_specific('fra_ncl', 'act', usx)
        expect(out).not.toContain('sid="ACT 10:49"')
        expect(out).toContain('stray quote ')
    })

    it("Leaves an unrelated translation untouched", ({expect}) => {
        const usx = `<usx>${v('GEN 1:1', '1', 'hello ')}</usx>`
        expect(post_reverse_specific('xyz_abc', 'gen', usx)).toEqual(usx)
    })

})
