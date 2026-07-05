# Handoff: s80/s82/s83/s84/s85 fully reconstructed (sweep 80→85/85) — HOW each mechanism works
Conversation name: streamed-drifting-graham
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/61aca2a3-c849-4bfc-9487-72c2ed898907.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/streamed-drifting-graham.md (implementation notes: plans/implementation-notes-streamed-drifting-graham.md)

## Branch
`api-from-scenarios` based on `master`

## Goal
Close the last five failing scenarios in the per-step coverage oracle (s80, s82, s83, s84, s85) — all script-execution scenarios where Python scripts move/rename/create files with no per-file Write/Edit events in the transcript. Everything is committed as `f9a46eb "85/85 passing"`.

## Current State
Done and committed. Sweep: 85/85 scenarios fully reproduced. `npm test`: 343/343. `npm run typecheck`: clean. `stash@{0}` (the prior session's parts bin) is still present and should stay.

### HOW the engine closes each scenario (mechanism descriptions)

**s80 — renames recovered from printed stdout.** A script run's `shutil.move` leaves no tool_use event; the only evidence is the run's printed `one.py -> core_one.py` lines in the executor's tool_result. `extractScriptRenameEvents` (src/reconstruction_extract.ts, appended inside `extractFileEvents`) maps each executor tool_use id to its run instant + cwd (MCP `input.cwd` preferred over record cwd), scans the paired tool_result text with the `renameArrowLine` regex (both sides must carry a dot-extension — this rejects function renames `f_one -> alpha` and echoed f-strings `{name}.py -> …` since braces aren't path chars), drops pairs whose source was never written (phantom guard), resolves both sides against the run's cwd, and stamps the rename at the RUN's instant so later events order after it.

**s84 — lineage-first pre-state seeding.** `getPreExecutionState` (src/reconstruction_script_execution.ts) seeds the sandbox for a script run from, in priority order: (1) the target's own reconstructed lineage just before the run (`LineageContentBefore` callback — `getLineageContentBefore` in src/reconstruction_branches.ts replays `reconstructFileOver` and takes `lastRevisionStrictlyBefore`, strictly-before so a run never seeds from its own injected output; re-entrancy is broken by a module-scope `seedingLineages` set keyed `path|beforeMs`); (2) the file-history backup at the rename-resolved current name; (3) the backup at the original name; (4) the authored Write body. Every written file is seeded (not just files the script names), keyed by `computeScriptStateKey` = the cwd-relative path (preserving `tests/` subdirs) else basename. `runScriptAgainstState` walks the WHOLE temp dir afterwards (recursive `readAllFiles`), so files the script creates or renames-to are captured and deleted files are absent. `executeRunOnce` (src/reconstruction_script_stage.ts) memoizes one (pre, post) pair per run per records array in a WeakMap — key `timestamp|code`.

**s83 — glob-agnostic run→target gate.** A script that finds files via `glob.glob("core_*.py")` never names the target, so the substring gate fails. `runForTarget` keeps the substring pass primary (preserves run selection for the 80 already-green scenarios), and only when it finds nothing runs a second pass choosing the latest run for which `runTouchesTarget` is true — execution evidence: run the script once (cached), and see whether the target's ref (`refForTarget` over pre+post keys) changed or appeared. Over-firing is contained by the downstream beacon validation and pre≠post guards, not new guards.

**s82 — script-created files become targets.** `discoverScriptCreatedPaths` (src/reconstruction_script_stage.ts) executes every run once and collects post-state keys absent from the pre-state (skipping `__pycache__`/`.pyc`), resolved against the run cwd. `reconstructFilesOver` unions these with `distinctFinalPaths` when a reader is present. `beaconlessScriptExecution`'s guard accepts `pre === undefined` with a defined post as a legitimate birth (replay already builds a genesis revision from a scriptExecution event with no prior revisions).

**s85 — run chaining + git-commit blobs as an evidence channel.** Two mechanisms:
1. *Chaining* (`beaconlessScriptExecutions`, plural, src/reconstruction_script_stage.ts): a script-born file never appears in a later run's own cached sandbox (no Write event, nothing printed → no rename chain), so after the first run births/changes a target, each LATER run is re-executed against the run's cached pre-state augmented with the target's rolling content (`runOutcomeForTarget` with a `RollingTargetState`); one event is injected per run that changes the content. This is how `apply_renames.py`'s effect lands on `core_*.py` (steps 6–10).
2. *Git evidence* (src/reconstruction_git_evidence.ts, stage `placeGitCommitEvidence` wired after `injectScriptExecutions` in `reconstructFileOver`): `findGitCommitEvents` matches recorded `git commit` Bash commands via the `gitCommitCommand` regex (handles `git -C <dir> commit`; the -C dir wins over record cwd). `readCommittedFileContent` resolves the commit by committer time nearest the record timestamp within 60s (`git log --format='%H %cI'` in the recorded cwd, then `git show hash:relpath`); every absence (repo/commit/path) is a silent undefined so non-git scenarios are untouched. The placement: compute the blob's diff vs the lineage content at the commit instant; accept only PURE line additions (`pureAdditionsFrom` — a subsequence walk; any deletion/change bails); re-anchor the additions onto each earlier full-content event in turn (`applyAdditions`, anchor = the preceding blob line, inserted after its last occurrence); accept the EARLIEST placement from which re-executing the remaining runs (matched to events by timestamp, sandbox seeded with the rolling edited content) reproduces the blob BYTE-EXACT; splice a synthetic userEdit at the midpoint between the base event and its successor and rewrite downstream script events' contents so the addition survives them. This is how `# reviewed by ops` lands on `core_two.py` between the move and rename runs (steps 4–5).

