#!/usr/bin/env python3
"""Generate the eng_ev source (Everyday Version: OET Readers' Version with traditional names) for
the official collection, using the OET adapter (https://github.com/Freely-Given-org/OpenEnglishTranslation_adapter).

Only well-known names are changed (those in the New Testament, Bible book names, and FAMOUS_OT);
less familiar names keep OET's spelling, except where OET itself explains them inline.

Steps: run the adapter headlessly (traditional names, otherwise defaults) → resolve names the
adapter left ambiguous by checking which candidate the BSB uses in the same verse → strip \\nd
(OET marks nomina sacra with it, which would render as small caps) → write source.zip
and update the date in meta.json (which is otherwise maintained by hand).

Usage: python3 -I adaptations/eng_ev/generate.py [--oet-ref <commit>]
Then: .bin/collector_official download --recheck eng_ev && .bin/collector_official process eng_ev
(Without --recheck, download skips the already-extracted source and process uses stale files.)
"""

import argparse
import collections
import csv
import dataclasses
import datetime
import importlib.util
import io
import json
import re
import sys
import tempfile
import types
import urllib.request
import zipfile
from pathlib import Path


ADAPTER_COMMIT = 'c4678a3fd7c918f63a18a27f67781be6ad8b798a'
ADAPTER_URL = ('https://raw.githubusercontent.com/Freely-Given-org/OpenEnglishTranslation_adapter/'
    f'{ADAPTER_COMMIT}/OET_adapter.py')
OET_REPO_API = 'https://api.github.com/repos/Freely-Given-org/OpenEnglishTranslation--OET'
USER_AGENT = 'fetch-bible-collector'

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'collection_official' / 'sources' / 'bibles' / 'eng_ev'
BSB_DIR = ROOT / 'collection_official' / 'dist' / 'bibles' / 'eng_bsb' / 'txt'

# Adapter answers (anything omitted uses the adapter's default, e.g. Yahweh, British spelling)
# NOTE Intros and cross-references are excluded as fetch(bible) never uses them from translations
ADAPTER_ANSWERS = {
    'version': 'RV',
    'sections': ['FRT', 'OT', 'NT'],
    'parts': ['headings', 'footnotes'],
    'names': 'traditional',
    'formats': ['USFM'],
}

# OET footnotes explaining OET's own name choices, which no longer make sense with traditional
#     names (matched against the footnote's text after names are changed)
STALE_FOOTNOTES = [
    r'More familiar to most English readers as ‘Moses’',  # Exod 2:10
]

# Wrong OET explanations of obscure names, replaced with the given text so OET's spelling stays
#     (wrong explanations of well-known names are corrected from the BSB automatically)
#     keyed by (book, chapter, verse, RV name)
EXPLANATION_FIXES:dict[tuple[str, int, int, str], str] = {
    # 'Jew' is the meaning of the name Jehudi; the ' (' also pairs OET's ')' after 'son of Kushi'
    ('jer', 36, 14, 'Yehudi'): ' (',
    ('jer', 36, 21, 'Yehudi'): '',
    # Heliopolis is in Egypt, but this Beth-shemesh is in Judah (Heliopolis is right in Jer 43:13)
    ('2ki', 14, 11, 'Beyt-Shemesh'): '',
    ('2ch', 25, 21, 'Beyt-Shemesh'): '',
}

# RV names also listed as their own traditional name, never to be changed
KEEP_NAMES = {'Yahweh', 'Yah'}

NT_BOOKS = {'mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'php', 'col',
    '1th', '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn',
    'jud', 'rev'}

