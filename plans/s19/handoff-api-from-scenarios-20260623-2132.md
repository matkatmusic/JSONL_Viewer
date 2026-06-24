# Handoff: S19 (`s19-user-edit-conv-rewind`) is IMPLEMENTED and fully verified — the FIRST production-code change since S12. The surviving `scenario19.py` now reconstructs byte-for-byte to the 11-line on-disk ground truth (was 9 lines, dropping two blank lines). 233 tests green (was 224), `npx tsc --noEmit` clean, no file > 250 lines. Added an S19_JSONL fixture + 9 tests (4 engine + 5 CLI) + a 2-file engine fix + docs. NOTHING is committed (project rule: commit only on user approval, one commit per scenario → message `Implemented S19 handling`).
Conversation name: api-from-scenarios — S19 impl monitor → implement S19 (user-edit-conv-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/8ffd1656-909b-4d5f-82f1-0e9fe0ca9676.jsonl
Plan file (AUTHORITATIVE, executed): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s19/s19-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `f0ec2f0 Implemented S16-18 handling` (S16/S17/S18 are committed; the working tree was clean except untracked `plans/s19/` before this work). S19's changes are all UNCOMMITTED in the working tree.

## Goal
Make `reconstruction_cli` correctly reconstruct — and LOCK with tests — the file-change history of `s19-user-edit-conv-rewind`, the conversation-rewind twin of S18. B writes `scenario19.py` (`add`) + C writes the test; the user edits out-of-band inserting `# user tweak` (D); Claude edits to add `subtract` anchored on the user content (E); the user rewinds (`Rewind: 2`, conversation-only) to the original prompt; Claude then edits to add `multiply` (F). D and E land on the REWOUND branch, but the conversation-only rewind does NOT revert the file on disk, so F's `multiply` edit was computed against an advanced disk state the surviving branch's events (B + F only) do not contain. The surviving reconstruction must end at the real 11-line on-disk file.

## Current State
**IMPLEMENTED, all gates GREEN, nothing committed.** Verified this session:
- `npm test` → **233 pass / 0 fail** (224 baseline + 9 new: 4 engine + 5 CLI).
- `npx tsc --noEmit` → clean. Filesize sweep → clean (`reconstruction_sidecar.ts` 179, `reconstruction_branches.ts` 232; both under the 250-line cap).
- End-to-end: `--surviving --verbose` for `scenario19.py` ends at **11 lines with both blank-line pairs** (lines 3,4 and 8,9); a `diff` against the on-disk `scenarios/executed/s19-user-edit-conv-rewind/scenario19.py` is **byte-identical (123 bytes each)**.
- The bug was: on the surviving branch F's base = B's 2-line `add` write only, but F's hunk (`oldStart=5`, context `def subtract`/`return a-b`/`# user tweak`) was computed against the real 7-line v3 disk. `insertHunkAdditions`' `slice(0, oldStart-1)` = `slice(0,4)` on a 2-line base silently dropped the two blank lines. Fix = seed F's base from the file-history v3 backup (spec 39 generalised to a mid-stream edit).

Files changed (all uncommitted):
- `src/reconstruction_sidecar.ts` — extracted+exported `backupSeedWriteFor` (the reusable backup-seed builder); `seedEditBaseFromBackup` now delegates to it (behaviour-preserving for spec 39).
- `src/reconstruction_branches.ts` — new `editBaseIsStale`/`staleEditSeedFor`/`seedStaleEditBases` helpers + a `restaged` pass in `reconstructFileOver` (runs after `seedEditBaseFromBackup`). Imports `lastLinesOf`, `backupSeedWriteFor`, `EditEvent`, `WriteEvent`.
- `tests/fixtures.ts` — `S19_JSONL` added after `S18_JSONL`.
- `tests/reconstruction_engine_s19.test.ts` (new) — 4 engine tests (in-memory `S19_BACKUPS` reader).
- `tests/reconstruction_cli_s19.test.ts` (new) — 5 CLI byte-lock tests (real on-disk reader).
- `plans/roadmap.md` — line 20 flipped `[ ] S19 ->` to `[x] S19 -> [x] …`.
- `plans/implementation-notes-api-from-scenarios.md` — S19 entry prepended (top).
- `plans/reconstruction-engine-design.md` — spec-39 note extended with the mid-stream generalisation.

## What Remains
1. **(Optional) Re-run the gates** to confirm the state (commands in How to Verify) — they were all green at handoff time.
2. **On user approval, commit S19 as ONE scenario commit** (project rule: one commit per scenario). Stage EXACTLY: `tests/fixtures.ts`, `tests/reconstruction_engine_s19.test.ts`, `tests/reconstruction_cli_s19.test.ts`, `src/reconstruction_sidecar.ts`, `src/reconstruction_branches.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s19/s19-reconstruction-plan.md`. Suggested message: `Implemented S19 handling`. Do NOT `git add -A` (the untracked S19 handoff docs `…-2121.md`/`…-2132.md` should stay out of the commit).
3. **Next scenario:** S20 (roadmap line 21, still `[ ]`, `s20-user-edit-code-rewind`). The pipeline is monitor-gated: a planning agent authors `plans/s20/…` + a handoff, then an implementation session picks it up. (S20 planning/impl monitors are already armed in other sessions per MEMORY.md.)

## Key Files
- `plans/s19/s19-reconstruction-plan.md` — THE authoritative plan: the precise bug mechanism, the exact verified fix code (both files), verbatim engine + CLI test code, verify gates.
- `src/reconstruction_branches.ts:34` `reconstructFileOver` — the `restaged` pass + the 3 new helpers live here.
- `src/reconstruction_sidecar.ts:97` `seedEditBaseFromBackup` / the new `backupSeedWriteFor` — the backup-seed builder both spec-39 and the S19 mid-stream pass call.
- `src/reconstruction_replay_edit.ts:113` `insertHunkAdditions` — the bug SITE (the `slice(0, oldStart-1)` that drops the gap lines). NOT changed; the fix is at the seeding layer.
- `tests/reconstruction_engine_s19.test.ts` / `tests/reconstruction_cli_s19.test.ts` — the S19 locks.
- `tests/reconstruction_engine_s12.test.ts` — the engine-test template (in-memory `BackupReader`, spec-39 precedent).
- S19 JSONL (worktree): `scenarios/executed/s19-user-edit-conv-rewind/6fc31802-b970-4698-9814-cc04c0fef14f.jsonl` (the fixture uses the canonical Desktop path). On-disk backups at `~/.claude/file-history/6fc31802-…/928642d7d0c1c258@v2|v3|v4` (the v3 blob is the surviving-branch seed).

## Context the Next Agent Won't Have
- **The fix is spec 39 GENERALISED, not a new mechanism.** Spec 39 (`seedEditBaseFromBackup`, shipped for S12) seeds an edit's base from the file-history backup when the edit is the FIRST event on a branch. S19 is the same disease one step later: the creating Write (B) IS on-branch, but off-branch edits (D, E) advanced the disk past it. `seedStaleEditBases` fires the SAME backup seed for a MID-stream edit whose first hunk `oldStart-1 > reconstructedBaseLength`. It runs AFTER `seedEditBaseFromBackup`, so a spec-39 first-event edit is already seeded and not re-seeded (no double-seed — S12 stayed green).
- **Why no regression:** `editBaseIsStale` is true ONLY when a hunk references lines past its reconstructed base — exactly the off-branch-rewind divergence. For every aligned edit it is false and the lineage is returned unchanged, so S1–S18 are byte-for-byte identical (verified: 224 green with the fix applied, then 233 with the new tests).
- **ONE CLI test deviated from the plan (Task 5, test 4).** The plan asserted raw multi-line substrings (`"    return a + b\n\n\ndef subtract(a, b):"`) against `--surviving --verbose`, but that render is **line-numbered** (`     5 | def subtract(a, b):`), so raw substrings can never match. The reconstruction is correct (11 lines, both blank pairs). Rewrote the assertions to lock by line POSITION (`5 | def subtract`, `7 | # user tweak`, `10 | def multiply`, `11 |     return a * b`) — `subtract` on line 5 proves lines 3,4 are blanks; `multiply` on line 10 proves lines 8,9 are blanks. The engine test still byte-locks the exact raw `\n\n\n` string, so raw-byte coverage is unchanged. This is the only departure from the plan's verbatim code.
- **The synthetic seed stays OUT of the graphs.** Its changeId is the backup blob name (`928642d7d0c1c258@v3`), so conversationDAG, fileDAG, and `--list-branches` are UNCHANGED by the fix — only `--surviving --verbose` gains the corrected 3rd revision. The CLI graph tests assert the same bytes as the unfixed engine.
- **`seedStaleEditBases` is split into 3 small functions** (`editBaseIsStale`/`staleEditSeedFor`/`seedStaleEditBases`) — a `jot` post-tool hook blocks >3× indent nesting; a single nested loop+if+if trips it.
- **RED was demonstrated via the auto-run Stop hook**, not a manual per-test gate: after writing the engine tests against the unfixed engine the hook reported `actual: 2, expected: 3` (2 revisions, not the seeded 3); applying the fix turned all 4 green.
- **Plan §7's "S16/S17/S18 uncommitted — do NOT git checkout shared files" hazard is STALE.** They were committed mid-session as `f0ec2f0`; the tree was clean, so S19 commits normally.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 233 pass / 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s19-user-edit-conv-rewind/6fc31802-b970-4698-9814-cc04c0fef14f.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null   # scenario19.py ends 11 lines WITH the two blank pairs; 3 revisions
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null         # surviving #66840964 / rewound #7087c57e rewind @ #b1368b53
# Byte-identical to on-disk ground truth:
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null | sed -n '/revision 2/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') scenarios/executed/s19-user-edit-conv-rewind/scenario19.py
```
