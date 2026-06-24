# Handoff: S19 (`s19-user-edit-conv-rewind`) reconstruction PLAN is complete and engine-verified — implement it. This is the FIRST scenario since S12 that needs a REAL production-code change (S16/S17/S18 were no-op characterization locks). The fix was PROTOTYPED AND VERIFIED LIVE this session: with it applied the full suite stays 224 pass / 0 fail, `tsc` clean, and the surviving `scenario19.py` reconstructs byte-for-byte to the on-disk ground truth (was 9 lines, must be 11). Implementing = 1 fixture + 9 tests (4 engine + 5 CLI) + the 2-file engine fix + docs, expected 233 green. The plan contains the exact verified fix code. NOTHING about S19 is committed.
Conversation name: api-from-scenarios — S19 handoff monitor → plan S19 (user-edit-conv-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/1b6c8d53-cd48-4944-b18f-64d85f69ed7c.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s19/s19-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `f0ec2f0 Implemented S16-18 handling`. **S16/S17/S18 are now COMMITTED** (this happened mid-session). The working tree is CLEAN except the new untracked `plans/s19/`. The "uncommitted shared files" hazard from the S18 handoff NO LONGER APPLIES — you may commit S19 normally.

## Goal
Make `reconstruction_cli` correctly reconstruct — and lock with tests — the file-change history of `s19-user-edit-conv-rewind`. It is the conversation-rewind twin of S18: B writes `scenario19.py` (`add`) + C writes the test; the user out-of-band edits `scenario19.py` (D: inserts `# user tweak`); Claude edits it to add `subtract` (E); the user says "Looks good" then **rewinds (Rewind: 2)** to the original prompt; Claude then edits to add `multiply` (F). D and E end up on the REWOUND branch, but because the rewind is conversation-only it does NOT revert the python file on disk, so F's `multiply` edit was computed by Claude Code against a disk state (`add` + 2 blanks + `subtract` + `# user tweak`) that the surviving branch's events do not contain. The surviving reconstruction must end at the real 11-line on-disk file.

## Current State
**PLAN COMPLETE, engine fix VERIFIED, nothing committed.** This session:
- Ran S19 through `reconstruction_cli` and found the bug: `--surviving --verbose` for `scenario19.py` produced **9 lines, dropping the two blank lines** between `return a + b` and `def subtract`. The default DAG, `--list-branches`, and the engine do NOT crash (exit 0).
- Root-caused it via subagents + live engine probes: on the surviving branch F's base = B's 2-line `add` write only (D, E are off-branch/rewound), but F's hunk (`oldStart=5`, leading context `def subtract`/`return a-b`/`# user tweak`) was computed against the real v3 disk. `insertHunkAdditions` does `workingLines.slice(0, oldStart-1)` = `slice(0,4)` on a 2-line base → silently drops base indices 2,3 (the two blanks). `subtract` still appears because its context lines materialise via `resolveContextLine`'s born-path, but the 2 leading blanks cannot be recovered from the hunk.
- **Prototyped the fix and ran the FULL suite: 224 pass / 0 fail, `tsc` clean.** The surviving `scenario19.py` then reconstructed to the correct 11 lines (3 revisions: `add` write → v3 backup-seed overwrite → `multiply` edit). The prototype was then REVERTED (this session plans; you implement). `git diff src/` is empty — confirmed.
- Wrote the plan with the exact verified fix code and verbatim test code.

## What Remains
Execute `plans/s19/s19-reconstruction-plan.md` top to bottom (strict red→green TDD). In order:
1. **Task 1** — add `S19_JSONL` to `tests/fixtures.ts` after `S18_JSONL` (lines 56–57). Canonical Desktop path, verified to exist (118 lines).
2. **Task 2** — create `tests/reconstruction_engine_s19.test.ts` with the in-memory `S19_BACKUPS` reader (S12-style) and the blank-line regression test FIRST; run it and confirm it FAILS (RED) on the unfixed engine.
3. **Task 3** — apply the 2-file fix (§4a `src/reconstruction_sidecar.ts` extract+export `backupSeedWriteFor`; §4b `src/reconstruction_branches.ts` add `seedStaleEditBases`/`staleEditSeedFor`/`editBaseIsStale` + the `restaged` pass in `reconstructFileOver`). Engine test → GREEN; full suite green.
4. **Task 4** — add the other 3 engine tests (branch topology; 3-revision seeded base; single test-file revision).
5. **Task 5** — create `tests/reconstruction_cli_s19.test.ts` with 5 CLI byte-lock tests (real on-disk reader).
6. **Task 6** — docs: `plans/roadmap.md` line 20 → `[x] S19 -> [x] …`; prepend S19 entry to `plans/implementation-notes-api-from-scenarios.md`; add one sentence to the spec-39 note in `plans/reconstruction-engine-design.md` (~line 179).
7. **Task 7** — verify gates: `npm test` (233 green), `npx tsc --noEmit` clean, filesize sweep (≤250 lines; both edited files land ~177/~215).
8. **Task 8 — create handoff** with `/jot:handoff-prompt` (title contains `S19` + `IMPLEMENTED`; state 233 green, engine change made, nothing committed).

On user approval, commit as ONE scenario commit (message `Implemented S19 handling`) staging exactly: `tests/fixtures.ts`, `tests/reconstruction_engine_s19.test.ts`, `tests/reconstruction_cli_s19.test.ts`, `src/reconstruction_sidecar.ts`, `src/reconstruction_branches.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s19/s19-reconstruction-plan.md`.

## Key Files
- `plans/s19/s19-reconstruction-plan.md` — THE plan: verified changeIds/tips/backups, the precise bug mechanism, the exact verified fix code (both files), verbatim engine + CLI test code, the in-memory reader literal, verify gates. Read this fully before touching anything.
- `src/reconstruction_branches.ts` (178 lines) — `reconstructFileOver` (line 34); add the `restaged` pass + 3 helpers here.
- `src/reconstruction_sidecar.ts` (165 lines) — `seedEditBaseFromBackup` (line 97); extract `backupSeedWriteFor` here.
- `src/reconstruction_replay_edit.ts:113` — `insertHunkAdditions`, the bug site (the `slice(0, oldStart-1)` that drops the gap lines). DO NOT change it — the fix is at the seeding layer, not here.
- `tests/reconstruction_engine_s12.test.ts` — the template for the engine test (in-memory `BackupReader`, the spec-39 precedent).
- `tests/reconstruction_cli_s18.test.ts` — the template for the CLI test (real on-disk reader via `runCli`).
- S19 JSONL (worktree): `scenarios/executed/s19-user-edit-conv-rewind/6fc31802-b970-4698-9814-cc04c0fef14f.jsonl` (fixture uses the canonical Desktop path).
- File-history backups on disk: `~/.claude/file-history/6fc31802-b970-4698-9814-cc04c0fef14f/928642d7d0c1c258@v2|v3|v4` (the v3 blob is what the surviving-branch seed reads).

## Context the Next Agent Won't Have
- **The fix is spec 39 GENERALISED, not a new mechanism.** Spec 39 (`seedEditBaseFromBackup`, shipped for S12) seeds an edit's base from the file-history backup when the edit is the FIRST event on a branch. S19 is the same disease one step later: the creating Write (B) IS on-branch, but off-branch edits (D, E) advanced the disk past it. The new `seedStaleEditBases` pass fires the SAME backup seed for a MID-stream edit whose first hunk `oldStart-1 > reconstructedBaseLength`. It runs AFTER `seedEditBaseFromBackup`, so a spec-39 first-event-edit is already seeded and not re-seeded (no double-seed — verified, S12 stayed green).
- **Why no regression:** `editBaseIsStale` is true ONLY when a hunk references lines past its reconstructed base — exactly the off-branch-rewind divergence. For every aligned edit it is false and the lineage is returned unchanged, so S1–S18 are byte-for-byte identical (verified: 224 green with the fix applied).
- **F's `structuredPatch` lives on the tool-RESULT record (rec 95), NOT the tool_use record (rec 94, whose `toolUseResult` is `{}`).** Don't conclude "no hunk" from the tool_use record — `indexEditHunksByToolUseId` reads it from the result record. F's hunk is authoritative (`oldStart=5`, context includes `def subtract`).
- **The synthetic seed stays OUT of the graphs.** Its changeId is the backup blob name (`928642d7d0c1c258@v3`), so conversationDAG, fileDAG, and `--list-branches` are UNCHANGED by the fix — only `--surviving --verbose` gains the corrected content (a 3rd revision). The CLI tests for the graphs assert the same bytes as the unfixed engine.
- **`seedStaleEditBases` must be split into 3 small functions** (`editBaseIsStale` / `staleEditSeedFor` / `seedStaleEditBases`) — a `jot` post-tool hook blocks >3× indent nesting; a single nested loop+if+if trips it. The plan's code is already split correctly.
- **Engine tests need a reader; CLI tests get one for free.** `reconstructAll`/`reconstructBranches` take a `BackupReader` arg — the engine test supplies an in-memory `S19_BACKUPS` map (the v3 blob keyed by `928642d7d0c1c258@v3`). `runCli` builds the real on-disk reader internally, so CLI tests rely on the backups existing at `~/.claude/file-history/6fc31802-…/` (they do).
- **Ground-truth expected content** (the regression assertion): surviving `scenario19.py` final = `def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak\n\n\ndef multiply(a, b):\n    return a * b` (11 lines, two blanks between add and subtract). The unfixed engine omits those two blanks.
- **No git-checkout hazard anymore** — S16/S17/S18 were committed as `f0ec2f0` mid-session, so the worktree is clean; you can commit S19 without the shared-file (`tests/fixtures.ts`/`roadmap.md`/impl-notes) intermixing that plagued the S18 handoff.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline 224 pass / 0 fail BEFORE you start; 233 pass / 0 fail when done
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s19-user-edit-conv-rewind/6fc31802-b970-4698-9814-cc04c0fef14f.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null   # scenario19.py ends 11 lines WITH the two blanks; 3 revisions
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null         # surviving #66840964 / rewound #7087c57e rewind @ #b1368b53
```
