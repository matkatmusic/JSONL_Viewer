# Handoff: S20 (`s20-user-edit-code-rewind`) reconstruction PLAN is complete and engine-verified — IMPLEMENT it. S20 is the CODE-rewind twin of S19 and the engine ALREADY reconstructs it byte-for-byte correctly (verified live this session), so this is a CHARACTERIZATION/REGRESSION LOCK with NO production-code change (same shape as S16/S17/S18). Implementing = 1 fixture line + 9 tests (4 engine + 5 CLI) + 3 doc edits, expected 233 → 242 green, `tsc` clean, `git diff src/` stays empty. The plan contains exact changeIds, branch tips, the in-memory backup reader, and verbatim test code.
Conversation name: api-from-scenarios — S20 planning monitor → plan S20 (user-edit-code-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/63a89cf6-01c1-4974-a6c1-c2a0de1ee0d7.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s20/s20-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `f0ec2f0 Implemented S16-18 handling`.

⚠️ **The working tree is NOT clean** — it carries S19's UNCOMMITTED work (the S19 implementing session left everything uncommitted, awaiting user approval). Modified: `src/reconstruction_branches.ts`, `src/reconstruction_sidecar.ts`, `tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`. Untracked: `plans/s19/`, `plans/s20/`, `tests/reconstruction_{engine,cli}_s19.test.ts`, handoff docs `…-2121.md`/`…-2132.md`. **Do NOT revert, commit, or `git checkout` any of these S19 files** — S20 builds on top of the S19-fixed engine. When you commit S20, stage ONLY the S20 files (see the plan's Commit section); never `git add -A`.

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs the file-change history of `s20-user-edit-code-rewind`, the **code-rewind twin of S19**. B writes `scenario20.py` (`add`) + C writes the test; the user out-of-band edits `scenario20.py` inserting `# user tweak` (D); Claude edits to add `subtract` (E); the user says "Looks good" then **rewinds (`Rewind: 2, code`)** — a CODE rewind that reverts the file on disk. D and E land on the REWOUND branch. The code rewind re-writes the checkpoint file to disk, which surfaces as a SYNTHETIC user-edit (F) on the SURVIVING branch (content = `add` + `# user tweak`, subtract removed); Claude then edits to add `multiply` (G) against that restored disk. The surviving reconstruction must end at the real 7-line on-disk file. The engine already does this; S20 locks it and proves the S19 reseed stays dormant.

