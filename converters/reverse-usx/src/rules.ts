
import {eng_to_org, eng_to_vul, eng_to_rsc, eng_to_rso, eng_to_lxx, book_system_tests}
    from './systems.js'


export interface BookRuleSet {
    test:string|string[]  // Verse ref(s) that must all exist for these rules to apply
    renumber:Record<string, string>  // 'GEN 1:1': 'GEN 1:2'
    subtitle?:Record<string, number>  // 'PSA 52': 2  (first 2 verses are original subtitle)
}


// Turn a range like GEN 1:1-3 into [GEN 1:1, GEN 1:2, GEN 1:3]
function individualise_range(range:string){
    const book = range.slice(0, 3)
    const [chapter, verses] = range.slice(4).split(':') as [string, string]
    let [verse_start, verse_end] = verses.split('-').map(n => parseInt(n))
    verse_end ??= verse_start
    const results:string[] = []
    for (let v = verse_start!; v <= verse_end!; v++){
        results.push(`${book} ${chapter}:${v}`)
    }
    return results
}


// Convert a system's mapping data ('correct': 'incorrect' refs) into per-book rule sets
function system_to_rules(system:Record<string, string>){

    const system_rules:Record<string, BookRuleSet> = {}

    for (const [correct_ref, incorrect_ref] of Object.entries(system)){

        // Break up the ranges
        const corrects = individualise_range(correct_ref)
        const incorrects = individualise_range(incorrect_ref)

        // Ensure data always specifies a 1-1 mapping of verses
        if (corrects.length !== incorrects.length){
            throw new Error(`Different length: ${correct_ref} ${incorrect_ref}`)
        }

        // Add book to rules if not present yet
        const book = correct_ref.slice(0, 3)
        if (!(book in system_rules)){
            system_rules[book] = {
                test: '',
                renumber: {},
                subtitle: {},
            }
        }

        // Convert mapping data to own rules
        for (let i = 0; i < corrects.length; i++){
            const correct = corrects[i]!
            const incorrect = incorrects[i]!
            // Handle special case for beginning of some psalms which have intros un-numbered
            // In such cases need to remove verse markers and form a subtitle instead
            // NOTE Merging many-to-one is not yet supported by the spec
            // For now these Psalms just have 51:2 -> 51:0
            // https://github.com/Copenhagen-Alliance/versification-specification/issues/15
            if (correct.endsWith(':0')){
                system_rules[book]!.subtitle![incorrect.split(':')[0]!]
                    = parseInt(incorrect.split(':')[1]!)
            } else {
                system_rules[book]!.renumber[incorrect] = correct
            }
        }
    }

    return system_rules
}


// Util for building a single hand rule set from mapping data ranges
function rules_from(test:string|string[], data:Record<string, string>):BookRuleSet{
    const book = Object.keys(data)[0]!.slice(0, 3)
    return {...system_to_rules(data)[book]!, test}
}