# Well-known names not found in the New Testament (NT names and book names are added at runtime)
FAMOUS_OT = {
    # People
    'Abednego', 'Abigail', 'Abner', 'Abram', 'Absalom', 'Adonijah', 'Ahab', 'Ahasuerus', 'Artaxerxes',
    'Bathsheba', 'Belshazzar', 'Boaz', 'Caleb', 'Cyrus', 'Darius', 'Deborah', 'Delilah', 'Dinah',
    'Eli', 'Gehazi', 'Goliath', 'Ham', 'Haman', 'Hannah', 'Ishmael', 'Jael', 'Japheth', 'Jehu',
    'Jeroboam', 'Jethro', 'Joab', 'Jonathan', 'Laban', 'Leah', 'Mephibosheth', 'Meshach', 'Michal',
    'Miriam', 'Mordecai', 'Naomi', 'Nebuchadnezzar', 'Nimrod', 'Potiphar', 'Rebekah', 'Sarai',
    'Shadrach', 'Vashti', 'Xerxes', 'Zipporah',
    # Places
    'Ai', 'Ararat', 'Ashdod', 'Ashkelon', 'Assyria', 'Babel', 'Bashan', 'Beersheba', 'Bethel',
    'Carmel', 'Chaldea', 'Eden', 'Edom', 'Ekron', 'Gath', 'Gibeon', 'Gilead', 'Gilgal', 'Goshen',
    'Hebron', 'Horeb', 'Jezreel', 'Lebanon', 'Megiddo', 'Midian', 'Moab', 'Persia', 'Philistia',
    'Sheba', 'Shiloh', 'Tarshish', 'Tigris', 'Ur',
    # Peoples and gods
    'Amalekite', 'Amalekites', 'Ammonite', 'Ammonites', 'Amorite', 'Amorites', 'Assyrian',
    'Assyrians', 'Asherah', 'Canaanite', 'Canaanites', 'Chaldean', 'Chaldeans', 'Chemosh', 'Dagon',
    'Edomite', 'Edomites', 'Hittite', 'Hittites', 'Jebusite', 'Jebusites', 'Medes', 'Midianite',
    'Midianites', 'Moabite', 'Moabites', 'Molech', 'Persian', 'Persians', 'Philistine',
    'Philistines',
}

# Manually chosen names for when BSB doesn't settle it; values are a name, or one per book/segment
FALLBACK_NAMES:dict[str, str|dict[str, str]] = {
    'Mikah': 'Micah',
    'Peleshet': 'Philistia',
    "Shim'on": {'NT': 'Simon'},  # 1 Peter's title, 'Shim’on ‘the Rock’'
    'Hoshea': {'hos': 'Hosea'},  # Headings about the prophet
}

# Nouns after which a group name is used as an adjective ('the Zerahite clan', not 'Zerahites')
GROUP_NOUNS = {'clan', 'clans', 'people', 'family', 'families', 'region', 'tribe', 'tribes',
    'descendants', 'army', 'territory'}

# Names-table kinds (from Comment, e.g. "NT (1) City") that aren't places
PEOPLE_GROUP_KINDS = {'People-group', 'People-groups'}
PERSON_KINDS = {'Man', 'Woman', 'People', 'Name', 'Named', 'Deity', 'Angel', 'Month', 'Festival',
    ''}

HEADING_LINE_REGEX = re.compile(r'\\(s\d?|ms\d?|mr|sr|r|d|sp) ')
NAME_REGEX = re.compile(r"(?<![\w'’\\])[A-Z][\w'’\-]*")
XREF_REGEX = re.compile(r'(\\x .*?\\x\*)')
ND_REGEX = re.compile(r'\\\+?nd\*|\\\+?nd ')


