# Handoff: S9 (s9-code-restore-no-post-edit) is IMPLEMENTED and verified — surviving working tree is now the *restored* code, detected by content identity (carried-forward `backupFileName`) instead of the `version` counter. 116 tests green. Source + RED/engine tests are committed in `5c16958` (a partial background auto-commit); the 3 doc updates + 3 CLI regression tests are UNCOMMITTED and await a finishing commit.
Conversation name: api-from-scenarios — implement S9 (code-restore-no-post-edit) [autonomous monitor session]
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/172cf527-ac51-430c-bd3f-0a0c47b3cd85.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s9/s9-reconstruction-plan.md (EXECUTED — both tasks done)

## Branch
`api-from-scenarios` based on `master`. HEAD = `5c16958 implemented S9`. **The S9 work is split across one commit + uncommitted remainder** (see Current State / What Remains): a background `.plate` auto-committer committed a partial snapshot at 13:20:01 mid-implementation. No `-plate` branch exists.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time. **S9 (`s9-code-restore-no-post-edit`)** is the third scenario in the rewind family (S7–S23). The session writes `scenario9.py` (`greet`) + `tests/test_scenario9.py`, then does a **`code` rewind back to root** (restoring those files to disk), then only **reads** (no further writes). The goal: report the **restored code** as the surviving working tree (surviving tip `#f1b8dede`), with **no rewound branch** (the read-only conversation head is a file-less tangent dropped like S7's read tangent / S8's `Hello`).

## Current State
**S9 is fully implemented and verified; nothing remains to code.** Verify gate, run just now, all green:
- `npm test` → **116 pass, 0 fail** (109 at S8 HEAD + 4 engine/branch + 3 CLI).
- `npx tsc --noEmit` → **No errors found**.
- Filesize check → all files ≤250 lines (`reconstruction_worktree.ts` 43→**77**; no split needed).
- End-to-end on the real S9 transcript: default = plain list (`scenario9.py #01PZ3yAw` 2 lines + `tests/test_scenario9.py #012EzSkd` 5 lines), **no `## ` headers, no "no files touched"**; `--list-branches` = single `surviving tip #f1b8dede`, no rewound line; `--surviving` = the two files.
- **No-op proof:** S8 default still surviving `#2988ac8f` + 2 rewound (`#546718c1`, `#84d669da` @ `#04c69f8b`); S1 still a plain list (0 `##` headers).

**Git split (the one thing to clean up):**
- Committed in `5c16958 implemented S9` (partial background auto-commit, 13:20:01): `src/reconstruction_worktree.ts` (the GREEN fix), `tests/fixtures.ts` (`S9_JSONL`), `tests/reconstruction_branch.test.ts` (snapshotRec extension + 2 synthetic tests), `tests/reconstruction_engine_s9.test.ts` (2 engine tests), the `S9_JSONL` import line in `tests/reconstruction_cli.test.ts`, plus `plans/s9/s9-reconstruction-plan.md`, `plans/handoff-…-1313.md`, and the stray `src/Plan_Impl_template.md` edit.
- **UNCOMMITTED** (written after the auto-commit): the 3 CLI regression tests in `tests/reconstruction_cli.test.ts` (+29 lines) and the 3 doc updates — `plans/implementation-notes-api-from-scenarios.md` (S9 entry), `plans/reconstruction-engine-design.md` (spec 36 + spec-35 cross-ref + worktree desc + test inventory), `plans/roadmap.md` (S9 marked `[x]`).

## What Remains
1. **Get user approval, then commit the uncommitted remainder** (the 3 CLI tests + 3 docs) — suggested message: `Finish S9: CLI regression tests + docs`. (Or, if the user prefers a single clean S9 commit, soft-reset `5c16958` and recommit everything as `Implemented S9 handling`; either is fine — the working tree content is correct and green as-is.)
2. **S10 is the natural next slice.** Plan it the same way: verify the S10 ground truth (changeIds, tips, the snapshot transitions) against the real transcript first, then write `plans/s10/s10-reconstruction-plan.md`, then implement via `/jot:implement`.
3. **Carried-forward, not S9:** `parseRedirect` mis-parses `2>&1` / `>/dev/null` (S5 regression). Track as a separate `parseRedirect` hardening slice.

