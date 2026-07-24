# Task 192: bounded single-file reconstruction performance

Implements the measured-priority phases of `optimizations.md` (RevEng root): the
target-scoped surviving-branch CLI path (Phase 1), Bash-run sandbox gating plus
the `grep -ln` classifier fix (Phase 2), one-lookup-per-path pre-state
construction (Phase 3), counters instrumentation, the bound-diagnostic fix
(Phase 6), and a benchmark wrapper. Phase 4 (semantic execution-cache scopes)
and Phase 5 (tree-index caching) are deliberately deferred — see "Out of
scope".

All work happens in the `jfred` submodule
(`/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred`). The repo has
STAGED changes (heartbeat progress + `collectAbandonedHeads` O(n²) fix in
`src/reconstruction_trunk.ts`, `src/reconstruction_progress.ts`,
`src/reconstruction_engine.ts`, `src/reconstruction_branch.ts`,
`tests/reconstruction_progress.test.ts`). Build on them; never revert them.

Mandatory reading before writing code: `jfred/plans/coding-requirements.md`
(domain types over primitives, enum-member comparisons, verb-named functions,
single-source vocabulary, DRY). Tests run via `npm test` (node --import tsx
--test). Test files follow `tests/<module>.test.ts` naming (a Stop hook
enforces this). Every source file has a 250-line cap — split, never condense.
Strict red-green TDD: for each step, write the failing test first, then the
minimum code to pass.

## Correctness invariant (applies to every step)

No reconstruction semantics may change. The targeted command must emit the
same `FileHistory[]` JSON the current all-branch path emits for the selected
branch and final target path. Any place this plan says "same result", write an
equivalence test that proves it by deep-comparing parsed structures (never
serialized whitespace).

## Step 1 — counters instrumentation

New module `src/reconstruction_counters.ts` (+ `tests/reconstruction_counters.test.ts`).

1. Define `export enum ReconstructionCounter { executionRequests, executionCacheHits, preStateBuilds, sandboxSpawns, sandboxMemoHits, lineageReplayRequests, lineageCacheServes }`
   (string-valued members, e.g. `executionRequests = "executionRequests"`).
2. Module-level `Map<ReconstructionCounter, number>` with three verb-named
   functions: `incrementReconstructionCounter(counter)`,
   `snapshotReconstructionCounters(): Record<string, number>` (every enum
   member present, missing = 0), `resetReconstructionCounters()`.
3. Wire increments at exactly these sites:
   - `executeRunOnce` (`src/reconstruction_script_runs.ts:74`): `executionRequests`
     on entry; `executionCacheHits` when `cached !== undefined`.
   - `getPreExecutionState` (`src/reconstruction_script_prestate.ts:142`): `preStateBuilds` on entry.
   - `runScriptAgainstState` (`src/reconstruction_script_sandbox.ts:167`):
     `sandboxMemoHits` on the memo return; `sandboxSpawns` right before `spawnSandboxRun`.
   - `replayLineageContentBefore` (`src/reconstruction_branches.ts:211`):
     `lineageReplayRequests` on entry; `lineageCacheServes` next to `noteLineageCacheServe`.
4. CLI emission: in `runCli` (`src/reconstruction_cli.ts:172`) call
   `resetReconstructionCounters()` beside `clearReconstructionFailures()`; in
   the `try`, after `renderTranscriptView` returns and only when
   `sink !== undefined`, write one line to stderr:
   `counters: ${JSON.stringify(snapshotReconstructionCounters())}` — via a
   helper `emitReconstructionCounters(): string` in the counters module so
   `reconstruction_cli.ts` gains only ~4 lines (it is at 233/250).
   Do NOT route this through `reportReconstructionProgress` — the progress
   contract test (`tests/reconstruction_progress.test.ts`) pins the sink's
   sequences; use `process.stderr.write` directly.