def http_get(url:str) -> bytes:
    """Fetch a URL's body."""
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def load_adapter(adapter_path:Path, oet_ref:str, famous:set[str],
        explained:dict[str, 'ExplainedNames'], stats:collections.Counter[str]) -> types.ModuleType:
    """Import the adapter without tkinter, pinned to an OET commit, with names fixes.

    `explained` is filled with the names each book's OET explanations give (keyed by book code).
    """

    # The GUI is never used (only run_export), so tkinter needn't be installed
    stub = types.ModuleType('tkinter')
    stub.__getattr__ = lambda name: type(name, (), {})  # type: ignore[method-assign]
    for name in ('tkinter', 'tkinter.ttk', 'tkinter.messagebox', 'tkinter.filedialog'):
        sys.modules[name] = stub

    spec = importlib.util.spec_from_file_location('oet_adapter', adapter_path)
    assert spec and spec.loader
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)

    # Download from a fixed OET commit rather than the moving main branch
    adapter.GITHUB_BRANCH = oet_ref
    adapter.RAW_BASE_URL = (f'https://raw.githubusercontent.com/{adapter.GITHUB_OWNER_REPO}/'
        f'{oet_ref}/')

    # The adapter expects a Segment column the names table lacks, so give it one
    # Also drop RV names that can't mean a well-known name, so they keep OET's spelling
    # NOTE Names that could also mean an obscure one are kept so the adapter sees them as ambiguous
    #     (resolve_names then decides per verse)
    original_init = adapter.NamesTable.__init__
    ambiguous:dict[str, set[str]] = collections.defaultdict(set)  # segment -> RV names
    candidates:dict[str, dict[str, set[str]]] = {}  # segment -> RV name -> traditional names
    def names_init(self:object, tsv_text:str) -> None:
        rows = parse_names_table(tsv_text)
        candidates.update(build_rv_names(rows))
        trads:dict[tuple[str, str], set[str]] = collections.defaultdict(set)
        for r in rows:
            trads[(r['segment'], r['rv'])].add(r['trad'])
        for (segment, rv), names in trads.items():
            if len(names) > 1 and rv not in KEEP_NAMES:
                ambiguous[segment].add(rv)
        wanted = {(r['segment'], r['rv']) for r in rows if r['trad'] in famous}
        out = io.StringIO()
        writer = csv.writer(out, delimiter='\t', lineterminator='\n')
        writer.writerow(['TraditionalName', 'RVName', 'Segment'])
        for row in rows:
            if (row['segment'], row['rv']) in wanted:
                writer.writerow([row['trad'], row['rv'], row['segment']])
        original_init(self, out.getvalue())
    adapter.NamesTable.__init__ = names_init

    # Explanations like `Shmuel’ \add !(Samuel¦125728,\add* \add meaning…` would map to 'Samuel,'
    original_explanation = adapter.explanation_traditional_name
    def explanation_name(content:str) -> str|None:
        name = original_explanation(content)
        return name.rstrip(',.;:') or None if name else None
    adapter.explanation_traditional_name = explanation_name

    # The adapter gives every bare name the meaning explained nearest before it (or the book's first
    #     explanation), whoever it refers to: 'No one cared' became 'Thebes one cared' (Ezek 16:5),
    #     'Yakob' became 'Jacob' where it means James (Mark 10:41)
    # So headings first get the meaning explained within their own section, and other bare names
    #     that can mean more than one person/place are hidden from the adapter (with a leading ¦,
    #     which its name regex skips) for resolve_names to check against the BSB verse
    original_change = adapter.change_to_traditional_names
    def change_names(text:str, bbb:str, names_table:object) -> str:
        book = adapter.usfm_code(bbb, text).lower()
        if (BSB_DIR / f'{book}.json').exists():
            text = correct_explanations(adapter, text, book, BsbBook(book),
                candidates.get(adapter.book_section(bbb), {}), famous, stats)
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if HEADING_LINE_REGEX.match(line):
                lines[i] = explain_heading_names(adapter, line, section_lines(lines, i))
        text = '\n'.join(lines)
        book_names = ExplainedNames({trad for _rv, trad in explanations(adapter, lines)}, {})
        explained[book] = book_names
        # Titles before chapter 1 have no verse to check, and the book-wide meaning suits them
        start = text.find('\n\\c ') + 1 or len(text)
        text = text[:start] + hide_ambiguous(adapter, text, start,
            ambiguous[adapter.book_section(bbb)], book_names.at_verse)
        return re.sub(r'¦(?!\d)', '', original_change(text, bbb, names_table))
    adapter.change_to_traditional_names = change_names

    # Keep 'OET' in the text rather than renaming it to 'Adapted OET'
    adapter.add_adapted = lambda text: text
    return adapter


def section_lines(lines:list[str], heading:int) -> list[str]:
    """The lines after a heading up to the next section heading."""
    end = next((i for i in range(heading + 1, len(lines))
        if re.match(r'\\(s\d?|ms\d?) ', lines[i])), len(lines))
    return lines[heading + 1:end]


@dataclasses.dataclass
class ExplainedNames:
    """Traditional names a book's OET explanations give, overall and in force at each verse."""
    names:set[str]
    # (chapter, verse, RV name) -> the explanation the adapter would have used there
    at_verse:dict[tuple[int, int, str], str]


def name_base(adapter:types.ModuleType, name:str) -> str:
    """A name without any possessive suffix, with normalised apostrophes."""
    return adapter.split_possessive(adapter.normalise_apostrophes(name))[0]


