# Handoff: s33 (`s33-script-rename-csv-user-edit`) IMPLEMENTED — CHAR-LOCK, no engine change, suite 451→463
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S33 impl (/impl-scenario 33)
JSONL: the active /impl-scenario 33 session under /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ (planning source of record: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/11652f32-159d-475f-a5ff-83d3aa9bff50.jsonl)
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s33/s33-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (UNCHANGED — NOTHING committed; the worktree
carries uncommitted S28–S33 work, see Coordination Hazard).

## Goal
Lock the reconstruction of Scenario s33 — a script rename whose `renames.csv` MAPPING file is written with
3 rows then USER-EDITED to append a 4th row (`chk_stock,check_stock`) BEFORE `python3 apply_renames.py` runs
once via Bash. The engine already reconstructs all four touched files byte-perfectly (sibling of
S25/S29/S31/S32: HAS-BEACON + native S15 user-edit handling), so this is a characterization/regression LOCK
with NO `src/` change — add a fixture, write 6 engine + 6 CLI tests, update 3 docs.

## Current State — IMPLEMENTED (verified)
- **Suite 451 → 463 green** (`npm test` → tests 463 / pass 463 / fail 0). `npx tsc --noEmit` exits 0, no
  diagnostics.
- The 12 new s33 tests pass on FIRST run (no RED phase — there is no bug, no `src/` change).
- `git diff --stat -- src/` shows ZERO s33-attributable change. The src files that appear there
  (`loadTranscript.ts`, `reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`,
  `Impl_template.md`, `Plan_template.md`) are PRE-EXISTING uncommitted S28–S32 / other-agent work — this
  session touched no `src/` file.
- Live-verified targets the tests pin: `reconstructBranches(loadRecords(S33_JSONL))` → `rewound=0`,
  `surviving=4`; `extractFileEvents` = `{write:4, edit:2, userEdit:3, overwrite:0}`, userEdit ids sorted
  `["4480f645","b8591d24","c7415420"]`; `renames.csv` ladder 4→5 lines; `billing.py` ladder
  146→164→164→187; list-branches tip `#c3d6846d`; reader-INDEPENDENT under a poison reader.

### Files created / changed this session
- `tests/fixtures.ts` — added `S33_JSONL` (after `S32_JSONL`).
- `tests/reconstruction_engine_s33.test.ts` — NEW, 6 engine tests T1–T6.
- `tests/reconstruction_cli_s33.test.ts` — NEW, 6 CLI tests C1–C6.
- `plans/roadmap.md` — appended the S33 line (suite 463).
- `plans/reconstruction-engine-design.md` — S33 note inserted after the S32 block.
- `plans/implementation-notes-api-from-scenarios.md` — prepended the S33 entry.
- `plans/s33/` — plan + this handoff.

## What Remains
1. **Commit (USER APPROVAL ONLY).** Stage EXACTLY these s33 paths — never `git add -A`, never any `src/*`:
   `tests/fixtures.ts`, `tests/reconstruction_engine_s33.test.ts`, `tests/reconstruction_cli_s33.test.ts`,
   `plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
   `plans/implementation-notes-api-from-scenarios.md`, `plans/s33/`. The three doc files ALSO carry S28–S32
   edits — the commit-split is NOT s33-only; confirm with the user before staging (see Coordination Hazard).
2. **S34 planning** fires automatically: this handoff's title (`s33 … IMPLEMENTED`) satisfies
   `monitor-handoff.sh s33 impl`, which gates the S34 planning monitor.

## Key Files
- `plans/s33/s33-reconstruction-plan.md` — authoritative plan (test-by-test anchors).
- `tests/reconstruction_engine_s33.test.ts` / `tests/reconstruction_cli_s33.test.ts` — the new lock tests.
- `tests/reconstruction_engine_s32.test.ts` / `tests/reconstruction_cli_s32.test.ts` — the structural
  templates the helpers were copied from verbatim.
- `tests/fixtures.ts` — `S33_JSONL` constant.
- `scenarios/executed/s33-script-rename-csv-user-edit/` — rendered ground-truth files (byte-identical to the
  sibling store the fixture points at).
- `plans/script-handling.txt` — MUST READ; HAS-BEACON vs NO-BEACON premise (a Bash run is HAS-BEACON).

## Context the Next Agent Won't Have
- **Pure LOCK — tests pass on first run; there is NO bug and NO `src/` change.** If any s33 test is RED, the
  test is wrong (or the baseline drifted), not the engine. Do NOT "fix" the engine.
- **The NOVEL element is the CSV user-edit, and it is LOAD-BEARING.** `renames.csv` reconstructs to a
  2-revision ladder: rev0 = 4 lines (header + 3 rows, NO `chk_stock,check_stock`), rev1 = 5 lines (+ the 4th
  row). The post-script `reorder` edit on `billing.py` calls `check_stock` — a name that exists ONLY because
  that 4th row flowed through the script. T3 + T5 + C6 pin this.
- **Three user-edits, mixed provenance.** `4480f645` (billing) and `c7415420` (test) are script-run beacons;
  `b8591d24` (renames.csv) is a GENUINE manual edit, not a beacon. The engine treats all three uniformly —
  do not call `b8591d24` a beacon.
- **No kept-name control here (unlike S31/S32).** `tests/test_billing.py` method names embed no terse
  substring, so the S31/S32 `test_get_val_*` kept-name test has no subject and was intentionally omitted.
  Old-name absence is still pinned with `\bold\b` regexes (the renamed import + call sites are the surface).
- **Prose hazard:** the NEW names appear ~16× in `billing.py` docstrings (e.g. `reorder`'s
  `:func:\`check_stock\``). Absence assertions target OLD whole-word names only, never new names.
- **Exact-string CLI assertions were captured from live `runCli` output** (throwaway capture scripts written
  to the project root, run, then deleted) before writing the tests — that is why C1–C6 matched on the first
  run. If re-deriving, the CLI `--verbose` line-number gutter (`   N | `) does not break `includes()` of
  `def …(` substrings, and `finalRevisionSlice` scopes old-name absence to the final renamed revision.

## Coordination Hazard (same as S28–S32)
The worktree carries uncommitted prior-scenario work — `src/parse/loadTranscript.ts` (S32 fix),
`src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`, `tests/loadTranscript.test.ts`,
the S28–S32 test/plan files, and unrelated `src/Impl_template.md` / `src/Plan_template.md` edits by other
agents. The three doc files in the s33 commit ALSO carry S28–S32 edits. `git diff --stat` is NOT s33-only —
confirm the commit-split with the user; do not assume; never `git add -A`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # tests 463 / pass 463 / fail 0
npx tsc --noEmit    # exit 0, no diagnostics
node --import tsx --test tests/reconstruction_engine_s33.test.ts tests/reconstruction_cli_s33.test.ts   # 12/12
git diff --stat -- src/    # NO s33-attributable change (pure characterization lock)
```