Tests (plain-English step comments per the TDD guide, one behavior each):
- `test_counter_increment_and_snapshot` — increment twice, snapshot shows 2, other counters 0.
- `test_counter_reset_zeroes_all` — increment, reset, snapshot all zeros.
- `test_execute_run_once_counts_request_and_cache_hit` — drive `executeRunOnce`
  twice with the same run/records (reuse a fixture from
  `tests/reconstruction_script_runs.test.ts` if present, else a minimal
  synthetic run); assert requests=2, hits=1.

## Step 2 — Phase 1: target-scoped surviving-branch CLI path

New module `src/reconstruction_target.ts` (+ `tests/reconstruction_target.test.ts`).

### Engine API

```ts
export function reconstructFileHistoryOver(
    records: TranscriptRecord[],
    target: Path,
    reader?: BackupReader,
): FileHistory | undefined
```

Body (mirrors the head of `reconstructFilesOver` in
`src/reconstruction_renderable.ts:26-49`, but for one target and WITHOUT
`discoverScriptCreatedPaths`):
1. `extractFileEvents(records)` (corpus-memoized, cheap on repeat).
2. `appendScriptMoveRenames(extracted, records, reader, reader ? getLineageContentBefore(records, reader) : undefined)`
   when `reader` is set, else the extracted events (imports from
   `reconstruction_script_move_events.ts` / `reconstruction_branches.ts`).
   Executions are memoized per records identity, so this costs nothing extra
   beyond what `reconstructFileOver` will do anyway.
3. `buildRenameChain(events)`; `finalTarget = resolveFinalPath(target, renameChain)`.
   If `finalTarget.toString() !== target.toString()` return `undefined` — a
   request for an old rename source must NOT become a new result (parity with
   `filterByTarget`, which matches only final paths).
4. Membership check: `distinctFinalPaths(events, renameChain)` contains
   `target` → `revisions = reconstructFileOver(records, target, new Set(), reader)`
   and return `{ target, revisions }` (empty revisions included — parity with
   the all-files backstop).
5. Not a member: still call `reconstructFileOver`; return `{ target, revisions }`
   when `revisions.length > 0` (a script-born target the all-files path only
   finds via discovery), else `undefined`.
   Comment: `// ponytail: a discovered-but-zero-revision script-born path returns undefined here where the all-files path emits an empty history; no scenario exercises that corner`.

```ts
export function reconstructSurvivingFileHistory(
    records: TranscriptRecord[],
    target: Path,
    reader?: BackupReader,
): FileHistory | undefined
```
— exactly `reconstructFileHistoryOver(selectLiveBranch(records), target, reader)`;
`selectLiveBranch` is called once (it is corpus-memoized).

Also in this module, the CLI glue so `reconstruction_cli.ts` stays under cap:

```ts
export function isTargetedSurvivingRequest(options: CliOptions): boolean
// true iff options.branch === "surviving" && options.target !== undefined
export function listTargetedSurvivingHistories(
    records: TranscriptRecord[],
    reader: BackupReader | undefined,
    target: Path,
): FileHistory[]
// zero-or-one array from reconstructSurvivingFileHistory
```

### CLI dispatch (`src/reconstruction_cli.ts`)

- `renderJson`: immediately BEFORE `const branched = reconstructBranches(records, reader);`
  (line 155): when `isTargetedSurvivingRequest(options)`, return
  `JSON.stringify(listTargetedSurvivingHistories(records, reader, options.target!), null, 2)`.
- `renderTranscriptView` text path: immediately BEFORE
  `const branched = reconstructBranches(records, reader);` (line 223): when
  `isTargetedSurvivingRequest(options)`, return
  `renderChosen(listTargetedSurvivingHistories(records, reader, options.target!), options)`.

The fast path must never reach `reconstructBranches`,
`buildRewoundBranchHistory`, `reconstructFilesOver`,
`discoverScriptCreatedPaths`, `collectAcceptedUserEditIds`, or the
step/document builders — guaranteed by construction (returns before line 155/223).
Bare `--json --file` (no `--branch`) is UNCHANGED — the
`ReconstructionDocument` contract is broader and is optimized separately.

