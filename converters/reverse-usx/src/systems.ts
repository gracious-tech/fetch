// Taken from mappedVerses data in https://github.com/Copenhagen-Alliance/versification-specification/tree/master/versification-mappings/standard-mappings


// NOTE This spec only allows 1-1 mappings, so ranges should always be same size
// The only exception being beginning of some Psalms
// See https://github.com/Copenhagen-Alliance/versification-specification/issues/15
export const eng_to_org = Object.freeze({
    "GEN 31:55": "GEN 32:1",
    "GEN 32:1-32": "GEN 32:2-33",

    "EXO 8:1-4": "EXO 7:26-29",
    "EXO 8:5-32": "EXO 8:1-28",
    "EXO 22:1": "EXO 21:37",
    "EXO 22:2-31": "EXO 22:1-30",

    "LEV 6:1-7": "LEV 5:20-26",
    "LEV 6:8-30": "LEV 6:1-23",

    "NUM 16:36-50": "NUM 17:1-15",
    "NUM 17:1-13": "NUM 17:16-28",
    'NUM 26:1': 'NUM 25:19',  // ADDED https://github.com/Copenhagen-Alliance/versification-specification/issues/24
    "NUM 29:40": "NUM 30:1",
    "NUM 30:1-16": "NUM 30:2-17",

    "DEU 12:32": "DEU 13:1",
    "DEU 13:1-18": "DEU 13:2-19",
    "DEU 22:30": "DEU 23:1",
    "DEU 23:1-25": "DEU 23:2-26",
    "DEU 29:1": "DEU 28:69",
    "DEU 29:2-29": "DEU 29:1-28",

    "1SA 20:42": "1SA 21:1",
    "1SA 21:1-15": "1SA 21:2-16",
    "1SA 23:29": "1SA 24:1",
    "1SA 24:1-22": "1SA 24:2-23",

    "2SA 18:33": "2SA 19:1",
    "2SA 19:1-43": "2SA 19:2-44",

    "1KI 4:21-34": "1KI 5:1-14",
    "1KI 5:1-18": "1KI 5:15-32",
    "1KI 22:43-53": "1KI 22:44-54",

    "2KI 11:21": "2KI 12:1",
    "2KI 12:1-21": "2KI 12:2-22",

    "1CH 6:1-15": "1CH 5:27-41",
    "1CH 6:16-81": "1CH 6:1-66",
    "1CH 12:4-40": "1CH 12:5-41",

    "2CH 2:1": "2CH 1:18",
    "2CH 2:2-18": "2CH 2:1-17",
    "2CH 14:1": "2CH 13:23",
    "2CH 14:2-15": "2CH 14:1-14",

    "NEH 4:1-6": "NEH 3:33-38",
    "NEH 4:7-23": "NEH 4:1-17",
    "NEH 7:69-73": "NEH 7:68-72",
    "NEH 9:38": "NEH 10:1",
    "NEH 10:1-39": "NEH 10:2-40",

    "JOB 41:1-8": "JOB 40:25-32",
    "JOB 41:9-34": "JOB 41:1-26",

    "PSA 3:0-8": "PSA 3:1-9",
    "PSA 4:0-8": "PSA 4:1-9",
    "PSA 5:0-12": "PSA 5:1-13",
    "PSA 6:0-10": "PSA 6:1-11",
    "PSA 7:0-17": "PSA 7:1-18",
    "PSA 8:0-9": "PSA 8:1-10",
    "PSA 9:0-20": "PSA 9:1-21",
    "PSA 12:0-8": "PSA 12:1-9",
    "PSA 13:0-5": "PSA 13:1-6",
    "PSA 18:0-50": "PSA 18:1-51",
    "PSA 19:0-14": "PSA 19:1-15",
    "PSA 20:0-9": "PSA 20:1-10",
    "PSA 21:0-13": "PSA 21:1-14",
    "PSA 22:0-31": "PSA 22:1-32",
    "PSA 30:0-12": "PSA 30:1-13",
    "PSA 31:0-24": "PSA 31:1-25",
    "PSA 34:0-22": "PSA 34:1-23",
    "PSA 36:0-12": "PSA 36:1-13",
    "PSA 38:0-22": "PSA 38:1-23",
    "PSA 39:0-13": "PSA 39:1-14",
    "PSA 40:0-17": "PSA 40:1-18",
    "PSA 41:0-13": "PSA 41:1-14",
    "PSA 42:0-11": "PSA 42:1-12",
    "PSA 44:0-26": "PSA 44:1-27",
    "PSA 45:0-17": "PSA 45:1-18",
    "PSA 46:0-11": "PSA 46:1-12",
    "PSA 47:0-9": "PSA 47:1-10",
    "PSA 48:0-14": "PSA 48:1-15",
    "PSA 49:0-20": "PSA 49:1-21",
    "PSA 51:0": "PSA 51:2",
    "PSA 51:1-19": "PSA 51:3-21",
    "PSA 52:0": "PSA 52:2",
    "PSA 52:1-9": "PSA 52:3-11",
    "PSA 53:0-6": "PSA 53:1-7",
    "PSA 54:0": "PSA 54:2",
    "PSA 54:1-7": "PSA 54:3-9",
    "PSA 55:0-23": "PSA 55:1-24",
    "PSA 56:0-13": "PSA 56:1-14",
    "PSA 57:0-11": "PSA 57:1-12",
    "PSA 58:0-11": "PSA 58:1-12",
    "PSA 59:0-17": "PSA 59:1-18",
    "PSA 60:0": "PSA 60:2",
    "PSA 60:1-12": "PSA 60:3-14",
    "PSA 61:0-8": "PSA 61:1-9",
    "PSA 62:0-12": "PSA 62:1-13",
    "PSA 63:0-11": "PSA 63:1-12",
    "PSA 64:0-10": "PSA 64:1-11",
    "PSA 65:0-13": "PSA 65:1-14",
    "PSA 67:0-7": "PSA 67:1-8",
    "PSA 68:0-35": "PSA 68:1-36",
    "PSA 69:0-36": "PSA 69:1-37",
    "PSA 70:0-5": "PSA 70:1-6",
    "PSA 75:0-10": "PSA 75:1-11",
    "PSA 76:0-12": "PSA 76:1-13",
    "PSA 77:0-20": "PSA 77:1-21",
    "PSA 80:0-19": "PSA 80:1-20",
    "PSA 81:0-16": "PSA 81:1-17",
    "PSA 83:0-18": "PSA 83:1-19",
    "PSA 84:0-12": "PSA 84:1-13",
    "PSA 85:0-13": "PSA 85:1-14",
    "PSA 88:0-18": "PSA 88:1-19",
    "PSA 89:0-52": "PSA 89:1-53",
    "PSA 92:0-15": "PSA 92:1-16",
    "PSA 102:0-28": "PSA 102:1-29",
    "PSA 108:0-13": "PSA 108:1-14",
    "PSA 140:0-13": "PSA 140:1-14",
    "PSA 142:0-7": "PSA 142:1-8",

    "ECC 5:1": "ECC 4:17",
    "ECC 5:2-20": "ECC 5:1-19",

    "SNG 6:13": "SNG 7:1",
    "SNG 7:1-13": "SNG 7:2-14",

    "ISA 9:1": "ISA 8:23",
    "ISA 9:2-21": "ISA 9:1-20",
    "ISA 64:2-12": "ISA 64:1-11",  // ISA 64:1 is last half of BHS's 63:19, but can't auto-split it

    "JER 9:1": "JER 8:23",
    "JER 9:2-26": "JER 9:1-25",

    "EZK 20:45-46": "EZK 21:1-2",
    "EZK 20:47": "EZK 21:3",
    "EZK 20:48-49": "EZK 21:4-5",
    "EZK 21:1-32": "EZK 21:6-37",

    "DAN 4:1-3": "DAN 3:31-33",
    "DAN 4:4-37": "DAN 4:1-34",
    "DAN 5:31": "DAN 6:1",
    "DAN 6:1-28": "DAN 6:2-29",

    "HOS 1:10-11": "HOS 2:1-2",
    "HOS 2:1-23": "HOS 2:3-25",
    "HOS 11:12": "HOS 12:1",
    "HOS 12:1-14": "HOS 12:2-15",
    "HOS 13:16": "HOS 14:1",
    "HOS 14:1-9": "HOS 14:2-10",

    "JOL 2:28-32": "JOL 3:1-5",
    "JOL 3:1-21": "JOL 4:1-21",

    "JON 1:17": "JON 2:1",
    "JON 2:1-10": "JON 2:2-11",

    "MIC 5:1": "MIC 4:14",
    "MIC 5:2-15": "MIC 5:1-14",

    "NAM 1:15": "NAM 2:1",
    "NAM 2:1-13": "NAM 2:2-14",

    "ZEC 1:18-21": "ZEC 2:1-4",
    "ZEC 2:1-13": "ZEC 2:5-17",

    "MAL 4:1-6": "MAL 3:19-24",
})

