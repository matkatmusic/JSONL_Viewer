# Handoff: S16 (`s16-multi-edit-code-restore-re-edit`) reconstruction PLAN is complete and source-verified — implement it. The plan is a CHARACTERIZATION/REGRESSION-LOCK with NO production-code change: the engine already reconstructs S16 correctly (confirmed four ways), so the implementer adds only a fixture + 9 tests + roadmap/notes updates. This was a planning-only session; NOTHING in `src/` or `tests/` was changed for S16.
Conversation name: api-from-scenarios — S16 handoff monitor → plan Scenario 16 (multi-edit code-restore re-edit)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/c81c714b-14cc-448d-ac03-3c3c6b02b14e.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s16/s16-reconstruction-plan.md (authoritative, ready to execute)

## Branch
`api-from-scenarios` based on `master`. HEAD = `03dad64 Implemented S15 handling`. The only uncommitted working-tree change is `src/Plan_Impl_template.md` (unrelated to S16 — do NOT touch or commit it). `plans/s16/` is new/untracked. `npm test` on HEAD = **197 green**.

## Goal
Make `reconstruction_cli` correctly reconstruct — and LOCK with tests — the file-change history of `s16-multi-edit-code-restore-re-edit`. S16 is the **re-edit twin of S13**: B writes `scenario16.py` (greet) + the test; D edits in `farewell`; a **code-restore rewind** (scenario step `Rewind: 2, code`) abandons D and rolls disk back to greet-only; E re-edits to add `shout`. The surviving working tree is **greet + shout** (matches on-disk `scenario16.py`); the abandoned `farewell` edit is preserved as a structurally-discovered rewound branch. The point of the slice is to LOCK this — S16 is the first scenario where a structurally-discovered rewound branch coexists with a surviving branch that records its OWN file change.

## Current State
**Planning only — nothing implemented.** The plan (`plans/s16/s16-reconstruction-plan.md`) is written, How-focused, with full ground truth and ready-to-paste test code. Verified that **S16 needs NO production-code change** four independent ways:
- **CLI runs** (default / `--list-branches` / `--surviving --verbose` / `--branch 24093c68 --verbose`) produce the correct fork: surviving = greet+shout, rewound = greet+farewell.
- **Scenario-script comparison** against `scenarios/s16-multi-edit-code-restore-re-edit.txt`: every scripted file-change event maps to the reconstructed output; the two acceptances and the `edited_text_file` echo correctly produce no turns.
- **Four read-only source audits** (one per mechanism), all VERDICT: CORRECT by design — (1) structural rewound discovery via the system-record fork `9ab7b6e0`; (2) `findSurvivingHead` keeps final head `a4ec5565` via its on-branch short-circuit (owner `2de1cd62` is on the surviving chain), S14 guard a second line of defense; (3) branch-aware replay isolates `shout` against greet-only + S15 echo guard drops the record-80 echo (accepted user-edit set = empty); (4) two-DAG render correct (surviving shows its `E edit`, not `(no file changes)`; fileDAG kind width 5, no `user-edit` leaked).
- Baseline suite = **197 pass / 0 fail**, `tsc` clean.

## What Remains
Execute the plan task-by-task (it is the authoritative source; this list is the sequence):
1. **Task 1a** — add `S16_JSONL` to `tests/fixtures.ts` (after `S15_JSONL`; absolute-Desktop path in the plan).
2. **Task 1b** — create `tests/reconstruction_engine_s16.test.ts` (4 tests, code in the plan; mirror `reconstruction_engine_s15.test.ts`). Run: expect **201 green**, `tsc` clean. These are characterization locks — GREEN on arrival. If any is RED, STOP and diagnose against the plan's ground truth; do NOT loosen an assertion or fabricate a src change.
3. **Task 2a** — create `tests/reconstruction_cli_s16.test.ts` (5 tests, whitespace-accurate bytes in the plan; mirror `reconstruction_cli_s15.test.ts`; a NEW file because `reconstruction_cli.test.ts` is at 243/250). Run: expect **206 green**.
4. **Task 2b** — docs: prepend an S16 entry to `plans/implementation-notes-api-from-scenarios.md`; flip `plans/roadmap.md` line 17 `[ ] S16 ->` to `[x] S16 -> [x] …` (summary text in the plan). No design-doc/spec change (S13–S15 added none).
5. Run the verify gate + end-to-end check (commands in the plan).
6. **Task 3 — create a handoff** with `/jot:handoff-prompt` describing the implemented S16 (final test count, files added, nothing committed).
7. STOP and report. Commit only after the user approves — one commit, message `Implemented S16 handling`. Do NOT sweep `src/Plan_Impl_template.md` into it.

