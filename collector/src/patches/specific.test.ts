
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

    it("Folds agn_wps ROM 1's out-of-order v7 into v1 with a placeholder after v6", ({expect}) => {
        const usfm = '\\c 1\n\\p\n\\v 1 paul\n\\v 7 to all in rome\n\\v 2 gospel\n\\v 6 you also\n'
            + '\\s1 heading\n\\v 8 first\n'
        const out = pre_convert_specific('agn_wps', 'rom', usfm)
        // v7's text folds into v1 (no text-bearing \v 7 left) and an empty \v 7 sits after v6
        expect(out).not.toMatch(/\\v 7 \S/)
        expect(out).toContain('to all in rome')
        expect(out).toMatch(/\\v 6 you also\n\\v 7\n\\s1 heading/)
    })

    it("Strips bsj_d43 MRK's empty \\s5 chunk markers", ({expect}) => {
        const usfm = '\\c 1\n\\s5\n\\p\n\\v 1 text\n\\s5  \n\\v 2 more\n'
        const out = pre_convert_specific('bsj_d43', 'mrk', usfm)
        expect(out).not.toContain('\\s5')
        expect(out).toContain('\\v 1 text')
        expect(out).toContain('\\v 2 more')
    })

    it("Drops srp_1865 JOB 38's duplicated lion/raven tail (38:39-41)", ({expect}) => {
        const usfm = '\\c 38\n\\p\n\\v 38 zgusne\n\\b\n\\q1\n\\v 39 lavice\n\\v 41 gavranu\n'
            + '\\c 39\n\\q1\n\\v 1 lavu\n'
        const out = pre_convert_specific('srp_1865', 'job', usfm)
        expect(out).not.toContain('\\v 39 lavice')
        expect(out).not.toContain('\\v 41 gavranu')
        expect(out).toContain('\\v 38 zgusne')
        expect(out).toContain('\\v 1 lavu')
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


// Build raw USFM from each chapter's verse labels in physical order (verse text is "t<ch>_<v>")
function usfm(chapters:Record<number, (number|string)[]>):string{
    return Object.entries(chapters).map(([c, verses]) => `\\c ${c}\n\\p\n`
        + verses.map(v => `\\v ${v} t${c}_${v}\n`).join('')).join('')
}


// Get a single chapter's slice of USFM
function chapter_of(text:string, chapter:number):string{
    return text.split(/(?=\\c \d)/).find(part => new RegExp(`^\\\\c ${chapter}\\D`).test(part))
        ?? ''
}


// A raw-USFM fix: the input chapters, the verses whose text should fold into the preceding verse,
// and the empty placeholder verses that should be added
interface UsfmCase {
    translations:string[]
    book:string
    chapters:Record<number, (number|string)[]>
    folded?:[number, number|string][]
    placeholders?:[number, number][]
    contains?:string[]
    missing?:string[]
}


const usfm_cases:Record<string, UsfmCase> = {
    "usa_wbt 1TI 3:17 folds into v16": {translations: ['usa_wbt'], book: '1ti',
        chapters: {3: [16, 17]}, folded: [[3, 17]]},
    "tcz_cho SNG 6:14 folds into v13": {translations: ['tcz_cho'], book: 'sng',
        chapters: {6: [13, 14]}, folded: [[6, 14]]},
    "bjr_wbt MRK reorders 3:30": {translations: ['bjr_wbt'], book: 'mrk',
        chapters: {3: [28, 30, 29, 31]}, folded: [[3, 30]], placeholders: [[3, 30]]},
    "bjr_wbt ACT reorders 10:46": {translations: ['bjr_wbt'], book: 'act',
        chapters: {10: [44, 46, 45, 47]}, folded: [[10, 46]], placeholders: [[10, 46]]},
    "bjr_wbt 1CO reorders 11:7 and 15:24": {translations: ['bjr_wbt'], book: '1co',
        chapters: {11: [5, 7, 6, 8], 15: [22, 24, 23, 25]}, folded: [[11, 7], [15, 24]],
        placeholders: [[11, 7], [15, 24]]},
    "bjr_wbt EPH reorders 5:12": {translations: ['bjr_wbt'], book: 'eph',
        chapters: {5: [10, 12, 11, 13]}, folded: [[5, 12]], placeholders: [[5, 12]]},
    "bjr_wbt JHN reorders 11:57": {translations: ['bjr_wbt'], book: 'jhn',
        chapters: {11: [55, 57, 56]}, folded: [[11, 57]], placeholders: [[11, 57]]},
    "bjr_wbt other books are untouched": {translations: ['bjr_wbt'], book: 'gen',
        chapters: {3: [28, 30, 29, 31]}, contains: ['\\v 30 t3_30']},
    "bqc_sim ISA folds 38:21-22 into v6": {translations: ['bqc_sim'], book: 'isa',
        chapters: {38: [6, 21, 22, 7]}, folded: [[38, 21], [38, 22]]},
    "ukr LEV adds placeholders for omitted verses": {translations: ['ukr_pan', 'ukr_ufb'],
        book: 'lev', chapters: {6: [21, 22], 14: [54, 55], 17: [15], 21: [23]},
        placeholders: [[6, 23], [14, 56], [14, 57], [17, 16], [21, 24]]},
    "ZEC 4 lampstand tail folds with placeholders": {translations: ['kij_png', 'bba_sim'],
        book: 'zec', chapters: {4: [5, '10b', 11, 12, 13, 14, 6, 7, 8, 9, 10]},
        folded: [[4, '10b'], [4, 11], [4, 12], [4, 13], [4, 14]],
        placeholders: [[4, 11], [4, 12], [4, 13], [4, 14]]},
    "bba_sim ISA reorders 38:21-22 after v20": {translations: ['bba_sim'], book: 'isa',
        chapters: {38: [6, 21, 22, 7, 20]}, folded: [[38, 21], [38, 22]],
        placeholders: [[38, 21], [38, 22]], contains: ['\\v 20 t38_20\n\\v 21\n\\v 22\n']},
    "eng_drae PSA titles Ps 10's superscription and folds split verses": {
        translations: ['eng_drae'], book: 'psa',
        chapters: {2: [12, 13], 4: [9, 10], 10: [1, 2, 3], 42: [5, 6], 125: [6, 7],
            135: [26, 27]},
        folded: [[2, 13], [4, 10], [42, 6], [125, 7], [135, 27]],
        contains: ['\\d t10_1\n\\v 1 t10_2\n\\v 2 t10_3']},
    "lat_clv PSA folds fewer split verses": {translations: ['lat_clv'], book: 'psa',
        chapters: {2: [12, 13], 4: [9, 10], 42: [5, 6]}, folded: [[2, 13], [4, 10]],
        contains: ['\\v 6 t42_6']},
    "grc_lxx 1SA folds 18:20-22 into v29": {translations: ['grc_lxx'], book: '1sa',
        chapters: {18: [19, 29, 20, 21, 22, 30]}, folded: [[18, 20], [18, 21], [18, 22]]},
    "aer_wbt MAT 14:1-2 fold into v12 with placeholders at the start": {
        translations: ['aer_wbt'], book: 'mat', chapters: {14: [3, 12, 1, 2, 13]},
        folded: [[14, 1], [14, 2]], contains: ['\\c 14\n\\v 1\n\\v 2\n\\p\n\\v 3']},
    "wrk_wbt JHN reorders 9:14": {translations: ['wrk_wbt'], book: 'jhn',
        chapters: {9: [1, 14, 2, 13, 15]}, folded: [[9, 14]], placeholders: [[9, 14]]},
    "hrv_iva NAM reorders 2:2": {translations: ['hrv_iva'], book: 'nam',
        chapters: {2: [1, 3, 2, 4]}, folded: [[2, 2]], placeholders: [[2, 2]]},
    "hrv_iva 1SA reorders 9:9": {translations: ['hrv_iva'], book: '1sa',
        chapters: {9: [8, 10, 9, 11]}, folded: [[9, 9]], placeholders: [[9, 9]]},
    "hrv_iva HAB reorders 2:18": {translations: ['hrv_iva'], book: 'hab',
        chapters: {2: [17, 19, 18, 20]}, folded: [[2, 18]], placeholders: [[2, 18]]},
    "hrv_iva ISA folds 8:24 and reorders 33:22": {translations: ['hrv_iva'], book: 'isa',
        chapters: {8: [23, 24], 33: [21, 23, 22, 24]}, folded: [[8, 24], [33, 22]],
        placeholders: [[33, 22]]},
    "hrv_iva JER reorders 29:8-9 and 36:9": {translations: ['hrv_iva'], book: 'jer',
        chapters: {29: [7, 10, 8, 9, 11], 36: [8, 10, 9, 11]},
        folded: [[29, 8], [29, 9], [36, 9]], placeholders: [[29, 8], [29, 9], [36, 9]]},
    "hrv_iva JOB reorders 36:31": {translations: ['hrv_iva'], book: 'job',
        chapters: {36: [30, 32, 31, 33]}, folded: [[36, 31]], placeholders: [[36, 31]]},
    "hrv_iva other books are untouched": {translations: ['hrv_iva'], book: 'gen',
        chapters: {2: [1, 3, 2, 4]}, contains: ['\\v 2 t2_2']},
    "cbu_wbt DEU 10:6-9 fold with placeholders after v5": {translations: ['cbu_wbt'],
        book: 'deu', chapters: {10: [5, 10, 11, 6, 7, 8, 9, 12]},
        folded: [[10, 6], [10, 7], [10, 8], [10, 9]],
        placeholders: [[10, 6], [10, 7], [10, 8], [10, 9]]},
    "dji_wbt GEN 7:25 folds into v24": {translations: ['dji_wbt'], book: 'gen',
        chapters: {7: [24, 25]}, folded: [[7, 25]]},
    "eng_nna GEN reorders and folds sub-verses": {translations: ['eng_nna'], book: 'gen',
        chapters: {6: [15, 17, 16, 18], 13: [1, 3, 2, '7a', '7b'], 15: [14, 16, 15, 17]},
        folded: [[6, 17], [13, 2], [13, '7b'], [15, 15]],
        placeholders: [[6, 17], [13, 2], [15, 15]]},
    "eng_nna MRK reorders and folds sub-verses": {translations: ['eng_nna'], book: 'mrk',
        chapters: {2: ['15a', '15b'], 5: [7, 9, 8, 20, '21a'], 6: [43, 45, 44], 15: [6, 8, 7]},
        folded: [[2, '15b'], [5, 8], [5, '21a'], [6, 44], [15, 7]],
        placeholders: [[5, 8], [6, 44], [15, 7]]},
    "eng_nna other books are untouched": {translations: ['eng_nna'], book: 'luk',
        chapters: {6: [15, 17, 16]}, contains: ['\\v 17 t6_17']},
    "lit_tpv PSA reorders 24:10 after v5": {translations: ['lit_tpv'], book: 'psa',
        chapters: {24: [1, 2, 10, 3, 4, 5]}, folded: [[24, 10]], placeholders: [[24, 10]]},
    "grc_lxx PRO 20:20-22 fold with placeholders after v13": {translations: ['grc_lxx'],
        book: 'pro', chapters: {20: [9, 20, 21, 22, 10, 11, 12, 13]},
        folded: [[20, 20], [20, 21], [20, 22]], placeholders: [[20, 20], [20, 21], [20, 22]]},
    "gnn_bsa empties thematic summary chapters": {translations: ['gnn_bsa'], book: 'gen',
        chapters: {29: [1], 30: [1, 2], 31: [1]}, contains: ['\\c 30\n\\c 31', 't29_1'],
        missing: ['t30_1', 't30_2']},
    "gnn_bsa DEU folds 19:22-23 into v21": {translations: ['gnn_bsa'], book: 'deu',
        chapters: {19: [21, '22-23']}, folded: [[19, '22-23']]},
    "gnn_bsa books without summaries are untouched": {translations: ['gnn_bsa'], book: 'mat',
        chapters: {30: [1, 2]}, contains: ['\\v 1 t30_1']},
}


describe('pre_convert_specific raw USFM folds', () => {

    for (const [name, spec] of Object.entries(usfm_cases)){
        it.for(spec.translations)(`${name} (%s)`, (translation, {expect}) => {
            const out = pre_convert_specific(translation, spec.book, usfm(spec.chapters))
            for (const [chapter, verse] of spec.folded ?? []){
                const chap = chapter_of(out, chapter)
                expect(chap).not.toContain(`\\v ${verse} t${chapter}_${verse}`)
                expect(chap).toContain(`t${chapter}_${verse}`)
            }
            for (const [chapter, verse] of spec.placeholders ?? []){
                expect(chapter_of(out, chapter)).toMatch(new RegExp(`\\\\v ${verse}\\n`))
            }
            for (const text of spec.contains ?? []){
                expect(out).toContain(text)
            }
            for (const text of spec.missing ?? []){
                expect(out).not.toContain(text)
            }
            // Every fix is idempotent
            expect(pre_convert_specific(translation, spec.book, out)).toEqual(out)
        })
    }
})


describe('pre_convert_specific other fixes', () => {

    it("Moves swe_stb chapter markers back before the para holding verse 1", ({expect}) => {
        const usx = '<para style="p"><verse number="30" style="v" />end</para>'
            + '<para style="p"><verse number="1" style="v" />one <verse number="2" style="v" />two'
            + '</para><chapter number="11" style="c" />\n<para style="p">'
            + '<verse number="3" style="v" />three</para>'
        const out = pre_convert_specific('swe_stb', 'jhn', usx)
        expect(out).toEqual('<para style="p"><verse number="30" style="v" />end</para>'
            + '<chapter number="11" style="c" />\n'
            + '<para style="p"><verse number="1" style="v" />one <verse number="2" style="v" />two'
            + '</para><para style="p"><verse number="3" style="v" />three</para>')
        expect(pre_convert_specific('swe_stb', 'jhn', out)).toEqual(out)
    })

    it("Leaves hil_bib alone when there's no para holding a first verse", ({expect}) => {
        const no_verse = '<book code="MAT" /><para style="p">text</para>'
        expect(pre_convert_specific('hil_bib', 'mat', no_verse)).toEqual(no_verse)
        const no_para = '<verse number="1" style="v" sid="MAT 1:1" />text'
        expect(pre_convert_specific('hil_bib', 'mat', no_para)).toEqual(no_para)
    })

    it.for([['agg_png', 'act', 8], ['mbh_tbl', 'rev', 13], ['wuv_wbt', '1co', 13]] as const)(
        "Moves %s %s's misplaced \\c %i below the orphaned clause",
        ([translation, book, ch], {expect}) => {
            const usfm = `\\v 9 previous\n\\c ${ch}  \n\\p orphan.\n\\v 1 next\n`
            expect(pre_convert_specific(translation, book, usfm))
                .toEqual(`\\v 9 previous\n\\p orphan.\n\\c ${ch}  \n\\p\n\\v 1 next\n`)
        })

    it("Drops srp_dkc JOB 38's duplicated tail too", ({expect}) => {
        const usfm = '\\c 38\n\\p\n\\v 38 zgusne\n\\v 39 lavice\n\\c 39\n\\q1\n\\v 1 lavu\n'
        expect(pre_convert_specific('srp_dkc', 'job', usfm)).not.toContain('lavice')
    })

    it("Relabels eng_bstjb JOS 9:27-29 too", ({expect}) => {
        const usfm = '\\c 9\n\\p\n\\v 27-29 merged\n\\c 10\n\\p\n\\v 1 next\n'
        expect(pre_convert_specific('eng_bstjb', 'jos', usfm)).toContain('\\v 27 merged')
    })

    it("Splits uig_cyr PSA opening title ranges from the first body verse", ({expect}) => {
        const usfm = '\\c 1\n\\q1\n\\v 1 plain\n'
            + '\\c 3\n\\v 1-2 title three\n\\m body three\n'
            + '\\c 50\n\\v 1-3 title fifty\n\\m body fifty\n'
        const out = pre_convert_specific('uig_cyr', 'psa', usfm)
        expect(out).toEqual('\\c 1\n\\q1\n\\v 1 plain\n'
            + '\\c 3\n\\v 1 title three\n\\m \\v 2 body three\n'
            + '\\c 50\n\\v 1-2 title fifty\n\\m \\v 3 body fifty\n')
        expect(pre_convert_specific('uig_cyr', 'psa', out)).toEqual(out)
    })
})


describe('pre_convert_specific Brenton psalter', () => {

    // An LXX-numbered psalter (1-151) whose bodies identify their source chapter
    function lxx_psalter():string{
        const bodies:Record<number, string> = {
            9: '\\q1\n\\v 1 nine one\n\\v 20 nine twenty\n\\b  \n'
                + '\\q1 (Psalm 9a\\f + \\fr 9:20 numbering note\\f*)  \n'
                + '\\v 21 ten one\n\\v 38 ten eighteen\n',
            10: '\\q1\n\\v 1 eleven one\n\\q1\n\\v 2 eleven one b\n\\v 3 eleven two\n',
            146: '\\d title146\n\\q1\n\\v 1 a146\n\\v 11 b146\n',
            147: '\\d title147\n\\q1\n\\v 1 a147\n\\v 9 b147\n',
        }
        let out = '\\id PSA\n'
        for (let c = 1; c <= 151; c++){
            out += `\\c ${c}\n` + (bodies[c] ?? `\\q1\n\\v 1 lxx${c}\n`)
        }
        return out
    }

    it.for(['eng_bstj', 'eng_bstjb'])("Remaps %s to English psalm numbering", (translation,
            {expect}) => {
        const out = pre_convert_specific(translation, 'psa', lxx_psalter())
        const chapters = [...out.matchAll(/\\c (\d+)/g)].map(m => parseInt(m[1]!))
        expect(chapters).toEqual([...Array(150).keys()].map(i => i + 1))
        expect(out).not.toContain('lxx151')

        // LXX 9 splits into eng 9 and 10 (dropping the numbering note)
        expect(chapter_of(out, 9)).toEqual('\\c 9  \n\\q1\n\\v 1 nine one\n\\v 20 nine twenty\n')
        expect(chapter_of(out, 10))
            .toEqual('\\c 10  \n\\b  \n\\q1\n\\v 1 ten one\n\\v 18 ten eighteen\n')
        expect(out).not.toContain('Psalm 9a')

        // LXX 10 becomes eng 11 with its first two verses joined
        expect(chapter_of(out, 11))
            .toEqual('\\c 11  \n\\q1\n\\v 1 eleven one eleven one b\n\\v 2 eleven two\n')

        // LXX 11-145 shift up a chapter, 146+147 merge, and 148-150 are unchanged
        expect(chapter_of(out, 12)).toContain('lxx11')
        expect(chapter_of(out, 146)).toContain('lxx145')
        expect(chapter_of(out, 147)).toEqual('\\c 147  \n\\d title146\n\\q1\n\\v 1 a146\n'
            + '\\v 11 b146\n\\q1\n\\v 12 a147\n\\v 20 b147\n')
        expect(chapter_of(out, 150)).toContain('lxx150')

        // Already remapped (no Ps 151) so is a no-op
        expect(pre_convert_specific(translation, 'psa', out)).toEqual(out)
    })
})


describe('pre_reverse_specific other fixes', () => {

    it("Folds hrv_hrsdc ISA 8:24 into 8:23", ({expect}) => {
        const usx = `<para style="p">${v('ISA 8:23', '23', 'a ')}${v('ISA 8:24', '24', 'b ')}</para>`
        expect(pre_reverse_specific('hrv_hrsdc', 'isa', usx))
            .toEqual(`<para style="p">${v('ISA 8:23', '23', 'a b ')}</para>`)
    })

    it("Relabels tig_mdw ACT 21:40-1 and wraps the root-level 22:2", ({expect}) => {
        const usx = '<chapter number="21" style="c" sid="ACT 21" />'
            + `<para style="p">${v('ACT 21:39', '39', 'a ')}${v('ACT 21:40-1', '40-1', 'b ')}</para>`
            + '<chapter eid="ACT 21" /><chapter number="22" style="c" sid="ACT 22" />'
            + `${v('ACT 22:2', '2', 'c ')}<para style="p">${v('ACT 22:3', '3', 'd ')}</para>`
        const out = pre_reverse_specific('tig_mdw', 'act', usx)
        expect(out).toContain(v('ACT 21:40', '40', 'b '))
        expect(out).toContain(`<para style="p">${v('ACT 22:2', '2', 'c ')}</para>`)
        expect(pre_reverse_specific('tig_mdw', 'act', out)).toEqual(out)
    })

    it("Wraps mra_mrk's root-level MRK 9:1", ({expect}) => {
        const usx = `<chapter number="9" style="c" sid="MRK 9" />${v('MRK 9:1', '1', 'a ')}`
            + `<para style="p">${v('MRK 9:2', '2', 'b ')}</para>`
        expect(pre_reverse_specific('mra_mrk', 'mrk', usx)).toContain(
            `<chapter number="9" style="c" sid="MRK 9" /><para style="p">${v('MRK 9:1', '1', 'a ')}`)
    })

    // ZEC 4 with the lampstand tail (10b-14) printed after v5
    function zec(tail_label:string){
        return `<para style="p">${v('ZEC 4:5', '5', 'five ')}`
            + `${v(`ZEC 4:${tail_label}`, tail_label, 'tenb ')}${v('ZEC 4:11', '11', 'eleven ')}`
            + `${v('ZEC 4:12', '12', 'twelve ')}${v('ZEC 4:13', '13', 'thirteen ')}`
            + `${v('ZEC 4:14', '14', 'fourteen ')}</para>`
            + `<para style="p">${v('ZEC 4:6', '6', 'six ')}${v('ZEC 4:9', '9', 'nine ')}`
            + `${v('ZEC 4:10a', '10a', 'tena ')}</para>`
    }

    // Expected ZEC 4 once the tail is folded into v5 with placeholders after v10
    const zec_fixed = `<para style="p">${v('ZEC 4:5', '5', 'five tenb eleven twelve thirteen '
        + 'fourteen ')}</para><para style="p">${v('ZEC 4:6', '6', 'six ')}`
        + `${v('ZEC 4:9', '9', 'nine ')}${v('ZEC 4:10', '10', 'tena ')}</para>\n  `
        + `<para style="p">${v('ZEC 4:11', '11')}${v('ZEC 4:12', '12')}${v('ZEC 4:13', '13')}`
        + `${v('ZEC 4:14', '14')}</para>`

    it.for([['ach_abr', '10b'], ['mro_seed', '10'], ['bis_obb', '10b']] as const)(
        "Folds %s ZEC 4's displaced lampstand tail (labelled %s)",
        ([translation, label], {expect}) => {
            const out = pre_reverse_specific(translation, 'zec', zec(label))
            expect(out).toEqual(zec_fixed)
            expect(pre_reverse_specific(translation, 'zec', out)).toEqual(out)
        })

    it("Drops mhr_mmu's appended 2CH 37", ({expect}) => {
        const usx = `<usx><chapter number="36" style="c" sid="2CH 36" />${v('2CH 36:1', '1', 'a')}`
            + '<chapter eid="2CH 36" /><chapter number="37" style="c" sid="2CH 37" />manasseh</usx>'
        const out = pre_reverse_specific('mhr_mmu', '2ch', usx)
        expect(out).not.toContain('manasseh')
        expect(out).toMatch(/<chapter eid="2CH 36" \/><\/usx>$/)
    })

    it("Folds ces_bible 2CH 28:28 into v27", ({expect}) => {
        const usx = `${v('2CH 28:27', '27', 'a ')}${v('2CH 28:28', '28', 'b ')}`
        expect(pre_reverse_specific('ces_bible', '2ch', usx)).toEqual(v('2CH 28:27', '27', 'a b '))
    })

    it("Folds nyn_bsu's split verses and renumbers the rest of the chapter", ({expect}) => {
        const gen = `${v('GEN 18:32', '32', 'a ')}${v('GEN 18:33', '33', 'b ')}`
            + `${v('GEN 18:34', '34', 'c ')}`
        const gen_out = pre_reverse_specific('nyn_bsu', 'gen', gen)
        expect(gen_out).toEqual(`${v('GEN 18:32', '32', 'a b ')}${v('GEN 18:33', '33', 'c ')}`)
        expect(pre_reverse_specific('nyn_bsu', 'gen', gen_out)).toEqual(gen_out)

        const mat = `${v('MAT 20:31', '31', 'a ')}${v('MAT 20:32', '32', 'b ')}`
            + `${v('MAT 20:33', '33', 'c ')}${v('MAT 20:35', '35', 'e ')}`
        const mat_out = pre_reverse_specific('nyn_bsu', 'mat', mat)
        expect(mat_out).toEqual(`${v('MAT 20:31', '31', 'a b ')}${v('MAT 20:32', '32', 'c ')}`
            + `${v('MAT 20:34', '34', 'e ')}`)
        expect(pre_reverse_specific('nyn_bsu', 'mat', mat_out)).toEqual(mat_out)
    })

    it("Renumbers tkr_ibtr's LXX-numbered psalms to English", ({expect}) => {
        const psalm = (c:number, verses=1) => `<chapter number="${c}" style="c" sid="PSA ${c}" />`
            + [...Array(verses).keys()].map(i => v(`PSA ${c}:${i + 1}`, `${i + 1}`, `lxx${c} `))
                .join('') + `<chapter eid="PSA ${c}" />`
        const usx = [psalm(1), psalm(15, 6), psalm(17), psalm(31), psalm(89), psalm(111),
            psalm(112), psalm(150)].join('')
        const out = pre_reverse_specific('tkr_ibtr', 'psa', usx)
        const chapters = [...out.matchAll(/<chapter number="(\d+)"/g)].map(m => m[1])
        expect(chapters).toEqual(['1', '16', '18', '32', '90', '112', '113', '150'])
        expect(out).toContain(v('PSA 113:1', '1', 'lxx112 '))
        expect(out).toContain(v('PSA 112:1', '1', 'lxx111 '))
        expect(pre_reverse_specific('tkr_ibtr', 'psa', out)).toEqual(out)
    })

    it("Leaves wol_rwnt JHN alone once the pericope verse is in chapter 7", ({expect}) => {
        const usx = `${v('JHN 7:52', '52', 'a ')}${v('JHN 7:53', '53', 'b ')}`
            + `${v('JHN 8:1', '1', 'c ')}${v('JHN 8:53', '53', 'd ')}`
        expect(pre_reverse_specific('wol_rwnt', 'jhn', usx)).toEqual(usx)
    })

    it("Folds bis_obb ISA 38:21-22 into v6 with placeholders after v20", ({expect}) => {
        const usx = `<para style="p">${v('ISA 38:6', '6', 'six ')}${v('ISA 38:21', '21',
            'poultice<note><char style="fr" closed="false">38.22: </char></note> ')}`
            + `${v('ISA 38:22', '22', 'sign ')}</para>`
            + `<para style="p">${v('ISA 38:7', '7', 'seven ')}${v('ISA 38:20', '20', 'twenty ')}`
            + '</para>'
        const out = pre_reverse_specific('bis_obb', 'isa', usx)
        expect(out).toEqual(`<para style="p">${v('ISA 38:6', '6',
            'six poultice<note><char style="fr" closed="false">38.6: </char></note> sign ')}`
            + `</para><para style="p">${v('ISA 38:7', '7', 'seven ')}`
            + `${v('ISA 38:20', '20', 'twenty ')}</para>\n  `
            + `<para style="p">${v('ISA 38:21', '21')}${v('ISA 38:22', '22')}</para>`)
        expect(pre_reverse_specific('bis_obb', 'isa', out)).toEqual(out)
    })

    it("Relabels bis_obb MAT 1 genealogy ranges with inline placeholders", ({expect}) => {
        const usx = `<para style="p">${v('MAT 1:1', '1', 'one ')}${v('MAT 1:2-6a', '2-6a', 'two ')}`
            + `${v('MAT 1:6b-11', '6b-11', '<char style="xo" closed="false">1.6b-11: </char>six ')}`
            + `${v('MAT 1:12-16', '12-16', 'twelve ')}${v('MAT 1:17', '17', 'seventeen ')}</para>`
        const out = pre_reverse_specific('bis_obb', 'mat', usx)
        const sids = [...out.matchAll(/sid="MAT 1:(\d+)"/g)].map(m => parseInt(m[1]!))
        expect(sids).toEqual([...Array(17).keys()].map(i => i + 1))
        expect(out).toContain(v('MAT 1:6', '6', '<char style="xo" closed="false">1.6: </char>six '))
        expect(out).toContain(`${v('MAT 1:12', '12', 'twelve ')}${v('MAT 1:13', '13')}`)
        expect(pre_reverse_specific('bis_obb', 'mat', out)).toEqual(out)
    })

    it("Leaves other bis_obb books untouched", ({expect}) => {
        const usx = `<para style="p">${v('GEN 1:1', '1', 'a ')}</para>`
        expect(pre_reverse_specific('bis_obb', 'gen', usx)).toEqual(usx)
    })

    it.for([['gen', 'GEN 44', 34], ['2ch', '2CH 14', 14]] as const)(
        "Drops shr_mkb %s's spurious tail after %s:%i", ([book, chapter, last], {expect}) => {
            const usx = `<para style="p">${v(`${chapter}:${last}`, `${last}`, 'real ')}`
                + `${v(`${chapter}:${last + 1}`, `${last + 1}`, 'filler ')}</para>\n`
                + `<chapter eid="${chapter}" />`
            expect(pre_reverse_specific('shr_mkb', book, usx)).toEqual(
                `<para style="p">${v(`${chapter}:${last}`, `${last}`, 'real ')}</para>\n`
                + `<chapter eid="${chapter}" />`)
        })

    it("Leaves shr_mkb EZK alone once renumbered", ({expect}) => {
        const usx = `<para style="p">${v('EZK 21:1', '1', 'a ')}</para>`
        expect(pre_reverse_specific('shr_mkb', 'ezk', usx)).toEqual(usx)
    })
})
