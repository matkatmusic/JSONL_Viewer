# Handoff: S12 (`s12-write-conv-only-rewrite`) is RE-PLANNED — the slice grew from "fix the crash" to "fix the crash + add a two-DAG CLI (`--graphConvo`/`--graphFile`) that becomes the new global default". The authoritative, corrected plan is at `~/.claude/plans/reactive-imagining-llama.md`. Nothing implemented; only `plans/s12/` + handoffs are uncommitted.
Conversation name: revise S12 plan
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/d2ed6f49-160b-4b5c-a364-ba2a0ef9c205.jsonl
Plan file (AUTHORITATIVE): /Users/matkatmusicllc/.claude/plans/reactive-imagining-llama.md
Plan file (repo copy, SUPERSEDED — see warning below): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s12/s12-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `6a47c39 Implemented S11 handling` (129 tests green at HEAD). No `-plate` branch. Uncommitted (all untracked, no src/test changes yet): `plans/s12/` (the original S12 plan), `plans/handoff-api-from-scenarios-20260623-1450.md` (the S12 *planning* handoff), and this handoff.

## Goal
Clean-room TypeScript engine reconstructing a Claude Code session's file-change history from its JSONL, one scenario at a time. **S12** is the sixth rewind-family scenario: Write `scenario12.py`(`add`)+`test_scenario12.py`, accept, **conversation-only** rewind to the original prompt (leaves files on disk — spec 37/S10), then on a new branch **Edit** both files to add `multiply` (Read-then-Edit; never re-Write), then exit. Two coupled deliverables in ONE slice: (1) **fix the crash** — the surviving branch Edits a file whose creating Write is off-branch, so the Edit replays on an empty base and throws in `insertHunkAdditions`; (2) **add a two-DAG CLI render** — `--graphConvo` (conversation graph, forks at the rewind) and `--graphFile` (file/disk graph, stays linear), with **no flags = both graphs**, which REPLACES the bare-default output for every scenario.

## Current State
**Planned only — nothing in `src/` or `tests/` changed.** `npm test` = 129 pass / 0 fail at HEAD (per S11; not re-run this session). The current engine CRASHES on the S12 transcript: `TypeError: Cannot read properties of undefined (reading 'values')` in `src/reconstruction_replay_edit.ts` (`insertHunkAdditions`, the context-line branch indexing an empty `workingLines`). The full task breakdown, literal source-change code, data model, renderer specs, exact expected S12 output, and the precise list of 12 existing tests to rewrite are in the authoritative plan file.