## What Remains
1. (Durability, flagged not fixed) s85's repo is resolved via the RECORDED temp cwd `/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.o1fs4eqs`, which still exists but will vanish on temp cleanup — s85 steps 4–10 would then regress. Fix shape: teach `readCommittedFileContent`'s caller (or a reader-root mapping like the file-history sidecar's) to fall back to the preserved repo at `scenarios/executed/s85-git-commit-csv-and-move-scripts/.git` when the recorded cwd is gone. Verify by temporarily renaming the temp dir and re-running `npx tsx scripts/check_scenario_coverage.ts s85`.
2. Nothing else pending from the plan — all five scenarios and all gates are green and committed.

## Key Files
- src/reconstruction_script_execution.ts — run detection, `ScriptRun` (now carries `cwd`), `computeScriptStateKey`, lineage-first `getPreExecutionState`, full-walk `runScriptAgainstState`
- src/reconstruction_script_stage.ts — `executeRunOnce` cache, `refForTarget`/`runTouchesTarget` gates, chained `beaconlessScriptExecutions`, `discoverScriptCreatedPaths`, `injectScriptExecutions`
- src/reconstruction_git_evidence.ts — NEW: git-commit evidence channel + `placeGitCommitEvidence` placement stage
- src/reconstruction_branches.ts — pipeline wiring (`injectScriptExecutions` → `placeGitCommitEvidence` → `completeElidedBeacons`), `getLineageContentBefore`, `lastRevisionStrictlyBefore`, target union in `reconstructFilesOver`
- src/reconstruction_extract.ts — `extractScriptRenameEvents` (stdout renames)
- src/regex_expressions.ts — `renameArrowLine`, `gitCommitCommand` (all regexes live here, composed from named primitives)
- src/structures/vocabulary.ts — `EXECUTOR_TOOL_NAMES` single-sourced here
- tests/reconstruction_git_evidence.test.ts, tests/reconstruction_script_stage.test.ts, tests/reconstruction_script_execution.test.ts, tests/reconstruction_extract.test.ts — the TDD tests for every mechanism above
- plans/implementation-notes-streamed-drifting-graham.md — design decisions, deviations, the s85 STOP report and its resolution

## Context the Next Agent Won't Have
- The prior session's stash (`stash@{0}` on `c7b3611`) is a PARTS BIN, not a unit: its extraction half was restored file-by-file; its `reconstruction_script_execution.ts` rewrite keyed pre-state files by bare basename, which broke s44 and the s37 canary test — do NOT `stash pop` it. Leave it in place.
- The plan's per-phase gate predictions were wrong twice, and both times the code was right: s83 went 14/14 in Phase 3 (the plan expected 12/14 until Phase 5a — the existing backfill stages placed the comment once the gate fired), and s85's rename steps were NOT covered by Phases 3+4 as the plan claimed (the chaining mechanism was designed mid-run and user-approved before implementation, per the plan's own STOP clause).
- `test_s37_ledger_has_a_script_execution_revision_renamed_without_the_comment` (tests/reconstruction_script_stage.test.ts) is the canary for the stash's basename-keying bug — if it goes red, pre-state keys lost their subdirectory qualification.
- The provenance-wiring test (tests/reconstruction_provenance_wiring.test.ts) whitelists instrumented stage names; `injectScriptExecutions` was added when the glob-agnostic gate made it (correctly) fire on s29. A new `noteStage` stage name must be added there or the test fails misleadingly.
- `verify_gaps.ts` (repo root, committed by the user as 8fba793) reads `uncovered-real-jsonl-lines.md` (restored from the stash by the user). Last run: Section A 3/3 MATCH, Section B 0 real mutations hiding as ignored bash variants — no engine gaps.
- The test runner is `node --test` via `npm test`, NOT vitest. Single-file runs: `npx tsx --test tests/<file>.test.ts`.
- User preferences enforced this session: regexes only as named constants in src/regex_expressions.ts composed from the named primitives; strict red-green TDD (write the named failing test first); 4-space indent; verb-named functions and domain types per plans/coding-requirements.md.

## How to Verify
```
npx tsx scripts/check_scenario_coverage.ts   # expect: 85/85 scenarios fully reproduced.
npm test                                     # expect: 343 pass, 0 fail
npm run typecheck                            # expect: clean
npx tsx verify_gaps.ts                       # expect: 3x MATCH, 0 hidden mutations
```