### Tests (`tests/reconstruction_target.test.ts`)

Output equivalence — for each fixture, deep-compare
`filterByTarget(reconstructBranches(records, reader).surviving, target)` (the
old path; import `reconstructBranches`, replicate the filter locally) against
`[reconstructSurvivingFileHistory(records, target, reader)]` via
`assert.deepStrictEqual` on the parsed structures. Reuse the builders in
`tests/fixtures.ts`, `tests/multi-source-test-helpers.ts`
(`buildPromptRecord`, `makeSourceTree`), and the fixture patterns in
`tests/reconstruction_engine.test.ts` / `tests/reconstruction_bound.test.ts`:
- `test_targeted_history_matches_allfiles_for_simple_write_edit`
- `test_targeted_history_matches_allfiles_for_rename_into_target`
- `test_targeted_history_for_absent_target_is_undefined`
- `test_targeted_history_for_old_rename_source_is_undefined`
- `test_targeted_history_matches_allfiles_on_bounded_multi_source_records`
  (drive records through `truncateRecordsAtRevisionTurnEnd` first).
- Rewind fixture: `test_targeted_history_matches_allfiles_with_rewound_branch`
  (fixture with a rewind so `selectLiveBranch` actually filters).

Work-scoping regression — capture progress lines via
`setReconstructionProgressSink`, drive `runCli` with a two-file fixture
(`alpha.py`, `beta.py`) that also has a rewound branch, args
`--branch surviving --json --file alpha.py`:
- `test_targeted_cli_never_reconstructs_unrelated_file` — no captured line
  contains `beta.py`.
- `test_targeted_cli_skips_rewound_branch_and_discovery` — no line contains
  `reconstructing rewound branch` and none contains
  `discovering script-created files`.
- `test_targeted_cli_emits_one_element_history_array` — stdout parses to a
  one-element array whose `target` is alpha's path.
- `test_targeted_cli_text_mode_renders_only_target` — same fixture without
  `--json`, assert the output's `### ` headers name only the target.

Update the accidental contract at `tests/reconstruction_cli.test.ts:211`
("reconstructed but filtered out of the rendering"): if that test drives
`--branch surviving --file`, its other-source file is now NOT reconstructed —
flip the assertion to the new work-scoping contract (result unchanged, work
absent). Keep the file under its 250-line cap; if the rewrite grows it, move
the test into `tests/reconstruction_target.test.ts`.

## Step 3 — Phase 2: executor kind + Bash sandbox gate

Files: `src/reconstruction_script_execution.ts` (117 lines, has room),
`src/reconstruction_script_runs.ts` (246/250 — the gate adds ~10 lines; if it
overflows, move `refForTarget` + `runTouchesTarget` to a new
`src/reconstruction_script_probe.ts` with direct-import updates at their two
call sites — no forwarding re-exports).

1. In `reconstruction_script_execution.ts`:
   - `export enum ScriptExecutorKind { python = "python", bash = "bash" }`.
   - Extend `ScriptRun` with `executorKind: ScriptExecutorKind`.
   - `runsInRecord`: `executorKind = block.name === ToolName.Bash ? bash : python`
     (enum-member comparison; MCP ctx tools stay python — current behavior).
2. In `resolveScriptIndirection` (`src/reconstruction_script_indirection.ts`):
   when a body is substituted AND `run.executorKind` is bash AND the invoked
   filename ends with `.py`, the returned run's `executorKind` becomes python
   (the s34/s37 `python3 apply.py` mechanism must keep executing). All other
   substitutions keep the original kind. Do not infer language from code text.