def line_explanations(adapter:types.ModuleType, line:str) -> list[tuple[int, str, str]]:
    """(position, RV name, traditional name) for each OET explanation like `\\add !(…)` in a line."""
    found = []
    for match in adapter.EXPLANATION_REGEX.finditer(line):
        trad = adapter.explanation_traditional_name(match.group(2))
        preceding = adapter.PRECEDING_NAME_REGEX.search(
            adapter.WORD_NUMBER_REGEX.sub('', line[:match.start()]))
        if trad and preceding and preceding.group(1)[0].isupper():
            found.append((match.start(), name_base(adapter, preceding.group(1)),
                name_base(adapter, trad)))
    return found


def correct_explanations(adapter:types.ModuleType, text:str, book:str, bsb:'BsbBook',
        candidates:dict[str, set[str]], famous:set[str], stats:collections.Counter[str]) -> str:
    """Apply EXPLANATION_FIXES, and fix OET explanations naming a different well-known person/place
    than the BSB verse does (Mark 10:41 explains 'Ya'akov' as 'Jacob' where the BSB has 'James')."""
    out, ch, v = [], 0, 0
    for line in text.split('\n'):
        if match := re.match(r'\\c (\d+)', line):
            ch, v = int(match.group(1)), 0
        verses = [(m.start(), int(m.group(1))) for m in re.finditer(r'\\v (\d+)', line)]
        if line.startswith('\\rem') or HEADING_LINE_REGEX.match(line):
            out.append(line)
            continue

        def fix(match:re.Match[str]) -> str:
            verse = next((n for pos, n in reversed(verses) if pos < match.start()), v)
            trad = adapter.explanation_traditional_name(match.group(2))
            preceding = adapter.PRECEDING_NAME_REGEX.search(
                adapter.WORD_NUMBER_REGEX.sub('', line[:match.start()]))
            if not trad or not preceding:
                return match.group(0)
            rv = name_base(adapter, preceding.group(1))
            if (key := (book, ch, verse, rv)) in EXPLANATION_FIXES:
                stats[f'explanation:{key}'] += 1
                # \0 marks where a following space must go, so '(' isn't followed by one
                return EXPLANATION_FIXES[key] + ('\0' if EXPLANATION_FIXES[key].endswith('(') else '')
            trad = name_base(adapter, trad)
            options = candidates.get(rv, set())
            bsb_text = bsb.verses.get((ch, verse), '')
            if trad not in options or re.search(rf'(?<!\w){re.escape(trad)}', bsb_text):
                return match.group(0)
            choice = pick_candidate(options, [bsb_text])
            # Forms of one name ('the land of the Chaldeans', BSB 'Chaldea') suit OET's wording
            if not choice or choice not in famous or trad.startswith(choice) \
                    or choice.startswith(trad):
                return match.group(0)
            start, end = match.start(2) - match.start(), match.end(2) - match.start()
            content = re.sub(rf'(?<!\w){re.escape(trad)}', choice, match.group(2), count=1)
            return match.group(0)[:start] + content + match.group(0)[end:]
        out.append(re.sub(r'\0 ?', '', adapter.EXPLANATION_REGEX.sub(fix, line)))
        v = verses[-1][1] if verses else v
    return '\n'.join(out)


def explanations(adapter:types.ModuleType, lines:list[str]) -> list[tuple[str, str]]:
    """(RV name, traditional name) for each OET explanation, in order."""
    return [(rv, trad) for line in lines for _pos, rv, trad in line_explanations(adapter, line)]


def hide_ambiguous(adapter:types.ModuleType, text:str, start:int, ambiguous:set[str],
        at_verse:dict[tuple[int, int, str], str]) -> str:
    """Prefix bare (unexplained) ambiguous RV names in text[start:] with ¦ so the adapter leaves
    them alone, recording the explanation it would have used for each in `at_verse`."""

    # Like the adapter: the explanation nearest before, else the first in the book
    current:dict[str, str] = {}
    for rv, trad in explanations(adapter, text.split('\n')):
        current.setdefault(rv, trad)
    token_regex = re.compile(rf'\\c (\d+)|\\v (\d+)|{adapter.NAME_TOKEN_REGEX.pattern}')

    out, ch, v = [], 0, 0
    for line in text[start:].split('\n'):
        if line.startswith('\\rem'):  # The adapter leaves these alone
            out.append(line)
            continue
        events = line_explanations(adapter, line)

        def hide(match:re.Match[str]) -> str:
            nonlocal ch, v
            if match.group(1):
                ch, v = int(match.group(1)), 0
                return match.group(0)
            if match.group(2):
                v = int(match.group(2))
                return match.group(0)
            while events and events[0][0] < match.start():
                _pos, rv, trad = events.pop(0)
                current[rv] = trad
            token = match.group(3)
            rest = line[match.end():]
            base = name_base(adapter, token)
            # Explained names are right where they're explained, and 'Havah/Eve' forms are handled
            if base not in ambiguous or rest.startswith('/') or re.match(
                    r'(?:¦\d+)?(?:\\\+?[a-z]+\d*\*)*\s*\\\+?add !', rest):
                return token
            if base in current:
                at_verse.setdefault((ch, v, base), current[base])
            return '¦' + token
        out.append(token_regex.sub(hide, line))
        for _pos, rv, trad in events:
            current[rv] = trad
    return '\n'.join(out)


