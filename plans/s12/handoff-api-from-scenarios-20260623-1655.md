# Handoff: S12 (`s12-write-conv-only-rewrite`) is IMPLEMENTED and fully verified — the first production-code engine fix (empty-base Edit crash) PLUS a two-DAG CLI (`--graphConvo`/`--graphFile`, both-by-default) that becomes the new global default. 151 tests green, tsc clean, every file ≤ 250 lines. NOTHING is committed — awaiting user review/approval, then a single commit.
Conversation name: api-from-scenarios — implement S12 (write-conv-only-rewrite) [autonomous monitor session]
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/0caa7b79-b451-443a-912c-646973eabe23.jsonl
Plan file (AUTHORITATIVE, executed): /Users/matkatmusicllc/.claude/plans/reactive-imagining-llama.md
Implementation notes (running log, S12 entry prepended): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-api-from-scenarios.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `6a47c39 Implemented S11 handling` (the 129-test S11 baseline). No `-plate` branch. All S12 work is uncommitted in the working tree (see Current State for the file list).

## Goal
`api-from-scenarios` is a clean-room TypeScript engine that reconstructs a Claude Code session's file-change history from its JSONL transcript, one scenario at a time. **S12** is the sixth rewind-family scenario and the first that needed real production code: the session Writes `scenario12.py`(`add`)+`test_scenario12.py`, accepts, does a **conversation-only** rewind to the original prompt (which leaves the files on disk — spec 37/S10), then on a NEW surviving branch **Edits** both files to add `multiply` (Read-then-Edit; never re-Writes). Two coupled deliverables in ONE slice: (1) **fix the crash** — the surviving branch Edits a file whose creating Write is off-branch, so the Edit replayed against an empty base and threw in `insertHunkAdditions`; (2) **add a two-DAG CLI render** — `--graphConvo` (conversation graph, forks at the rewind) + `--graphFile` (file/disk graph, stays linear), with **no flags = both graphs**, the new global default that replaces the old `## surviving`/`## rewound` text default for every scenario.

## Current State
**Fully implemented and verified; NOTHING committed.** `npm test` = **151 pass / 0 fail** (129 baseline + 22 new). `npx tsc --noEmit` = no errors. Filesize sweep over `src/**` + `tests/*` = all ≤ 250 lines. The engine no longer crashes on the real S12 transcript; the bare CLI renders both DAGs exactly per the plan's expected literal (root `#94000895 (rewind point)`, rewound tip `#cba30c9f` ABOVE surviving tip `#2c9424c4`, turns B–E).

Done, by part:
- **Part 1 — crash fix (3 source changes).** `seedEditBaseFromBackup` + private `findBackupAtOrBefore` in `src/reconstruction_sidecar.ts`; wired into `reconstructFileOver` (`src/reconstruction_branches.ts`) after `fillRedirectContent`, guarded on `reader`; `insertHunkAdditions`' context branch made total via a new `resolveContextLine` (`src/reconstruction_replay_edit.ts`).
- **Part 2 — two-DAG feature.** New `src/reconstruction_graph.ts` (model + `assignTurnLetters`/`buildFileDag`/`buildConversationDag`), new `src/reconstruction_graph_render.ts` (renderers), new `src/reconstruction_labels.ts` (relocated `shortenChangeId`+`getBaseName`), `BranchRole` enum in `src/structures/vocabulary.ts`, CLI wiring + new global default in `src/reconstruction_cli.ts` (retired `renderAllBranches`/`formatBranchHeader`).
- **Tests.** New: `tests/reconstruction_replay_edit.test.ts`, `tests/reconstruction_graph.test.ts`, `tests/reconstruction_graph_render.test.ts`, `tests/reconstruction_engine_s12.test.ts`, `tests/reconstruction_cli_s12.test.ts`; added seed tests to `tests/reconstruction_sidecar.test.ts`; `S12_JSONL` in `tests/fixtures.ts`; the 12 default-view CLI tests rewritten to the graph output across `tests/reconstruction_cli.test.ts` / `_s10` / `_s11`.
- **Docs.** Specs 39+40 and code-layout/TDD updates in `plans/reconstruction-engine-design.md`; S12 entry prepended to `plans/implementation-notes-api-from-scenarios.md`; `plans/roadmap.md` S12 flipped to `[x]`.

Untracked artifacts also present (NOT part of the engine change, decide whether to include in the commit): `plans/s12/` (the superseded earlier plan draft), `plans/handoff-api-from-scenarios-20260623-1450.md` (S12 planning handoff), `plans/handoff-api-from-scenarios-20260623-1611.md` (S12 implementation handoff that launched this session), and this handoff.

