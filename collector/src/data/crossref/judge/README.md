
# LLM judging campaign (one-time)

This folder holds the **one-time** campaign that classified every OpenBible cross-reference pair
into our categories using an LLM judge. Its permanent output is `results.json` — the full record
of every judgment (category, one-line point, salience 0-5), committed to the repo.

**Future users never run this.** The crossref pipeline (`collector crossref`) only *interprets*
the recorded results via `../judged.ts` — thresholds, caps, and cross-checks against our own
original-language analysis can all be iterated there without re-running any LLM.

## Structure

- `results.json` — the permanent judgment record, keyed by pair
  (`book,sc,sv,ec,ev>book,sc,sv,ec,ev`). Spans are encoded in the keys, so interpretation needs
  no other data source.
- `campaign.ts` — pool building (raw OpenBible zip → canonical, range-folded), the judge prompt
  (the single source of truth), and the slice/merge/status tooling. The pool is EVERY OpenBible
  pair with BSB text on both sides — pairs the algorithmic detectors also find are included
  (~0.3% of the pool) so the record is complete and detector thresholds stay freely tunable;
  exact duplicates are deduped at publish time in `../index.ts`.
- `run.ts` — campaign CLI: `node collector/dist/data/crossref/judge/run.js <action>`.
- `state/` — transient campaign state (slices, wave outputs). Gitignored.

## How the campaign runs

Judging happens in Claude Code sessions via subagents (Sonnet), on the maintainer's Claude
subscription — no API key is involved anywhere. `results.json` is the only progress state:
a key present means that pair is done; pending is always recomputed as pool minus results,
so every step is idempotent and any session can resume cold.

Waves run strictly serially — ONE subagent at a time, never in parallel. Time is not the
constraint (nightly windows have hours to burn through the session limit); losing work is.
Agents append judgments incrementally, so when the limit kills the session only the single
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

### Unattended overnight runs

`night.sh` automates the above: it sleeps until its nightly windows (22:30-03:15 and
03:30-08:00 by default), then repeatedly launches headless Claude Code sessions
(`claude -p … --dangerously-skip-permissions`) that run waves until the cutoff. When a session
hits the subscription limit, it parses the reset time from the CLI's output and sleeps straight
through to it (or abandons the window if the reset falls after the cutoff), and it exits for
good once everything is judged. This burns session limits overnight while leaving daytime
capacity free. Run it
detached: `tmux new -d -s judging collector/src/data/crossref/judge/night.sh` — progress and
session output land in `state/night.log`.

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

The `theme` category exists only in the record: it distinguishes "loosely related by topic"
from "no connection at all" so that information is not lost (the campaign is one-time), and it
gives the judge a legitimate home for below-the-bar pairs, sharpening the `relevant` boundary.
It is never published; if a use emerges later, handle it in `../judged.ts` (e.g. review
"theme, salience 3+" as promotion candidates).

## Post-campaign TODOs (interpretation layer)

Decisions deliberately deferred until the full record exists — all live in `../judged.ts` /
`../distribute.ts` and need no re-judging. **Not part of the campaign: judging sessions must
never act on these.** Pool measurements are from 2026-07-05 (306,272 pairs).

- **Overlap-aware dedupe of near-duplicate pairs.** ~9.3k containment pairings share an
  identical side A and ~9.5k share side B (~6% of the pool on each axis) — OpenBible carries
  both a verse-level and a range row that folding can't unify (e.g. `gen 2:1-2 > heb 4:3-4`
  vs `… > heb 4:4`). Both variants are judged on purpose (the judge's per-variant category +
  salience is the evidence for picking the right one); the exact-key dedupe in `../index.ts`
  will NOT catch them, so without this they publish as visible near-duplicates. Rule sketch:
  cluster pairs where one side is identical and the other side is contained, keep one per
  cluster — highest salience, tie-broken by category priority (quotation > parallel > …), then
  by the narrower (more specific) span. Validate against real judgments first (how often do
  variants actually score differently?).
- **Wide-span policy.** 2,361 pairs (0.77%) have a side longer than 15 verses (the judge only
  saw the first 15, with a trailing ellipsis); mostly legitimate whole-account `mention` links
  (Psa 78:12 ↔ Exo 7-12). Two separate concerns: (a) forward specificity — check whether wide
  spans cluster at high salience or the ≥3 threshold already prunes the vague ones; (b) reverse
  fan-out — a wide span back-links from every verse in its range, so consider direction-aware
  emission in `../distribute.ts`: always emit the narrow→wide direction, but skip (or anchor at
  the range's start verse) the reverse direction when the source span exceeds ~15 verses. Note
  a blunt verse cap would delete legitimate mentions — Luke 17:32 → Gen 19 spans 38 verses.
- **`theme` promotion review.** As above: once tallies exist, review "theme, salience 3+" as
  candidates for `relevant` promotion, or drop the category for good.