def explain_heading_names(adapter:types.ModuleType, heading:str, section:list[str]) -> str:
    """Change RV names in an ESFM heading to the traditional name first explained in its section."""
    explained:dict[str, str] = {}
    for rv, trad in explanations(adapter, section):
        explained.setdefault(rv, trad)

    def replace(match:re.Match[str]) -> str:
        token = match.group(1)
        # Leave forms like 'Tsidkiyah/Zedekiah' to the adapter, which already handles them
        if heading[match.end():].startswith('/'):
            return token
        base, suffix = adapter.split_possessive(adapter.normalise_apostrophes(token))
        return explained[base] + suffix if base in explained else token
    return adapter.NAME_TOKEN_REGEX.sub(replace, heading)


def parse_names_table(tsv_text:str) -> list[dict[str, str]]:
    """Expand the names table into one (trad, rv, segment) row per OT/NT/DC segment."""
    rows = []
    for row in csv.DictReader(tsv_text.splitlines(), delimiter='\t'):
        trad = (row.get('TraditionalName') or '').strip().replace('’', "'")
        rv = (row.get('RVName') or '').strip().replace('’', "'")
        comment = (row.get('Comment') or '').strip()
        if not trad or not rv:
            continue
        # Segments are only given as the Comment prefix, e.g. "OT/NT/DC (3) People"
        # NOTE The prefix covers the RV name as a whole, so DC-only spellings must be narrowed
        prefix = re.match(r'([A-Z]+(?:/[A-Z]+)*)\b', comment)
        segments = prefix.group(1).split('/') if prefix else ['']
        if 'DC form of' in comment:
            segments = ['DC']
        kind = re.match(r'\S+ \(\d+\) ([A-Za-z\-]+)', comment)
        rows.extend({'trad': trad, 'rv': rv, 'segment': s, 'kind': kind.group(1) if kind else ''}
            for s in segments)
    return rows


class BsbBook:
    """BSB text of a book, for checking which traditional name it uses where."""

    def __init__(self, book:str):
        data = json.loads((BSB_DIR / f'{book}.json').read_text(encoding='utf-8'))
        self.name:str = data['name']['normal']
        if not isinstance(self.name, str) or not self.name:
            raise ValueError(f'No BSB book name for {book}')
        # contents[chapter][verse] is a list of strings and objects (headings/notes)
        # NOTE Notes are excluded as they list textual variants (e.g. 'TR Bosor' beside 'Beor')
        self.verses:dict[tuple[int, int], str] = {}
        for ch, chapter in enumerate(data['contents']):
            for v, verse in enumerate(chapter):
                parts = [p if isinstance(p, str) else p.get('contents', '') for p in verse
                    if isinstance(p, str) or p.get('type') == 'heading']
                self.verses[(ch, v)] = ' '.join(p for p in parts if isinstance(p, str))
        self.chapters = collections.defaultdict(str)
        for (ch, _v), text in self.verses.items():
            self.chapters[ch] += ' ' + text
        self.whole = ' '.join(self.chapters.values())

    def windows(self, ch:int, v:int) -> list[str]:
        """Progressively wider BSB text around a verse: verse, ±1 verse, chapter, book."""
        near = ' '.join(self.verses.get((ch, n), '') for n in (v - 1, v, v + 1))
        return [self.verses.get((ch, v), ''), near, self.chapters.get(ch, ''), self.whole]


