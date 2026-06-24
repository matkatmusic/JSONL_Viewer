# Handoff: S20 (`s20-user-edit-code-rewind`) is IMPLEMENTED and fully verified — a characterization/regression lock with NO production-code change. The surviving `scenario20.py` reconstructs byte-for-byte to the 7-line on-disk ground truth; the S19 `seedStaleEditBases` reseed is proven INERT for the aligned code-rewind case. 242 tests green (was 233), `npx tsc --noEmit` clean, no file > 250 lines. Added an S20_JSONL fixture + 9 tests (4 engine + 5 CLI) + docs. NO `src/` change. NOTHING is committed (project rule: commit only on user approval, one commit per scenario → message `Implemented S20 handling`).
Conversation name: api-from-scenarios — S20 impl monitor → implement S20 (user-edit-code-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/19d63a17-b3be-471b-ae3b-3564955ad4cc.jsonl
Plan file (AUTHORITATIVE, executed): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s20/s20-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `f0ec2f0 Implemented S16-18 handling`. NOTE: S19 is also implemented but UNCOMMITTED in this worktree (its src fix + tests are untracked/modified). S20's changes are all UNCOMMITTED and touch NO source.

## Goal
Lock — with tests — the file-change reconstruction of `s20-user-edit-code-rewind`, the CODE-rewind twin of S19. B writes `scenario20.py` (`add`) + test C; the user edits `scenario20.py` out-of-band (`# user tweak`, D); Claude adds `subtract` (E); the user rewinds (`Rewind: 2, code`) to the original prompt; Claude reads the file then adds `multiply` (G). D + E land on the REWOUND branch; the CODE rewind reverts the file on disk and Claude Code's checkpoint re-write surfaces as a synthetic `edited_text_file` (user-edit F) on the SURVIVING branch. Because F advances the surviving base to the full 3-line disk state, G's edit is aligned and the S19 reseed stays inert — so S20 needs NO engine change; the tests guard that this stays true.

## Current State
**IMPLEMENTED, all gates GREEN, nothing committed.** Verified this session:
- `npm test` → **242 pass / 0 fail** (233 baseline + 9 new: 4 engine + 5 CLI).
- `npx tsc --noEmit` → clean. Filesize sweep → clean (new test files 97 / 58 lines; no file > 250).
- `git diff src/` shows only the two S19 fix files — **S20 itself edited zero src files** (the S19 fix is uncommitted in this worktree; S20's 242-green baseline already included it).
- End-to-end: `--surviving --verbose` for `scenario20.py` ends at **7 lines** (`# user tweak` on line 3, `def multiply` on line 6, two blanks on lines 4–5), 3 revisions; `diff` against on-disk `scenarios/executed/s20-user-edit-code-rewind/scenario20.py` is **byte-identical**.

Files changed (all uncommitted):
- `tests/fixtures.ts` — `S20_JSONL` added after `S19_JSONL`.
- `tests/reconstruction_engine_s20.test.ts` (new) — 4 engine tests (in-memory `S20_BACKUPS` reader; test 3 is the reseed-stays-inert regression lock).
- `tests/reconstruction_cli_s20.test.ts` (new) — 5 CLI tests (real on-disk reader via `runCli`).
- `plans/roadmap.md` — line 21 flipped `[ ] S20 ->` to `[x] S20 -> [x] …`.
- `plans/implementation-notes-api-from-scenarios.md` — S20 entry prepended (top).
- `plans/reconstruction-engine-design.md` — code-rewind-restore-as-surviving-user-edit note added after the S19 reseed paragraph.

## What Remains
1. **(Optional) Re-run the gates** to confirm state (commands in How to Verify) — all green at handoff time.
2. **On user approval, commit S20 as ONE scenario commit** (project rule: one commit per scenario). Stage EXACTLY: `tests/fixtures.ts`, `tests/reconstruction_engine_s20.test.ts`, `tests/reconstruction_cli_s20.test.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s20/s20-reconstruction-plan.md`. Message: `Implemented S20 handling`. Do NOT `git add -A` (no `src/` files belong to S20; keep untracked handoff docs out). NOTE: `tests/fixtures.ts` is shared with S19's uncommitted work — if S19 is committed first, fixtures.ts will contain both `S19_JSONL` and `S20_JSONL`; stage the file as-is for whichever commit lands second.
3. **Next scenario:** S21 (roadmap line 22, still `[ ]`, `s21-multiple-user-edits`). Monitor-gated: a planning agent authors `plans/s21/…` + a handoff, then an implementation session picks it up. (S21 planning/impl monitors are already armed in other sessions per MEMORY.md.)

## Key Files
- `plans/s20/s20-reconstruction-plan.md` — THE authoritative plan: ground-truth table (changeIds/tips), verbatim engine + CLI test code, why the engine is already correct, verify gates.
- `tests/reconstruction_engine_s20.test.ts` / `tests/reconstruction_cli_s20.test.ts` — the S20 locks. Engine test 3 (`test_S20_surviving_file_has_three_revisions_and_no_synthetic_seed`) is the reseed-inert regression guard.
- `src/reconstruction_branches.ts` `editBaseIsStale`/`seedStaleEditBases` — the S19 reseed that S20 proves stays INERT (read-only; NOT changed for S20).
- `src/reconstruction_replay.ts` `userEditChangesContent` — the S15 content-aware guard that records F on the surviving branch (read-only; the reason S20 is already correct).
- `tests/reconstruction_engine_s19.test.ts` / `tests/reconstruction_cli_s19.test.ts` — the templates copied for S20 (imports + `finalTextOf`/`historyEndingWith` helpers verbatim).
- S20 JSONL (worktree): `scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl` (the fixture uses the canonical Desktop path).

## Context the Next Agent Won't Have
- **S20 needs NO engine change — it is the code-rewind twin of S19, and the contrast is the whole point.** S19 (conversation-only rewind) left the user-edit OFF the surviving branch → base too short → `seedStaleEditBases` had to FIRE (real fix). S20 (CODE rewind) reverts the file on disk; Claude Code re-writing the checkpoint surfaces as a synthetic `edited_text_file` (user-edit F) ON the surviving branch; the S15 guard records F, advancing the surviving base to the full 3-line disk state, so G's `multiply` hunk (`oldStart=1, oldLines=3`) is ALIGNED → `editBaseIsStale` is false → the S19 reseed is dormant.
- **The `s20Reader` supplies v2/v4 backup blobs even though the engine never reads them for S20.** This keeps the reseed code path ACTIVE (a `reader` is present) so engine test 3 proves the reseed stays dormant by choice, not because the reader was empty. If a future change made the reseed mis-fire on an aligned base, a 4th `overwrite` revision would appear and test 3 would go RED.
- **S20 is the FIRST scenario with a `user-edit` on BOTH branches** — D (the real human edit) on the rewound branch, F (the code-rewind restore echo) on the surviving branch. The CLI conversationDAG/fileDAG tests assert both.
- **`# user tweak` is on line 3 (no blank before it) — the S20-vs-S19 INVERSION.** In S19 `subtract` sat on line 5 (two blanks after `add`). For S20 the two blanks are lines 4–5, before `def multiply` on line 6. The CLI verbose test locks `multiply` on line 6, which proves the blanks survive.
- **No plan deviation in the test code** (unlike S19, whose CLI verbose test had to be rewritten from raw multi-line substrings to line-position assertions). Every S20 plan assertion string matched the live CLI output verbatim — the plan author had already used line-position/substring forms.
- **The monitor that triggered this work false-fired once.** A loose first-60-lines predicate matched the S19 IMPLEMENTED handoff (`…-2132.md`) because it names S20 in "What Remains"; the monitor was re-armed with a title-line (first-5-lines) + non-empty-`plans/s20/` predicate and then fired correctly on the real S20 plan.
- **`reconstruction_cli.ts` has no `--rewound` flag.** `runCli` is the in-process test entry; the rewound branch is inspected via `--branch <tip>` (e.g. `--branch 51227411`).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 242 pass / 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null   # scenario20.py ends 7 lines, # user tweak on line 3, def multiply on line 6, 3 revisions
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null         # surviving #cacc87c7 / rewound #51227411 rewind @ #e76a23d3
# Byte-identical to on-disk ground truth:
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null | sed -n '/revision 2/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') scenarios/executed/s20-user-edit-code-rewind/scenario20.py && echo BYTE-IDENTICAL
# Confirm S20 added no source (the only src diff is S19's uncommitted fix):
git diff --name-only src/   # only reconstruction_branches.ts + reconstruction_sidecar.ts (both S19)
```