// Hand-curated rules tested BEFORE the system-generated ones
// Needed when a tradition includes a system's differences plus extra ones of its own
const hand_rules_pre:Record<string, BookRuleSet[]> = {
    'ECC': [
        // Geneva (eng_gnv) puts eng 6:11-12 at the start of ch7 (so ch7 reaches v31). Must run
        // before the vul system rule, whose 'ECC 7:30' test would otherwise mis-fire on Geneva;
        // this rule renumbers 7:30/7:31 away so vul no longer matches on the next pass.
        rules_from('ECC 7:31', {
            'ECC 6:11-12': 'ECC 7:1-2',
            'ECC 7:1-29': 'ECC 7:3-31',
        }),
    ],
    'JOB': [
        // spa_rv/ita_db follow the Serbian 38/39 boundary only as far as eng 40:5, then revert to
        // eng numbering (so ch41 keeps its full 34 verses and ch40 ends at a re-derived 19). Gated
        // on JOB 41:34, which the fully-Serbian variants below lack (their ch41 stops at v25). Must
        // precede the full Serbian rule, whose 'JOB 39:38' test would otherwise corrupt these.
        rules_from(['JOB 39:38', 'JOB 41:34'], {
            'JOB 38:39-41': 'JOB 39:1-3',
            'JOB 39:1-30': 'JOB 39:4-33',
            'JOB 40:1-5': 'JOB 39:34-38',
            'JOB 40:6-24': 'JOB 40:1-19',
        }),
        // Serbian tradition (srp_bibc, srp_bibl, srp_1865, swe_*, dan_det, eng_gnv, fra_lsg,
        // nld_nbg) shifts boundaries of chapters 38-41
        // NOTE Must be before vul rules as both have 40:28 (but vul doesn't have 39:38)
        rules_from('JOB 39:38', {
            'JOB 38:39-41': 'JOB 39:1-3',
            'JOB 39:1-30': 'JOB 39:4-33',
            'JOB 40:1-5': 'JOB 39:34-38',
            'JOB 40:6-24': 'JOB 40:1-19',
            'JOB 41:1-9': 'JOB 40:20-28',
            'JOB 41:10-34': 'JOB 41:1-25',
        }),
    ],
    'JER': [
        // Masoretic-style editions (eng_tojb, ydd_oyt) follow org plus put 31:1 as 30:25
        rules_from('JER 30:25', {
            'JER 9:1': 'JER 8:23',
            'JER 9:2-26': 'JER 9:1-25',
            'JER 31:1': 'JER 30:25',
            'JER 31:2-40': 'JER 31:1-39',
        }),
    ],
    'SNG': [
        // ces_bkr shifts the 5/6 boundary like vul but keeps eng numbering for ch 1
        // NOTE Must be before vul rules which would also shift ch 1 (vul files lack 1:17)
        rules_from(['SNG 5:17', 'SNG 1:17'], {
            'SNG 6:1': 'SNG 5:17',
            'SNG 6:2-13': 'SNG 6:1-12',
        }),
    ],
    'DAN': [
        // dan_det follows org for the 5/6 boundary but eng for ch 3-4
        // NOTE Must be before org rules which would also shift ch 4 (org files lack 4:35)
        rules_from(['DAN 6:29', 'DAN 4:35'], {
            'DAN 5:31': 'DAN 6:1',
            'DAN 6:1-28': 'DAN 6:2-29',
        }),
    ],
    'LEV': [
        // ukr_pan/ufb follow the org 5/6 boundary (eng 6:1-7 numbered as 5:20-26) and also split
        // eng 6:5 into 5:24-25. Gated on LEV 5:27 (unique to them). Must precede the org LEV system
        // test, which has no mapping and would otherwise throw on the original numbering. ukr's
        // source adds empty placeholder verses (6:23→eng 6:30 etc.) so chapter lengths match eng.
        {
            test: 'LEV 5:27',
            renumber: {
                ...rules_from('LEV 5:27', {
                    'LEV 6:1-5': 'LEV 5:20-24',
                    'LEV 6:6-7': 'LEV 5:26-27',
                    'LEV 6:8-30': 'LEV 6:1-23',
                }).renumber,
                'LEV 5:25': 'LEV 6:5',
            },
        },
        // eng_bstj/bstjb (Brenton) keep eng numbering through ch6 but place the trespass/burnt-
        // offering laws (eng 7:1-10) at the end of ch6 as 6:31-40, so their ch7 begins at eng 7:11.
        // Gated on LEV 6:40 (eng 6 has only 30 verses; unique to these two).
        rules_from('LEV 6:40', {
            'LEV 7:1-10': 'LEV 6:31-40',
            'LEV 7:11-38': 'LEV 7:1-28',
        }),
    ],
    'HOS': [
        // dan_det (and similar) follow org for ch 11-14 but eng for ch 1-2
        // NOTE Must be before org rules which would also renumber ch 2 (org files lack 1:10)
        rules_from(['HOS 12:15', 'HOS 1:10'], {
            'HOS 11:12': 'HOS 12:1',
            'HOS 12:1-14': 'HOS 12:2-15',
            'HOS 13:16': 'HOS 14:1',
            'HOS 14:1-9': 'HOS 14:2-10',
        }),
    ],
    'NEH': [
        // uig_cyr follows the Hebrew 9/10 boundary (eng 9:38 = its 10:1, so its ch10 has 40 verses
        // and trips the org test) but is otherwise eng-numbered, so the full org NEH mapping would
        // wrongly renumber ch3/4. Gate on NEH 4:23 (eng ch4, absent from full-Hebrew texts whose
        // ch4 has 17 verses) plus NEH 10:40 to apply ONLY the 9/10 shift, beating the org rule.
        rules_from(['NEH 4:23', 'NEH 10:40'], {
            'NEH 9:38': 'NEH 10:1',
            'NEH 10:1-39': 'NEH 10:2-40',
        }),
        // grc_lxx (Septuagint) follows the Hebrew 3/4 boundary (eng 4:1-5 = its 3:33-37, with eng
        // 4:6 absent) but is otherwise eng-numbered (ch9 reaches 38, ch10 stops at 39), so the org
        // system test (NEH 10:40) never fires. Gate on NEH 3:37 (eng ch3 has only 32; full-Hebrew
        // texts reach 3:38) plus NEH 9:38 (eng-style; full-Hebrew ch9 ends at 37) to apply ONLY the
        // 3/4 shift — uniquely grc_lxx among all sources.
        rules_from(['NEH 3:37', 'NEH 9:38'], {
            'NEH 4:1-5': 'NEH 3:33-37',
            'NEH 4:7-23': 'NEH 4:1-17',
        }),
    ],
}


