# Engine B — the per-line belief-map reconstruction engine

A high-level explanation of how Engine B reconstructs a file's history from Claude Code
transcripts, and why it is built around a per-line "belief map."

---

## What it does

Given a target file, Engine B reconstructs what that file looked like over time using only
**recorded evidence** — the JSONL transcripts of Claude Code sessions (plus file-history
snapshots and git, as fallbacks). It then compares its reconstruction against a known
reference (the on-disk file, a snapshot, or a git blob) and emits a **verdict**: does the
reconstruction match, and if not, exactly which lines diverge and why.

The guiding rule is **never fabricate**. A line the transcripts never witnessed stays
explicitly unknown; a contradiction is recorded as a conflict, not silently smoothed over.
The engine reports what it can prove and honestly flags what it cannot.

---

## The core idea: a per-line belief map

Instead of replaying whole-file snapshots, Engine B keeps a **map from line number to a
belief about that line**:

```
belief = {
  entries: { 1: <entry>, 2: <entry>, ... },   // line number -> belief about that line
  lastLine: N,                                 // the highest line currently believed to exist
  eofConfirmed: bool,                          // do we actually know where the file ends?
  lastBeaconMs: <time>                         // when truth was last established
}
```

Each `entry` is a single line's claim:

```
{ state, text, confirmedAtMs, evidence }
```

- **state** — how strongly we believe it:
  - `authored` / `observed` — directly witnessed (an edit wrote it, or a read/snapshot saw it),
  - `presumed` — carried forward from an earlier belief but not re-confirmed at this moment,
  - `unknown` — a line we know *exists* but whose content we've never seen.
- **text** — the believed content (or `null` when unknown).
- **confirmedAtMs** — when this belief was last set.
- **evidence** — a back-reference into the transcript (which record/span/blob justifies this
  line). Provenance is first-class: every believed line can point at the proof behind it.

Why per-line rather than whole-file? Because the evidence *is* per-line and partial. An
`Edit` splices a few lines; a `head`/`sed` read witnesses a line range; a `grep` witnesses
scattered matches; a snapshot witnesses everything. A line-addressed map lets each line
accumulate its own evidence independently, lets the engine hold "some lines known, others
unknown" without lying, and lets it track file *extent* (where the file ends) separately
from line *content*.

---

## Events: one schema for every kind of evidence

Every piece of evidence becomes an **event** with a uniform shape and exactly one non-null
"kind" sub-object (the non-null sub-object *is* the kind — there is no separate kind string):

```
{ jsonl, jsonlLine, unixMs, timestamp, <oneKind>: {...}, ...others null }
```

Kinds fall into tiers (`api/file-event-kinds.js`):

- **Tier-1 beacons** establish truth: `snapshot`, `write`, `fileAbsent`. They overwrite the
  belief — after a Write, every line is known.
- **Authored edits**: `edit` (an old→new splice that can shift line numbers), plus
  `originalFile` (the whole pre-edit file an Edit implies).
- **Observations** corroborate or contradict without necessarily owning the whole file:
  `readFull`, `cat` (whole-file overlays), `readChunk`, `bashReadChunk`, `bashGrep`,
  `grepMatches`, `patchContext` (sparse/partial overlays), `bashExtent` (a lower bound on
  length), `bashRm`/`bashTruncate`/`bashAppend` (Bash file ops), `userModified` (an
  out-of-band change flag).
- **Transforms**: `scriptExecution` — a recorded script run that rewrote files. Unlike the
  others it carries no literal content; it carries a *transform spec* applied at replay time
  against whatever the belief holds then (see below).

A line of evidence usually doesn't store its content inline — it stores a **reference** and
the content is *materialized* on demand from the transcript span or snapshot blob
(`api/line-state-evidence.js`). This keeps events light and provenance exact.

---

## From transcripts to events to one timeline

1. **Extraction** (`api/file-events-extractors.js#extractFileEventsFromText`): turn ONE
   transcript into events for the target file's alias set, by running ~10 specialized
   sub-extractors (one per evidence kind) and merging their output.
