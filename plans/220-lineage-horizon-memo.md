# Task 220 — horizon-keyed lineage-seed memo (incremental closure replay)

## Problem being fixed (context only)

`replayLineageContentBefore` (jfred/src/reconstruction_branches.ts:211) memoizes
nested lineage replays under the exact key `${target}|${beforeMs}`. During the
script stage every executed run's pre-state build queries every closure file at
that run's instant (`getPreExecutionState` → `seedContent(currentPath,
run.timestamp)`), so the key never repeats and every query pays a full bounded
replay: cost ≈ runs × closure-size × per-replay cost (task-182 attempt 3,
~3 runs/min over 3,992 runs).

Fix: key the seed cache by the file's **relevant-input horizon** — the latest
instant strictly before the query at which anything that can change the file's
bounded replay occurred. Queries whose horizon matches a stored entry serve the
cached text; only queries whose horizon advanced recompute. Frames, cycle
guards, and the never-widening window keep their exact-instant keys — ONLY the
`lineageSeedsByKey` map key changes.

## Soundness rules the implementation must encode

A bounded replay of file F at cutoff `before` is a deterministic function of:

1. **F's static lineage events** — `extractFileEvents` events passing
   `eventBelongsToLineage(event, resolveFinalPath(F, chain), chain)` where
   `chain = buildRenameChain(staticEvents)`.
2. **Executed script runs whose sandbox diff touched F's lineage** — a run with
   a memoized `RunExecution` (`post !== undefined`) whose changed state keys
   (union of pre/post keys where `pre.get(key) !== post.get(key)`, junk keys
   skipped via `isJunkStateKey`) contain a key `k` such that some lineage path
   `p` satisfies `p === k || p.endsWith("/" + k)` (the `refForTarget` rule).
3. **Conservative bumps** (treat as relevant without proof):
   - an ELIGIBLE run (executor python or absent, `scriptCodeMayWriteFiles(code)`
     true, `checkTimestampPrecedesSkippedBaseline(run.timestamp)` false) that
     has NO memoized execution yet — its effects are unknown;
   - once ANY relevant-by-diff run for F exists at instant R: every eligible
     run after R (beaconless rolling mode re-executes later runs against F's
     rolling content — their memoized diffs no longer predict F's outcome), AND
     every static file event of ANY file after R (a proven script move can
     splice another path's later static events into F's augmented chain).

Ineligible runs (bash executor, read-only code, pre-baseline) can never produce
a post-state, pairs, or injections — never relevant, even unexecuted.

`horizonMs(F, before)` = max timestamp strictly before `before` across rules
1–3, or `-1` when none. Two instants with equal horizons have identical
relevant-input sets, hence byte-identical bounded-replay results (events after
the horizon do not exist, and revisions are cut strictly-before either instant).

The horizon computation must be PURE reads: it may probe
`derivedCaches.executionsByRun` with `.has()`/`.get()` but must NEVER call
`executeRunOnce` (that would execute runs out of walk order).

## Files touched

| File | Change |
|---|---|
| jfred/src/reconstruction_script_runs.ts | extract `computeRunExecutionKey(run)` (DRY the inline key in `executeRunOnce`) |
| jfred/src/reconstruction_lineage_horizon.ts | NEW — horizon key computation + its caches |
| jfred/src/reconstruction_lineage_memo.ts | path-level in-flight serve check |
| jfred/src/reconstruction_branches.ts | use horizon key for the seeds map (net ≤ 250 lines) |
| jfred/tests/reconstruction_script_runs.test.ts | key-helper test |
| jfred/tests/reconstruction_lineage_horizon.test.ts | NEW — horizon behavior tests |
| jfred/tests/reconstruction_lineage_memo.test.ts | path-level check tests |

Import direction (no cycles): horizon → {corpus, extract, lineage,
script_execution, script_runs, script_prestate, script_probe, script_sandbox,
base_commit, structures}. branches → horizon. Nothing imports branches from
that list.

## Step 1 — `computeRunExecutionKey` (script_runs)

Test first (tests/reconstruction_script_runs.test.ts): the key of a synthetic
`ScriptRun` equals `` `${timestamp.getTime()}|${executorKind ?? ScriptExecutorKind.python}|${code}` ``
and two runs differing only in code get different keys.

Then in reconstruction_script_runs.ts:

```ts
// The executionsByRun memo key: the run's instant, executor kind (absent = synthetic test run,
// executes like python — task 192), and full source. Exported for the horizon module's pure
// memo probes (task 220), which must build the identical key without executing anything.
export function computeRunExecutionKey(run: ScriptRun): string {
    const executorKind = run.executorKind ?? ScriptExecutorKind.python;
    return `${run.timestamp.getTime()}|${executorKind}|${run.code}`;
}
```

Replace the two inline lines in `executeRunOnce` (`const executorKind = ...;
const key = ...`) with `const key = computeRunExecutionKey(run);`. File stays
under 250 lines (225 today, net ±0 after the added export — trim nothing).

## Step 2 — lineage_memo path-level serve check

Behavior: a cached entry must not be served while ANY replay of a file it
queried is in flight — at any instant, not just the recorded one. (With
horizon keys an entry can be served at a different instant than it was
computed at; a fresh compute there would cycle-guard against the in-flight
file and degrade, so serving would no longer equal a fresh compute.)

Tests first (append to tests/reconstruction_lineage_memo.test.ts):

- entry with `queriedKeys = {"B|2"}` is NOT servable while frame `"B|3"` is in
  flight (same file, different instant);
- still servable while frame `"C|2"` is in flight (different file, same
  instant number).

Then in reconstruction_lineage_memo.ts:

```ts
// The file path of a cycle key — everything before the LAST "|" (the instant suffix; a path
// may itself contain "|" but never ends the key).
function extractLineagePathOfCycleKey(cycleKey: string): string {
    return cycleKey.slice(0, cycleKey.lastIndexOf("|"));
}
```

and change `checkNoQueriedKeyInFlight` to compare paths: for each queried key,
if any active frame's `extractLineagePathOfCycleKey(frame.cycleKey)` equals the
queried key's path → not servable. Keep `isLineageKeyOnReplayStack` (exact)
untouched — the branches guard still uses it.

## Step 3 — NEW jfred/src/reconstruction_lineage_horizon.ts

Public surface:

```ts
export function computeLineageSeedHorizonKey(
    records: TranscriptRecord[],
    reader: BackupReader,
    target: Path,
    before: Date,
): string; // `${target}|h${horizonMs}` (h-1 when no relevant input precedes `before`)
```

Internal structure (all module-level WeakMaps; nothing exported besides the
function above and — for tests — the pieces named in the test list):

- `staticInputsByCorpus: WeakMap<TranscriptRecord[], Map<string, LineageStaticInputs>>`
  where `type LineageStaticInputs = { lineagePathStrings: string[]; ownInstantsMs: number[]; allEventInstantsMs: number[] }`.
  Built once per (records, target): run `extractFileEvents(records)` (already
  corpus-cached), `buildRenameChain`, `resolveFinalPath`, filter with
  `eventBelongsToLineage`. `lineagePathStrings` = target + finalTarget + every
  lineage event's `target`/`from`/`to` path string (collect per event kind;
  read the fields that exist — `target` on write/edit/userEdit/etc., `from`/`to`
  on rename and copy). `ownInstantsMs` = sorted lineage-event timestamps.
  `allEventInstantsMs` = sorted timestamps of ALL static events (shared across
  targets — cache it once per corpus in the same WeakMap under a module-level
  sentinel or a second WeakMap; do not recompute per target).
- `runKeysByRun: WeakMap<ScriptRun, string>` — `computeRunExecutionKey(run)`
  built once per run object (ScriptRun objects are corpus-cached, so the
  WeakMap holds).
- `changedKeysByExecution: WeakMap<RunExecution, string[]>` — the diff of one
  memoized execution, computed once: union of pre/post keys, skip
  `isJunkStateKey`, keep keys where `pre.get(key) !== post.get(key)`.
- `runScanByDerived: WeakMap<DerivedCaches, Map<string, RunScanState>>` where
  `type RunScanState = { executionsSeen: number; relevantInstantsMs: number[]; firstDiffRelevantMs: number | undefined }`.
  Keyed by the `DerivedCaches` OBJECT (from `getDerivedCaches(records, reader)`)
  so reader/exec-gate/pre-baseline invalidation is automatic. The scan for one
  target is recomputed only when `executionsByRun.size` differs from
  `executionsSeen` (executions only accumulate); otherwise reused as-is.

Run scan (per target, ascending over `findScriptExecutionRuns(records)`):

1. Skip ineligible runs (bash `executorKind`, `!scriptCodeMayWriteFiles(code)`,
   `checkTimestampPrecedesSkippedBaseline(timestamp)`) — never relevant.
2. If a diff-relevant run was already seen at `firstDiffRelevantMs` and this
   run is later → relevant (rolling-mode conservatism).
3. Else look up `executionsByRun.get(runKeysByRun(run))`:
   - absent → relevant (unexecuted eligible run — unknown effects);
   - present with `post === undefined` → not relevant (executed to a skip);
   - present with post → relevant iff some changed key `k` matches some
     lineage path `p` (`p === k || p.endsWith("/" + k)`); when relevant,
     record `firstDiffRelevantMs` if unset.

Horizon assembly for (`target`, `before`):

- latest `ownInstantsMs` entry `< beforeMs`;
- latest `relevantInstantsMs` entry `< beforeMs`;
- when `firstDiffRelevantMs !== undefined`: latest `allEventInstantsMs` entry
  that is `< beforeMs` AND `> firstDiffRelevantMs` (the post-first-touch static
  flood of rule 3);
- horizon = max of those (or -1). Use binary search over the sorted arrays
  (write one small `findLatestInstantBefore(sortedMs, beforeMs)` helper —
  verb-named, tested).

Mark the two conservatism rules with `ponytail:` comments naming the ceiling
(e.g. `// ponytail: after the first script touch every later eligible run and
static event floods the horizon — per-pair chain tracking if script-heavy files
ever need sparse horizons`).

### Tests (tests/reconstruction_lineage_horizon.test.ts, written FIRST)

Model record fixtures on tests/reconstruction_script_memo.test.ts (it already
builds synthetic transcripts with Write events and python heredoc Bash runs)
and keep each test single-behavior:

1. `findLatestInstantBefore` returns the last instant strictly before the
   probe, and -1/undefined-equivalent when none.
2. Two queries at different instants with one Write of F and nothing between
   → identical horizon keys.
3. A second static Edit of F between the instants → different keys.
4. An eligible run with NO memoized execution between the instants → different
   keys (conservative bump).
5. The same run memoized as a skip (`post: undefined` seeded directly into
   `getDerivedCaches(records, reader).executionsByRun` under
   `computeRunExecutionKey(run)`) → identical keys (skip runs never relevant).
6. The run memoized with a post whose diff changes F's state key → different
   keys; with a diff touching only an unrelated key → identical keys.
7. Read-only code (`scriptCodeMayWriteFiles` false) and bash-executor runs
   never bump, even unexecuted.
8. After a diff-relevant run, a later static event of an UNRELATED file bumps
   F's horizon (flood rule).
9. The scan is not recomputed while `executionsByRun.size` is unchanged
   (observable: seed the map, compute a key, mutate an existing execution's
   maps in place — forbidden in production but fine as a test probe — and
   assert the key is unchanged; then ADD an execution and assert the scan
   refreshes).

## Step 4 — reconstruction_branches.ts (exactly at the 250-line cap)

In `replayLineageContentBefore`:

- add import of `computeLineageSeedHorizonKey` (goes into the existing
  multi-name import block region — one added line);
- after the guard block, compute
  `const seedKey = computeLineageSeedHorizonKey(records, reader, target, before);`
- pass `seedKey` instead of `cycleKey` to BOTH `findServableLineageSeed` and
  `storeLineageSeedWhenCacheable`. `cycleKey` stays for `recordLineageKeyQuery`,
  `isLineageKeyOnReplayStack`, `recordLineageGuardHit`, `runLineageReplayFrame`.

Line budget: the file is at 250. Reclaim 2 lines by tightening the 4-line
comment at lines 196–199 to 2 lines (keep the task-162 pointer). Verify with
`wc -l` ≤ 250 after the edit.

Integration test (append to tests/reconstruction_lineage_memo.test.ts or the
new horizon test file — wherever the fixture helpers land): reconstruct a
transcript where a closure file F has one Write and two later run instants
with nothing relevant between; call `getLineageContentBefore(records, reader)`
twice (t1, t2); assert via `snapshotReconstructionCounters()` that
`lineageReplayRequests` advanced twice but `lineageCacheServes` advanced on the
second query, and both texts are identical.

## Step 5 — bookkeeping

- Append one line to plans/166-per-file-target.md attempt-3 section: fix
  implemented per plans/220-lineage-horizon-memo.md, pending a task-182 rerun.
- Task 220 stays OPEN until the user's real-corpus rerun proves the rate;
  stage everything in jfred and RevEng, no commits.
- Do NOT run the full suite (user runs `npm test`); the new unit tests are the
  red-green vehicle and may be run individually during implementation ONLY if
  the user later asks — this session writes them and leaves execution to the
  user.

## Explicitly out of scope

- True forward-replay restructuring of `injectScriptExecutions` (optimizations
  Phases 4/5) — the horizon memo removes the same redundant replays without
  touching stage order.
- Any change to `executeRunOnce` semantics, the replay window, or the frame
  stack.
- Per-pair chain tracking to sharpen the flood rule (ponytail ceiling, noted
  in code).
