# Single-file reconstruction performance optimization

## Status

Proposed implementation plan based on the bounded `plate_cli.py` run started on
2026-07-23. This work is required before task 182 can be completed. It extends
task 192: the task-192 execution-cache blowup is real, but fixing that cache
alone will not make the current single-file command acceptably fast.

No reconstruction semantics may be weakened to meet the performance target.
The optimized command must emit the same `FileHistory[]` JSON as the current
implementation for the selected branch and final target path.

## Command under investigation

The command at `terminalLaunchCommands.txt:14` requests:

- 156 project JSONLs, merged into 72,438 records;
- a turn-end bound at revision 1 of `plate_cli.py`, leaving 39,922 records;
- the literal `surviving` conversation branch;
- one final target path, `common/scripts/plate/plate_cli.py`;
- JSON `FileHistory[]` output.

The run was stopped after approximately 6 hours 49 minutes. Its log is
`/tmp/plate_cli_bounded_progress.log`.

## Findings

### 1. Selection is applied after reconstruction

`reconstruction_cli.ts:155` calls `reconstructBranches(records, reader)`
unconditionally. Only after that completes does line 161 apply
`filterByTarget`, even when both `--branch surviving` and `--file` are known.

`reconstructBranches` does all of the following:

1. Enumerates every conversation branch.
2. Calls `reconstructAll` for the surviving branch.
3. Calls `buildRewoundBranchHistory` for every rewound branch.
4. `reconstructFilesOver` reconstructs every discovered target on each pass.
5. The CLI discards every history except the requested final path.

The current test documents this accidental contract explicitly:
`reconstruction_cli.test.ts:211` says the other source's file is
"reconstructed but filtered out of the rendering." The test verifies output
filtering, not work scoping.

The log proves this is the dominant waste:

- The surviving pass selected 10,065 records and 306 script runs.
- The requested `plate_cli.py` history completed around log line 3,920.
- The engine then began another pass over the 39,922-record corpus with 2,824
  script runs.
- When stopped, that pass had reached only run 150 of 2,824.
- The log contains 13,149 per-file reconstruction-stage lines for 83 distinct
  target paths, although one path was requested.

For this command, no rewound-branch history and no unrelated file history can
affect the returned value.

### 2. A direct file call still performs global script work

Calling the existing `reconstructFile` instead of `reconstructBranches` removes
the branch/file fan-out, but `reconstructFileOver` still calls
`appendScriptMoveRenames`. That function executes every eligible run in the
selected record set to find sandbox-proven moves. This is required for
glob-driven moves whose source and destination are not statically named.

Each eligible run calls `getPreExecutionState`, which walks all authored Write
events before the run and asks `getLineageContentBefore` for each file.
Each unique `(path, run timestamp)` can recursively reconstruct that file.
The stopped run recorded:

- 59 script execution attempts;
- 59 pre-execution-state builds;
- 1,267 lineage replays;
- 57 distinct lineage targets.

Therefore the CLI fast path is necessary but not by itself a complete
performance solution.

### 3. Bash commands are sent to a Python-only sandbox

`ScriptRun` loses the executor/tool kind and stores only `code`.
`spawnSandboxRun` always writes that code to `__script__.py` and invokes
`python3`. Bash-origin commands such as `grep`, `git`, `rm`, and `mv` cannot
produce a post-state through this sandbox, but may still pay the full
pre-execution reconstruction cost first.

The code comments already acknowledge this behavior. Shell rename and redirect
evidence is extracted through separate static channels, so skipping a command
that is known to come from the Bash tool preserves the current sandbox result:
`post === undefined`.

There is also a concrete read-only-classifier bug. The write-primitive pattern
`\bln\b` matches the `ln` letters in the read-only option `grep -ln`. Three such
commands in this run built pre-state and entered the sandbox unnecessarily.

### 4. Task 192 remains a separate full-mode blocker

Task 192 records a prior run in which one script was executed about 11,980
times. `executeRunOnce` stores results in `getDerivedCaches(records, reader)`,
whose owner is a records-array identity. Branch selections and other derived
record sets can represent the same semantic corpus scope with different array
identities, so the execution memo is not a reliable build-wide memo.

The current bounded run had not yet reached the point where that earlier
pathology dominated, but it was already entering the 2,824-run branch pass.
Target scoping avoids most of that work for this command; full reconstruction
still needs the task-192 cache correction.

### 5. Revision-bound reporting is misleading

The merged records are grouped by input JSONL, not globally sorted.
`truncateRecordsAtRevisionTurnEnd` reports the timestamp of the last retained
array element as `boundInstant`. That is not necessarily the wall-clock
boundary used by the filter. This does not cause the multi-hour runtime, but it
can make performance diagnosis and iterative reconstruction choose the wrong
interpretation of the bound.

## Required design

### Phase 1: Add a target-scoped surviving-branch path

Add an engine API that returns a `FileHistory`, not only revisions:

```ts
reconstructFileHistoryOver(
    records: TranscriptRecord[],
    target: Path,
    reader?: BackupReader,
): FileHistory | undefined
```

Its responsibilities are:

1. Operate over exactly the records supplied by the caller.
2. Resolve the target through the same complete rename chain used today.
3. Preserve the current exact-final-path selector contract. A request for an
   old rename source must not become a new result if the all-files path would
   filter it out.
4. Return `undefined` when the target is not one of the histories the current
   all-files reconstruction would expose.
5. Reuse `reconstructFileOver`; do not fork the replay pipeline.

Add a surviving wrapper that calls `selectLiveBranch` exactly once and then
calls `reconstructFileHistoryOver`.

Change both JSON and text CLI dispatch so this condition:

```text
target is present AND branch is the literal "surviving"
```

uses the targeted wrapper before any call to `reconstructBranches`.

The JSON result remains an array:

- found: `[history]`
- not found: `[]`

Text rendering passes that zero-or-one array through the existing
`renderChosen` behavior.

This path must not call:

- `reconstructBranches`;
- `buildRewoundBranchHistory`;
- `reconstructFilesOver`;
- `discoverScriptCreatedPaths`;
- `collectAcceptedUserEditIds`;
- step/document builders.

Do not initially change bare `--json --file`. Bare JSON returns a
`ReconstructionDocument`, whose steps, messages, branch metadata, and other
fields have a broader contract. Optimize that separately after the
`--branch surviving --json --file` release blocker is proven.

After the surviving path ships, extend the same model to a selected rewound
branch: enumerate branch metadata, select only the requested tip, and
reconstruct only the requested final target. This is not required for task
182.

### Phase 2: Preserve executor kind and skip impossible sandbox runs

Extend `ScriptRun` with an executor kind derived from the source tool block,
for example:

```ts
type ScriptExecutorKind = "python" | "bash";
```

The kind must participate in the run identity/cache key.

For Bash-origin runs:

1. Keep them available to existing static shell rename/redirect extraction.
2. Do not call `getPreExecutionState`.
3. Do not call `runScriptAgainstState`, because the only current executor is
   `python3 __script__.py`.
4. Memoize the skipped execution as `{ pre: new Map(), post: undefined }`.
5. Emit a distinct progress reason such as
   `skipping non-python sandbox run`, so this is observable and testable.

Do not infer language from source text when the originating tool kind is
available. MCP code-execution runs remain Python and retain current behavior.
If another real sandbox executor is added later, it should be an explicit
strategy keyed by executor kind.

Fix the `grep -ln` false positive independently because the classifier is also
used for viewer read-only labels. Split `ln` from the generic word-boundary
alternative and require that it is not immediately preceded by a word
character or `-`. Add cases for:

- `grep -ln pattern file` -> read-only;
- `grep -n pattern file` -> read-only;
- `ln -s target link` -> may-write;
- `/bin/ln target link` -> may-write;
- `println(...)` -> not a shell `ln` command.

### Phase 3: Make pre-state construction do one lookup per path

`getPreExecutionState` currently processes every eligible Write event. Multiple
Writes that resolve to the same current path cause repeated identical
`seedContent(currentPath, run.timestamp)` requests.

Build a map of current path to the latest eligible authored Write first, then
resolve content once per path. Preserve the existing fallback order:

1. reconstructed lineage;
2. backup at the current name;
3. backup at the authored/rename-source name;
4. latest authored Write content.

The map must preserve the current `state.set` winner for paths that collapse
through renames. Add a focused equivalence test with multiple Writes and a
rename before one run.

Do not introduce static "only seed files named in the script" pruning in this
phase. Glob, directory walks, local imports, and computed paths require ambient
workspace files; narrowing those without a proof would lose reconstruction
evidence.

### Phase 4: Complete task 192 with semantic cache scopes

Do not solve task 192 with a process-global
`Map<timestamp|code, RunExecution>`. Pre-state can differ by branch, bound,
reader, execution-consent flag, and pre-baseline policy.

Introduce a build/corpus context created after merge and revision bounding.
Derived record arrays must register their semantic selection with that context,
for example:

```ts
type ReconstructionScopeKey =
    | { kind: "surviving" }
    | { kind: "branch"; tip: string };
```

Store execution results in the root build context and key them by:

- semantic branch/scope key;
- stable run identity, preferably `toolUseId`, falling back to source location
  plus timestamp and code hash;
- reader identity/version;
- impure-execution consent;
- pre-baseline policy.

The lineage replay cutoff does not need a separate execution result when the
same run and branch have the same pre-state at the run timestamp. Prove that
in tests before omitting it from the key. If that proof cannot be encoded,
include the effective cutoff/snapshot identity.

Keep the sandbox's existing content-addressed `(code, cwd, pre-state)` memo as
the final correctness backstop. The build-level execution memo prevents
rebuilding pre-state; the sandbox memo prevents duplicate child processes.
They solve different costs.

