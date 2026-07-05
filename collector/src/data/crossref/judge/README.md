
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
- `campaign.ts` — pool building (raw OpenBible zip → canonical, range-folded, minus pairs the
  algorithmic detectors already cover), the judge prompt (the single source of truth), and the
  slice/merge/status tooling.
- `run.ts` — campaign CLI: `node collector/dist/data/crossref/judge/run.js <action>`.
- `state/` — transient campaign state (slices, wave outputs). Gitignored.

## How the campaign runs

Judging happens in Claude Code sessions via parallel subagents (Sonnet), on the maintainer's
Claude subscription — no API key is involved anywhere. `results.json` is the only progress
state: a key present means that pair is done; pending is always recomputed as pool minus
results, so every step is idempotent and any session can resume cold.

Per session, repeat waves until stopping:

1. `node collector/dist/data/crossref/judge/run.js status` — progress + tallies.
2. `... run.js slices 5` — writes `state/slice_0..4.json` (400 pending pairs each, BSB text).
3. Spawn one subagent per slice (model: sonnet). Prompt = the instructions below, with N filled
   in. Each writes `state/out_N.json`.
4. When all agents finish: `... run.js merge` — validates outputs, merges into `results.json`,
   deletes consumed state files. Malformed entries are rejected and simply stay pending.
5. Next wave (back to 2), or stop — nothing in flight is ever lost beyond the current wave.

### Unattended overnight runs

`night.sh` automates the above: it sleeps until its nightly windows (22:30-03:15 and
03:30-08:00 by default), then repeatedly launches headless Claude Code sessions
(`claude -p … --dangerously-skip-permissions`) that run waves until the cutoff or until the
session limit is hit (detected as repeated quick failures), and exits for good once everything
is judged. This burns session limits overnight while leaving daytime capacity free. Run it
detached: `tmux new -d -s judging collector/src/data/crossref/judge/night.sh` — progress and
session output land in `state/night.log`.

### Subagent prompt template

> You are acting as a Bible cross-reference classifier. Read the file
> `<repo>/collector/src/data/crossref/judge/state/slice_N.json` — an array of pairs of Bible
> passages, each with `key`, `ref_a`, `text_a`, `ref_b`, `text_b`.
>
> Classify EVERY pair using exactly these criteria:
>
> [paste `JUDGE_PROMPT` from campaign.ts verbatim]
>
> Write your judgments to `<repo>/collector/src/data/crossref/judge/state/out_N.json` as a
> single JSON object keyed by each pair's `key`, each value being
> `{"category": "quotation"|"parallel"|"allusion"|"mention"|"relevant"|"theme"|"none",
> "point": "one short line naming the connection (empty string if none)", "salience": 0-5}`.
> Judge every pair (output must have exactly as many keys as the input array); base judgments
> only on the given texts and references; be strict — most weak pairs are "none"; the final file
> must be valid JSON. When done, reply with just the count judged and a one-line category
> distribution.

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
