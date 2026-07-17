# Handoff: TASKS.md #4 shipped (staged, awaiting commit) + s85 coverage regression found (84/85, pre-existing, timing points at the gitOperations engine commit)
Conversation name: plan 'JSONL unhandled fields audit'
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/2d892ad7-44b1-48be-9af5-9892b7149cdb.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/plan-for-item-4-velvety-scone.md (executed; corpus findings + decisions)

## Branch
`develop` based on `main`. HEAD `051ce6c` at handoff time (moving — another session is
actively committing). Repo root: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`
(path has spaces — always quote).

## Goal
This session implemented TASKS.md #4: model every JSON field real transcripts carry that the
scenario captures never produced, so the strict field gate covers the real corpus and the
viewer's tolerant bypass logs nothing. During verification it discovered the scenario
coverage suite is at 84/85 — s85 regressed, NOT from this session's change.

## Current State
- **Item #4 done and STAGED, not committed** (user commits): `src/parse/loadTranscript.ts`
  (28 fields added to `ALLOWED_TOP_LEVEL_KEYS` per type where observed;
  `OBSERVED_SESSION_METADATA_KEYS` group; `findUnmodeledTopLevelKeys` exported),
  `src/structures/vocabulary.ts` (`RecordType.forkContextRef`), `scripts/audit_unmodeled_fields.ts`
  (new corpus auditor, skips symlinks + `SYNTHETIC_RECONSTRUCTED_VERSION` "0.0.0-reconstructed"
  records), `tests/loadTranscript.test.ts` (+2 tests incl. the 28-field evidence table with
  corpus file:line citations), `tests/vocabulary.test.ts`, `tests/audit-unmodeled-fields.test.ts`
  (new, 2 tests). Strict red-green throughout. 6 files, +370/-7.
- Verified 2026-07-07 ~18:15: typecheck clean; 16/16 across the three touched test files;
  `npx tsx scripts/audit_unmodeled_fields.ts ~/Programming/jot-recovery/claude-data/projects/`
  → 1,472 files, 459,460 lines, **0 unknown types, 0 unmodeled fields**, 250 synthetic skipped,
  exit 0.
- **Coverage suite: 84/85.** s85 (`s85-git-commit-csv-and-move-scripts`) fails steps 4–10.
- Implementation notes: `plans/implementation-notes-jsonl-unhandled-fields-audit.md`.
- Working tree also carries ANOTHER session's uncommitted edits (do not touch, stage, or
  revert): `src/reconstruction_branch.ts`, `src/reconstruction_branches.ts`,
  `src/reconstruction_script_stage.ts`, `tests/reconstruction_memo.test.ts`,
  `webapp/views/file-history.js`. The engine ones appeared 18:19–19:03 on 2026-07-07.

## What Remains
1. User commits the staged item-#4 work, then ticks TASKS.md #4 (checkbox intentionally left).
2. Investigate the s85 regression (see next section for everything known). Start by
   reproducing at a known-clean checkout — the tree now has another session's uncommitted
   engine edits, so use a temp worktree (`git worktree add <path> 27d29ec`), NOT a stash
   dance, and run `npx tsx scripts/check_scenario_coverage.ts s85` there.
3. Bisect the Jul-4→Jul-7 window. Last verified 85/85: 2026-07-04 (TASKS.md #3 note).
   Prime suspect: `4a8c675` "Ship gitOperations[] in the wire document…" — the only
   engine-behavior commit in the window (its sibling `de15df8`/`827fa3f`/`92f9764`/`380033b`/
   `685a754`/`6b5a71a` are webapp/inspector-only; `b75c176`/`27d29ec`/`051ce6c` are
   docs/diagram). Check s85 at `4a8c675^` then `4a8c675`.
4. Fix per findings; strict red-green. TASKS.md #15 (temp-cwd durability) stays open as a
   SEPARATE adjacent bug — see below for why this failure is probably not #15.

## Key Files
- `scripts/check_scenario_coverage.ts` — coverage runner; accepts a scenario filter arg
  (`… s85`) and `--onlyFailing`.
- `src/reconstruction_script_execution.ts` / `src/reconstruction_script_stage.ts` —
  `injectScriptExecutions` provenance stage named in the mismatch (the latter is currently
  dirty from the other session).
- `src/reconstruction_git_evidence.ts:86` — `readCommittedFileContent`, TASKS.md #15's
  target (silent `catch` ~`:99`).
- `scenarios/executed/s85-git-commit-csv-and-move-scripts/` — transcript, `.step_states/`
  ground truth, and preserved `.git`.
- `scripts/audit_unmodeled_fields.ts` — the new drift check; rerun after Claude Code updates.
- `plans/implementation-notes-jsonl-unhandled-fields-audit.md` — this session's decisions.

## Context the Next Agent Won't Have
- **s85 failure signature (2026-07-07):** steps 4–10 all mismatch on `core_two.py @line 7:
  expected "# reviewed by ops" got ""`. Provenance per failing step:
  `injectScriptExecutions: injected script-execution effect for a file with no user-edit
  beacon` (changeIds 4143d8c8… and 28eb1581…, plus 30bd402e…/e34d9104… on the clean-HEAD
  rerun — ids differ per run). "# reviewed by ops" is a user-edit that reaches core_two.py;
  the engine loses it when injecting script-execution effects.
- **It is NOT the item-#4 diff:** verified by `git stash push` of the 4 tracked gate/test
  files at HEAD `27d29ec` → s85 still 0/1 → `git stash pop`. The gate diff only widens
  accepted keys; scenario transcripts parsed identically before and after.
- **It is probably NOT TASKS.md #15's mode:** #15 predicts failure when s85's recorded
  temp cwd vanishes, but the temp repo STILL EXISTS on disk
  (`/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.o1fs4eqs`, verified
  2026-07-07 ~18:15) and the preserved fallback `scenarios/executed/s85-…/.git` exists too.
  So the timing (last green Jul 4, engine commit `4a8c675` landed Jul 5+) points at a code
  regression, not environment decay. A macOS temp purge could STILL trigger #15 later —
  don't conflate the two.
- The 84/85 was discovered ~18:00 2026-07-07 with the other session's engine files NOT yet
  modified; by 19:03 they were. Any rerun in the main checkout now includes those uncommitted
  engine edits — hence the worktree advice in What Remains.
- Synthetic corpus records: jot-recovery writes reconstructed sessions stamped
  `version "0.0.0-reconstructed"` carrying tool-invented fields (`reconstructed`,
  `timestampEstimated`). User decided these stay OUT of the allowlist; the audit script
  skips them. Don't "fix" zero-findings by allowlisting them.
- Several modeled fields are version-transient and unreproducible with current Claude Code
  (`sessionKind` 2.1.154/173, `preventContinuation` 2.1.181–197 — the old spelling of
  `preventedContinuation` — `retry*`/`cause` ≤2.1.179): never propose re-capturing scenarios
  to cover them.
- User workflow rules (standing): he runs the 7343 server (never kill; server memoizes —
  engine changes need HIS restart to show) and full `npm test`; you run typecheck + targeted
  tsx tests; prefix `NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS=` on all node/npm commands;
  stage ONLY files you touched, he commits; merges `--no-ff`; never delete files (RETIRED
  headers); strict red-green `test("test_<snake_case>")` with `// Scenario:` comments;
  4-space indent; verb-named functions; one condition per `if`; compare exported constants.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npm run typecheck                     # clean
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npx tsx --test tests/vocabulary.test.ts \
    tests/loadTranscript.test.ts tests/audit-unmodeled-fields.test.ts         # 16/16
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npx tsx scripts/audit_unmodeled_fields.ts \
    ~/Programming/jot-recovery/claude-data/projects/                          # 0 findings, exit 0
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npx tsx scripts/check_scenario_coverage.ts s85
    # currently 0/1 — the regression under investigation; suite-wide 84/85
```
