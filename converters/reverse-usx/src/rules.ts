
import {eng_to_org, eng_to_vul, eng_to_rsc, eng_to_rso, book_system_tests} from './systems.js'


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
        // Serbian tradition (srp_bibc, srp_bibl) shifts boundaries of chapters 38-41
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
        // Masoretic-style editions (eng_tojb, yid_oyt) follow org plus put 31:1 as 30:25
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
    ],
    'DEU': [
        // eng_bst/grc_bre follow org for ch 12-13 but not the rest of the book
        // NOTE org files have 13:19 too but are matched by the org rules first
        rules_from('DEU 13:19', {
            'DEU 12:32': 'DEU 13:1',
            'DEU 13:1-18': 'DEU 13:2-19',
        }),
    ],
    '1KI': [
        // deu_tkw/tdx_sle follow org for ch 4-5 boundaries but eng for ch 22
        // NOTE org files have 5:32 too but are matched by the org rules first
        rules_from('1KI 5:32', {
            '1KI 4:21-34': '1KI 5:1-14',
            '1KI 5:1-18': '1KI 5:15-32',
        }),
    ],
    '1CH': [
        // deu_tkw/tdx_sle follow org for ch 5-6 boundaries but eng for ch 12
        // NOTE org files have 5:41 too but are matched by the org rules first
        rules_from('1CH 5:41', {
            '1CH 6:1-15': '1CH 5:27-41',
            '1CH 6:16-81': '1CH 6:1-66',
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
    ],
    'NUM': [
        // bel_bbb/bba_sim follow org for ch 16-17 boundaries but eng for ch 30
        // NOTE org files have 17:28 too but are matched by the org rules first
        rules_from('NUM 17:28', {
            'NUM 16:36-50': 'NUM 17:1-15',
            'NUM 17:1-13': 'NUM 17:16-28',
        }),
    ],
    'JOB': [
        // Masoretic-style editions (eng_tojb, yid_oyt) put 3:1 as 2:14
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
    ],
    '1CO': [
        // tdx_sle puts 11:1 at the end of ch 10
        rules_from('1CO 10:34', {
            '1CO 11:1': '1CO 10:34',
            '1CO 11:2-34': '1CO 11:1-33',
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
