# Handoff: Implement File State History + Git Branch Initial State + Diagnostic Probe

## Branch
No git repository. Working directory: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/`

## Goal
Extend the JSONL replay engine with three capabilities: (1) intermediate file state tracking at every replay step (`buildFileStateHistory`), (2) git branch as a fallback source for file content when files aren't on disk, and (3) a diagnostic probe that runs the engine against ~50+ real-world JSONL files from jot-recovery to find reconstruction failures. These enable debugging mismatches, reconstructing files from branches not currently checked out, and measuring coverage gaps.

## Current State
**100% reconstruction on all existing test data.**

- 8 unit/integration tests pass (`node replay-edits.test.js` — note: bulk tests are in separate test-*.js files run by the runner)
- 29/29 controlled scenarios MATCH (`node verify-all-scenarios.js`)
- 27/27 jotVerifySequence JSONL files MATCH
- Engine uses 4 data sources: toolUseResult, Bash cat, Read results, file-history snapshots
- Zero git-related logic exists in the engine
- `buildFileStateHistory` was planned but never implemented (steps 6-7 of original "File State Tracker" plan)
- Scenario generator (`scenario_gen.py`) has produced 12 unexecuted scenario templates covering compact, clear, resume, multi-rewind-diff-N, and user edit combinations

**Module line counts (all under 500-line limit):**
| File | Lines |
|---|---|
| `replay-edits.js` | 470 |
| `extract-file-state.js` | 372 |
| `jsonl-parse.js` | 331 |
| `reconstruct.js` | 190 |
| `test-helpers.js` | 174 |
| `detect-rewinds.js` | 165 |
| `classify-edits.js` | 90 |

## What Remains
1. **Implement `buildFileStateHistory(edits)`** in `replay-edits.js` — wraps `applySingleEdit` in a loop that captures intermediate state at each step, producing step objects with the canonical shape defined in the plan. Emit separate `isUserEdit: true` steps when user edits are detected between agent edits. Add TDD tests.
2. **Create `git-file-state.js`** — new module with `extractSessionMetadata`, `computeRepoRelativePath`, `gitShowFile`, `buildFilePathMap`, `resolveGitContent`. Add `test-git-file-state.js`. Add `makeSystemLine` helper to `test-helpers.js`.
3. **Thread git fallback through `replay-edits.js`** — add `--git-repo`/`--git-branch` CLI flags, `buildGitOpts`, `tryGitFallback`, `tryGitAfterSnapshotFallback`. Modify `verifyMissingFile`, `verifyOnDiskFile`, `processJsonlTargets`, `processSingleJsonlFile`, `batchVerify`, `runBatchMode` to accept and pass `gitOpts`. Fallback chain becomes: on-disk → snapshot → git → error.
4. **Create `probe-projects.js`** — standalone diagnostic script. Scans jot-recovery JSONL files, runs `batchVerify` with git support, outputs JSON report mirroring jot-recovery's `AuditResult` schema. Supports `--skip-files` to compare JS engine results against Python engine's `skip_files.json` (195 entries, 65 passing).
5. **Run the probe** against `/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/`, analyze failures, categorize what remains.
6. **Execute generated scenarios** from `RevEng/plans/scenarios/scenario-generator/` — particularly `g-user-edit-code-rewind.txt`, `g-user-edit-conv-rewind.txt`, and others. Verify `buildFileStateHistory` output against their JSONL data.
7. **Write and execute new scenarios** for gaps not covered by the generator: "user edit between two agent edits (no rewind)", "multiple user edits in sequence", and "does file-history-snapshot capture user edits?" (empirical test).

## Key Files
- `RevEng/replay-edits.js` — Core engine (470 lines). Add `buildFileStateHistory`, git CLI flags, git fallback helpers. Key insertion points: `verifyMissingFile` (line 276), `verifyOnDiskFile` (line 300), `processJsonlTargets` (line 309), `cliArgMap` (line 364).
- `RevEng/extract-file-state.js` — File state extraction (372 lines). Already has full `file-history-snapshot` support. Reference for module pattern.
- `RevEng/test-helpers.js` — Shared JSONL line builders (174 lines). Add `makeSystemLine` for git metadata tests.
- `RevEng/plans/scenarios/scenario-generator/scenario_gen.py` — Coverage-goal-driven scenario generator. 21 goals, 12 rendered `.txt` files ready to execute.
- `/Users/matkatmusicllc/Programming/jot-recovery/skip_files.json` — 195-entry pass/fail tracker from Python engine. Test material for probe.
- `/Users/matkatmusicllc/Programming/jot-recovery/base_ref_config.json` — Git commit SHA mappings for base state resolution.
- `/Users/matkatmusicllc/Programming/jot-recovery/src/audit_reconstructable_files.py` — Python audit engine. Reference for `AuditResult` schema and report generation patterns.

## Plan File
`/Users/matkatmusicllc/.claude/plans/yes-start-phase-1-snazzy-flask.md`

## Context the Next Agent Won't Have
- **The canonical step object shape** for `buildFileStateHistory` was recovered from JSONL session `36f9e180`, line 462. The plan file `write-a-plan-for-magical-pebble.md` was later trimmed to only the split task — the original spec with the step object is gone from disk but preserved in the plan file above.
- **`isUserEdit` emits separate steps.** When a user edit is detected (via `originalFile` mismatch), the engine should emit a separate step with `isUserEdit: true` BEFORE the agent's step — not a flag on the agent step. This keeps user and agent edits as distinct timeline entries.
- **`file-history-snapshot` reliability for user edits is unverified.** `originalFile` on `toolUseResult` is confirmed to capture user edits. Whether `file-history-snapshot` also captures them needs empirical validation via a specific scenario (listed in Phase 4 of the plan).
- **JSONL `gitBranch` metadata is reliable.** 148/150 JSONL files in the main jot project have `gitBranch` and `cwd` in their `type: "system"` records, typically within the first 7 lines.
- **Two path forms exist in JSONL files.** Most use absolute paths (`/Users/matkatmusicllc/Programming/jot/...`), but 9 Docker-origin files use `/home/user/repo/...`. `computeRepoRelativePath` must handle both.
- **3 of 8 known `gitBranch` values no longer exist** locally or remotely (`add-plate`, `parallel-debate-agent-launch`, `todo-timestamp-filenames`). `gitShowFile` must return null gracefully for deleted branches.
- **All functions must be under 15 lines, ES5 `var` style, all files under 500 lines.** Read `CODING_STYLE.md` in the RevEng directory for naming conventions.
- **`verify-all-scenarios.js` may need updating** to find nested scenario files (user noted this at plan line 295).

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# All existing tests must pass unchanged
node replay-edits.test.js

# All 29 scenarios must still MATCH
node verify-all-scenarios.js

# All 27 jotVerifySequence files must still MATCH
node replay-edits.js --jsonl-dir '/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence' --files-dir '/Users/matkatmusicllc/Programming/jotVerifySequence'

# New: probe real-world JSONL files
node probe-projects.js --projects-dir '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/'
```
