# Handoff: JSON output for the reconstruction CLI (implemented, green, uncommitted)
Conversation name: json-output-cli
JSONL: ~/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/<this-session>.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/snoopy-cooking-pnueli.md
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-json-output-cli.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Make the reconstruction CLI emit the engine's reconstruction as JSON so the JFRED
diff HTML viewer can consume the *tested* engine output instead of re-parsing raw
JSONL in the browser. Scope is the CLI emitter + tests in this worktree only; the
viewer is not touched. The document exposes messages, branches, files, per-step
snapshots, and a per-line classification for every parsed JSONL record.

## Current State
Implemented and fully green; **nothing committed**.

- **New** `src/reconstruction_json.ts` — pure builders: `extractConversationMessages`,
  `summarizeBranches`, `buildStepSnapshots`, `buildLineVerdicts`,
  `buildReconstructionDocument` (plus `ConversationMessage`/`BranchSummary`/
  `StepSnapshot`/`LineVerdict`/`ReconstructionDocument` types). No CLI import (one-way dep).
- **Edited** `src/reconstruction_cli.ts` — added `renderJson` dispatch; `--json` and
  `--allRecords` flags (latter implies `--json`); `--file` alias for `--target`; USAGE
  updated; one `runCli` branch after the reader is built. Imports `recordVerdict`
  (`./reconstruction_parse_lines.ts`) + `isGenuineUserPrompt` (`./reconstruction_tree.ts`)
  + the three json builders.
- **New** `tests/reconstruction_json.test.ts` (unit, Steps 1–4) and
  `tests/reconstruction_cli_json.test.ts` (CLI integration, Steps 5–6) — 26 tests total.
- `npm test` → **314/314 pass**. `npx tsc --noEmit` → clean.
- `node --import tsx scripts/check_scenario_coverage.ts` → **72/72 fully reproduced**
  (change is additive; no engine logic touched).
- End-to-end verified against the real S19 transcript: `--json` emits all 6 sections,
  `branches[].tip` are strings, `steps[].files` are objects of strings (Map flatten works),
  `steps[].changeIds` are string arrays, `lineVerdicts` is one-per-record line-indexed from 0,
  `--allRecords` dumps 119 records each carrying `verdict` + `isGenuinePrompt`.

## What Remains
1. **Review the two deviations** (see notes file) — confirm they're acceptable.
2. **Decide on `cli-json-notes.md`** at the repo root: it is untracked and was NOT created
   by this session's JSON work. Inspect it; delete or relocate if stray. Do not commit it
   blindly.
3. **Commit** the JSON-output change when satisfied — files:
   `src/reconstruction_json.ts`, `src/reconstruction_cli.ts`,
   `tests/reconstruction_json.test.ts`, `tests/reconstruction_cli_json.test.ts`,
   `plans/implementation-notes-json-output-cli.md`. (User has not yet asked to commit.)
4. **Downstream (separate worktree, out of scope here):** wire the JFRED viewer to consume
   the CLI `--json` output.

## Key Files
- `src/reconstruction_json.ts` — new pure JSON builders (the deliverable).
- `src/reconstruction_cli.ts` — `renderJson`, the flags, `--file` alias, `runCli` branch.
- `tests/reconstruction_json.test.ts`, `tests/reconstruction_cli_json.test.ts` — the tests.
- `/Users/matkatmusicllc/.claude/plans/snoopy-cooking-pnueli.md` — the source spec (has GREEN code).
- `plans/implementation-notes-json-output-cli.md` — divergences + rationale.
- `scripts/check_scenario_coverage.ts` — the 72/72 regression gate.

## Context the Next Agent Won't Have
- **Export name:** the spec cites `reconstructAllFiles`; the real export is **`reconstructAll`**
  (`src/reconstruction_engine.ts:172`). Use that.
- **Test runner:** plain `node --test` FAILS on the repo's TS enums ("strip-only mode"). Run
  tests via `npm test` (`node --import tsx --test tests/*.test.ts`) only.
- **`changedPaths` is best-effort, not total — a spec assertion was relaxed.** The plan
  asserted every step's `changedPaths` is non-empty and their union covers every touched file.
  FALSE for S19: steps 3 & 4 are rewound/abandoned-branch edits whose triggering `changeIds`
  (`f14647d7…`, `toolu_01…`) are **not** any reconstructed revision's `changeId` — the engine
  re-stamps revision changeIds during beacon/reseed completion. Indexing all branches
  (surviving + rewound) still leaves them unresolved → it is fundamental, not a missing-branch
  bug. The join is kept **surviving-only** so a `changedPath` never names a file absent from
  `filesTouched`. `changeIds` (always present) is the reliable JSONL pointer; `changedPaths`
  is the secondary "which file" hint and may be `[]`. The test was renamed to
  `test_buildStepSnapshots_changedPaths_link_resolvable_steps_to_touched_files` asserting the
  honest invariant (every resolved entry ∈ filesTouched, deduped, ≥1 step resolves).
- **Don't hardcode S19 paths in tests:** they're temp-dir absolute and machine-specific. The
  CLI tests derive the target path at runtime from `document.filesTouched[0].target`.
- `lineVerdicts[i].uuid` is omitted (undefined) for session-meta records (`last-prompt`,
  `mode`, etc.) — expected; alignment is by `line` index, not uuid.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                                              # expect 314/314
npx tsc --noEmit                                      # expect clean
node --import tsx scripts/check_scenario_coverage.ts  # expect 72/72 fully reproduced
# end-to-end (S19 path resolved by fixtures):
S19=scenarios/executed/s19-user-edit-conv-rewind/809c9b38-5eb5-4215-987d-0fd1b0973763.jsonl
npx tsx src/reconstruction_cli.ts "$S19" --json | python3 -m json.tool | head -40
npx tsx src/reconstruction_cli.ts "$S19" --allRecords | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['verdict'], r[0]['isGenuinePrompt'])"
```
