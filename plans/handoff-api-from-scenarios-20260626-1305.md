# Handoff: s37 script-replay — Phase C IMPLEMENTED (s37 PASS 13/13); commit B+C, then optionally extend to other script-types
Conversation name: script-replay (partitioned-puppy)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ba079f53-7a92-486b-89c4-344621a8bfc5.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/task-implement-script-replay-partitioned-puppy.md
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-script-replay-partitioned-puppy.md

## Branch
`api-from-scenarios` based on `master`. Phase A is COMMITTED as `3994422 added --trace tool to reconstruction_cli`. Phases **B and C are both uncommitted** in the working tree.

## Goal
Close the s37 (`s37-script-rename-driver-back-and-forth-mcp`) coverage gap: a script run (MCP `ctx_execute`) renamed functions across `ledger.py`/`tests/test_ledger.py` leaving no per-file Write/Edit, and the engine bled a later out-of-band `# names normalized via rename script` comment into the step-8 reconstruction. The 3-phase plan: A = a line classifier + `--trace` CLI (done, committed); B = make the verdict the single extraction gate (done, uncommitted); C = model the script execution and fix the bleed (done, uncommitted). **s37 is now PASS 13/13.**

## Current State
- **s37: `npx tsx scripts/check_scenario_coverage.ts s37` → PASS 13/13.** Coverage ledger sweep (`scripts/coverage_ledger.ts`) → **1/1**.
- **Full suite: `node --import tsx --test tests/*.test.ts` → 209 pass / 6 fail.** The 6 failures are PRE-EXISTING and unrelated (verified across the session): `test_findCoveredScenarios_includes_s19`, `test_readStepStateFiles_...`, `test_checkScenario_reports_every_step_passes_for_s19` (s19 has no `.step_states` in this worktree), `test_a_file_less_surviving_branch_is_kept_...`, `test_findPromptForkPoints_returns_the_single_S13_fork_8faab841`, `test_findDeepestPromptOrReply_...` (S13 fixtures). The former 7th failure — `s37 reproduces every captured step state` — now PASSES.
- `npx tsc --noEmit` → clean.
- **Phase C mechanism:** a reconstruction STAGE `injectScriptExecutions` (in `src/reconstruction_script_stage.ts`), wired into `reconstructFileOver` (`src/reconstruction_branches.ts`) BEFORE `completeElidedBeacons`. For each post-script user-edit beacon a script run explains, it takes the pre-script on-disk content (file-history backup at-or-before the run), runs it forward through the derived rename subs, validates the result reproduces every visible beacon line, and replaces the beacon with a `ScriptExecutionEvent` carrying the precomputed clean content. On mismatch the beacon passes through to `completeElidedBeacons` unchanged.