## Current State
**PLAN COMPLETE, engine behavior VERIFIED CORRECT, no code change needed, nothing for S20 committed.** This session:
- Waited (monitor-gated) for the genuine S19 IMPLEMENTED handoff (`…-2132.md`) before analyzing, so S20 was diagnosed against the S19-fixed engine (not the pre-S19 engine — diagnosing early would have rediscovered S19's bug and produced a duplicate fix).
- Ran S20 through `reconstruction_cli`: `--surviving --verbose` reconstructs `scenario20.py` to **7 lines, BYTE-IDENTICAL** to on-disk `scenarios/executed/s20-user-edit-code-rewind/scenario20.py` (`diff` clean). `--list-branches` and the default conversationDAG/fileDAG render correctly.
- Confirmed via subagents (engine-path + raw-JSONL trace) that **no `src/` change is required**: the S19 `seedStaleEditBases` reseed is INERT for S20 (G's hunk is aligned with the 3-line user-tweak base that F supplies), and correctness comes from the existing S15 content-aware user-edit guard recording F.
- Baseline: `npm test` = **233 pass / 0 fail** (S19 applied, uncommitted).
- Wrote the plan with exact changeIds, tips, in-memory reader, and verbatim test code.

## What Remains
Execute `plans/s20/s20-reconstruction-plan.md` top to bottom. In order:
1. **Task 0** — confirm `npm test` = 233 green and the end-to-end probes match the ground truth. (If ≠ 233, STOP — the S19 work may be missing.)
2. **Task 1** — add `S20_JSONL` to `tests/fixtures.ts` (after `S19_JSONL`, line 60); create `tests/reconstruction_engine_s20.test.ts` with the in-memory `S20_BACKUPS` reader + 4 tests (final-text byte-lock; branch enumeration; **3-revisions-no-synthetic-seed regression lock**; test-file single write). Confirm GREEN.
3. **Task 2** — create `tests/reconstruction_cli_s20.test.ts` with 5 CLI byte-lock tests (re-run the CLI and paste exact column whitespace; line-POSITION locks for `# user tweak` on line 3 and `def multiply` on line 6). Full suite → **242 green**.
4. **Task 3** — docs: flip `plans/roadmap.md` line 21 `[ ] S20 -> [x] …`; prepend S20 entry to `plans/implementation-notes-api-from-scenarios.md`; add one note to `plans/reconstruction-engine-design.md` (code-rewind restore surfaces as a surviving-branch user-edit).
5. **Task 4** — verify gates: `npm test` (242 green), `npx tsc --noEmit` clean, filesize sweep (≤250 lines), `git diff src/` EMPTY.
6. **Task 5 — create handoff** with `/jot:handoff-prompt` (title contains `S20` + `IMPLEMENTED`; state 242 green, no engine change, nothing committed). This is required so the downstream S21 planning monitor recognizes completion.

On user approval, commit as ONE scenario commit (message `Implemented S20 handling`) staging EXACTLY: `tests/fixtures.ts`, `tests/reconstruction_engine_s20.test.ts`, `tests/reconstruction_cli_s20.test.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s20/s20-reconstruction-plan.md`. No `src/` files. (Note: S19's separate uncommitted work will still be in the tree — do not co-mingle it; the user manages the S19 commit separately.)

## Key Files
- `plans/s20/s20-reconstruction-plan.md` — THE plan: ground-truth table (changeIds/tips/content/blob ladder), the verbatim engine + CLI test code, the in-memory reader, doc edits, verify gates. Read it fully first.
- `tests/reconstruction_engine_s19.test.ts` — the engine-test template (copy imports + `finalTextOf`/`historyEndingWith` helpers verbatim; swap S19→S20 values).
- `tests/reconstruction_cli_s19.test.ts` — the CLI-test template (`runCli` usage, line-position locking style).
- `tests/fixtures.ts` — add `S20_JSONL` after line 60 (Desktop canonical path).
- `src/reconstruction_branches.ts` / `src/reconstruction_replay.ts` — READ ONLY (orientation): `seedStaleEditBases`/`editBaseIsStale` (the S19 reseed that must stay inert) and `userEditChangesContent` (the S15 guard that records F). Do NOT edit.
- S20 JSONL (worktree): `scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl` (the fixture uses the canonical Desktop path).

## Context the Next Agent Won't Have
- **S20 is a NO-OP characterization lock, NOT a fix.** Do not change `src/`. If a test fails, the test (changeId / whitespace / line number / enum member) is wrong, not the engine — fix the test to match live CLI/engine output.
- **The S19 vs S20 hinge:** S19 (conv-rewind) put the user-edit on the REWOUND branch → surviving edit base was stale → reseed FIRED (real fix). S20 (code-rewind) puts the restore-echo user-edit (F) on the SURVIVING branch → base aligned → reseed INERT. S20's Task-1 "3-revisions, kinds `[write, userEdit, edit]`" test is the regression lock proving the reseed stays dormant; a mis-fire would add a 4th `overwrite` revision (S19's surviving ladder is `[write, overwrite, edit]` — DIFFERENT from S20's).
- **There are TWO user-edits with byte-identical snippets** (`add` + `# user tweak`): D `#1f34678f` (rewound, the REAL human edit, backup v2) and F `#ce4c11d8` (surviving, the CODE-REWIND RESTORE, backup v4 written ~32s later). The snippet alone can't tell them apart — the timeline + backup-version ladder (v1 add → v2 human tweak → v3 subtract → v4 restore → v5 multiply) is what disambiguates. S20 is the FIRST scenario with a user-edit on BOTH branches.
- **G's `structuredPatch` lives on the tool-RESULT record, not the tool_use record** (its `oldStart=1, oldLines=3, originalFile="…# user tweak\n"` — aligned). Don't conclude "no hunk" from the tool_use record.
- **The `EventKind` member for a user-edit revision may be named `userEdit` (verify against `src/structures/vocabulary.ts`).** S19's seeded middle revision used `EventKind.overwrite`; S20's middle revision is a user-edit, a different member — confirm the exact name before asserting.
- **CLI column whitespace is load-bearing and fragile.** The plan's CLI assertion strings were captured live this session, but re-run `reconstruction_cli` during implementation and paste the exact lines (the S19 CLI test #4 had to be rewritten because `--verbose` output is line-numbered, so raw multi-line substrings never matched — lock by line POSITION instead).
- **There is no `--rewound` flag.** Inspect the rewound branch with `--branch 51227411 --verbose` (an unknown flag is silently ignored and defaults to surviving).
- **Working tree carries uncommitted S19 work** (see Branch). Keep S20's commit isolated; never `git add -A`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 233 pass / 0 fail BEFORE you start; 242 pass / 0 fail when done
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
git diff src/            # MUST be empty — S20 touches no source
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null   # scenario20.py: 7 lines, `# user tweak` on line 3, three revisions
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null         # surviving #cacc87c7 / rewound #51227411 rewind @ #e76a23d3
# Byte-identical to on-disk ground truth:
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/revision 2/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s20-user-edit-code-rewind/scenario20.py && echo BYTE-IDENTICAL
```