3. In `executeRunOnce` (`src/reconstruction_script_runs.ts`):
   - Cache key becomes `${run.timestamp.getTime()}|${run.executorKind}|${run.code}`.
   - New gate AFTER the pre-baseline skip and BEFORE the read-only skip:
     `run.executorKind === ScriptExecutorKind.bash` → report
     `PROGRESS_LABEL_NON_PYTHON_SKIP_PREFIX` (= `"skipping non-python sandbox run"`,
     exported const) with the same `@ ${iso}${formatRunSource(run)}` shape,
     memoize `{ pre: new Map(), post: undefined }`, return. This preserves the
     current sandbox result for every bash run (shell code under `python3`
     always crashed to `post: undefined`) while skipping `getPreExecutionState`
     and `runScriptAgainstState` entirely.
4. Synthetic-run construction sites in tests/fixtures that build `ScriptRun`
   literals need the new field — set python unless the test is about the gate.

Tests (extend `tests/reconstruction_script_runs.test.ts` if it exists, else
create; gate tests may also live in `tests/reconstruction_target.test.ts` only
if module-naming forces it — prefer the runs module test):
- `test_bash_run_skips_prestate_and_sandbox` — bash-kind run through
  `executeRunOnce`; counters show 0 preStateBuilds and 0 sandboxSpawns;
  progress captured the non-python skip label; result `post === undefined`.
- `test_python_run_still_executes` — python-kind run builds pre-state exactly once.
- `test_bash_indirection_to_python_file_executes` — bash run
  `python3 x.py` with a Written `x.py` body resolves to python kind.
- `test_bash_static_rename_evidence_survives_gate` — a bash `mv a b` run:
  rename evidence in the reconstruction unchanged (reuse an existing bash-mv
  fixture, e.g. from `tests/reconstruction_bash_events.test.ts`).
- Existing tests asserting the read-only skip label for BASH commands will now
  see the non-python label — update those expectations; python read-only runs
  keep the read-only label.

## Step 4 — `grep -ln` classifier fix

`src/regex_script_detection.ts:49-52`: remove `ln` from the
`\b(?:mv|cp|rm|mkdir|touch|tee|ln)\b` group and add the alternative
`(?<![\w-])ln\b` (not preceded by a word character or `-`). Update the
"Equivalent to the literal" comment to match. This is independent of Step 3
because the classifier also drives viewer read-only labels.

Tests (in the existing home of `scriptCodeMayWriteFiles` cases — locate via
`grep -rn "scriptCodeMayWriteFiles" tests/`; else `tests/regex_script_detection.test.ts`):
- `test_grep_dash_ln_is_read_only` — `grep -ln pattern file` → false.
- `test_grep_dash_n_is_read_only` — `grep -n pattern file` → false.
- `test_ln_dash_s_may_write` — `ln -s target link` → true.
- `test_bin_ln_may_write` — `/bin/ln target link` → true.
- `test_println_is_not_a_shell_ln` — `println("x")` → false.

## Step 5 — Phase 3: one lookup per path in pre-state

`getPreExecutionState` (`src/reconstruction_script_prestate.ts:142-173`),
first loop only (the `parseScriptFileRefs` loop is untouched):