## Key Files
- `src/reconstruction_worktree.ts` (77/250) — the ONLY source file changed. `findWorkingTreeOwner` now builds a per-snapshot **content signature** (`buildContentSignature` + `resolveContentId` + `NEVER_BACKED_UP`), carrying each path's last-known non-null `backupFileName` forward across null-bfn refresh snapshots. Read first.
- `src/reconstruction_branch.ts` (212) — `findSurvivingHead` (calls `findWorkingTreeOwner`); UNCHANGED. The S8 switch logic already does the right thing once the owner is content-aware.
- `src/structures/file-history.ts` — `getFileHistorySnapshot`, `FileHistorySnapshotMessage`, `FileBackupMap` (`.entries()` → `Array<[Path, FileHistoryBackup]>`), `FileHistoryBackup` (`{ backupFileName: Path | null; version: number; backupTime: Date }`).
- `src/reconstruction_engine.ts` (228) — `reconstructAll`/`reconstructBranches`; UNCHANGED. The S9 engine tests target it.
- `tests/fixtures.ts` (`S9_JSONL`), `tests/reconstruction_branch.test.ts` (2 new synthetic tests + extended `snapshotRec`), `tests/reconstruction_engine_s9.test.ts` (NEW, 2 real-transcript tests), `tests/reconstruction_cli.test.ts` (3 new CLI tests — UNCOMMITTED).
- `plans/s9/s9-reconstruction-plan.md` — THE plan (ground truth, 6 locked decisions, literal RED tests + exact GREEN code). Followed verbatim.
- `plans/implementation-notes-api-from-scenarios.md` — S9 entry at top (design decisions, deviations, tradeoffs, open questions). UNCOMMITTED.
- `plans/reconstruction-engine-design.md` — spec 36 added (refines spec 35). UNCOMMITTED.
- `plans/handoff-api-from-scenarios-20260623-1313.md` — the S9 *planning* handoff (input to this session).

## Context the Next Agent Won't Have
- **The fix REVISES S8's locked decision #3** (which chose `version` over `backupFileName`). A `code` restore with no post-edit emits trailing "refresh" snapshots that bump each file's `version` (S9 goes v3→v4→v5) while content is unchanged and `backupFileName` is `null`. The S8 `{path → version}` key changed on every refresh, so it wrongly named the last refresh (`b71764ed`, on the read-only branch) as the working-tree owner. Content identity (carried-forward `backupFileName`) keeps the owner at `f1b8dede`. **Do not "simplify" back to `version` — that reintroduces the bug.**
- **Why the carry-forward is safe for new files (the whole subtlety):** a file's first tracked version reports `backupFileName: null` (→ `NEVER_BACKED_UP` placeholder), but a brand-new file ALSO changes the tracked PATH SET, and the signature keys on the path set too — so a genuine write is still detected. The carry-forward only collapses *refresh* snapshots (same paths, null bfn, bumped version).
- **Reconstruct from the Write events, not from backup content.** The restored bytes ARE the Write events restored to disk, so once the surviving head moves to `f1b8dede` (which has the Writes), `reconstructAll` recovers the files with their real `changeId`s (`scenario9.py` = `toolu_01PZ3yAwBcZT3utNNCFEEMLn`, test = `toolu_012EzSkdGv9PA1K2NBwrwDot`). The FINAL snapshot's `backupFileName` is `null` (no on-disk backup for the final state) — there is nothing to read; the only on-disk backup is the `@v2` pair on `f1b8dede`, and you don't need it.
- **No CLI source change was needed** (the plan predicted this). The S7 all-branches renderer already produces correct S9 output once `findWorkingTreeOwner` is content-aware; Task 2 only added the 3 regression tests to LOCK the output.
- **S9 renders as a PLAIN LIST (no `## headers`)** — one surviving branch, zero rewound. The read-only head `936c10c7` touches no files → dropped as a file-less tangent. This is correct, not a bug. Surviving tip is still `#f1b8dede` (see `--list-branches`); consequently `--branch f1b8dede` returns nothing (it's the surviving branch, not a rewound one) — use `--surviving`. Mirrors S8.
- **The 3 CLI test assertions were written against the captured real-transcript output, then confirmed to match the plan's prediction** — evidence-based, not transcribed from prose.
- **Harness quirks (carried from S8):** `tsx` does NOT type-check — `npx tsc --noEmit` is the real type gate (`noUnusedLocals`/`noUnusedParameters`/`noImplicitAny` make stray imports/untyped params hard errors; the new test helpers are typed `FileHistory[]`). A PostToolUse hook flags `>3×` indent nesting — `resolveContentId` is extracted to avoid it. Ignore stale mid-edit `PostToolBatch`/`PostToolUse` test-failure noise; a manually-run `npm test` is authoritative. **A background `.plate` agent auto-commits periodically — it produced the partial `5c16958` mid-session; expect it and reconcile the git split (What Remains #1).** Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S9_JSONL` fixture path.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 116 pass, 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (proves the restored code survives; S8/S1 unchanged):
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s9-code-restore-no-post-edit/b381c39b-e81e-45e8-b400-03edc4ee4be3.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # plain list: scenario9.py #01PZ3yAw (2 lines) + tests/test_scenario9.py #012EzSkd (5 lines). NO "## ", NO "no files touched".
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # one line: surviving tip #f1b8dede   scenario9.py, test_scenario9.py
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # the two files, no headers
# Sanity: S8 default still surviving #2988ac8f + 2 rewound (#546718c1, #84d669da @ #04c69f8b); S1 still a plain list, no ## headers.
```
