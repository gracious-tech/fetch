
# LLM judging campaign

This folder holds the campaign that classified every candidate cross-reference pair into our
categories using an LLM judge. Its permanent output is `results.json` — the full record of every
judgment (category, one-line point, salience 0-5), committed to the repo.

**The main campaign is complete; normal builds never run this.** The crossref pipeline
(`collector crossref`) only *interprets* the recorded results via `../judged.ts` — thresholds,
sizes, and cross-checks against our own original-language analysis can all be iterated there
without re-running any LLM. A short top-up session is only needed when new candidate pairs
appear (a re-tuned detector, or a new OpenBible release) — `run.js status` shows them as pending.

## Structure

- `results.json` — the permanent judgment record, keyed by pair
  (`book,sc,sv,ec,ev>book,sc,sv,ec,ev`). Spans are encoded in the keys, so interpretation needs
  no other data source. Read from the source tree only (not shipped in the npm package).
- `campaign.ts` — pool building, the judge prompt (the single source of truth), and the
  slice/merge/status tooling. The pool is every OpenBible pair (raw zip → canonical,
  range-folded) plus every link our own detectors find, each with BSB text on both sides;
  exact duplicates are deduped at publish time in `../index.ts`.
- `run.ts` — campaign CLI: `node collector/dist/data/crossref/judge/run.js <action>`.
- `state/` — transient campaign state (slices, wave outputs). Gitignored.

## How the campaign runs

Judging happens in Claude Code sessions via subagents (Sonnet), on the maintainer's Claude
subscription — no API key is involved anywhere. `results.json` is the only progress state:
a key present means that pair is done; pending is always recomputed as pool minus results,
so every step is idempotent and any session can resume cold.

Waves run strictly serially — ONE subagent at a time, never in parallel. Time is not the
constraint; losing work is. Agents append judgments incrementally, so when the limit kills the session only the single
in-flight agent is interrupted, and even it keeps everything appended so far.

Per session, repeat waves until stopping:

1. `node collector/dist/data/crossref/judge/run.js status` — progress + tallies.
2. `... run.js slices 1` — writes `state/slice_0.json` (400 pending pairs, BSB text) plus
   `state/prompt.txt`, the exact subagent prompt.
3. Spawn ONE subagent for the slice (model: sonnet). Prompt = `state/prompt.txt` verbatim with
   `N` replaced by the slice number — never paraphrase or shorten it, so judging stays
   consistent across sessions. The subagent appends judgments to `state/out_N.jsonl` as it
   works.
4. When the agent finishes: `... run.js merge` — validates outputs line by line, merges into
   `results.json`, deletes consumed state files. Partial output from an interrupted agent
   merges fine (its unjudged pairs simply stay pending); malformed lines and orphaned output
   files are rejected likewise.
5. Next wave (back to 2), or stop — nothing in flight is ever lost beyond the last unwritten
   batch of judgments.

### Subagent prompt

`run.js slices` writes the exact subagent prompt to `state/prompt.txt`, generated from
`JUDGE_PROMPT` in `campaign.ts` (the single source of truth) with absolute file paths baked in.
Use it verbatim, only replacing `N` with the slice number.

## Calibration history

A 1,000-pair pilot (2026-07-04, Sonnet subagents) set the current prompt and thresholds:
uncalibrated, the judge parked weak thematic pairs at salience 2 instead of rejecting them
(keep-rate 61%); salience ≥3 is where quality held up (≈38% keep). The judge records category
(kind) and salience (strength) independently and never self-censors — the ≥3 threshold is
applied ONLY in `../judged.ts`, so it stays re-tunable against the full record.
The pilot also ruled out workload reducers: vote thresholds lose too much
(59% of good references sit in the 1-4 vote band), and a Haiku pre-screen constrained to be safe
only rejected 8.6% while costing more than it saved. Votes are ignored entirely throughout.

Judged text is the BSB (English) only, up to 15 verses per span. Known implication: allusions
that only surface in the original languages are invisible to the judge — allusion coverage
relies primarily on the algorithmic passes and BSB footnotes.

The `theme` category distinguishes "loosely related by topic" from "no connection at all" so
that information is not lost (pairs are never re-judged), and it gives the judge a legitimate
home for below-the-bar pairs, sharpening the `relevant` boundary. Only "theme, salience 3+" is
published, as `relevant` (~2k pairs that read like borderline relevant links).

## Interpretation (post-campaign)

The campaign completed 2026-11-06 with all 306,272 pairs judged. How the record is interpreted
lives in `../judged.ts` / `../index.ts` and needs no re-judging:

- **Two published sizes.** Each category publishes a full set (`{category}/`, salience 3+) and a
  small set (`{category}_small/`, salience 4+). There is no per-verse cap — apps choose a size
  instead.
- **Our own detectors' links are judged too.** The pool also includes every link the
  algorithmic detectors find (BSB footnotes, Greek wording matches, retellings), so they get the
  same salience thresholds; their category still comes from the detector. Any not yet judged
  (e.g. after re-tuning a detector) publish in both sizes, ranked just below salience 5, until a
  campaign session judges them — `run.js status` shows them as pending.
- **Best first.** Within each verse, links are ordered by salience (highest first), so apps can
  show the top few without the score itself being published.
- **Near-duplicate variants.** OpenBible often carries both a verse-level and a range row for
  one connection (`gen 2:1-2 > heb 4:3-4` vs `… > heb 4:4`). Where one side is identical and the
  other contains the other, the variant with higher salience is kept, then the stronger
  category, then the narrower span. Algorithmic links are checked against judged variants too
  (the stronger category wins; on a tie the judged link, since the judge saw both texts).
- **Wide spans** need no special handling in the data: a range is stored once per book file as
  a single entry (`gen 19:1-38 → luk 17:32`), so how it is displayed is up to each app.
