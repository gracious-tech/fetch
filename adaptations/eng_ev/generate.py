#!/usr/bin/env python3
"""Generate the eng_ev source (Everyday Version: OET Readers' Version with traditional names) for
the official collection, using the OET adapter (https://github.com/Freely-Given-org/OpenEnglishTranslation_adapter).

Only well-known names are changed (those in the New Testament, Bible book names, and FAMOUS_OT);
less familiar names keep OET's spelling, except where OET itself explains them inline.

Steps: run the adapter headlessly (traditional names, otherwise defaults) → resolve names the
adapter left ambiguous by checking which candidate the BSB uses in the same verse → strip \\nd
(OET marks nomina sacra with it, which would render as small caps) → write source.zip and update
the date in meta.json (which is otherwise maintained by hand).

Usage: python3 -I adaptations/eng_ev/generate.py [--oet-ref <commit>]
Then: .bin/collector_official download --recheck eng_ev && .bin/collector_official process eng_ev
(Without --recheck, download skips the already-extracted source and process uses stale files.)
"""

import argparse
import collections
import csv
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
}

# Nouns after which a group name is used as an adjective ('the Zerahite clan', not 'Zerahites')
GROUP_NOUNS = {'clan', 'clans', 'people', 'family', 'families', 'region', 'tribe', 'tribes',
    'descendants', 'army', 'territory'}

# Names-table kinds (from Comment, e.g. "NT (1) City") that aren't places
PEOPLE_GROUP_KINDS = {'People-group', 'People-groups'}
PERSON_KINDS = {'Man', 'Woman', 'People', 'Name', 'Named', 'Deity', 'Angel', 'Month', 'Festival',
    ''}

NAME_REGEX = re.compile(r"(?<![\w'’\\])[A-Z][\w'’\-]*")
XREF_REGEX = re.compile(r'(\\x .*?\\x\*)')
ND_REGEX = re.compile(r'\\\+?nd\*|\\\+?nd ')


def http_get(url:str) -> bytes:
    """Fetch a URL's body."""
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def load_adapter(adapter_path:Path, oet_ref:str, famous:set[str]) -> types.ModuleType:
    """Import the adapter without tkinter, pinned to an OET commit, with names-table fixes."""

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
    def names_init(self:object, tsv_text:str) -> None:
        rows = parse_names_table(tsv_text)
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

    # Keep 'OET' in the text rather than renaming it to 'Adapted OET'
    adapter.add_adapted = lambda text: text
    return adapter


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
        famous:set[str], stats:collections.Counter[str]) -> str:
    """Replace well-known RV names the adapter left (ambiguous or in hyphenated compounds)."""

    def replace_part(part:str, ch:int, v:int) -> str:
        new = choose_part(part, ch, v)
        if new == part:
            return part
        base = re.sub(r"['’]s?$", '', new)
        if base not in famous:
            stats['kept_obscure'] += 1
            return part
        stats['changed'] += 1
        return new

    def choose_part(part:str, ch:int, v:int) -> str:
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
            return choice + suffix if choice and choice != base else part
        choice = next(iter(candidates)) if candidates and len(candidates) == 1 \
            else pick_candidate(candidates, bsb.windows(ch, v)) if candidates else None
        if not choice and (choice := fallback_name(base, book, segment)):
            stats[f'fallback:{base}'] += 1
        return choice + suffix if choice else part

    def replace_token(match:re.Match[str], ch:int, v:int) -> str:
        token = match.group(0)
        # Try a hyphenated name whole first ('Beyt-Lehem' → 'Bethlehem'), as the adapter only saw
        #     its parts (OET numbers each part), then part by part ('Yohan-the-immerser')
        result = replace_part(token, ch, v) if '-' in token else token
        if result == token:
            result = '-'.join(replace_part(p, ch, v) if p[:1].isupper() else p
                for p in token.split('-'))
        following = re.match(r'\s+(\w+)', match.string[match.end():])
        if result != token and result.endswith('ites') and following \
                and following.group(1) in GROUP_NOUNS:
            result = result[:-1]
        return result

    lines, ch, v = [], 0, 0
    for line in usfm.split('\n'):
        if match := re.match(r'\\c (\d+)', line):
            ch, v = int(match.group(1)), 0
        if line.startswith(('\\id', '\\ide', '\\rem', '\\toc', '\\usfm')):
            lines.append(line)
            continue
        out = []
        # Track verse changes mid-line and leave cross-reference book abbreviations alone
        for piece in re.split(r'(\\v \d+)', line):
            if match := re.fullmatch(r'\\v (\d+)', piece):
                v = int(match.group(1))
                out.append(piece)
                continue
            out.append(''.join(chunk if chunk.startswith('\\x ') else NAME_REGEX.sub(
                lambda m: replace_token(m, ch, v), chunk)
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
        adapter = load_adapter(adapter_path, oet_ref, famous)
        adapter.EXPORTED_FILES_FOLDER = temp_dir / 'export'
        source = adapter.Source('temp', log=lambda _msg: None)
        export_dir = adapter.run_export(source, ADAPTER_ANSWERS, log=lambda _msg: None)

        rows = parse_names_table(source.read_text(adapter.NAMES_TABLE_PATH))
        rv_names = build_rv_names(rows)
        stats:collections.Counter[str] = collections.Counter()

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
                        stats)
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
    if unused:
        print('WARNING unused manual entries:', ', '.join(unused))


if __name__ == '__main__':
    main()