## What Remains
1. **User review of the diff.** Show the working tree (`git diff` + the untracked `src/reconstruction_graph*.ts`, `src/reconstruction_labels.ts`, the 5 new test files). Get approval before any commit (project rule: commit only when the user asks).
2. **Commit S12** once approved, message `Implemented S12 handling`. Stage the source + tests + the three doc files. Mirror the S10/S11 commit scope precedent (handoff docs + plan files were committed alongside tests in prior scenarios) — confirm with the user whether `plans/s12/` and the handoff `.md` files go in the same commit.
3. **(Optional) sync or delete the superseded repo plan** `plans/s12/s12-reconstruction-plan.md` — it renders the convoDAG example surviving-before-rewound, which is WRONG (the authoritative `~/.claude/plans/reactive-imagining-llama.md` is rewound-first, and the shipped code matches the authoritative one). Either fix its one example or delete it; do not let it mislead a future reader.
4. **Next scenario: S13.** Roadmap line `[ ] S13` is empty. A separate active monitor (memory `s13-handoff-monitor`) is gating S13 implementation on a new S13 handoff landing in `plans/`. Do not start S13 here; that pipeline handles it.

## Key Files
- `~/.claude/plans/reactive-imagining-llama.md` — THE authoritative plan that was executed (locked decisions, literal code, exact S12 expected output, the 12-test rewrite list).
- `src/reconstruction_sidecar.ts` — `seedEditBaseFromBackup`/`findBackupAtOrBefore` (the seed); `BackupReader`, `fillRedirectContent`.
- `src/reconstruction_branches.ts` — `reconstructFileOver` pipeline (…→`fillRedirectContent`→`seedEditBaseFromBackup`→`replayEvents`).
- `src/reconstruction_replay_edit.ts` — `insertHunkAdditions` + new `resolveContextLine` (empty-base guard).
- `src/reconstruction_graph.ts` — two-DAG model + builders (`assignTurnLetters`, `buildFileDag`, `buildConversationDag`, `resolveRootUuid`).
- `src/reconstruction_graph_render.ts` — `renderConversationDag`/`renderFileDag`/`renderGraphs` (oldest-at-top, topology only).
- `src/reconstruction_labels.ts` — shared `shortenChangeId`+`getBaseName` (one canonical home).
- `src/reconstruction_cli.ts` — `resolveGraphFlags` + the new dispatch (graphs → list-branches → branch → surviving content).
- `src/structures/vocabulary.ts` — `BranchRole {surviving, rewound}`.
- `tests/reconstruction_engine_s12.test.ts` / `tests/reconstruction_cli_s12.test.ts` — the S12 locks (in-memory backup reader for the engine; real on-disk reader for the CLI).
- `plans/implementation-notes-api-from-scenarios.md` — the full S12 design-decision log (read the top entry).

## Context the Next Agent Won't Have
- **The conversationDAG root is the REWIND POINT, not the parentUuid-null root.** The plan said rootUuid = the parentUuid-null record, but the plan's own EXPECTED literal shows the root as `#94000895` (the rewind point, == the rewound branch's `rewind @`), not the absolute root `#dfd8d07c`. Resolved by `resolveRootUuid`: use the rewind point when forked, else the parentUuid-null root (linear). This reproduces the expected output exactly. Do not "fix" it back to the absolute root.
- **The graph is TOPOLOGY ONLY — it shows raw `EventKind`, not the list-view labels.** So it prints "write" (not "create"), S4's second write shows "write" (not "overwrite"), and there are NO line counts. The 12 rewritten default-view tests assert kinds/changeIds/structure accordingly; the OLD assertions ("create", "overwrite", "2 lines", "## surviving", "tests/<path>") are intentionally gone. File names render as base names (no directory).
- **The synthetic seed Write's `changeId` is the backup filename** (e.g. `43c1313ce6fd5f24@v2`) and surfaces only in `--surviving` content views (`#43c1313c`). The fileDAG/convoDAG deliberately attribute the file's base to the REAL Write turn (`#015zSRxJ`) via `extractFileEvents` over all records, so the synthetic id never appears in the graphs. This was a deliberate plan decision (#9), not a bug.
- **A repo lint hook blocks >3× indent nesting** (`jot:post_tool_use`). It forced two refactors beyond the plan's literal pseudocode: `resolveContextLine` (extracted from `insertHunkAdditions`) and several extracted test-record/dag builders. All behavior-preserving.
- **The superseded `plans/s12/s12-reconstruction-plan.md` disagrees with the shipped code on branch order** (it renders surviving-before-rewound; the code + authoritative plan are rewound-first/oldest-first). Ignore it; the authoritative plan is `reactive-imagining-llama.md`.
- **A Stop hook runs the test suite after every edit and reports failures inline.** During strict RED→GREEN this fired constantly with expected failures — those were the intended RED states, not real regressions. The final state is fully green.
- The S12 CLI tests depend on the real on-disk file-history backups under `~/.claude/file-history/<session e320b4f6…>/` existing (confirmed present), consistent with the other real-transcript CLI tests (S5/S7/etc.).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 151 pass / 0 fail
npx tsc --noEmit         # expect: no errors (the real type gate — tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done   # expect: no FLAGGED
# End-to-end (was a CRASH before the fix):
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s12-write-conv-only-rewrite/e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null              # both DAGs; root #94000895 (rewind point); rewound #cba30c9f above surviving #2c9424c4
npx tsx src/reconstruction_cli.ts "$P" --graphConvo 2>/dev/null # conversationDAG only
npx tsx src/reconstruction_cli.ts "$P" --graphFile 2>/dev/null  # fileDAG only
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null  # def add AND def multiply
# Sanity: S1 default = linear convoDAG + fileDAG (no branch wrappers); S11 default = forked convoDAG.
```