Add cache instrumentation available to tests:

- execution requests;
- execution-cache hits;
- pre-state builds;
- sandbox spawns;
- lineage replay requests and hits.

### Phase 5: Cache conversation-tree indexes

Store `indexRecordsByUuid(records)` and the deduplicated head list in the pure
`CorpusState`. Change ancestor, rewind-point, and head-at-or-above walkers to
accept/reuse the index instead of rebuilding it per head.

The staged `collectAbandonedHeads` change reduces an
`O(heads^2 * records)` pattern, but `mapHeadChains` still calls
`collectAncestorUuids`, which rebuilds the full UUID index for every head.
For the observed 733 heads and 39,922 records, that remains tens of millions of
avoidable index insertions. This phase benefits full mode and branch listing;
the Phase-1 surviving target path should avoid abandoned-head enumeration.

### Phase 6: Correct the bound diagnostic

Return and report the actual turn-end boundary instant from
`findTurnEndBoundary`, rather than the timestamp of the final retained array
element. Add a multi-JSONL, non-chronologically-grouped test.

This is a diagnostic correctness fix, not part of the performance acceptance
calculation.

## Tests

### Output equivalence

For representative fixtures, run the old all-branch/all-file path and the new
targeted engine API directly, then deep-compare the selected history:

- simple Write/Edit history;
- static rename into the requested final path;
- glob-driven sandbox-proven move;
- copy-seeded history;
- script execution with and without a user-edit beacon;
- base-commit seed;
- revision-bounded multi-source corpus;
- target absent;
- old rename source requested.

Do not compare serialized whitespace; compare parsed structures and all
revision fields.

### Work-scoping regression

Replace the task-181 assumption that unrelated files are reconstructed.
Capture progress/counters and assert that:

- `--branch surviving --json --file alpha.py` never announces reconstruction
  of `beta.py`;
- no rewound-branch reconstruction event occurs;
- no script-created-path discovery pass occurs;
- the result is still the one-element `FileHistory[]`.

Add a fixture with a rewound branch containing a script so the test would fail
if `reconstructBranches` were called.

### Script gating

Assert that Bash-origin runs produce no pre-state build and no sandbox spawn,
while their statically extracted `mv`/redirect evidence remains unchanged.
Assert that Python-origin runs still execute and reconstruct the same results.

### Cache correctness

Use two branches with the same run identity but different pre-run file content:
their results must not cross-serve. Repeated requests in one semantic branch
must build pre-state once. Changing reader, consent, or pre-baseline policy
must invalidate the entry.

Run the s85 move/range-patch scenarios explicitly; task 192 must not regress
their branch- and pre-state-sensitive behavior.

## Real-corpus benchmark and acceptance gates

Add a reproducible benchmark wrapper for the exact command in
`terminalLaunchCommands.txt`. Record wall time, peak RSS, and the counters
listed above in a small JSON report. Run it cold in a fresh process.

Task 182 may be unblocked only when all of these hold:

1. The exact bounded command completes and writes valid non-empty JSON.
2. The output contains exactly one history for the requested final path.
3. No rewound branch is reconstructed.
4. No unrelated top-level file history is reconstructed.
5. Every eligible Python run is pre-state-built at most once per semantic
   branch scope.
6. No Bash-origin run enters the Python sandbox.
7. Cold wall time is at most 10 minutes on the machine used for the 6h49m
   observation, with a stretch target of 5 minutes.
8. Peak RSS and output size are recorded, with no unbounded cache growth.
9. The full unit suite, typecheck, and webapp build pass.
10. The emitted ladder passes task 182's content checks: baseline blob
    `9d14d60d`, intermediate revisions, final revision, and reported count.

If Phase 1 plus Phase 2 do not meet the 10-minute gate, use the counters to
decide whether Phase 3 or Phase 4 is dominant before adding further
optimization. Do not add heuristic evidence pruning.

## Implementation order

1. Add benchmark counters and output-equivalence fixtures.
2. Implement Phase 1 and run the real bounded benchmark.
3. Implement Bash-origin gating and the `grep -ln` classifier fix.
4. Implement one-lookup-per-path pre-state construction.
5. Implement the semantic task-192 execution cache.
6. Cache tree indexes and correct the bound diagnostic.
7. Run the exact task-182 verification and update
   `plans/166-per-file-target.md` with timings and ladder results.

## Release impact

The current open-task dependency chain is:

```text
192 -> 182 -> 183 -> 184
          -> 186 -> 187 -> 189 -> 190
          -> 188 ------^
```

Task 194 also depends operationally on a bounded engine path that completes in
interactive time. Until the target-scoped path and task-192 cache behavior are
proven on the real corpus, the per-file viewer, 68-file sweep, iterative
re-seed proof, added/deleted-file sweeps, and bounded webapp mode cannot be
released credibly.