1. First pass over `events`: for each eligible Write (kind write, timestamp ≤
   run's), compute `currentPath = resolveFinalPath(event.target, renameChain)`
   and upsert into `Map<string, WriteEvent>` keyed by `currentPath.toString()`
   — on replace, `map.delete(key)` then `map.set(key, event)` so the map's
   iteration order is each path's LAST eligible event. This re-creates the
   current last-`state.set`-wins outcome even when two different current paths
   collapse to the same `computeScriptStateKey` (basename collision outside
   cwd) — the delete/re-set makes iteration order equal the original final-set
   order.
2. Second pass over that map in iteration order: resolve content ONCE per
   path with the existing fallback chain unchanged (lineage `seedContent`,
   backup at current name, backup at the winning event's authored name,
   winning event's `content`), then `state.set(computeScriptStateKey(...), content)`.
3. Do NOT add "only seed files named in the script" pruning.

Tests (`tests/reconstruction_script_prestate.test.ts`, extend or create):
- `test_prestate_resolves_each_path_once` — three Writes to one path before a
  run: a counting `seedContent` stub is called exactly once for that path, and
  the seeded content equals the pre-change result.
- `test_prestate_rename_collapse_keeps_last_writer` — Writes to `a.py`, a
  rename `a.py → b.py`, another Write to `b.py`, then a run: state matches the
  pre-change implementation output (capture the old behavior first, red-green).
- `test_prestate_basename_collision_final_writer_wins` — two absolute paths
  outside cwd sharing a basename, interleaved Writes (A, B, A): the shared
  state key holds A's latest content (the delete/re-set ordering proof).

## Step 6 — Phase 6: honest bound diagnostic

`truncateRecordsAtRevisionTurnEnd` (`src/reconstruction_bound.ts:122-144`):
replace the `lastKeptInstant` derivation with `boundInstant: boundary.instant`
— the actual turn-end wall-clock cut `findTurnEndBoundary` returned. Update
the `RevisionBound.boundInstant` comment. Diagnostic-only; no acceptance math.

Test (`tests/reconstruction_bound.test.ts`, 12.8K — room):
- `test_bound_instant_reports_turn_end_not_last_record` — two-session
  interleaved fixture where the last RETAINED record's timestamp differs from
  the boundary prompt's instant; assert `boundInstant` equals the boundary
  prompt's timestamp. Update any existing assertion pinning the old value.

## Step 7 — benchmark wrapper

New `jfred/bench/bench_bounded.sh` (executable), ~15 lines, no new deps:
- Runs `/usr/bin/time -l npx tsx jfred/src/reconstruction_cli.ts …` with the
  EXACT arguments from `terminalLaunchCommands.txt:14-22`, stdout to
  `/tmp/plate_cli_bounded.json`, stderr to `/tmp/plate_cli_bounded_progress.log`.
- Afterwards extracts wall time + `maximum resident set size` from time's
  output and the final `counters: {…}` line from the progress log into
  `/tmp/plate_cli_bounded_report.json` via a small `node -e` one-liner.
- DO NOT RUN IT. The user runs the real-corpus benchmark themselves.

Also update `terminalLaunchCommands.txt` (RevEng root, user-owned — edit in
place, keep the existing content): below the existing Terminal 1 block for
lines 14-22, add a timed variant of the SAME command that captures start/end
wall-clock instants and peak RSS, e.g. a block that runs
`date +"start %Y-%m-%dT%H:%M:%S%z"`, then the exact command wrapped in
`/usr/bin/time -l`, then `date +"end %Y-%m-%dT%H:%M:%S%z"`, with time's output
appended to the progress log — plus a one-line pointer to
`jfred/bench/bench_bounded.sh` as the JSON-report alternative.

## Verification (run all; fix failures before staging)

In `jfred/`: `npm run typecheck`, `npm test` (expect the full suite green —
1,026 pre-existing tests plus the new ones), `npm run build:webapp`.

Then stage everything in `jfred` AND stage the plan file + submodule pointer
in the RevEng root. No commits. Do NOT close task 192, do NOT edit
`plans/166-per-file-target.md`, do NOT modify `tasks.json` — those wait for
the user's measured real-corpus result.

## Out of scope (and why)

- Phase 4 (semantic execution-cache scopes): the fast path hands the engine
  ONE records identity (`selectLiveBranch`), so the memo cannot churn on this
  command; the 11,980×-executed run from the task-192 evidence is a Bash
  compound command that Step 3 now skips outright. Whether full-mode still
  needs semantic scopes is decided from the user's benchmark counters
  (`executionRequests` vs `executionCacheHits`), per optimizations.md's rule.
- Phase 5 (tree-index caching in `mapHeadChains`): the fast path never
  enumerates abandoned heads; full-mode-only win, same decision gate.
- Rewound-branch targeted mode, bare `--json --file` document optimization:
  explicitly deferred by optimizations.md.
