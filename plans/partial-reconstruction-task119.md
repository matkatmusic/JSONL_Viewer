# Task 119 — Partial reconstruction: surface recoverable file states when full reconstruction fails

All source work happens in the **jfred submodule** (`RevEng/jfred/`), never in `~/Programming` clones.
Engine code: `jfred/src/`. Webapp code: `jfred/webapp/`. Tests: `jfred/tests/*.test.ts`
(runner is `node --import tsx --test tests/*.test.ts` via root `package.json` — **but see the
hard constraint below**).

Follow `plans/coding-requirements.md` (RevEng root): domain types (`Uuid`/`Path`/`Date`), wire
enums live in `src/structures/vocabulary.ts`, enum-member comparisons, verb-named functions, no
re-export shims. Follow `~/.claude/guides/tdd.md`: for every behavior, WRITE the test first
(RED), then the minimum code (GREEN).

## HARD CONSTRAINT — do not run tests

The user will run all tests themselves after this work is staged. **Write every test listed
here, but do not execute `npm test`, `node --test`, or any suite.** The only allowed
verification commands are `npm install` (if `node_modules` is absent in `jfred/`) and
`npx tsc --noEmit -p tsconfig.json` + `npx tsc --noEmit -p tsconfig.webapp.json` (compile
checks, not tests). Because tests are not run, be extra careful that each test's imports,
fixtures, and assertions match the code actually written.

## Feature summary

Three failure modes must stop aborting whole-session reconstruction and instead degrade
per-revision, with reasons:

1. **Parser crashes** (viewer path): an unknown record `type` or malformed JSON line is
   skipped and recorded, not thrown. Strict mode (CLI/tests) keeps throwing — the fog-of-war
   guard that surfaced s87's new record type stays intact.
2. **Engine-stage throws**: each stage in the per-file chain falls back to its input events;
   each event whose replay throws becomes an *unrecoverable placeholder revision*; a per-file
   and per-document backstop catch survives anything else.
3. **Missing evidence**: a sidecar blob ENOENT surfaces as a stage failure (mode 2 catches
   it); an unreadable git-baseline repo gets an explicit failure note at its existing guard.

The engine reports all of this on the wire document; the webapp renders mockup options A + C
from `plans/partial-reconstruction-ui-mockups.html` (RevEng root): session banner with counts,
dashed gap rows in the timeline, dashed/grayed missing rev-cards in the revision stepper, and
a per-file coverage strip in the Files sidebar with a click-for-reason popover on red segments.

---

## Phase 1 — vocabulary + failure collector (engine)

### 1a. `FailureScope` enum