// The systems below are composed from Copenhagen Alliance standard mappings (system -> org)
// combined with the org -> eng data above, keeping only books that:
//   * are detectable (have a verse ref that doesn't exist in eng numbering)
//   * only need renumbering (reverse-usx can't move content, e.g. Synodal ROM 14:24-26)
//   * stay within the protestant 66 books (no deuterocanon cross-book moves)
// PSA is also excluded for vul/rsc/rso (LXX psalm chapter offsets; no translation needs it yet)


// Vulgate versification (also covers several books of mixed European traditions)
export const eng_to_vul = Object.freeze({

    "NUM 11:35": "NUM 11:34",
    "NUM 12:16": "NUM 13:1",
    "NUM 13:1-33": "NUM 13:2-34",
    "NUM 20:28-29": "NUM 20:29-30",
    "NUM 29:40": "NUM 30:1",
    "NUM 30:1-16": "NUM 30:2-17",

    "JOS 4:23-24": "JOS 4:24-25",
    "JOS 5:14-15": "JOS 5:15-16",
    "JOS 21:37": "JOS 21:36",
    "JOS 21:39-45": "JOS 21:37-43",

    "JDG 5:31": "JDG 5:32",
    "JDG 21:25": "JDG 21:24",

    "1SA 20:42": "1SA 20:43",
    "1SA 23:29": "1SA 24:1",
    "1SA 24:1-22": "1SA 24:2-23",

    "1KI 22:43-53": "1KI 22:44-54",

    "JOB 16:4-22": "JOB 16:5-23",
    "JOB 40:1-5": "JOB 39:31-35",
    "JOB 40:6-24": "JOB 40:1-19",
    "JOB 41:1-9": "JOB 40:20-28",
    "JOB 41:10-34": "JOB 41:1-25",
    "JOB 42:17": "JOB 42:16",

    "ECC 5:1": "ECC 4:17",
    "ECC 5:2-20": "ECC 5:1-19",
    "ECC 6:12": "ECC 7:1",
    "ECC 7:1-29": "ECC 7:2-30",

    "SNG 1:2-17": "SNG 1:1-16",
    "SNG 6:1": "SNG 5:17",
    "SNG 6:2-13": "SNG 6:1-12",

    "HOS 2:23": "HOS 2:24",
    "HOS 13:16": "HOS 14:1",
    "HOS 14:1-9": "HOS 14:2-10",

    "AMO 6:10-14": "AMO 6:11-15",

    "JON 2:10": "JON 2:11",

    "HAG 1:15": "HAG 2:1",
    "HAG 2:1-23": "HAG 2:2-24",

    "MRK 4:41": "MRK 4:40",
    "MRK 9:1": "MRK 8:39",
    "MRK 9:2-50": "MRK 9:1-49",

    "JHN 6:51-71": "JHN 6:52-72",
})


