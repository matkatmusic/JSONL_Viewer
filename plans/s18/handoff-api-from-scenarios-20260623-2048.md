# Handoff: S18 (`s18-user-edit-no-rewind`) reconstruction PLAN is complete and engine-verified — implement it. The plan is a characterization/regression LOCK with NO production-code change: the current engine already reconstructs S18 byte-for-byte correctly. All four engine-level assertions were verified LIVE this session via an engine probe (branches=1 surviving tip 503a45bb / rewound=0 / scenario18.py=3 revisions with comment+greet+farewell / exactly 1 user-edit changeId 8902b3f0 after 2 writes), and all CLI bytes were captured from real runs. Implementing = add a fixture constant + 9 tests (4 engine + 5 CLI) + docs, expected 224 green, GREEN on arrival. NOTHING is committed.
Conversation name: api-from-scenarios — S17 handoff monitor → plan S18 (user-edit-no-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/9d9865a7-2b6f-44f6-aebb-312db6df818b.jsonl
Plan file (AUTHORITATIVE): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s18/s18-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `39700e6 updated plan implement template`. S15 is committed at `03dad64`. **S16 and S17 are both IMPLEMENTED but UNCOMMITTED** in the working tree (their test files are untracked; `tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md` carry their uncommitted edits). S18 has only its plan dir (`plans/s18/`) so far.

## Goal
Make `reconstruction_cli` correctly reconstruct — and LOCK with tests — the file-change history of `s18-user-edit-no-rewind`: a **strictly linear** scenario (no rewind, no fork) where B writes `scenario18.py` (greet) + C writes the test, the user then edits `scenario18.py` **out-of-band** (an `edited_text_file` attachment prepending `# user was here`), and E (Claude) edits the file to add `farewell` **anchored on the user-edited content**. Surviving (and only) tree = `# user was here` + greet + farewell. S18 is the **inversion of S15**: the user edit is KEPT on the surviving lineage (S15 stranded its edit on a rewound branch); it is the FIRST scenario whose fileDAG shows a `user-edit` kind on the surviving lineage and whose `--surviving` view KEEPS the user edit.

## Current State
**PLAN COMPLETE + ENGINE-VERIFIED — implementation NOT started, nothing committed.** The plan was authored after running S18 through `reconstruction_cli`, fanning out subagents to extract the JSONL ground truth and audit the engine source, and running a live engine probe. The engine is already correct (no `src/` change needed). Verified this session:
- **CLI** (`npx tsx src/reconstruction_cli.ts <S18> ...`, real bytes): default conversationDAG is LINEAR — `A prompt #257a17e2`, `B write scenario18.py #01Gi9FvK`, `C write test_scenario18.py #01XgoZoq`, `D user-edit scenario18.py #8902b3f0`, `E edit scenario18.py #015Q6Dme`; NO rewind point / NO branch headers. fileDAG `scenario18.py` = B write / D user-edit / E edit, `test_scenario18.py` = C write. `--list-branches` = `surviving tip #503a45bb` only (no rewound). `--surviving --verbose` = greet + `# user was here` + farewell (3 revisions).
- **Engine probe** (against `findConversationBranches`/`reconstructBranches`/`reconstructAll`/`extractFileEvents`, since removed): branches.length=1, isSurviving=true, tip=503a45bb, rewindPoint=undefined, non-surviving=0; rewound.length=0; scenario18.py=3 revisions, final has comment+greet+farewell, revision-1 has comment+greet but NOT farewell; exactly 1 userEdit event, changeId=8902b3f0, ordered after the 2 writes.
- Baseline suite (with S16+S17 in the tree): **215 pass / 0 fail**; `npx tsc --noEmit` clean.

## What Remains
Execute the plan `plans/s18/s18-reconstruction-plan.md` task by task (all tests are characterization locks expected GREEN on arrival — if any is unexpectedly RED, STOP and diagnose against the plan's verified ground truth; do NOT loosen an assertion or fabricate a fix):
1. Run `npm test` and record the pre-S18 green count as `BASE` (expected **215**).
2. **Task 1a** — add `S18_JSONL` to `tests/fixtures.ts` (immediately after `S17_JSONL`, currently line 53; absolute Desktop path is in the plan).
3. **Task 1b** — create `tests/reconstruction_engine_s18.test.ts` (4 tests; transcribe the plan's code verbatim — scaffolding mirrors `tests/reconstruction_engine_s15.test.ts`). Verify gate: expect **BASE+4 = 219** green, tsc clean, no file > 250 lines.
4. **Task 2a** — create `tests/reconstruction_cli_s18.test.ts` (5 tests; transcribe the plan's code verbatim — scaffolding mirrors `tests/reconstruction_cli_s15.test.ts`). Verify gate: expect **BASE+9 = 224** green.
5. **Task 2b/3** — docs: prepend an S18 entry to `plans/implementation-notes-api-from-scenarios.md`; flip `plans/roadmap.md` line 19 `[ ] S18 ->` to `[x] S18 -> [x] ...` (full summary text is in the plan).
6. **Run the End-to-end check** in the plan (proves S18 keeps the user edit AND that S15's `--surviving` still EXCLUDES its user edit — the headline inversion, both directions).
7. **Create handoff** — produce a completion handoff with `/jot:handoff-prompt` (S18 implemented as a characterization lock, no production change, fixture + 9 tests, final count 224, nothing committed).
8. **Stop and report. Commit only on user approval** (project rule: one commit per scenario). Stage exactly the S18 artifacts — do NOT `git add -A` (S16/S17 are also uncommitted; keep each scenario a DISTINCT commit). Suggested message on approval: `Implemented S18 handling`.

## Key Files
- `plans/s18/s18-reconstruction-plan.md` — the AUTHORITATIVE plan (verified changeIds/uuids, the S15-vs-S18 inversion table, the three already-correct engine paths, verbatim test code, verify gates).
- `tests/reconstruction_engine_s15.test.ts` / `tests/reconstruction_cli_s15.test.ts` — the SCAFFOLDING templates to mirror (imports, the three `finalTextOf`/`historyFinalText`/`historyEndingWith` helpers, `runCli`/`loadRecords` usage). S15 is the closest structural analog because it is the other user-edit-guard scenario — but its ASSERTIONS invert (see below).
- `tests/fixtures.ts` — where `S18_JSONL` goes (after `S17_JSONL`, line 53).
- `plans/roadmap.md` (line 19 `[ ] S18 ->`) / `plans/implementation-notes-api-from-scenarios.md` (top entry) — the docs to update.
- `src/reconstruction_replay.ts:118-134` (`userEditChangesContent`), `src/reconstruction_replay_edit.ts:96-107` (`resolveContextLine` born-path), `src/reconstruction_branch.ts:37-59` (`findSurvivingHead` linear case) — the engine paths that make S18 already-correct (read-only; do NOT change).
- S18 JSONL: `scenarios/executed/s18-user-edit-no-rewind/a2146944-adfe-408d-b9be-0de8cc1d4c72.jsonl` (canonical Desktop path used in the fixture is in the plan).

## Context the Next Agent Won't Have
- **Do NOT copy the S16/S17 test files — copy S15's SCAFFOLDING but INVERT the assertions.** S16/S17 are rewind scenarios: their tests assert a rewound branch exists and that `!out.includes("user-edit")`. S18 is linear: assert `branches.length === 1` (surviving only), `rewound.length === 0`, the fileDAG `includes("user-edit")`, and `--surviving` KEEPS `# user was here`. A blind copy of S16/S17 (or of S15's "surviving EXCLUDES the user edit") is the single most likely mistake — S18's surviving view INCLUDES the user edit.
- **Why the engine is already correct (no fix):** the user's `# user was here` content DIFFERS from B's greet-only write, so the S15 content-aware guard `userEditChangesContent` (`reconstruction_replay.ts:118-134`) returns true and KEEPS the user-edit revision (in S16 the echo matched current → dropped). E's `farewell` edit then anchors on the user-edited revision via `resolveContextLine` carryAt (`reconstruction_replay_edit.ts:96-107`). With no rewind, `findSurvivingHead` returns the single head directly. All shipped, all verified live.
- **The fixtures.ts recovery hazard (IMPORTANT):** this worktree carries uncommitted S16/S17 work from a concurrent pipeline. During planning, a `git checkout tests/fixtures.ts` (run to revert a temporary probe edit) DISCARDED the uncommitted `S16_JSONL`/`S17_JSONL` constants; they were restored by hand and the suite is green again (215). **Never `git checkout`/`git restore` a shared file in this worktree** — uncommitted scenario work lives there. To revert a temp edit, edit the specific lines back instead.
- **Baseline depends on S16+S17 being present.** If `BASE ≠ 215` at start, S16 or S17 may have been committed or reverted elsewhere — the absolute target is still `BASE + 9`; note any discrepancy in the completion handoff.
- This plan was produced by a monitor-gated pipeline: a self-healing background Monitor watched `plans/` for the S17 IMPLEMENTED handoff (`20260623-2034.md`) before S18 planning began.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 215 BASE; 219 after Task 1 (+4 engine); 224 after Task 2 (+5 CLI); expect 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s18-user-edit-no-rewind/a2146944-adfe-408d-b9be-0de8cc1d4c72.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                          # linear A/B/C/D-user-edit/E-edit; fileDAG write/user-edit/edit
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null          # surviving #503a45bb only (no rewound)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null     # KEEPS: # user was here + greet + farewell (the S18 signature)
```