In `src/structures/vocabulary.ts`, beside the other enums, add (values cross the wire to the
webapp, so the enum lives here per requirement #2):

```ts
// Where a partial-reconstruction failure was caught: one stage of one file's chain, a whole
// file's reconstruction, or one sub-phase of the document build.
export enum FailureScope {
    fileStage = "file-stage",
    file = "file",
    documentPhase = "document-phase",
}
```

No `Object.values` set — nothing does membership checks on it.

### 1b. `src/reconstruction_health.ts` (new module)

Mirror the module-level-sink pattern of `src/reconstruction_provenance.ts`, but ALWAYS-ON
(entries are pushed only when something fails, so there is no hot-path cost to gate):

```ts
// Partial-reconstruction health sink: a module-level log of every failure the engine survived
// (skipped stages, unrecoverable events, dead document phases), drained into the wire document
// so the webapp can mark what was NOT recovered. Always on — entries only exist on failure.
// ponytail: global sink like reconstruction_provenance.ts — thread a sink instead only if the
// engine ever reconstructs sessions concurrently.

import type { Path } from "./structures/domain.ts";
import { FailureScope } from "./structures/vocabulary.ts";

// One survived failure: which scope caught it, the stage/phase function name, the file it
// affects (when one applies), and a one-line human reason.
export type ReconstructionFailure = {
    scope: FailureScope;
    stage: string;
    target?: Path;
    reason: string;
};

let buffer: ReconstructionFailure[] = [];

// Record one survived failure.
export function noteReconstructionFailure(failure: ReconstructionFailure): void {
    buffer.push(failure);
}

// Return the captured failures and empty the buffer.
export function drainReconstructionFailures(): ReconstructionFailure[] {
    const drained = buffer;
    buffer = [];
    return drained;
}

// Empty the buffer without returning it (call at the start of a build so a previous build's
// aborted leftovers cannot leak in).
export function clearReconstructionFailures(): void {
    buffer = [];
}
```

`stage` stays a plain string (the stage function's name — free-form display text, never
compared; requirement #1 allows primitives for genuinely free-form text).

**Test (RED first)** — new file `tests/reconstruction_health.test.ts`:
- `test_noteReconstructionFailure_is_returned_by_drain_and_buffer_empties` — note one entry,
  drain returns it, second drain returns `[]`.
- `test_clearReconstructionFailures_discards_pending_entries` — note, clear, drain → `[]`.

## Phase 2 — tolerant parsing with skipped-line capture (engine)

### 2a. Behavior (plain English)

`loadTranscript` in tolerant mode (`tolerateUnmodeledFields === true`, the viewer's mode)
must catch, per line: a `JSON.parse` throw ("malformed JSON: …") and an
`UnknownRecordTypeError` (`unknown record type "…"`). The line is skipped, reported once via
`onProgress` (same channel as unmodeled fields), and captured as a `SkippedLine`. Strict mode
is byte-for-byte unchanged (still throws). Update the stale function comment at
`src/parse/loadTranscript.ts:164-171` — "An unknown record *type* still throws either way" is
no longer true; it throws only in strict mode.

### 2b. Types and return shape

In `src/parse/loadTranscript.ts`:

```ts
// One line the tolerant loader could not parse: where it was, why, and (when the raw JSON
// still carried one) its timestamp — the webapp uses it to place the gap in the timeline.
export type SkippedLine = {
    filePath: Path;
    lineNumber: number;
    timestamp?: Date;
    reason: string;
};

// A loaded transcript: the parsed records plus every line tolerant mode skipped (always
// empty in strict mode, which throws instead).
export type LoadedTranscript = {
    records: TranscriptRecord[];
    skippedLines: SkippedLine[];
};
```

Change `loadTranscript` to return `LoadedTranscript`. In the per-line loop
(`loadTranscript.ts:212-229`), tolerant mode wraps `parseRecord(text)`:

- `JSON.parse` throw → `reason = "malformed JSON: " + String(error)`, no timestamp.
- `UnknownRecordTypeError` → re-parse is NOT needed: catch it, then `JSON.parse(text)` once
  more inside the catch **only to read a `timestamp` string field** (guard with its own
  try/catch; it succeeded the first time so this is safe) and hydrate it via
  `new Date(rawTimestamp)` when it is a string. `reason = error.message`.
- Either way: push the `SkippedLine`, emit one
  `onProgress?.({ kind: DocumentResponseKind.progress, label: "skipped line <n>: <reason>" })`,
  and `continue` — the skipped line still counts in the `current/total` progress arithmetic
  only via its loop index (do not reindex; `total` stays `numberedLines.length`).

Distinguish the two throw kinds with `error instanceof UnknownRecordTypeError` (import it
from `./parseRecord.ts`); everything else in tolerant mode also becomes a skip with
`String(error)` as reason (a hydration throw on one record must not kill the load either).

### 2c. Call-site updates (all become `{ records, skippedLines }` consumers)

- `src/reconstruction_cli.ts:168` — destructure `const { records } = loadTranscript(...)`
  (CLI is strict; `skippedLines` is always empty there).
- `src/viewer_api_records.ts` — `loadProjectRecords` (line 75) must return BOTH, and the
  cache must store both (skips are discovered at parse time; a cache hit would otherwise
  lose them and the banner would vanish on warm rebuilds). Change:

```ts
// The parsed record stream for a transcript set plus every line the tolerant parse skipped —
// cached together so a warm rebuild still reports its gaps.
export type ProjectRecords = { records: TranscriptRecord[]; skippedLines: SkippedLine[] };

const parsedRecordsCache = new Map<string, ProjectRecords>();
```

  `loadProjectRecords` returns `ProjectRecords`; the fresh path collects
  `transcripts.flatMap((loaded) => loaded.skippedLines)` alongside the sorted-merged records.
  Note `sortTranscriptsChronologically` sorts `TranscriptRecord[][]` — feed it
  `transcripts.map((loaded) => loaded.records)` and keep the flat merge as today.
- Every other caller of `loadTranscript` / `loadProjectRecords` (grep both names across
  `src/` and `tests/`) is updated to destructure `.records`.

**Tests (RED first)** — in the existing `loadTranscript` test file (locate via
`grep -l loadTranscript tests/*.test.ts`); write temp `.jsonl` fixtures with the existing
test-utility helpers:
- `test_loadTranscript_tolerant_skips_unknown_record_type_and_records_reason` — a file with
  one valid record and one `{"type":"future-nonsense","timestamp":"2026-01-01T00:00:00Z"}`
  line, tolerant → `records.length === 1`, one `SkippedLine` whose reason names
  `future-nonsense` and whose `timestamp` is the hydrated `Date`.
- `test_loadTranscript_tolerant_skips_malformed_json_line` — a `not json{` line → skipped
  with a "malformed JSON" reason and `timestamp === undefined`.
- `test_loadTranscript_strict_still_throws_on_unknown_record_type` — same fixture, strict →
  `assert.throws`.
- `test_loadProjectRecords_caches_skipped_lines_with_records` — call twice on the same
  fixture set; both calls return the same skipped-line count (proves the cache carries them).

## Phase 3 — per-event replay tolerance → placeholder revisions (engine)

### 3a. Behavior

In `src/reconstruction_replay.ts` `replayEvents` (line 198), a throw from
`appendRevisionsForEvent` for ONE event must not kill the file. The event becomes an
**unrecoverable placeholder revision**: same `kind`/`changeId`/`timestamp` as the event,
`lines` = the previous revision's lines carried forward (identity carry, exactly like
`renameRevision` does with `lastLinesOf(revisions).map(carryAt)`) so every LATER event still
replays against the believed state, and a new marker field carrying the reason. This is the
per-revision granularity the task demands: the revision slot exists, is marked, and later
revisions stay recovered.

### 3b. Type + code

In `src/reconstruction_engine.ts`, extend `FileRevision` (line 46-53) with the same
optional-tag pattern as `rename?`/`copy?`:

```ts
    // Present when this revision could not be reconstructed: the replay of its event threw and
    // its lines are the previous revision's carried forward, not real content.
    unrecoverable?: { reason: string };
```

In `reconstruction_replay.ts`:

```ts
// A survived per-event failure: the revision slot exists (so steppers and coverage strips can
// show the gap) but its lines are the prior state carried forward, flagged with the reason.
function unrecoverableRevision(event: FileEvent, revisions: FileRevision[], reason: string): FileRevision {
    return {
        kind: event.kind,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines: lastLinesOf(revisions).map(carryAt),
        unrecoverable: { reason },
    };
}

export function replayEvents(events: FileEvent[]): FileRevision[] {
    const revisions: FileRevision[] = [];
    for (const event of events) {
        try {
            appendRevisionsForEvent(event, revisions);
        } catch (error) {
            revisions.push(unrecoverableRevision(event, revisions, String(error)));
        }
    }
    return revisions;
}
```

`UnsupportedEventKindError` now also lands as a placeholder instead of a crash — the
coverage-ledger byte comparison still flags such scenarios, so the fog-of-war signal moves
from "crash" to "visible unrecoverable revision + ledger FAIL", which is the point of this
task.

**Existing-test update**: grep tests for `UnsupportedEventKindError` / `assert.throws` around
`replayEvents` — any test asserting the old crash behavior must be rewritten to assert the
new placeholder behavior (an `unrecoverable` revision, not a throw). Same for any test
pinning `loadTranscript`'s old array return (Phase 2's grep covers those).

**Tests (RED first)** — extend the replay/engine test file that already exercises
`replayEvents` (find via `grep -l replayEvents tests/*.test.ts`):
- `test_replayEvents_emits_unrecoverable_placeholder_when_an_event_kind_is_unsupported` —
  feed a well-formed write event followed by `{ kind: "bogus-kind", changeId, timestamp }`
  (cast via `as unknown as FileEvent`); expect 2 revisions, second has
  `unrecoverable.reason` containing `bogus-kind`.
- `test_unrecoverable_placeholder_carries_previous_lines_forward` — same setup; the
  placeholder's line text equals the write revision's line text, and a subsequent valid edit
  event still applies (3rd revision has no `unrecoverable`).

## Phase 4 — per-stage + per-file + per-phase tolerance (engine)

### 4a. Per-stage wrapper in the chain

In `src/reconstruction_branches.ts` `computeFileRevisionsOver` (lines 90-115), add one
helper and route every stage call through it:

```ts
// Run one chain stage, falling back to its unmodified input when it throws — the file keeps
// every state computed so far and the failure is noted for the wire document.
function runStageTolerantly(
    stage: string,
    target: Path,
    input: FileEvent[],
    run: () => FileEvent[],
): FileEvent[] {
    try {
        return run();
    } catch (error) {
        noteReconstructionFailure({ scope: FailureScope.fileStage, stage, target, reason: String(error) });
        return input;
    }
}
```

Rewrite the chain body so each `const x = stage(...)` becomes
`const x = runStageTolerantly("<stageFnName>", finalTarget, <input>, () => stage(...))`,
preserving the exact current order and the `reader ?` gating (gate OUTSIDE the wrapper:
`const filled = reader ? runStageTolerantly("fillRedirectContent", finalTarget, seeded, () => fillRedirectContent(records, seeded, reader)) : seeded;`).
The three pre-chain steps (`extractFileEvents`, `buildRenameChain` + `resolveFinalPath`,
the lineage filter) stay unwrapped — they are pure record/event walks with no evidence
dependency, and the Phase 4b backstop covers them. `replayEvents` stays unwrapped too (it
has its own per-event net from Phase 3). This is where sidecar ENOENT (missing backup blob)
is survived: the reader-gated stage that touched the dead blob throws, the wrapper keeps the
input events, and the note names the stage.

### 4b. Per-file backstop

In `src/reconstruction_renderable.ts` `reconstructFilesOver` (lines 24-49): wrap each
file's reconstruction in try/catch; on throw, produce `{ target, revisions: [] }` for that
file and `noteReconstructionFailure({ scope: FailureScope.file, stage: "reconstructFilesOver", target, reason: String(error) })`.
Match the function's actual local shape when editing (read it first).

### 4c. Git-baseline missing-evidence note

In `src/reconstruction_base_commit.ts` `seedBaseCommitBeacon`: at the existing guard where a
base commit IS recorded but the commit is unreadable (the `readCommitTimestamp(...) ===
undefined` / unreadable-commit return around line 104 — read the guards and pick the one
meaning "baseline recorded, repo gone"), add
`noteReconstructionFailure({ scope: FailureScope.fileStage, stage: "seedBaseCommitBeacon", target, reason: "git baseline commit unreadable (recorded repo missing)" })`
before the existing early return. Do NOT note the benign guards (no base-commit record, no
cwd, target outside root) — those are normal sessions, not missing evidence.

### 4d. Document-phase backstop + wire fields

In `src/reconstruction_json.ts`:

- Add to `ReconstructionDocument` (line 141):

```ts
    skippedLines: SkippedLine[];
    failures: ReconstructionFailure[];
```

- `buildReconstructionDocument` gains a 5th parameter `skippedLines: SkippedLine[] = []`.
- Wrap each sub-phase call (lines 180-195: `extractConversationMessages`,
  `summarizeBranches`, `buildStepSnapshots`, `buildLineVerdicts`, `findGitCommitEvents`,
  `findGitOperations`, `findToolCalls`, `summarizeScriptRunFileChanges`) with:

```ts
// Run one document sub-phase, degrading to a fallback value when it throws so every file
// state already computed still ships.
function buildPhaseTolerantly<T>(phase: string, fallback: T, run: () => T): T {
    try {
        return run();
    } catch (error) {
        noteReconstructionFailure({ scope: FailureScope.documentPhase, stage: phase, reason: String(error) });
        return fallback;
    }
}
```

  Fallbacks: `[]` for every list; for `buildStepSnapshots` the fallback is
  `{ steps: [], stepFileHistories: [] }`.
- Assemble `failures: drainReconstructionFailures()` as the LAST document field computed
  (stage failures accumulated during `reconstructBranches` earlier in the build are still in
  the buffer — the drain picks up everything), and `skippedLines` from the new parameter.
- Callers of `buildReconstructionDocument` (grep): `src/viewer_api.ts` passes the
  `skippedLines` from `loadProjectRecords`; the CLI passes its (always-empty) skips or omits
  the argument; tests pass nothing (default `[]`).
- At the START of the build entry points — `buildProjectReconstruction` in
  `src/viewer_api.ts` (before `reconstructBranches`) and `runCli` in
  `src/reconstruction_cli.ts` (before its reconstruction call) — call
  `clearReconstructionFailures()` so an aborted previous build cannot leak notes.
- Known accepted limitation (note it as a comment on the `failures` field): per-file revision
  memos are cached per records-array, so a warm rebuild over cached revisions re-reports only
  per-revision `unrecoverable` flags (cached inside the revision objects), not stage notes;
  the viewer also caches the whole document per stamp, so in practice the first (real) build's
  failures are what users see.

**Tests (RED first):**
- In the engine/branches test file: `test_reconstructFile_survives_a_throwing_reader_stage` —
  build records for a scenario that exercises a reader-gated stage, inject a `BackupReader`
  whose read method always throws `new Error("ENOENT: blob gone")`; assert revisions are
  still returned (equal to the reader-less reconstruction of the same records) and
  `drainReconstructionFailures()` contains an entry with `scope === FailureScope.fileStage`.
  (Call `clearReconstructionFailures()` in test setup.)
- In `tests/reconstruction_json.test.ts` (pattern-match its existing builders):
  - `test_buildReconstructionDocument_carries_skipped_lines_through` — pass one fabricated
    `SkippedLine`; assert `document.skippedLines.length === 1`.
  - `test_buildReconstructionDocument_drains_failures_into_document` — note one failure
    before building; assert it appears in `document.failures` and a second build has none.

## Phase 5 — webapp wire types + coverage view-model (tested)

### 5a. Wire types

In `webapp/views/timeline-types.ts`: extend `WireRevision` (line 28) with
`unrecoverable?: { reason: string }`; extend `WireTimelineDocument` (line 78) with
`skippedLines?: { filePath: string; lineNumber: number; timestamp?: string; reason: string }[]`
and
`failures?: { scope: string; stage: string; target?: string; reason: string }[]`
(wire mirrors are string-typed on the webapp side, like the existing wire types there;
optional because filtered/demo documents may predate the fields).

### 5b. New tested VM module `webapp/views/reconstruction-coverage.ts`

Pure, DOM-free (the project's dual-renderer split). Contents:

```ts
// Coverage summary for the session banner.
export type CoverageSummary = {
    totalRevisions: number;
    unrecoverableRevisions: number;
    skippedLineCount: number;
    failureCount: number;
    isPartial: boolean;
};

// One segment of a file's coverage strip: one revision, recovered or not.
export type CoverageSegment = { recovered: boolean; reason?: string; revisionIndex: number };

// One dashed gap row for the timeline: a contiguous run of skipped lines from one file.
export type TimelineGap = { count: number; reason: string; timestamp?: Date };
```

Functions (each with tests FIRST in new `tests/reconstruction-coverage.test.ts`, feeding
hand-built wire-shaped literals):

- `summarizeReconstructionCoverage(document)` → `CoverageSummary`; scans
  `filesTouched[].revisions` counting `unrecoverable`, plus `skippedLines`/`failures`
  lengths; `isPartial` = any of the three counts > 0.
  - `test_summarizeReconstructionCoverage_counts_unrecoverable_revisions`
  - `test_summarizeReconstructionCoverage_is_not_partial_for_clean_document`
- `buildFileCoverageSegments(history)` → `CoverageSegment[]` (one per revision, `reason`
  from the revision's `unrecoverable`).
  - `test_buildFileCoverageSegments_marks_unrecoverable_revisions`
- `buildTimelineGaps(skippedLines)` → `TimelineGap[]`; group runs of skipped lines that share
  `filePath` and have consecutive `lineNumber`s into one gap (`count` = run length, `reason`
  = first reason, `timestamp` = first defined timestamp in the run, hydrated with
  `new Date(...)`).
  - `test_buildTimelineGaps_groups_consecutive_lines_into_one_gap`
  - `test_buildTimelineGaps_splits_non_consecutive_lines`
- `computeGapInsertionIndexes(gaps, nodeTimestamps)` → `Map<number, TimelineGap[]>` keyed by
  node index BEFORE which each gap renders: first node whose timestamp is ≥ the gap's;
  gaps without a timestamp key to index 0.
  - `test_computeGapInsertionIndexes_places_gap_before_first_later_node`
  - `test_computeGapInsertionIndexes_places_timestampless_gap_first`

### 5c. Revision-card VM flag

In `webapp/views/details-model.ts` `buildRevisionCards` (line 97) / `RevisionCard` type
(line 42): add `unrecoverableReason?: string`, populated from the revision's
`unrecoverable?.reason`. Test in `tests/details-viewmodels.test.ts`:
- `test_buildRevisionCards_flags_unrecoverable_revision` — a revision literal with
  `unrecoverable: { reason: "sidecar backup missing" }` yields a card carrying that reason.

## Phase 6 — webapp DOM (untested-by-convention render halves)

### 6a. Banner

In `webapp/views/timeline.ts` `renderTimelineView` (line 89), after the document arrives and
before `renderForkSidebar` (line 194): compute `summarizeReconstructionCoverage(document)`;
when `isPartial`, create a `div.recon-banner` mounted in the timeline pane header region
(`#timeline-pane-header`, `index.html:31-36`, beside `#timeline-summary`; remove any prior
`.recon-banner` first so re-renders don't stack). Content:
`⚠ Partial reconstruction — <unrecoverableRevisions> of <totalRevisions> revisions unrecoverable · <skippedLineCount> records skipped`
(omit the "· N records skipped" clause when the count is 0). Set the full failure reasons
(one per line from `document.failures`) as the banner's native `title` tooltip — no "show
gaps" popover (skipped: gap rows/strips already show every gap in place; add a popover only
if the user asks).

### 6b. Timeline gap rows

In `webapp/views/timeline-render-rows.ts` `buildTimelineRows`: following the
`appendSessionStartMarker` pattern (line 91), add `appendGapRow(fragment, gap)` emitting a
`div.tl-row.tl-gap-row` with text
`✗ <count> record(s) skipped — <reason>; revisions in this span unrecoverable`.
Wire it: the render context / caller computes `computeGapInsertionIndexes(...)` once (from
`buildTimelineGaps(document.skippedLines ?? [])` and each node's timestamp) and, in the row
loop, appends the mapped gaps before their node index; gaps mapped past the last node append
after the loop.

### 6c. Missing rev-cards

In `webapp/views/details-revision-view.ts` (rev-card build at line 217): when the card's
`unrecoverableReason` is set, add class `missing`, render the head as `rev N ✗`, append a
`div.why` with the reason, and render the reason line INSTEAD of the 5-button action row
(`buildRevisionActionsElement`, lines 66-74) — the placeholder's lines are carried-forward
guesses, so content/export/patch actions would lie.

### 6d. Sidebar coverage strip + popover

In `webapp/views/sidebar.ts` file-row builder (lines 111-121): when
`buildFileCoverageSegments(history)` contains any unrecovered segment, append after the name
a `span.covbar` (one `span` child per segment, class `miss` on unrecovered ones) and replace
the `.revcount` text with `<recovered> / <total> revs`. Files with full coverage keep
today's row exactly (no strip — real files can have 100+ revisions; a strip on every row is
noise). Clicking a `.miss` segment toggles a `.popover.cov-popover` (reuse the existing
`.popover` base class + native `hidden` attribute pattern from `app-header.ts`) anchored
under the row, showing `"<file> — rev <n> ✗ unrecoverable"` and `reason: <reason>`; clicking
elsewhere hides it (reuse the header's hide-on-outside-click approach).

### 6e. Styles

In `webapp/styles.css`, using existing tokens only (`--red`, `--muted`, `--error-bg`,
`--border-strong`; both themes come free via the tokens):

```css
.recon-banner { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--error-bg); border-bottom: 1px solid var(--border); font-size: 12.5px; }
.recon-banner .warn { color: var(--orange); font-weight: 600; }
.tl-gap-row { background: var(--error-bg); border-top: 1px dashed var(--red); border-bottom: 1px dashed var(--red); color: var(--red); font-size: 12px; }
.rev-card.missing { border-style: dashed; border-color: var(--red); background: transparent; opacity: 0.75; }
.rev-card.missing .rev-head { color: var(--red); }
.rev-card.missing .why { color: var(--muted); font-size: 10.5px; margin-top: 4px; max-width: 130px; }
.covbar { display: flex; gap: 2px; }
.covbar span { flex: 1; min-width: 3px; max-width: 26px; height: 12px; border-radius: 2px; background: var(--green); opacity: 0.85; }
.covbar span.miss { background: var(--red); cursor: pointer; }
.cov-popover { position: absolute; max-width: 330px; padding: 10px 12px; font-size: 12px; }
```

Match the surrounding stylesheet's exact formatting conventions when inserting.

## Phase 7 — compile check + staging

1. In `jfred/`: `npm install` only if `node_modules` is absent; then
   `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.webapp.json`; fix
   compile errors. **Do not run any test suite.**
2. `git add` all changed/new files inside `jfred/` (submodule), and in the RevEng superproject
   stage `plans/partial-reconstruction-task119.md`, `plans/partial-reconstruction-ui-mockups.html`
   (the design input, currently untracked), and the `jfred` submodule pointer. **No commits
   anywhere.**

## Explicitly out of scope (say so, don't build)

- CLI strict mode stays strict (fog-of-war guard for scenario development).
- No "show gaps" interactive panel on the banner (native `title` tooltip only).
- No coverage strip on fully-recovered files, and no strip in the details pane's own file
  list — the Files sidebar is the file list the chosen mockup covers.
- No re-run/re-fetch machinery for missing evidence — reporting only.