// Russian Synodal (canonical) versification
export const eng_to_rsc = Object.freeze({

    "NUM 12:16": "NUM 13:1",
    "NUM 13:1-33": "NUM 13:2-34",
    "NUM 29:40": "NUM 30:1",
    "NUM 30:1-16": "NUM 30:2-17",

    "JOS 6:1": "JOS 5:16",
    "JOS 6:2-27": "JOS 6:1-26",

    "JOB 40:1-5": "JOB 39:31-35",
    "JOB 40:6-24": "JOB 40:1-19",
    "JOB 41:1-8": "JOB 40:20-27",
    "JOB 41:9-34": "JOB 41:1-26",

    "SNG 1:2-17": "SNG 1:1-16",
    "SNG 6:13": "SNG 7:1",
    "SNG 7:1-13": "SNG 7:2-14",

    "DAN 4:1-3": "DAN 3:31-33",
    "DAN 4:4-37": "DAN 4:1-34",

    "HOS 13:16": "HOS 14:1",
    "HOS 14:1-9": "HOS 14:2-10",
})


// Russian Synodal (Orthodox) versification (only books differing from the above)
export const eng_to_rso = Object.freeze({

    "PRO 13:14-25": "PRO 13:15-26",
    "PRO 18:8-24": "PRO 18:9-25",
})


