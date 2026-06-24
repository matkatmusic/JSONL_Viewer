# Handoff: Scenario m2 (m2-mv-rename) IMPLEMENTED — characterization/regression LOCK, NO src change, 287 green; commit pending user approval
Conversation name: api-from-scenarios — m2 impl monitor → implement m2 (mv-rename)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/dee18a44-0c90-433f-ab40-6c32f5544dca.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m2/m2-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock — with tests — that the reconstruction engine correctly reconstructs `m2-mv-rename`: a file is written, edited (`validate`), renamed via `mv m2_old_name.py m2_new_name.py`, then the renamed file is edited again (`finalize`). m2 is the rename twin of m1's cp-fork and the FIRST rename scenario edited on BOTH sides of the rename. The engine was already correct, so this is a characterization/regression LOCK (no `src/` change), mirroring m1/S20/S21/S22.

## Current State
DONE and verified. `npm test` = **287 pass / 0 fail** (278 committed baseline + 9 new); `npx tsc --noEmit` clean. `git diff --stat src/` is **empty** — m2 added ZERO production code (S23+M1 are already committed at `91ac563`). The no-fix premise held: all 9 tests were GREEN on first run.

Files changed (the exact 7-file commit set, NOT yet committed):
- `tests/fixtures.ts` — added `M2_JSONL` (Desktop path) after `M1_JSONL`.
- `tests/reconstruction_engine_m2.test.ts` — NEW, 4 reader-free engine tests (all green; crux proven to bite).
- `tests/reconstruction_cli_m2.test.ts` — NEW, 5 CLI byte-lock tests (all green; crux proven to bite).
- `plans/roadmap.md` — M2 line flipped to `[x]`.
- `plans/implementation-notes-api-from-scenarios.md` — m2 entry prepended (newest-first).
- `plans/reconstruction-engine-design.md` — m2 note appended after the m1 note (no new spec number).
- `plans/m2/m2-reconstruction-plan.md` — the authoritative plan (already on disk).

Both prove-the-lock RED→GREEN cycles were run and restored (see "Context" below).

## What Remains
1. **(User-gated) Commit.** Project rule: one commit per scenario, ONLY after the user approves. Stage EXACTLY the 7 files above — do **NOT** `git add -A` (the shared docs carry only m2 edits now since S23+M1 are committed, but `plans/handoff-*.md` reorg and other `plans/sN/` files must not be swept in). There is **no `src/` file** in the commit. Suggested message: `Implemented m2 handling`.
2. **Plan the NEXT scenario: m3 (`m3-bash-redirect`).** Scenario file `scenarios/m3-bash-redirect.txt`; executed output `scenarios/executed/m3-bash-redirect/`. Roadmap line 27 (`[ ] M3 ->`) is the placeholder to fill. Plan it the same way (ground-truth-first: run the CLI live, verify byte-for-byte, then write a char-lock OR real-fix plan depending on whether the engine is already correct).

## Key Files
- `plans/m2/m2-reconstruction-plan.md` — the plan executed verbatim (§2 ground truth, §3 why-no-fix reference map, §5/§6 tests, §7 docs, §9 commit+handoff).
- `tests/reconstruction_engine_m2.test.ts` / `tests/reconstruction_cli_m2.test.ts` — the new locks.
- `tests/fixtures.ts` — `M2_JSONL` constant (Desktop transcript path).
- `src/reconstruction_lineage.ts` — `buildRenameChain`/`resolveFinalPath`/`eventBelongsToLineage`/`distinctFinalPaths` (the rename machinery m2 exercises; UNCHANGED).
- `src/reconstruction_replay.ts` (`renameRevision`) + `src/reconstruction_replay_edit.ts` (`lastLinesOf`/`carryAt`) — the pre-rename content carry (UNCHANGED).
- `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md` — shared docs updated for m2.

## Context the Next Agent Won't Have
- **The plan's §6 prove-the-lock flip is WRONG.** It says flip the CLI crux `(6 lines)` → `(2 lines)` to confirm RED — but `(2 lines)` legitimately appears in `--surviving --verbose` as revision 0 (the 2-line `process` write), so the test stays GREEN. I used an absent sentinel `(99 lines)` instead to prove the assertion bites (confirmed `actual: false`), then restored `(6 lines)`. If you re-run prove-the-lock for m3-style CLI line-count assertions, pick a sentinel that does NOT appear elsewhere in the output.
- **m2 is reader-free; m3 is NOT.** A rename needs no file-history sidecar (recovered from the JSONL mv from/to paths + inline carried content), so the engine tests pass no `BackupReader`. **m3 (`m3-bash-redirect`) WILL need the sidecar** — bash `>`/`>>` redirects recover content from `~/.claude/file-history` backups (the next snapshot after the op), via the injected `BackupReader`. Do NOT assume m3 is reader-free.
- **Fixtures read from the Desktop tree, not the worktree.** Every `S*_JSONL`/`M*_JSONL` points at `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/...`. The worktree `scenarios/executed/...` copies are only for live CLI spot-checks.
- **Never `git checkout`/`git restore` the shared docs** to undo a temp edit — revert specific lines by hand (worktree-git-checkout hazard noted across S18+).
- The Stop hook runs the test suite after every test-file edit and BLOCKS on RED — expect (and ignore) its failure notifications during deliberate prove-the-lock flips; it passes once restored.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 287 pass / 0 fail
npx tsc --noEmit  # expect clean
git diff --stat src/   # expect EMPTY (no m2 src change)
```