## What Remains
Execute `~/.claude/plans/reactive-imagining-llama.md` with `/jot:implement`, strict RED→GREEN, in order:
1. **Crash fix.** RED 3 sidecar unit tests + RED 1 replay-edit guard test → Source changes 1–3 (seed the Edit base from the file-history backup via new `seedEditBaseFromBackup`/`findBackupAtOrBefore` in `reconstruction_sidecar.ts`; one pipeline line in `reconstruction_branches.ts`; make `insertHunkAdditions`'s context branch total).
2. **Graph model + builders** (new `src/reconstruction_graph.ts` + `BranchRole` enum) → RED `tests/reconstruction_graph.test.ts`.
3. **Graph renderers** (new `src/reconstruction_graph_render.ts`) → RED `tests/reconstruction_graph_render.test.ts`.
4. **CLI wiring + GLOBAL default change** — add `--graphConvo`/`--graphFile`, default both, dispatch, USAGE; **rewrite the 12 default-view CLI tests** (exact list + line numbers in the plan).
5. **S12 real-transcript lock** — add `S12_JSONL` to `tests/fixtures.ts`; new `tests/reconstruction_engine_s12.test.ts` (in-memory backup reader) + `tests/reconstruction_cli_s12.test.ts` (real reader; assert both-graph default). Read Branch B's tip short id off the engine, transcribe it.
6. **Docs** — spec 39 + spec 40 in `plans/reconstruction-engine-design.md`; prepend S12 to `plans/implementation-notes-api-from-scenarios.md`; flip `plans/roadmap.md` S12 to `[x]`.
7. **Stop and report; commit only after the user approves** (`Implemented S12 handling`).

## Key Files
- `~/.claude/plans/reactive-imagining-llama.md` — **THE plan.** Read first. Locked decisions, literal code, data model, renderer specs, exact S12 output, the 12-test rewrite list, verification.
- `plans/s12/s12-reconstruction-plan.md` — earlier draft; **superseded** (see warning). Still has the verified ground-truth tables (changeIds, snapshots, backups) which are correct.
- `plans/handoff-api-from-scenarios-20260623-1450.md` — the S12 *planning* handoff (crash root-cause analysis; the seed-from-backup fix; verified ground truth).
- `src/reconstruction_sidecar.ts` (116) — `findCwd`/`buildBackupTimeline`/`findBackupAfter`/`fillRedirectContent`; `BackupPoint = {backupTime, backupFileName}` (NO `version` field); `BackupReader = (Path)=>string`. Add the seed here.
- `src/reconstruction_branches.ts` (120) — `reconstructFileOver` pipeline (…→`fillRedirectContent`→**seed here**→`replayEvents`).
- `src/reconstruction_replay_edit.ts` (168) — `insertHunkAdditions` crash site; make the context branch total.
- `src/reconstruction_branch.ts` — `findConversationBranches`, `shortUuid` (exported), `formatBranchHeader`. `src/reconstruction_engine.ts` — `reconstructBranches`/`buildRewoundBranchHistory` (model the convoDAG's diverging-turn logic on it), the `FileEvent`/`WriteEvent` types.
- `src/reconstruction_render_list.ts` — has PRIVATE `shortenChangeId` (trims `toolu_`, 8 chars); export or relocate it (no re-export shim) to reuse in the graph renderer.
- `src/structures/vocabulary.ts` — `EventKind` string-enum; add `BranchRole {surviving, rewound}` in the same style.
- Tests: `tests/utilities.ts` (`loadRecords`), `tests/fixtures.ts` (`S1_JSONL…S11_JSONL`, absolute Desktop paths), `tests/reconstruction_engine_s5.test.ts` (in-memory reader pattern), `tests/reconstruction_sidecar.test.ts` (`buildSnapshotRecord`/`buildCwdRecord`), `tests/reconstruction_cli*.test.ts` (the 12 default-view tests; `runCli([JSONL, …flags])`, `entryLineWith` helper).

## Context the Next Agent Won't Have
- **WARNING — two plan files disagree on ONE thing.** The repo copy `plans/s12/s12-reconstruction-plan.md` renders the S12 convoDAG example **surviving-before-rewound**, which is WRONG. The user confirmed **oldest-at-top extends to branch order**: the branch whose first turn is oldest renders first → **rewound (writes @16:09) ABOVE surviving (edits @16:10)**. `reactive-imagining-llama.md` is corrected. Follow it; sync the repo copy (or delete it) before/while implementing.
- **The design was negotiated live; it is NOT just "fix the crash".** The user reframed S12's old "decision 3" (is the abandoned branch a `## rewound` section?) into a CLI feature: two DAGs, two flags. Do NOT resurrect the `## surviving`/`## rewound` bare-default text view — it is RETIRED. Branch structure now lives in `--graphConvo`.
- **The two DAGs encode the crux of S12.** The *conversation* graph forks at the rewind; the *file/disk* graph is LINEAR because a conversation-only rewind never reverted disk. In S7/S8/S11 (code rewinds) the disk graph also forks, so they agreed; S12 is the first where they split. fileDAG = true cross-branch disk lineage: scenario12.py's base node is turn **B = Branch A's REAL Write `#015zSRxJ`**, NOT the synthetic backup-seed used internally to reconstruct surviving *content*. Keep those two notions separate (seed = a content-recovery device for `--surviving`; fileDAG = lineage).
- **Shared letters are the cross-link.** `assignTurnLetters` over ALL records (sorted by timestamp, starting at "B"; "A" = root prompt) is the single letter source for BOTH graphs, so fileDAG `B` is the same turn as convoDAG `B`. Build the fileDAG and letters from ALL records; only `buildConversationDag` partitions by branch.
- **Decisions locked, do not re-litigate:** topology-only graph nodes (`letter kind target #shortChangeId`; content via `--surviving`/`--verbose`/`--diff`); no-fork scenarios (S1–S6/S9/S10) render a LINEAR convoDAG with no `branch` wrappers; wrappers only on a real fork (S7/S8/S11/S12); fileDAG vertical per file.
- **The crash fix changes NO S1–S11 behavior.** The seed only fires on an edit-first lineage; the `insertHunkAdditions` guard only triggers on an empty base — neither occurs for S1–S11 (a Write always precedes an Edit on the same branch). Prove zero regression via the full suite.
- **Backup selection nuance:** the Edit needs the backup taken **at or before** it (`@v2`, the `add` base), the OPPOSITE of the existing `findBackupAfter` (which would pick `@v3`, the edit's result). The `@v2` blob is byte-identical to what Claude diffed against, so the hunks align.
- **Harness quirks (carried from S8–S11):** `tsx` does NOT type-check — `npx tsc --noEmit` is the real gate (`noImplicitAny`/`noUnusedLocals`/`noUnusedParameters` are hard errors; type new engine-test helpers `FileHistory[]`). 250-line-per-file hard cap enforced by a PostToolUse hook AND the verify gate — split if a module/test file would exceed it (this is why CLI tests are per-scenario files). The CLI prints `Debugger listening…` on stderr — append `2>/dev/null`; `runCli` tests avoid it. Ignore stale in-batch PostToolUse hook test failures (they run mid-edit before tsx reloads); a manual `npm test` is authoritative. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` beyond the fixture path.
- **Coding requirements** (`plans/coding-requirements.md`, mandatory): no primitive domain values (`Uuid`/`Date`/`Path`), one canonical vocabulary in `src/structures/vocabulary.ts`, DRY helpers, enum-member discriminant comparisons (`event.kind !== EventKind.edit`, never `"edit"`), verb-named functions, single-condition branching.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 129 baseline + new tests; ZERO failures incl. all content-view S1–S11 tests
npx tsc --noEmit         # No errors found (the REAL type gate; tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (was a CRASH before the fix):
```
P="scenarios/executed/s12-write-conv-only-rewrite/e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null              # both graphs; rewound branch ABOVE surviving; fileDAG vertical per file, shared letters B–E
npx tsx src/reconstruction_cli.ts "$P" --graphConvo 2>/dev/null # conversationDAG only
npx tsx src/reconstruction_cli.ts "$P" --graphFile 2>/dev/null  # fileDAG only
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null  # edited (add+multiply) content
# Sanity: S1 default = linear convoDAG + fileDAG (no branch wrappers); S11 default = forked convoDAG.
```