// For each book, the order to test systems in, with refs that must all be
// present for that system's rules to apply (refs chosen to exclude eng files
// and files of any system listed lower)
export const book_system_tests:Record<string, [string, string[]][]> = {
    'GEN': [['org', ['GEN 32:33']]],
    'EXO': [['org', ['EXO 21:37']]],
    'LEV': [['org', ['LEV 5:26']]],
    // NOTE org test relaxed to its unique marker NUM 17:28 (ch16/17 shift is org-only); this also
    // catches "partial org" files that shift 16/17 + 29/30 but omit the obscure 25:19 (e.g. bba_sim)
    'NUM': [['org', ['NUM 17:28']], ['vul', ['NUM 30:17', 'NUM 20:30']], ['rsc', ['NUM 30:17']]],
    'DEU': [['org', ['DEU 28:69']]],
    'JOS': [['vul', ['JOS 5:16', 'JOS 4:25']], ['rsc', ['JOS 5:16']]],
    'JDG': [['vul', ['JDG 5:32']]],
    // org/vul tests relaxed to their unique single markers so "partial" files (that shift only
    // some of a system's chapters) still match; the renumber maps no-op on absent verses
    '1SA': [['org', ['1SA 21:16']], ['vul', ['1SA 20:43']]],
    '2SA': [['org', ['2SA 19:44']]],
    '1KI': [['org', ['1KI 5:32']], ['vul', ['1KI 22:54']]],
    '2KI': [['org', ['2KI 12:22']]],
    '1CH': [['org', ['1CH 12:41']]],
    '2CH': [['org', ['2CH 13:23']]],
    'NEH': [['org', ['NEH 10:40']]],
    'JOB': [['org', ['JOB 40:32']], ['vul', ['JOB 40:28']], ['rsc', ['JOB 40:27']]],
    // NOTE PSA test hand-tuned to an early psalm so partial psalters are still detected
    'PSA': [['org', ['PSA 3:9']]],
    'PRO': [['rso', ['PRO 18:25']]],
    'ECC': [['vul', ['ECC 7:30']], ['org', ['ECC 4:17']]],
    'SNG': [['vul', ['SNG 5:17']], ['org', ['SNG 7:14']], ['rsc', ['SNG 7:14']]],
    'ISA': [['org', ['ISA 8:23']]],
    'JER': [['org', ['JER 8:23']]],
    'EZK': [['org', ['EZK 21:37']]],
    'DAN': [['org', ['DAN 6:29']], ['rsc', ['DAN 3:33']]],
    'HOS': [['org', ['HOS 14:10', 'HOS 12:15']], ['vul', ['HOS 14:10', 'HOS 2:24']], ['rsc', ['HOS 14:10']]],
    'JOL': [['org', ['JOL 4:21']]],
    'AMO': [['vul', ['AMO 6:15']]],
    'JON': [['org', ['JON 2:11']], ['vul', ['JON 2:11']]],
    'MIC': [['org', ['MIC 4:14']]],
    'NAM': [['org', ['NAM 2:14']]],
    'HAG': [['vul', ['HAG 2:24']]],
    'ZEC': [['org', ['ZEC 2:17']]],
    'MAL': [['org', ['MAL 3:24']]],
    'MRK': [['vul', ['MRK 8:39']]],
    'JHN': [['vul', ['JHN 6:72']]],
}
