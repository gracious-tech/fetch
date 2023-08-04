
export const ignored_elements:readonly string[] = [
    'book',     // Book marker meaningless since books served separately
    'table',    // TODO Tables are probably non-biblical content (but confirm)
    'row',      // Part of a table
    'cell',     // Part of a table
    'sidebar',  // Non-biblical info not tied to specific verse
    'periph',   // Non-biblical extra info
    'figure',   // Illustrations etc
    'optbreak', // Line breaks that are optional (and opting not to use)
    'ms',       // TODO Multi-purpose markers (could be useful in future)
]


export const ignored_para_styles:readonly string[] = [

    // <para> Identification [exclude all] - Running headings & table of contents
    'ide',  // See https://github.com/schierlm/BibleMultiConverter/issues/67
    'rem',  // Remarks (valid in schema though missed in docs)
    'h', 'h1', 'h2', 'h3', 'h4',
    'toc1', 'toc2', 'toc3',
    'toca1', 'toca2', 'toca3',

    /* <para> Introductions [exclude all] - Introductionary (non-biblical) content
        Which might be helpful in a printed book, but intro material in apps is usually bad UX,
        and users that really care can research a translations methodology themselves
    */
    'imt', 'imt1', 'imt2', 'imt3', 'imt4',
    'is', 'is1', 'is2', 'is3', 'is4',
    'ip',
    'ipi',
    'im',
    'imi',
    'ipq',
    'imq',
    'ipr',
    'iq', 'iq1', 'iq2', 'iq3', 'iq4',
    'ib',
    'ili', 'ili1', 'ili2', 'ili3', 'ili4',
    'iot',
    'io', 'io1', 'io2', 'io3', 'io4',
    'iex',
    'imte',
    'ie',

    /* <para> Headings [exclude some] - Exclude book & chapter headings but keep section headings
        Not excluded: ms# | mr | s# | sr | d | sp | sd#
    */
    'mt', 'mt1', 'mt2', 'mt3', 'mt4',
    'mte', 'mte1', 'mte2', 'mte3', 'mte4',
    'cl',
    'cd',  // Non-biblical chapter summary, more than heading
    'r',  // Parallels to be provided by external data
]


export const ignored_char_styles = [
    'rq',  // In-text cross-reference (use own system instead)
]