// Hand-curated rules tested AFTER the system-generated ones
const hand_rules:Record<string, BookRuleSet[]> = {
    'EXO': [
        // wlo_wbt puts 6:1 at the end of ch 5
        rules_from('EXO 5:24', {
            'EXO 6:1': 'EXO 5:24',
            'EXO 6:2-30': 'EXO 6:1-29',
        }),
        // fra_lsg follows the Hebrew 7/8 boundary (eng 8:1-4 = 7:26-29) but eng elsewhere, so it
        // isn't caught by the full org system test; same mapping as org, gated on its 7/8 marker
        rules_from('EXO 7:26', {
            'EXO 8:1-4': 'EXO 7:26-29',
            'EXO 8:5-32': 'EXO 8:1-28',
        }),
        // pes_pbs splits eng 29:36 ("offer a bullock…and cleanse the altar…") into 36-37
        rules_from('EXO 29:47', {
            'EXO 29:36-46': 'EXO 29:37-47',
        }),
        // ita_db (Diodati) puts eng 36:1 ("Then wrought Bezaleel…") at the end of ch35 as 35:36
        rules_from('EXO 35:36', {
            'EXO 36:1': 'EXO 35:36',
            'EXO 36:2-38': 'EXO 36:1-37',
        }),
    ],
    'DEU': [
        // eng_bst/grc_bre follow org for ch 12-13 but not the rest of the book
        // NOTE org files have 13:19 too but are matched by the org rules first
        rules_from('DEU 13:19', {
            'DEU 12:32': 'DEU 13:1',
            'DEU 13:1-18': 'DEU 13:2-19',
        }),
        // eng_bst/eng_bstb/grc_bre also follow org for the 22/23 boundary (eng 22:30 = their
        // 23:1, so ch23 reaches v26). Gated on DEU 23:26; org files have it too but are matched by
        // the org rules first (which remove it before this rule is reached).
        rules_from('DEU 23:26', {
            'DEU 22:30': 'DEU 23:1',
            'DEU 23:1-25': 'DEU 23:2-26',
        }),
        // eng_bstj/bstjb relocate eng 23:24-25 (the gleaning laws) to the start of ch24 as 24:1-2
        // (in swapped order), pushing the rest of ch24 down two. Rather than reorder the text, fold
        // those two misplaced verses into the preceding verse (eng 23:23) and renumber ch24 back.
        // Gated on DEU 24:23 (eng 24 has only 22 verses; unique to these two).
        {
            test: 'DEU 24:23',
            renumber: {
                'DEU 24:1': 'DEU 23:23',
                'DEU 24:2': 'DEU 23:23',
                ...rules_from('DEU 24:23', {'DEU 24:1-22': 'DEU 24:3-24'}).renumber,
            },
        },
    ],
    '1SA': [
        // eng_bstj follows org for the 23/24 boundary (eng 23:29 = their 24:1, so ch24 reaches
        // v23) but eng elsewhere. Gated on 1SA 24:23; org files have it too but are matched by the
        // org rules first. This also restores ch23's otherwise-missing final verse.
        rules_from('1SA 24:23', {
            '1SA 23:29': '1SA 24:1',
            '1SA 24:1-22': '1SA 24:2-23',
        }),
        // grc_lxx mis-keys ch16's last verse (eng 16:23) as 16:33; renumber it back. (Its ch18
        // disorder is fixed in source, as the validator rejects out-of-order input before any rule
        // runs.) Gated on 1SA 16:33 (unique to grc_lxx).
        rules_from('1SA 16:33', {
            '1SA 16:23': '1SA 16:33',
        }),
    ],
    '1KI': [
        // deu_tkw/tdx_sle follow org for ch 4-5 boundaries but eng for ch 22
        // NOTE org files have 5:32 too but are matched by the org rules first
        rules_from('1KI 5:32', {
            '1KI 4:21-34': '1KI 5:1-14',
            '1KI 5:1-18': '1KI 5:15-32',
        }),
        // grc_lxx has a doublet ending (11:43 then 11:44 both "Solomon slept with his fathers");
        // fold v44 into v43. Gated on 1KI 11:44 (eng 11 has only 43 verses; unique to grc_lxx).
        rules_from('1KI 11:44', {
            '1KI 11:43': '1KI 11:44',
        }),
    ],
    '1CH': [
        // deu_tkw/tdx_sle follow org for ch 5-6 boundaries but eng for ch 12
        // NOTE org files have 5:41 too but are matched by the org rules first
        rules_from('1CH 5:41', {
            '1CH 6:1-15': '1CH 5:27-41',
            '1CH 6:16-81': '1CH 6:1-66',
        }),
        // spa_rv splits eng 21:15 ("…said to the angel that destroyed, It is enough…") into 15-16
        // NOTE Also gated on 22:19 to distinguish from the cmn_cuvmp* 21/22 boundary below
        rules_from(['1CH 21:31', '1CH 22:19'], {
            '1CH 21:15-30': '1CH 21:16-31',
        }),
        // cmn_cuvmps/cmn_cuvmpt put eng 22:1 at the end of ch 21
        rules_from('1CH 21:31', {
            '1CH 22:1': '1CH 21:31',
            '1CH 22:2-19': '1CH 22:1-18',
        }),
        // bis_obb splits eng 19:19 ("…served him" / "neither would the Syrians help Ammon…") into
        // 19-20
        {
            test: '1CH 19:20',
            renumber: {
                '1CH 19:20': '1CH 19:19',
            },
        },
    ],
    '2CH': [
        // pes_pbs splits eng 14:7 ("build these cities…because we have sought the LORD") into 7-8
        rules_from('2CH 14:16', {
            '2CH 14:7-15': '2CH 14:8-16',
        }),
        // spa_rv splits eng 16:14 (Asa's burial / the bed of spices) into 14-15
        {
            test: '2CH 16:15',
            renumber: {
                '2CH 16:15': '2CH 16:14',
            },
        },
        // cab_sblg splits eng 12:15 (acts of Rehoboam / wars with Jeroboam) into 15-16
        rules_from('2CH 12:17', {
            '2CH 12:15-16': '2CH 12:16-17',
        }),
        // arb_gna follows org for the 1/2 boundary (eng 2:1 = 1:18) but eng for 13/14
        // NOTE org files have 1:18 too but are matched by the org rules first
        rules_from('2CH 1:18', {
            '2CH 2:1': '2CH 1:18',
            '2CH 2:2-18': '2CH 2:1-17',
        }),
    ],
    'GEN': [
        // Rifain translations (rif_tba etc) put 37:1 at the end of ch 36
        rules_from('GEN 36:44', {
            'GEN 37:1': 'GEN 36:44',
            'GEN 37:2-36': 'GEN 37:1-35',
        }),
        // dan_det puts 43:1 at the end of ch 42
        rules_from('GEN 42:39', {
            'GEN 43:1': 'GEN 42:39',
            'GEN 43:2-34': 'GEN 43:1-33',
        }),
        // ita_db splits eng 35:22 (Reuben / "Now the sons of Jacob were twelve") into 22-23
        rules_from('GEN 35:30', {
            'GEN 35:22-29': 'GEN 35:23-30',
        }),
    ],
    'NUM': [
        // bel_bbb/bba_sim follow org for ch 16-17 boundaries but eng for ch 30
        // NOTE org files have 17:28 too but are matched by the org rules first
        rules_from('NUM 17:28', {
            'NUM 16:36-50': 'NUM 17:1-15',
            'NUM 17:1-13': 'NUM 17:16-28',
        }),
        // ita_db follows the 12/13 boundary (eng 12:16 "the people removed from Hazeroth" as 13:1)
        // like vul/rsc but eng elsewhere, so isn't caught by their system tests; same mapping gated
        // on the 13:34 marker (full vul/rsc files are renumbered by the system rule first)
        rules_from('NUM 13:34', {
            'NUM 12:16': 'NUM 13:1',
            'NUM 13:1-33': 'NUM 13:2-34',
        }),
        // ukr_pan/ufb split eng 23:17 ("when he came to him…" / "Balak said, What hath the LORD
        // spoken?") into 17-18
        rules_from('NUM 23:31', {
            'NUM 23:17-30': 'NUM 23:18-31',
        }),
    ],
    'JOB': [
        // Masoretic-style editions (eng_tojb, ydd_oyt) put 3:1 as 2:14
        rules_from('JOB 2:14', {
            'JOB 3:1': 'JOB 2:14',
            'JOB 3:2-26': 'JOB 3:1-25',
        }),
        {
            test: 'JOB 31:41',
            renumber: {
                'JOB 31:41': 'JOB 31:40',  // ces_bkr numbers the colophon of 31:40 as 31:41
            },
        },
        // ces_bkr also puts 37:1 ("At this also my heart trembleth") at the end of ch36
        rules_from('JOB 36:34', {
            'JOB 37:1': 'JOB 36:34',
            'JOB 37:2-24': 'JOB 37:1-23',
        }),
        // eng_bstj splits eng 16:9 ("He teareth me…gnasheth…sharpeneth his eyes") into 16:10-11,
        // pushing the rest of the chapter down one (ch16 reaches v23). Fold it back into 16:10.
        rules_from('JOB 16:23', {
            'JOB 16:10-22': 'JOB 16:11-23',
        }),
    ],
    'HAB': [{
        // lit_tpv has a stray empty verse marker after 3:19
        test: 'HAB 3:20',
        renumber: {
            'HAB 3:20': 'HAB 3:19',
        },
    }],
    'JOL': [
        // dan_det has a 3-chapter Joel that follows org for the 2:28->3:1 shift but keeps the
        // old ch3 contents in ch3 (not split into ch4 like the org system does)
        rules_from('JOL 3:22', {
            'JOL 2:28-32': 'JOL 3:1-5',
            'JOL 3:1-21': 'JOL 3:6-26',
        }),
    ],
    'JDG': [
        // spa_rv splits eng 14:18 (the riddle answer / "If ye had not plowed with my heifer…") into
        // 18-19
        rules_from('JDG 14:21', {
            'JDG 14:18-20': 'JDG 14:19-21',
        }),
    ],
    'ZEC': [
        // eng_bstj splits eng 3:2 (the speaker intro / the rebuke speech) into 3:2-3, pushing the
        // rest of the chapter down one (ch3 reaches v11). Fold the split back into 3:2.
        rules_from('ZEC 3:11', {
            'ZEC 3:2-10': 'ZEC 3:3-11',
        }),
    ],
    '2SA': [
        // ukr_pan/ufb split eng 2:4 (men of Judah anoint David / they told David of Jabesh-gilead)
        // into 4-5
        rules_from('2SA 2:33', {
            '2SA 2:4-32': '2SA 2:5-33',
        }),
    ],
    'JOS': [
        {
            // rus_syn keeps the Septuagint plus at the end of Joshua (24:34-36: the ark borne by
            // people, Israel serving Astaroth) which has no Masoretic/eng equiv. — fold into 24:33
            test: 'JOS 24:36',
            renumber: {
                'JOS 24:34': 'JOS 24:33',
                'JOS 24:35': 'JOS 24:33',
                'JOS 24:36': 'JOS 24:33',
            },
        },
        // grc_lxx (Septuagint) numbers ch9 so the Gibeonite-covenant material (eng 9:14-27) runs as
        // 9:20-33, leaving ch9 over eng's 27-verse max (the 5/6 boundary is handled by the rsc
        // system). The original is ascending (1-13 then 20-33), so renumber it back to eng 14-27.
        // Gate on JOS 9:33 — unique to grc_lxx among all sources.
        rules_from('JOS 9:33', {
            'JOS 9:14-27': 'JOS 9:20-33',
        }),
    ],
    'PRO': [
        {
            // rus_syn keeps the Septuagint plus at the end of Proverbs 4 (4:28-29: "the ways on
            // the right hand the Lord knows…") with no Masoretic/eng equivalent — fold into 4:27
            test: 'PRO 4:29',
            renumber: {
                'PRO 4:28': 'PRO 4:27',
                'PRO 4:29': 'PRO 4:27',
            },
        },
        // rus_syn has the Septuagint plus 13:13a ("The crafty son shall have nothing good…") as its
        // own verse 13:14, with no eng equivalent — fold it into 13:13 and shift the rest down
        rules_from('PRO 13:26', {
            'PRO 13:13-25': 'PRO 13:14-26',
        }),
    ],
    'ECC': [
        // fra_lsg puts eng 11:9-10 ("Rejoice young man…/remove sorrow…") at the start of ch12,
        // so ch11 ends at v8 and ch12 has 16 — shift them back and renumber ch12
        rules_from('ECC 12:16', {
            'ECC 11:9-10': 'ECC 12:1-2',
            'ECC 12:1-14': 'ECC 12:3-16',
        }),
    ],
    'ISA': [
        // Rifain translations (rif_tba etc) put 52:13-15 as 53:1-3
        rules_from('ISA 53:15', {
            'ISA 52:13-15': 'ISA 53:1-3',
            'ISA 53:1-12': 'ISA 53:4-15',
        }),
        // ukr_pan/ufb split eng 9:21 ("…against Judah" / "For all this his anger is not turned
        // away…") into 21-22
        {
            test: 'ISA 9:22',
            renumber: {
                'ISA 9:22': 'ISA 9:21',
            },
        },
        // eng_drae (Vulgate) splits eng 45:23 ("…every knee shall bow") into 45:23-24, pushing the
        // rest of the chapter down one (ch45 reaches v26). Fold the split back into 45:23.
        rules_from('ISA 45:26', {
            'ISA 45:23-25': 'ISA 45:24-26',
        }),
    ],
    'HOS': [
        // nld_nbg puts eng 2:1 ("Say to your brothers: Ammi…") at the end of ch1 as 1:12
        // (so ch1 gains a verse); numbering re-syncs at ch3
        rules_from('HOS 1:12', {
            'HOS 2:1': 'HOS 1:12',
            'HOS 2:2-23': 'HOS 2:1-22',
        }),
        // fra_lsg follows the Hebrew 1/2 and 11/12 boundaries (but eng for 13/14), so it isn't
        // caught by the full org system test; both shifts use the org mapping, gated on org markers
        rules_from(['HOS 2:25', 'HOS 12:15'], {
            'HOS 1:10-11': 'HOS 2:1-2',
            'HOS 2:1-23': 'HOS 2:3-25',
            'HOS 11:12': 'HOS 12:1',
            'HOS 12:1-14': 'HOS 12:2-15',
        }),
        // eng_bstj follows the LXX 5/6 boundary (eng 5:15 = their 6:1, so ch6 reaches v12) and the
        // org 13/14 boundary (eng 13:16 = their 14:1, so ch14 reaches v10), but eng elsewhere — so
        // neither system test matches. Gated on the over-range marker each boundary leaves behind.
        rules_from('HOS 6:12', {
            'HOS 5:15': 'HOS 6:1',
            'HOS 6:1-11': 'HOS 6:2-12',
        }),
        rules_from('HOS 14:10', {
            'HOS 13:16': 'HOS 14:1',
            'HOS 14:1-9': 'HOS 14:2-10',
        }),
    ],
    'NEH': [
        // nld_nbg follows the Hebrew omission of eng 7:68 (horses/mules) AND splits eng 7:73
        // across the 7/8 boundary (its second half "when the seventh month came" is nbg 8:1) —
        // merge that half back into 7:73 and shift ch8 down a verse
        {
            test: 'NEH 8:19',
            renumber: {
                ...rules_from('NEH 8:19', {
                    'NEH 7:69-73': 'NEH 7:68-72',
                    'NEH 8:1-18': 'NEH 8:2-19',
                }).renumber,
                'NEH 8:1': 'NEH 7:73',
            },
        },
    ],
    'EZK': [{
        // eng_gnv (Geneva) splits 1:28 into 1:28-29
        test: 'EZK 1:29',
        renumber: {
            'EZK 1:29': 'EZK 1:28',
        },
    }],
    'MRK': [{
        test: 'MRK 9:51',
        renumber: {
            'MRK 9:51': 'MRK 9:50',  // hre_bth and mkl_sim split 9:50 into 9:50-51
        },
    }, {
        // fra_lsg splits 10:52 ("…thy faith…" / "…received sight…") into 52-53
        test: 'MRK 10:53',
        renumber: {
            'MRK 10:53': 'MRK 10:52',
        },
    }],
    'LUK': [{
        test: 'LUK 23:57',
        renumber: {
            'LUK 23:57': 'LUK 23:56',  // hun_bib and wro_bfb split 23:56 into 56-57
        },
    }],
    'GAL': [
        // heb_sg numbers the quote in 4:27 as its own verse, shifting the rest of the chapter
        rules_from('GAL 4:32', {
            'GAL 4:27': 'GAL 4:28',
            'GAL 4:28-31': 'GAL 4:29-32',
        }),
        // ita_db splits eng 3:28 ("…for ye are all one in Christ Jesus") into 28-29
        rules_from('GAL 3:30', {
            'GAL 3:28-29': 'GAL 3:29-30',
        }),
    ],
    '1CO': [
        // tdx_sle puts 11:1 at the end of ch 10
        rules_from('1CO 10:34', {
            '1CO 11:1': '1CO 10:34',
            '1CO 11:2-34': '1CO 11:1-33',
        }),
    ],
    'COL': [
        // ita_db (Diodati) puts eng 4:1 ("Masters, give unto your servants…") at the end of ch3 as
        // 3:26
        rules_from('COL 3:26', {
            'COL 4:1': 'COL 3:26',
            'COL 4:2-18': 'COL 4:1-17',
        }),
    ],
    'JHN': [{
        test: 'JHN 13:39',
        renumber: {
            'JHN 13:39': 'JHN 14:1',  // Some manuscripts have 13:39 that should be merged into 14:1
        },
    },
        // Byzantine/TR editions (e.g. grc_byz) split 1:38 into 1:38-39, shifting rest of chapter
        rules_from('JHN 1:52', {
            'JHN 1:38-51': 'JHN 1:39-52',
        }),
    ],
    'ROM': [{
        // Some translations put Romans 16:25–27 at end of chapter 14 as Rom 14:24-26
        // But only 1 of 6 early manuscripts support that, and only ~24 of 1000+ translations
        // So best to append contents un-numbered to Rom 14:23 if it is included
        test: 'ROM 14:24',
        renumber: {
            'ROM 14:24': 'ROM 14:23',
            'ROM 14:25': 'ROM 14:23',
            'ROM 14:26': 'ROM 14:23',
        },
    }, {
        test: 'ROM 7:26',
        renumber: {
            'ROM 7:26': 'ROM 7:25',  // nld_nbg splits 7:25 ("I thank God…So then…") into 25-26
        },
    }],
    '1TI': [{
        test: '1TI 6:22',
        renumber: {
            '1TI 6:22': '1TI 6:21',  // arb_bib and a couple others put end of 6:21 as new verse
        },
    }],
    'PSA': [
        {
            test: 'PSA 47:10',
            renumber: {
                'PSA 47:10': 'PSA 47:9',  // Some bibles like nhe_tbl split v9 into 9-10
            },
        },
        {
            // isl_bib and deu_tkw split 2:12 ("Kiss the Son…") into 12-13
            test: 'PSA 2:13',
            renumber: {
                'PSA 2:13': 'PSA 2:12',
            },
        },
    ],
    'REV': [{
        test: 'REV 15:9',
        renumber: {
            'REV 15:9': 'REV 15:8',  // Byzantine/TR editions (e.g. grc_byz) split 15:8 into 8-9
        },
    }],
}


