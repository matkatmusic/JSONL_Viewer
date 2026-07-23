# Task 193 — CLI mode: bounded reconstruction up to a file's nth revision (turn-end bound)

Repo: `RevEng/jfred` (all edits below are jfred-relative). Design decision (pre-made — do
not revisit): the bound is implemented by **truncating the merged record stream** before
`buildSidecarReader` / the engine run. Everything downstream (script-run pool, beacons,
steps, JSON, graphs) is bounded automatically because it never sees post-bound records.
No engine internals change.

## Contract (from the task description)

- New flag `--until-revision <file>`: `<file>` is an absolute path, matched exactly the way
  `--target/--file` matches (string equality on the path).
- Optional companion flag `--nth <n>` (1-based ordinal, default 1). `--nth` without
  `--until-revision` is a usage error.
- The engine locates the nth file event touching `<file>`, resolves the END of the agent
  turn containing it (the file may be revised again later in the same turn — those later
  same-turn revisions MUST stay in), and truncates the record stream just before the next
  genuine user prompt after that event.
- One stderr line always reports: chosen ordinal, the target's TOTAL revision count across
  the given JSONLs, the bound instant, and kept/total record counts — so the user can pick
  `n` for the next invocation. stdout stays pure (`--json` consumers).
- Out-of-range `--nth` (or a file with zero events) throws an error whose message contains
  the total revision count.

## Vocabulary (per coding-requirements.md — domain types, verb-named functions)

- `RevisionBound` — `{ records: TranscriptRecord[]; totalRevisions: number; boundInstant: Date | undefined }`
  (`boundInstant` undefined when the nth revision sits in the final turn → no truncation).
- `truncateRecordsAtRevisionTurnEnd(records, target: Path, ordinal: number): RevisionBound` — the one entry point.
- `selectEventsTouchingPath(events: FileEvent[], target: Path): FileEvent[]` — filter helper.
- `listEventPaths(event: FileEvent): Path[]` — rename/copy → `[from, to]`, else `[event.target]`.
  NOTE: `viewer_api_repo.ts:65` has a private identical helper. Per the no-forwarding-layers
  rule, give it ONE canonical home: export it from the new module and make
  `viewer_api_repo.ts` import it from there (delete the private copy).
- `findTurnEndIndex(records, after: Date): number` — index of the first turn-boundary prompt
  strictly after `after`; `records.length` when none.

## Step 0 — free line budget in reconstruction_cli.ts (AT the 250-line cap)

Move `formatProgressLine` and `buildStderrProgressSink` (src/reconstruction_cli.ts:167–187,
comments included) verbatim into `src/reconstruction_progress.ts` (31 lines today; lands
~55). That file is their natural home (progress plumbing) and already imports the
`ProgressSink` type from `loadTranscript.ts`, so adding the `ProgressEvent` type import
creates no cycle. Export both moved functions. In `reconstruction_cli.ts`: drop the moved
bodies, import `buildStderrProgressSink` from `./reconstruction_progress.ts`, and drop the
now-unused `ProgressEvent` type import (keep `ProgressSink` — `renderTranscriptView`'s
signature uses it). No test currently imports either function by name (verified by grep),
so no test moves. Net: ~20 lines freed.

## Step 1 — RED: tests first

Per `~/.claude/guides/tdd.md`: plain-English step comments in every test body,
`test_<behavior>` names, one behavior per test. **Write the tests, but DO NOT run any test
suite — the user runs tests afterward.** (Typecheck is allowed, see Step 5.)

### tests/reconstruction_bound.test.ts (new; name matches the new module per the Stop-hook convention)

Build synthetic in-memory transcripts. Before writing fixtures, read
`tests/multi-source-test-helpers.ts` and reuse `buildWriteRecordPair` /
`writeTranscriptFixture` where they fit (check real signatures first — a past trap:
guessing a fixture-helper arg produced `structuredPatch:[null]` crashes under node --test).
A record must satisfy the real hydrated shapes: `timestamp` a `Date`, prompt records
passing `isGenuineUserPrompt` (type `user`, no tool_result block, not `isMeta`), assistant
records carrying `tool_use` blocks that `extractFileEvents` turns into write events. If the
helpers don't fit, hydrate wire objects through `parseRecord` (see `tests/parseRecord.test.ts`
for the pattern) rather than hand-casting.

Fixture shape used by the tests below (5 turns of interest, one file `A`, one file `B`):

```
prompt1 | write A rev1 | edit A rev2      <- turn 1 (two revisions of A)
prompt2 | write B      | edit A rev3      <- turn 2
prompt3 | (no file ops)                   <- turn 3 (final)
```

