# Handoff: S17 (`s17-multi-edit-conv-only-re-edit`) is IMPLEMENTED and fully verified — characterization/regression LOCK with NO production-code change. 215 tests green (was 206), `npx tsc --noEmit` clean, no file > 250 lines. Added a fixture constant + 9 tests (4 engine + 5 CLI) + docs. NOTHING is committed (project rule: commit only on user approval, one commit per scenario → message `Implemented S17 handling`).
Conversation name: api-from-scenarios — S17 handoff monitor → implement S17 (multi-edit-conv-only-re-edit)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/26cdb2a2-3c50-4e56-a4d2-4bebb589e59f.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s17/s17-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `39700e6 updated plan implement template` (S15 committed at `03dad64`). **S16 is implemented but UNCOMMITTED**, and **S17 is now also implemented and UNCOMMITTED** — the two share three modified files (see "What Remains" for staging).

## Goal
Make `reconstruction_cli` correctly reconstruct — and LOCK with tests — the file-change history of `s17-multi-edit-conv-only-re-edit`, the **conversation-only twin of S16**. B writes `scenario17.py` (greet) + the test C; D edits in `farewell`; a **conv-only** rewind (`Rewind: 2`, NO `code` suffix) abandons D conversationally but **leaves `farewell` on disk**; E re-edits the still-farewell file to add `shout`. Surviving working tree = **greet + farewell + shout** (KEEPS farewell — the one byte that inverts vs S16's greet + shout). The engine was already correct; the slice LOCKS that and documents the twin distinction.

## Current State
**IMPLEMENTED — all tasks done, all gates green, nothing committed.** Verified this session:
- `npm test` → **215 pass / 0 fail** (206 baseline + 4 engine + 5 CLI, all GREEN on arrival).
- `npx tsc --noEmit` → clean.
- Filesize sweep → no file > 250 lines (new test files 87 / 68 lines; `reconstruction_cli.test.ts` untouched at 243).
- End-to-end CLI check passed: S17 default DAG forks at `#4a69b697` (rewound `D edit #01EbvweP` above surviving `E edit #01RvpwRx`); `--surviving` = greet + farewell + shout; `--list-branches` = surviving `#e53225b5` + rewound `#07038b43`; `--branch 07038b43` = greet + farewell. **S16 sanity: `--surviving` STILL shows greet + shout with NO farewell** — the twins differ by exactly the kept `farewell`.

Changes made (no `src/` change):
- `tests/fixtures.ts` (M) — added `S17_JSONL` after `S16_JSONL`.
- `tests/reconstruction_engine_s17.test.ts` (new, 87 lines) — 4 engine tests.
- `tests/reconstruction_cli_s17.test.ts` (new, 68 lines) — 5 CLI byte-lock tests.
- `plans/roadmap.md` (M) — line 18 flipped `[ ] S17 ->` to `[x] S17 -> [x] ...`.
- `plans/implementation-notes-api-from-scenarios.md` (M) — prepended the S17 entry.

## What Remains
1. **Review** the diff and the new test files; confirm the S17-vs-S16 inversion is correct (S17 surviving asserts BOTH `farewell` AND `shout`; S16 asserts `shout` and NOT `farewell`).
2. **Commit on user approval only.** Project rule = one commit per scenario, message `Implemented S17 handling`. **S16 and S17 are BOTH uncommitted and share `tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`** (each carries both scenarios' additions). Land S16 first as its own commit (`Implemented S16 handling`), then S17 — or stage them as two distinct commits. Do NOT fold S17 into the S16 commit. Stage exactly the S16/S17 artifacts; do NOT `git add -A` (untracked handoff docs `*-2005/2017/2034/2042.md` and `plans/s16/`, `plans/s17/` dirs are not code and should be handled per project convention).
3. **Optional:** if a short S17 prose note in `plans/reconstruction-engine-design.md` is wanted for completeness, add it (S13–S16 added none — default is to skip).

## Key Files
- `plans/s17/s17-reconstruction-plan.md` — the AUTHORITATIVE plan (ground-truth changeIds/uuids, four source audits, verbatim test code, verify gates, S16-inversion callouts).
- `tests/reconstruction_engine_s17.test.ts` / `tests/reconstruction_cli_s17.test.ts` — the new S17 locks (mirror the S16 files, with the surviving-assertion inversion applied).
- `tests/fixtures.ts` — `S17_JSONL` constant (after `S16_JSONL`).
- `plans/roadmap.md` (line 18) / `plans/implementation-notes-api-from-scenarios.md` (top entry) — updated docs.
- `src/reconstruction_replay_edit.ts:96-107` (`resolveContextLine` born-path), `src/reconstruction_branch.ts:37-71` (`findSurvivingHead`/guard), `src/reconstruction_fork.ts` (structural discovery) — the read-only engine paths that make S17 already-correct. Do NOT change.

## Context the Next Agent Won't Have
- **The single inversion vs S16 is the whole point and was applied deliberately, not blind-copied.** The S16 test files were the template, but S17's surviving tests assert the tree contains `farewell` AND `shout` (S16 asserts `shout` and NOT `farewell`). The conv-only rewind keeps `farewell` on disk, so E's `shout` edit anchors on `farewell`.
- **Why the engine needs no change (partially-present base):** the surviving branch reconstructs over its own records (D excluded), so E's `farewell` context lines are absent from the greet-only base B; the spec-39 / S12 `resolveContextLine` born-path materialises them as genesis. So `scenario17.py` reconstructs as exactly TWO revisions (greet Write, then one Edit revision holding greet + farewell + shout). This born-path firing on a partially-present base is what S17 uniquely exercises.
- **No `edited_text_file` attachment exists in S17 at all** (full-transcript scan = zero) — so "no `user-edit` turn" holds trivially; the S15 content-aware guard has nothing to evaluate. (Contrast S16's record-80 echo, which the guard dropped.)
- **The farewell-attribution artifact is intentional, not a bug.** `farewell`'s content lands on E's edit revision (its real author D is off-branch). Per the project directive "reconstruct the change history 100%, attribution second", the surviving content is byte-correct — do NOT special-case attribution (scope creep, risks S1–S16).
- All 9 tests passed GREEN on first run — the plan's four-way verification held. No assertion was loosened, no production change invented.
- **S18–S23 are the user-edit family** (`edited_text_file` attachments that DO differ from current content) — their own planned slices, out of scope here.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect 215 pass, 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (S17 correct + S16 unchanged):
P="scenarios/executed/s17-multi-edit-conv-only-re-edit/4c41e3a3-a213-40f4-8df7-169bf61a8e40.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                         # fork #4a69b697; fileDAG B/D/E + C write
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null    # greet + farewell + shout (the S17 signature)
S16="scenarios/executed/s16-multi-edit-code-restore-re-edit/1ae6a672-d55d-41a6-add3-46123a227440.jsonl"
npx tsx src/reconstruction_cli.ts "$S16" --surviving --verbose 2>/dev/null  # greet + shout, NO farewell (twin sanity)
```