def pick_candidate(candidates:set[str], texts:list[str]) -> str|None:
    """Return the only candidate used in the narrowest BSB window that uses any (else None)."""
    for text in texts:
        # Prefer exact forms so 'Ephesians' beats 'Ephesian', then allow plurals ('Amorites')
        for suffix in ('', '(?:e?s)?'):
            # BSB lowercases later parts of compounds (e.g. 'Lebo-hamath', 'Evil-merodach')
            found = {c for c in candidates if re.search(rf'(?:(?<!\w){re.escape(c)}|(?<=-)'
                rf'{re.escape(c[:1].lower() + c[1:])}){suffix}(?!\w)', text)}
            if len(found) == 1:
                return found.pop()
            if len(found) > 1:
                return None  # A wider window can't disambiguate
    return None


def fallback_name(base:str, book:str, segment:str) -> str|None:
    """Get the manually chosen traditional name for an RV name (if any)."""
    choice = FALLBACK_NAMES.get(base)
    return choice.get(book, choice.get(segment)) if isinstance(choice, dict) else choice


def resolve_names(usfm:str, book:str, segment:str, bsb:BsbBook, rv_names:dict[str, set[str]],
        famous:set[str], explained:ExplainedNames, stats:collections.Counter[str]) -> str:
    """Replace RV names the adapter left (ambiguous or in hyphenated compounds) with well-known
    names, or with names the book's OET explanations use."""

    def replace_part(part:str, ch:int, v:int, raw_v:int, after_the:bool) -> str:
        new = choose_part(part, ch, v, raw_v, after_the)
        if new == part:
            return part
        base = re.sub(r"['’]s?$", '', new)
        if base not in famous and base not in explained.names:
            stats['kept_obscure'] += 1
            return part
        stats['changed'] += 1
        return new

    def choose_part(part:str, ch:int, v:int, raw_v:int, after_the:bool) -> str:
        norm = part.replace('’', "'")
        base, suffix = norm, ''
        match = re.fullmatch(r"(.+?)('s|')", norm)
        if match and (match.group(1) in rv_names or match.group(1) in FALLBACK_NAMES):
            base, suffix = match.group(1), part[len(match.group(1)):]
        candidates = rv_names.get(base)
        if not candidates and base not in FALLBACK_NAMES:
            return part
        if candidates and base in candidates:
            # The RV form is also valid (e.g. Azaryah/Azariah, Eleazar/Lazarus, No/Thebes), so only
            #     change it if the BSB verse itself uses another candidate (and not the RV form)
            choice = pick_candidate(candidates, [bsb.windows(ch, v)[0]])
            if not choice and (choice := fallback_name(base, book, segment)):
                stats[f'fallback:{base}'] += 1
            return choice + suffix if choice and choice != base else part
        choice = next(iter(candidates)) if candidates and len(candidates) == 1 \
            else pick_candidate(candidates, bsb.windows(ch, v)) if candidates else None
        if not choice and (choice := fallback_name(base, book, segment)):
            stats[f'fallback:{base}'] += 1
        # When the BSB doesn't settle it, use the OET explanation the adapter would have used
        if not choice and (choice := explained.at_verse.get((ch, raw_v, base))):
            stats['explained'] += 1
        # 'the land of the Kasdim' means the people, so 'Chaldeans' rather than 'Chaldea'
        people = f'{choice}ns'
        if choice and after_the and candidates and people in candidates \
                and (people in famous or people in explained.names):
            choice = people
        return choice + suffix if choice else part

    def replace_token(match:re.Match[str], ch:int, v:int, raw_v:int) -> str:
        token = match.group(0)
        after_the = match.string[:match.start()].endswith('the ')
        # Try a hyphenated name whole first ('Beyt-Lehem' → 'Bethlehem'), as the adapter only saw
        #     its parts (OET numbers each part), then part by part ('Yohan-the-immerser')
        result = replace_part(token, ch, v, raw_v, after_the) if '-' in token else token
        if result == token:
            result = '-'.join(replace_part(p, ch, v, raw_v, after_the) if p[:1].isupper() else p
                for p in token.split('-'))
        following = re.match(r'\s+(\w+)', match.string[match.end():])
        if result != token and result.endswith('ites') and following \
                and following.group(1) in GROUP_NOUNS:
            result = result[:-1]
        return result

    # Headings come before the verse they introduce, so resolve their names against that verse
    in_lines = usfm.split('\n')
    next_verse:list[int|None] = [None] * len(in_lines)
    upcoming:int|None = None
    for i in range(len(in_lines) - 1, -1, -1):
        if match := re.search(r'\\v (\d+)', in_lines[i]):
            upcoming = int(match.group(1))
        elif in_lines[i].startswith('\\c '):
            upcoming = None
        next_verse[i] = upcoming

    lines, ch, v = [], 0, 0
    for i, line in enumerate(in_lines):
        if match := re.match(r'\\c (\d+)', line):
            ch, v = int(match.group(1)), 0
        if line.startswith(('\\id', '\\ide', '\\rem', '\\toc', '\\usfm')):
            lines.append(line)
            continue
        heading_v = next_verse[i] if HEADING_LINE_REGEX.match(line) else None
        out = []
        # Track verse changes mid-line and leave cross-reference book abbreviations alone
        for piece in re.split(r'(\\v \d+)', line):
            if match := re.fullmatch(r'\\v (\d+)', piece):
                v = int(match.group(1))
                out.append(piece)
                continue
            verse = heading_v or v
            out.append(''.join(chunk if chunk.startswith('\\x ') else NAME_REGEX.sub(
                lambda m: replace_token(m, ch, verse, v), chunk)
                for chunk in XREF_REGEX.split(piece)))
        lines.append(''.join(out))
    # A gloss like `‘Kalev’ (Caleb)` becomes `‘Caleb’ (Caleb)` once the name is changed
    return re.sub(r'‘([\w’\-]+)’ \(\1\)', r'‘\1’', '\n'.join(lines))