1. `test_bound_reports_total_revision_count` — bound on A, ordinal 1 →
   `totalRevisions === 3` (write + 2 edits), regardless of truncation.
2. `test_bound_truncates_after_containing_turn_end` — ordinal 1 (rev1, turn 1) → returned
   records are exactly the records before `prompt2`; the rev2 record (same turn, later
   instant) IS included — this pins the task's turn-end extension.
3. `test_bound_same_turn_ordinals_share_a_bound` — ordinal 2 (rev2, also turn 1) → same
   record count as ordinal 1.
4. `test_bound_later_ordinal_truncates_before_next_prompt` — ordinal 3 (rev3, turn 2) →
   returned records end just before `prompt3`.
5. `test_bound_final_turn_revision_keeps_all_records` — same fixture but cut after the
   rev3 record (no `prompt3`), ordinal 3 → no truncation, `boundInstant === undefined`.
6. `test_bound_rejects_out_of_range_ordinal` — ordinal 9 → throws; the message contains
   `"3"` (the total) and the target path.
7. `test_bound_rejects_unknown_target` — bound on a never-touched path → throws; message
   says no revisions were found.
8. `test_bound_ignores_sidechain_prompts` — insert a `isSidechain: true` genuine-looking
   user prompt between rev1 and rev2 → it is NOT a turn boundary (record count unchanged
   vs test 2). Rationale: a subagent's opening prompt occurs DURING the parent turn.

### tests/reconstruction_cli_args.test.ts (extend)

9. `test_parse_until_revision_flag` — `parseArgs(["t.jsonl", "--until-revision", "/a.py"])`
   → `untilRevision` equals the Path, `untilNth === 1`.
10. `test_parse_until_nth_flag` — with `--nth 4` → `untilNth === 4`.
11. `test_parse_nth_requires_until_revision` — `--nth 2` alone → throws USAGE.
12. `test_parse_nth_rejects_non_integer` — `--nth x` → throws USAGE.

### tests/reconstruction_cli.test.ts (extend)

