# Handoff: S17 (`s17-multi-edit-conv-only-re-edit`) reconstruction PLAN is complete and engine-verified — implement it. The plan is a characterization/regression LOCK with NO production-code change: the current engine already reconstructs S17 correctly (the shipped S12 born-path + S13 structural discovery + S14 surviving-head guard already cover it). All four engine-level assertions and all CLI bytes were verified live during planning. Implementing = add a fixture constant + 9 tests (4 engine + 5 CLI) + docs, expected 215 green, GREEN on arrival. NOTHING is committed.
Conversation name: api-from-scenarios — S16 IMPLEMENTED handoff monitor → plan S17 (multi-edit-conv-only-re-edit)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/98ef0771-b602-4693-9c2c-364907620b15.jsonl
Plan file (AUTHORITATIVE): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s17/s17-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `39700e6 updated plan implement template` (S15 is committed at `03dad64`; S16 is implemented but UNCOMMITTED in the working tree; S17 has only its plan dir so far).

## Goal
Make `reconstruction_cli` correctly reconstruct — and LOCK with tests — the file-change history of `s17-multi-edit-conv-only-re-edit`, the **conv-only twin of S16**: B writes `scenario17.py` (greet) + the test C; D edits in `farewell`; a **conversation-only** rewind (`Rewind: 2`, NO `code` suffix) abandons D *conversationally* but **leaves `farewell` on disk**; E re-edits the still-farewell file to add `shout`. Surviving working tree = **greet + farewell + shout** (KEEPS farewell — the one byte that inverts versus S16's greet + shout); the abandoned `farewell` edit is preserved as a structurally-discovered rewound branch. S17 is to S16 what S14 was to S13 (conv-only twin of a code-restore scenario).

## Current State
**PLAN COMPLETE + ENGINE-VERIFIED — implementation NOT started, nothing committed.** The plan was authored after running S17 through `reconstruction_cli` and auditing the engine source; the engine is already correct (no `src/` change needed). Verified live this session:
- **CLI** (`npx tsx src/reconstruction_cli.ts <S17> ...`, bytes confirmed via `cat -e`): default forks at `#4a69b697` (rewound `D edit scenario17.py #01EbvweP` above surviving `E edit scenario17.py #01RvpwRx`); fileDAG `scenario17.py` = `B write #017Kvucu / D edit #01EbvweP / E edit #01RvpwRx`, `test_scenario17.py` = `C write #01S2jTCa`, no `user-edit` turn; `--list-branches` = surviving `#e53225b5` + rewound `#07038b43` (rewind @ `#4a69b697`); `--branch 07038b43` = greet + farewell; `--surviving` = greet + farewell + shout.
- **Engine** (throwaway probe against `reconstructAll`/`reconstructBranches`/`findConversationBranches`, since removed): T1 surviving tip `e53225b5`, rewound `07038b43` (isSurviving false, rewindPoint `4a69b697`); T2 one rewound branch touching only `scenario17.py`; T3 rewound = farewell, not shout; **T4 surviving = 2 revisions, has farewell TRUE, has shout TRUE** (the S17 signature).
- Baseline suite (with S16 in the tree): **206 pass / 0 fail**; `npx tsc --noEmit` clean.

## What Remains
Execute the plan `plans/s17/s17-reconstruction-plan.md` task by task (all tests are characterization locks expected GREEN on arrival — if any is unexpectedly RED, STOP and diagnose against the plan's verified ground truth; do NOT loosen an assertion or fabricate a fix):
1. **Task 1a** — add `S17_JSONL` to `tests/fixtures.ts` (after `S16_JSONL`; absolute-Desktop path in the plan).
2. **Task 1b** — create `tests/reconstruction_engine_s17.test.ts` (4 tests; transcribe the plan's code verbatim — mirrors `tests/reconstruction_engine_s16.test.ts`). Verify gate: expect **210** green, tsc clean, no file > 250 lines.
3. **Task 2a** — create `tests/reconstruction_cli_s17.test.ts` (5 tests; transcribe the plan's code verbatim — mirrors `tests/reconstruction_cli_s16.test.ts`). Verify gate: expect **215** green.
4. **Task 2b** — docs: prepend an S17 entry to `plans/implementation-notes-api-from-scenarios.md`; flip `plans/roadmap.md` line 18 `[ ] S17 ->` to `[x] S17 -> [x] ...` (summary text in the plan).
5. **Run the End-to-end check** in the plan (proves S17 correct AND that S16's `--surviving` still shows greet + shout with NO farewell — the headline twin difference).
6. **Create handoff** — produce a completion handoff with `/jot:handoff-prompt` (S17 implemented as a characterization lock, no production change, test files + fixture, final count 215, nothing committed → message `Implemented S17 handling` only on user approval).
7. **Stop and report. Commit only on user approval** (project rule: one commit per scenario). Stage exactly the S17 artifacts — do NOT `git add -A`.

## Key Files
- `plans/s17/s17-reconstruction-plan.md` — the AUTHORITATIVE plan (ground-truth changeIds/uuids, the four source audits, locked decisions, verbatim test code, verify gates, the S16-inversion callouts).
- `tests/reconstruction_engine_s16.test.ts` / `tests/reconstruction_cli_s16.test.ts` — the exact templates to mirror (S16 is in the tree, uncommitted).
- `tests/fixtures.ts` — where `S17_JSONL` goes (after `S16_JSONL`).
- `plans/roadmap.md` (line 18 `[ ] S17 ->`) / `plans/implementation-notes-api-from-scenarios.md` (top entry) — the docs to update.
- `src/reconstruction_replay_edit.ts:96-107` (`resolveContextLine` born-path), `src/reconstruction_branch.ts:37-71` (`findSurvivingHead`/guard), `src/reconstruction_fork.ts` (structural discovery) — the engine paths that make S17 already-correct (read-only; do NOT change).
- S17 JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s17-multi-edit-conv-only-re-edit/4c41e3a3-a213-40f4-8df7-169bf61a8e40.jsonl` (repo-relative via the `scenarios/` symlink: `scenarios/executed/s17-multi-edit-conv-only-re-edit/4c41e3a3-...jsonl`).

## Context the Next Agent Won't Have
- **The ONE assertion that inverts vs S16 — do not copy S16 verbatim.** S16's surviving tests assert the tree has `shout` and **NOT** `farewell`. S17's surviving tests assert the tree has `farewell` **AND** `shout`. The conv-only rewind keeps `farewell` on disk, so E's `shout` edit anchors on `farewell` and the surviving tree is greet + farewell + shout. The plan's Task 1b/2a have bold callouts; this is the whole point of the slice. A blind copy of the S16 assertions is the single most likely mistake.
- **Why the engine is already correct (no fix):** the surviving branch reconstructs over its own records (D excluded), so E's `farewell` context lines are absent from the greet-only base; the spec-39 / S12 `resolveContextLine` born-path materialises them as genesis (this is the partially-present-base case — greet present, farewell absent — that S17 uniquely exercises). The rewound branch is found STRUCTURALLY (probe-confirmed: tip `07038b43` is no last-prompt head), exactly as S13/S16. `findSurvivingHead` keeps the final head `e53225b5` via its on-branch short-circuit (owner `60cee518` is on the final chain). All shipped, all verified live.
- **No `edited_text_file` attachment exists in S17 at all** (full-transcript scan = zero). Unlike S16 (which had a record-80 greet-only echo dropped by the S15 guard), S17 has nothing for the S15 content-aware guard to evaluate — so "no `user-edit` turn" holds trivially.
- **The farewell-attribution artifact is intentional, NOT a bug.** On the surviving branch, `farewell`'s content lands on E's edit revision (its real author D is off-branch). Per the project directive "reconstruct the change history 100%, attribution second", the surviving *content* is byte-correct. Do NOT special-case attribution — scope creep that risks S1–S16.
- **`src/Plan_Impl_template.md` is now committed** (`39700e6`), so it is no longer a stray working-tree edit to avoid (it was in earlier handoffs). Current tree carries S16 (uncommitted) + the new `plans/s17/` dir. If S16 is still uncommitted when S17 lands, keep them as DISTINCT commits — do not fold S17 into the S16 commit.
- This plan was produced by a monitor-gated pipeline: a self-healing background monitor watched `plans/` for the S16 IMPLEMENTED handoff (`20260623-2017.md`) before S17 planning began.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 210 after Task 1 (206 + 4 engine); 215 after Task 2 (+5 CLI); expect 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s17-multi-edit-conv-only-re-edit/4c41e3a3-a213-40f4-8df7-169bf61a8e40.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                          # fork #4a69b697: rewound D edit above surviving E edit; fileDAG B/D/E + C write
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null          # surviving #e53225b5 + rewound #07038b43 (rewind @ #4a69b697)
npx tsx src/reconstruction_cli.ts "$P" --branch 07038b43 --verbose 2>/dev/null   # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null     # greet + farewell + shout  (KEEPS farewell — the S17 signature)
```