// Versification system mapping data ('correct' eng ref to 'incorrect' variant ref)
const systems:Record<string, Record<string, string>> = {
    org: eng_to_org,
    vul: eng_to_vul,
    rsc: eng_to_rsc,
    rso: eng_to_rso,
    lxx: eng_to_lxx,
}


// Build rule sets for each system
const rules_by_system:Record<string, Record<string, BookRuleSet>> = {}
for (const [name, system] of Object.entries(systems)){
    rules_by_system[name] = system_to_rules(system)
}


// Assemble final rules per book: pre hand rules, then system rule sets in the generated order
// (tests chosen to only match files of that system), then remaining hand rules
export const default_rules:Record<string, BookRuleSet[]> = {}
for (const [book, rule_sets] of Object.entries(hand_rules_pre)){
    default_rules[book] ??= []
    default_rules[book]!.push(...rule_sets)
}
for (const [book, entries] of Object.entries(book_system_tests)){
    for (const [system_name, conditions] of entries){
        const rules = rules_by_system[system_name]?.[book]
        if (rules){
            rules.test = conditions
            default_rules[book] ??= []
            default_rules[book]!.push(rules)
        }
    }
}
for (const [book, rule_sets] of Object.entries(hand_rules)){
    default_rules[book] ??= []
    default_rules[book]!.push(...rule_sets)
}