13. `test_cli_until_revision_bounds_all_views` — write a synthetic 2-turn transcript
    fixture to a temp dir (reuse `writeTranscriptFixture`): turn 1 writes `A`, turn 2
    writes `B`. `runCli([jsonl, "--until-revision", <A>])` output mentions `A` and does
    NOT mention `B`; a control run without the flag mentions both. Topology-level
    assertions only (this suite's convention — no content pinning).

## Step 2 — GREEN: src/reconstruction_bound.ts (new module, ~90 lines)

Header comment: task 193; bounded reconstruction = input truncation, with the ceiling
noted: `// ponytail: turn boundaries are scanned in merged-array order; parallel-session
multi-source streams may interleave turns — per-session turn walks if that bites.`

```ts
import { Path } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { extractFileEvents } from "./reconstruction_extract.ts";
import type { FileEvent } from "./reconstruction_engine.ts";
import { isGenuineUserPrompt } from "./reconstruction_prompts.ts";

export type RevisionBound = {
    records: TranscriptRecord[];
    totalRevisions: number;
    boundInstant: Date | undefined;
};

// rename/copy touch two paths; every other event touches its single target.
export function listEventPaths(event: FileEvent): Path[] { /* as in viewer_api_repo today */ }

function selectEventsTouchingPath(events: FileEvent[], target: Path): FileEvent[] {
    const targetKey = target.toString();
    return events.filter((event) =>
        listEventPaths(event).some((eventPath) => eventPath.toString() === targetKey));
}

// A turn boundary is a genuine typed-in prompt on the MAIN chain — a subagent's opening
// prompt (isSidechain) happens inside the parent's turn and must not end it.
function isTurnBoundary(record: TranscriptRecord): boolean { ... }

function findTurnEndIndex(records: TranscriptRecord[], after: Date): number { ... }

export function truncateRecordsAtRevisionTurnEnd(
    records: TranscriptRecord[],
    target: Path,
    ordinal: number,
): RevisionBound { ... }
```

Semantics to implement exactly:

- `extractFileEvents(records)` is timestamp-sorted and memoized — call it once on the full
  merged stream; `selectEventsTouchingPath` gives the revision list; its length is
  `totalRevisions`.
- `totalRevisions === 0` → `throw new Error(\`--until-revision: no revisions of ${target} found\`)`.
- `ordinal < 1 || ordinal > totalRevisions` → throw
  `` `--until-revision: revision ${ordinal} of ${target} out of range 1..${totalRevisions}` ``.
- Chosen event = `revisions[ordinal - 1]`. Turn end: scan `records` in array order; the
  boundary is the first record where `isTurnBoundary(record)` holds AND
  `record.timestamp instanceof Date` AND `record.timestamp.getTime() > chosen.timestamp.getTime()`
  (strictly after — a prompt stamped at the event instant belongs to the next turn only if
  later; equal stamps stay inside the turn). Boundary found at index i →
  `records = records.slice(0, i)`, `boundInstant = records[i - 1]?.timestamp` (the last
  kept record's stamp; fall back to `chosen.timestamp` when it is not a Date). No boundary
  → full `records`, `boundInstant = undefined`.
- `isTurnBoundary` = `isGenuineUserPrompt(record) && record.isSidechain !== true`
  (single-condition-branching guide: express as two guard `if`s, not one compound
  expression, matching the project style in `reconstruction_prompts.ts`).

Then edit `src/viewer_api_repo.ts`: delete its private `listEventPaths` (lines 65–73) and
import the exported one from `./reconstruction_bound.ts`.

## Step 3 — GREEN: flag parsing (src/reconstruction_cli_args.ts, 208 lines → ~225)

- `CliOptions` gains `untilRevision: Path | undefined; untilNth: number;`.
- In `parseArgs`: extend the `extractValueFlag` chain after `--base-commit` with
  `--until-revision` then `--nth`. `untilNth` = parse via a new
  `parseOrdinal(value: string | undefined): number` — undefined → 1; non-integer or < 1 →
  throw USAGE (reuse the `parseStepNumber` pattern; do NOT reuse `parseStepNumber` itself,
  its absent-value contract differs).
- Guard: `--nth` present while `--until-revision` absent → throw USAGE.
- USAGE string: append ` [--until-revision <path> [--nth <n>]]`.

## Step 4 — GREEN: CLI wiring (src/reconstruction_cli.ts)

In `renderTranscriptView`, immediately after the `records` merge line (currently :225) and
BEFORE the `buildSidecarReader` progress line — the reader must be built from the bounded
stream so no post-bound machinery runs:

```ts
const bounded = applyRevisionBound(records, options);
```

…and use `bounded` everywhere `records` was used below. Put the glue in the new module so
the cli file pays only the call + import (budget freed by Step 0 covers it):

```ts
// In reconstruction_bound.ts — CLI glue: no-op without the flag; otherwise truncate and
// report the pick-your-n summary on stderr (stdout stays pure for --json).
export function applyRevisionBound(records: TranscriptRecord[], options: CliOptions): TranscriptRecord[] {
    if (options.untilRevision === undefined) {
        return records;
    }
    const bound = truncateRecordsAtRevisionTurnEnd(records, options.untilRevision, options.untilNth);
    process.stderr.write(`until-revision: ${options.untilRevision} revision ${options.untilNth}/${bound.totalRevisions}; bounded at ${bound.boundInstant?.toISOString() ?? "end of transcript"}; records ${bound.records.length}/${records.length}\n`);
    return bound.records;
}
```

(`CliOptions` import from `./reconstruction_cli_args.ts` — args module does not import the
bound module, so no cycle.)

## Step 5 — verify

- `npx tsc --noEmit` (or the repo's typecheck script — check `package.json` scripts) must
  pass. **Do not run `npm test` or any suite** — the user runs tests.
- `wc -l src/reconstruction_cli.ts src/reconstruction_cli_args.ts src/reconstruction_bound.ts src/reconstruction_progress.ts`
  — every file ≤ 250.

## Step 6 — bookkeeping

- Close task 193 via the `taskTools:close-tasks` skill (closureNote: bounded-reconstruction
  flag implemented — record-stream truncation at containing-turn end, revision-count
  report on stderr).
- Stage (never commit) in `RevEng/jfred`, then stage the submodule pointer + this plan in
  `RevEng`.

## Explicitly out of scope (say no if tempted)

- No webapp/viewer wiring — that is task 194.
- No engine replay-window changes (`enterLineageReplayWindow` etc.) — truncation makes the
  windows small by construction; the task named that machinery as inspiration, not as the
  required lever.
- No fix for the `executeRunOnce` re-execution blowup — task 192.
- Post-bound evidence (e.g. s40-style out-of-window `originalFile` seeds that live AFTER
  the bound) is intentionally invisible in bounded mode; bounded output is a debug/viability
  mode, exactness up to the bound comes from the same mechanisms the full run uses on the
  truncated stream.