def remove_stale_footnotes(usfm:str, stats:collections.Counter[str]) -> str:
    """Remove the footnotes listed in STALE_FOOTNOTES."""
    def check(match:re.Match[str]) -> str:
        for pattern in STALE_FOOTNOTES:
            if re.search(pattern, match.group(0)):
                stats[f'footnote:{pattern}'] += 1
                return ''
        return match.group(0)
    return re.sub(r'\\f .*?\\f\*', check, usfm)


def fix_book_titles(usfm:str, name:str) -> str:
    """Use the standard book name, and the OET's own title (from \\mt lines) as the long name."""

    # OET titles are like `\mt2 Paul’s letter to the believers in` `\mt1 Ephesus` `\mt2 (Ephesus)`
    #     where the bracketed line glossed the RV name, so is now a duplicate
    lines = usfm.split('\n')
    titles = [(i, m.group(1), m.group(2).strip()) for i, line in enumerate(lines)
        if (m := re.match(r'\\(mt\d?) (.*)', line))]
    long_parts = []
    for _i, _marker, text in titles:
        if text.startswith('(') or text == 'commonly called':
            break
        long_parts.append(text)
    main_title = next((text for _i, marker, text in titles if marker in ('mt', 'mt1')), None)
    drop = {i for i, _marker, text in titles if text == f'({main_title})'}

    out = []
    for i, line in enumerate(lines):
        if i in drop or line.startswith(('\\toc1 ', '\\toc3 ')):
            continue  # OET abbreviations (e.g. 'Yhn') are RV-name based, so omit
        if line.startswith(('\\h ', '\\toc2 ')):
            line = f'{line.split(" ", 1)[0]} {name}'
            if line.startswith('\\toc2') and long_parts:
                out.append(f'\\toc1 {" ".join(long_parts)}')
        out.append(line)
    return '\n'.join(out)


def build_rv_names(rows:list[dict[str, str]]) -> dict[str, dict[str, set[str]]]:
    """Map segment -> RV name -> traditional candidates, for RV names never used traditionally."""
    all_trads = {r['trad'] for r in rows}
    kinds:dict[tuple[str, str], dict[str, str]] = collections.defaultdict(dict)
    for r in rows:
        if r['rv'] not in KEEP_NAMES:
            kinds[(r['segment'], r['rv'])][r['trad']] = r['kind']
    by_segment:dict[str, dict[str, set[str]]] = collections.defaultdict(dict)
    for (segment, rv), trads in kinds.items():
        # Skip RV names that are unchanged ('Hebron') or another name's traditional form, but keep
        #     those also listed as their own traditional form alongside others ('Azaryah')
        if rv in trads:
            # OET uses such names for the clan too ('the men of Gershon and Merari')
            trads = {t: k for t, k in trads.items() if k not in PEOPLE_GROUP_KINDS}
        if set(trads) == {rv} or (rv in all_trads and rv not in trads):
            continue
        # NT city names (Efesos, Thessalonikai) also cover their people ("people from Efesos"),
        #     so a demonym in the BSB verse ("Artemis of the Ephesians") mustn't override the place
        places = {t for t, k in trads.items() if k not in PERSON_KINDS | PEOPLE_GROUP_KINDS}
        if segment == 'NT' and places:
            trads = {t: k for t, k in trads.items() if k not in PEOPLE_GROUP_KINDS}
        by_segment[segment][rv] = set(trads)
    return by_segment