## Key Files
- `plans/s16/s16-reconstruction-plan.md` — the authoritative plan: ground truth (changeIds, uuids, the echo), ready-to-paste test code, locked decisions, verify gates. READ THIS FIRST.
- `tests/fixtures.ts` — add `S16_JSONL` (ends at `S15_JSONL` today).
- `tests/reconstruction_engine_s15.test.ts` / `tests/reconstruction_cli_s15.test.ts` — the exact structural templates for the two new S16 test files.
- `scenarios/s16-multi-edit-code-restore-re-edit.txt` — the scripted scenario (the behavioral ground truth).
- `plans/roadmap.md` (line 17) / `plans/implementation-notes-api-from-scenarios.md` (top) — the docs to update.
- S16 JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s16-multi-edit-code-restore-re-edit/1ae6a672-d55d-41a6-add3-46123a227440.jsonl` (repo-relative via the `scenarios/` symlink: `scenarios/executed/s16-multi-edit-code-restore-re-edit/1ae6a672-d55d-41a6-add3-46123a227440.jsonl`).

## Context the Next Agent Won't Have
- **No RED phase by design.** The engine is already correct; the 9 tests are characterization/regression locks expected GREEN on arrival (exactly like S10/S11). A RED means a transcription error or a real regression — diagnose, do not paper over.
- **S16's distinct property (why it's its own slice despite no code change):** it is the FIRST scenario combining a structurally-discovered rewound branch (the S13 mechanism — the abandoned tip `24093c68` is NOT a last-prompt head) with a surviving branch that records its OWN file change (the `shout` re-edit). In S13/S14/S15 the surviving branch was file-less (`(no file changes)`); here it renders its `E edit`. The load-bearing reason the surviving head stays correct is the on-branch working-tree-owner short-circuit (`reconstruction_branch.ts:48-49`), with the S14 `survivingBranchRecordsFileChange` guard as a redundant safeguard.
- **The lone `edited_text_file` (record 80, greet-only) is a disk-snapshot ECHO, not a user edit** (S16 is not a user-edit scenario). The S15 content-aware, branch-aware guard drops it — so the fileDAG kind column is width 5 (`write`/`edit`), never width 9 (`user-edit`). The CLI test asserts `!out.includes("user-edit")` to lock this.
- **Predecessor S15 was committed since its own handoff** (HEAD `03dad64`), so its echo-guard code is present — that is WHY S16's echo is already dropped. The repo is clean (except the unrelated template file).
- **Repo hooks:** a Stop hook reruns the full suite after source/test edits (inline RED can lag one edit — confirm with `npx tsx --test <file>` or `npm test`); a lint hook caps files at 250 lines (`reconstruction_cli.test.ts` is at 243 — hence the new per-scenario CLI file); a hook WARNS when a new `src/*.ts` has no test (N/A here — no src change). `tsx` does NOT type-check; `npx tsc --noEmit` is the real type gate, so type the engine-test helpers as in the S15 test.
- **S17 (`s17-multi-edit-conv-only-re-edit`) is the conv-only twin of S16** (disk keeps `farewell`) — its own future slice; do NOT fold it in.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 197 baseline → 201 after Task 1 → 206 after Task 2 (confirm exact, zero failures)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s16-multi-edit-code-restore-re-edit/1ae6a672-d55d-41a6-add3-46123a227440.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # fork: rewound D edit #01V2kMb8 above surviving E edit #01FE5WkH; fileDAG B write / D edit / E edit + C write
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null   # greet + shout (no farewell)
npx tsx src/reconstruction_cli.ts "$P" --branch 24093c68 --verbose 2>/dev/null  # greet + farewell (no shout)
```