2. **Gathering** (`api/reconstruct-file.js#reconstructFileWithSeed`): a file may be referenced
   across many sessions, and may have been renamed/copied over time. The engine:
   - follows recorded `cp`/`mv`/`git mv` lineage to find all **alias paths** of the file,
   - computes **alias windows** (which path identifies the file during which time interval),
   - discovers every transcript that references those aliases (across the combined main +
     subagent cache) and extracts events from each,
   - filters events to those falling inside a valid alias window,
   - chooses a **reference** for comparison: on-disk file → else latest snapshot → else git.

The result is one time-ordered stream of events drawn from genuine recorded evidence.

---

## The replay loop

`api/track-line-states.js#trackLineStates` is the heart. It:

1. **Sorts events by time** and groups those sharing a millisecond.
2. **Applies each group in order** via `api/apply-one-event.js#applyOneEvent`, which dispatches
   on the event's kind and mutates the belief map:
   - a **beacon** overwrites belief (Write/snapshot set every line; `fileAbsent` clears it),
   - an **edit** splices old→new and shifts subsequent line numbers,
   - an **observation** overlays the lines it witnessed, recording a **conflict** wherever the
     observed text contradicts what belief held,
   - a **`scriptExecution`** applies its transform (e.g. whole-token renames) to the lines the
     belief currently knows, honoring the script's own safety semantics (skip+flag on a
     count-assertion mismatch rather than writing a partial result).
3. After each group, **degrades untouched lines to `presumed`** — they're still believed, but
   the engine records that they weren't re-confirmed at this instant.
4. Records a **timeline entry** per timestamp (a snapshot of belief at that moment), so the
   whole history is queryable, not just the final state.

Conflicts are collected throughout and then collapsed into coherent runs
(`conflict-cascade-collapse`) so a single divergence isn't reported as dozens of line noise.

A subtle but important rule: **transforms can't be pre-computed into content**. A script
rename's effect depends on what the file actually contained *at the moment it ran*, which is
only known mid-replay. So a `scriptExecution` event carries the *recipe* and is executed
against the live belief when the timeline reaches `T`, exactly like the real script saw the
real file.

---

## The verdict

After replay, `api/final-line-verdict.js` compares the final belief against the chosen
reference, line by line, bucketing each line into per-line stats:

- **matchedObserved** — reconstructed line matches the reference and was directly witnessed,
- **matchedPresumed** — matches, but was carried forward rather than re-confirmed,
- **mismatched** — reconstruction disagrees with the reference (recorded with both texts),
- **neverObserved** — a reference line the transcripts never touched (a genuine evidence gap),
- plus **tailUncertain** when the file's end (EOF/extent) couldn't be proven.

`api/reconstruction-coverage.js` then classifies the file: **PASS** (byte-perfect),
**FAIL** (concrete mismatches), or **INDETERMINATE** (not enough evidence to judge). Because
the verdict is per-line with provenance, a FAIL points at the exact lines and the reason —
which is what makes the engine useful for finding real gaps (e.g. the "a script rewrote these
files and left no edit record" case that motivated the `scriptExecution` work).

---

## Design principles, in one place

- **Evidence-grounded:** every believed line traces back to a recorded span, blob, or
  transform recipe. Nothing is invented.
- **Per-line + per-tier:** content, extent, and certainty are tracked independently, so the
  engine can be precise about partial knowledge.
- **Time-ordered, monotonic intent:** replay in recorded order; beacons set truth,
  observations corroborate, edits splice, transforms transform.
- **Honest about uncertainty:** contradictions become conflicts; unwitnessed lines stay
  unknown; ambiguous EOF stays uncertain. Flag, don't fabricate.
- **Lineage-aware:** renames/copies are followed so a file's history isn't lost at a `mv`.

---

## A tiny worked example

```
T0  Write "api/x.js" = ["a = eventsForOp()", "b = 2"]   → both lines authored, eofConfirmed
T1  (a script run renames eventsForOp → extractEvents)   → scriptExecution transform at T1
T2  reference (on-disk) = ["a = extractEvents()", "b = 2"]
```

Replay: at T0 belief = the two written lines. At T1 the transform rewrites line 1 in place
(`eventsForOp → extractEvents`) against the live belief; line 2 is untouched. Final belief ==
the on-disk reference ⇒ **PASS**, with line 1 attributed to the recorded script run. Had the
engine *not* modeled the run, it would have reconstructed the pre-rename text and reported a
one-line **mismatch** — correctly flagging that something happened it couldn't yet explain.