def update_meta_date() -> None:
    """Set the source date in meta.json, editing only that line (the rest is maintained by hand)."""
    path = OUT_DIR / 'meta.json'
    text = path.read_text(encoding='utf-8')
    today = datetime.date.today().isoformat()
    text, count = re.subn(r'("updated": )"[^"]*"', rf'\1"{today}"', text, count=1)
    if count != 1:
        raise ValueError(f'No source "updated" field in {path}')
    path.write_text(text, encoding='utf-8')


def famous_names() -> set[str]:
    """Names readers would know: those in the BSB New Testament, book names, and FAMOUS_OT."""
    names = set(FAMOUS_OT)
    for path in BSB_DIR.glob('*.json'):
        book = BsbBook(path.stem)
        # e.g. '1 Samuel' -> 'Samuel' (multi-word names like 'Song of Solomon' aren't needed)
        names.add(re.sub(r'^\d ', '', book.name))
        if path.stem in NT_BOOKS:
            names.update(re.findall(r'[A-Z][a-z]+', ' '.join(book.verses.values())))
    return names


def main() -> None:
    """Generate the eng_ev source zip and meta."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--oet-ref', help='OET repo commit (default: current main)')
    args = parser.parse_args()
    oet_ref = args.oet_ref or json.loads(http_get(f'{OET_REPO_API}/commits/main'))['sha']
    print(f'Using OET commit {oet_ref}')
    famous = famous_names()

    with tempfile.TemporaryDirectory() as temp:
        temp_dir = Path(temp)
        adapter_path = temp_dir / 'adapter' / 'OET_adapter.py'
        adapter_path.parent.mkdir()
        adapter_path.write_bytes(http_get(ADAPTER_URL))
        explained:dict[str, ExplainedNames] = {}
        stats:collections.Counter[str] = collections.Counter()
        adapter = load_adapter(adapter_path, oet_ref, famous, explained, stats)
        adapter.EXPORTED_FILES_FOLDER = temp_dir / 'export'
        source = adapter.Source('temp', log=lambda _msg: None)
        export_dir = adapter.run_export(source, ADAPTER_ANSWERS, log=lambda _msg: None)

        rows = parse_names_table(source.read_text(adapter.NAMES_TABLE_PATH))
        rv_names = build_rv_names(rows)

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(OUT_DIR / 'source.zip', 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for usfm_path in sorted(export_dir.glob('*.USFM')):
                usfm = usfm_path.read_text(encoding='utf-8')
                book = re.match(r'\\id (\w{3})', usfm).group(1).lower()  # type: ignore[union-attr]
                # Front matter has no BSB equivalent (the adapter already handled its names)
                if (BSB_DIR / f'{book}.json').exists():
                    segment = 'NT' if book in NT_BOOKS else 'OT'
                    bsb = BsbBook(book)
                    usfm = resolve_names(usfm, book, segment, bsb, rv_names[segment], famous,
                        explained.get(book, ExplainedNames(set(), {})), stats)
                    usfm = fix_book_titles(usfm, bsb.name)
                    usfm = remove_stale_footnotes(usfm, stats)
                usfm = ND_REGEX.sub('', usfm)
                zip_file.writestr(f'{book}.usfm', usfm)

    update_meta_date()
    print(f"Names changed after the adapter: {stats['changed']}, "
        f"kept in OET spelling as not well known: {stats['kept_obscure']}")
    # Flag manual entries that no longer match, as the OET text may have changed
    unused = [n for n in FALLBACK_NAMES if not stats[f'fallback:{n}']]
    unused += [p for p in STALE_FOOTNOTES if not stats[f'footnote:{p}']]
    unused += [f'explanation {k}' for k in EXPLANATION_FIXES if not stats[f'explanation:{k}']]
    if unused:
        print('WARNING unused manual entries:', ', '.join(unused))


if __name__ == '__main__':
    main()