## What Remains
1. **Confirm commit granularity with the user**: B and C as ONE commit or TWO? (They are cleanly separable — see Key Files for which files belong to which phase.) Then commit. **The user makes ALL commits — do not commit yourself.** Stop after asking / once told.
2. (Optional, only if the user asks) **Extend script-execution modelling to other script-types.** s28/s30/s31/s33 are also script renames but currently flow through `completeElidedBeacons`; their forward transform (scoped / conditional / count-checked) is NOT the plain whole-token rename-CSV idiom, so `deriveRenameSubs` returns undefined and validation fails → they fall back. To model them, add scoped/conditional/count-checked derivations beside `deriveRenameSubs` in `src/reconstruction_script_execution.ts` (the plan's "script-type plugins"). Re-run the full suite + sweep; do not regress s28/s30/s35.
3. (Optional) Add the deferred **edit-reversal** step (reverse observed Edits in `(T, anchor]` newest-first onto the anchor) when a scenario actually has edits between the run and the first post-script beacon — s37 has none, so it was YAGNI'd.

## Key Files
**Phase C (new + modified):**
- `src/reconstruction_script_execution.ts` (NEW) — `ScriptExecutionEvent`/`RenameSub` types; transform (`parseRenameSubs`, `parseScriptTargets`, `escapeRegExp`, `applyRenameSubs`); run detection (`isScriptExecutionRun`, `findScriptExecutionRuns`); transform derivation (`deriveRenameSubs`, recovers the CSV from its file-history backup).
- `src/reconstruction_script_stage.ts` (NEW) — `injectScriptExecutions` (the forward-validate-inject stage). Split from the above for the 250-line cap.
- `src/structures/vocabulary.ts` — `EventKind.scriptExecution`; `ToolName.CtxExecute/CtxExecuteFile/CtxBatchExecute` (full `mcp__plugin_context-mode_context-mode__…` wire names).
- `src/reconstruction_engine.ts` — `ScriptExecutionEvent` added to the `FileEvent` union.
- `src/reconstruction_replay.ts` — `scriptExecution` branch (emits the event's precomputed `content`).
- `src/reconstruction_branches.ts` — `injectScriptExecutions` wired into `reconstructFileOver` before `completeElidedBeacons`.
- `tests/reconstruction_script_execution.test.ts`, `tests/reconstruction_script_stage.test.ts` (NEW); `tests/reconstruction_engine.test.ts`, `tests/vocabulary.test.ts` (membership/union assertions).

**Phase B (modified, uncommitted):**
- `src/reconstruction_extract.ts` — `collectEventsFromRecord` early-returns when `recordVerdict(record) === Verdict.ignore` (the single evidence gate).
- `src/reconstruction_parse_lines.ts` — exported `recordVerdict`.
- `tests/reconstruction_extract.test.ts` — `test_extraction_ignore_gate_changes_no_s37_events` (parity).

**Reference:**
- `plans/implementation-notes-script-replay-partitioned-puppy.md` — full per-phase write-up (design decisions, deviations, fixture corrections).
- `scenarios/executed/s37-script-rename-driver-back-and-forth-mcp/` — the fixture (transcript `.jsonl`, `apply_renames.py`, `renames.csv`, `.step_states/`).

## Context the Next Agent Won't Have
- **The user makes ALL commits — never commit yourself.** Stop after each phase and report. Ponytail-ultra (lazy/minimal) is active.
- **250-line-per-file cap is enforced by a hook** ("split, never condense"). A PostToolUse hook also runs the test suite on every edit and flags deep nesting (>3 indents) — extract helpers, don't condense. Test runner is `node --import tsx --test`, NOT vitest. Filter `Debugger`/`inspector`/`Waiting for` from stderr. `scenarios/` is a symlink — never `git add` under it.
- **The plan was WRONG on several fixture facts (verified against the live fixture + file-history backups):** (a) the transcript `renames.csv` Write has only **2 rows** but the file RAN with **4** (`tot_debits→total_debits`, `tot_credits→total_credits` were added out-of-band; recovered from the CSV's file-history backup, NOT the Write); step-8 needs all 4. (b) Two idempotent runs — line 158 (relative paths) FAILED with FileNotFoundError, line 162 (absolute paths) SUCCEEDED. (c) **No file-history backup holds the renamed-WITHOUT-comment state** — every renamed backup carries the comment; the clean state exists only as the windowed `edited_text_file` beacon @ line 167. That is the whole reason the state must be COMPUTED (forward transform) rather than fished from a backup, and why the old `completeElidedBeacons` path bled the comment.
- **Architecture pivot from the plan:** the plan put extraction inside `extractFileEvents`; that can't work because the forward transform needs the pre-script RECONSTRUCTED/on-disk state, which extraction lacks. It is a reconstruction STAGE instead. Consequence: the Phase-B `recordVerdict` gate is NOT involved and was NOT changed (the `ctx_execute` run stays `ignore` in extraction; the stage finds it from `records` directly).
- **The event carries precomputed `content`, NOT `subs`.** A first cut re-applied subs to `currentText` at replay, but at replay an earlier elided beacon may not yet be completed, so `currentText` was the truncated window (validation saw 24 lines vs a 96-line beacon). Deriving pre-script content from the backup and storing the computed result on the event makes replay order-independent.
- **C8 (reconcile the comment bleed) was a NO-OP.** Replacing the beacon before `completeElidedBeacons` removes the beacon it would have mis-completed, so the bleed never happens — `completeElidedBeacons` is unchanged, and s28/s30/s35 fall through untouched (their forward transform does not reproduce their beacons → validation fails → fallback). The validation (`linesMatchBeacon`) is the safety net.
- **A subagent investigation initially mis-reported** that the v4 ledger.py backup was clean (no comment); a direct backup dump proved it carries the comment. Trust the file-history backup contents over summaries.

## How to Verify
- s37 closed: `npx tsx scripts/check_scenario_coverage.ts s37 2>&1 | grep -viE 'Debugger|inspector|Waiting for' | tail -3` → `PASS s37 13/13` / `1/1 scenarios fully reproduced`.
- Full suite: `node --import tsx --test tests/*.test.ts 2>&1 | grep -viE 'Debugger|inspector|Waiting for' | grep -E '^ℹ (tests|pass|fail)'` → `pass 209 / fail 6` (the 6 are pre-existing; do not let the count rise).
- Type check: `npx tsc --noEmit` → clean.
- Sweep parity: `npx tsx scripts/coverage_ledger.ts` → `1/1 passing`, s37 PASS 13/13.
