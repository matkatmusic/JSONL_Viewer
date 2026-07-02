# Handoff: IMPLEMENT Scenario s33 (`s33-script-rename-csv-user-edit`) — CHAR-LOCK, no engine change, suite 451→463
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S33 planning (/plan-scenario 33)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/11652f32-159d-475f-a5ff-83d3aa9bff50.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s33/s33-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (unchanged — NOTHING committed; the worktree
carries uncommitted S28–S32 work, see Coordination Hazard).

## Goal
Lock the reconstruction of Scenario s33 — a script rename whose **`renames.csv` mapping file is written
with 3 rows then USER-EDITED to append a 4th row** (`chk_stock,check_stock`) BEFORE the rename script
runs once via Bash. The engine **already reconstructs all four touched files byte-perfectly** (sibling
of S25/S29/S31/S32, HAS-BEACON + native user-edit handling), so this is a **characterization /
regression LOCK: NO `src/` change** — add a fixture, write 6 engine + 6 CLI tests, update 3 docs.

## Current State — PLANNED (implementation not started)
- Baseline **451/451 green**, `npx tsc --noEmit` clean (confirm first; reconcile with the S32 handoff
  `plans/s32/handoff-api-from-scenarios-20260624-1911.md` if not 451).
- **Live-verified at HEAD:** `reconstructBranches(loadRecords(S33_JSONL))` → `rewound=0`,
  `surviving=4`; all four files byte-equal to the rendered ground truth with **NO reader AND under a
  poison reader** (reader-INDEPENDENT); `extractFileEvents` = `{write:4, edit:2, userEdit:3,
  overwrite:0}`, userEdit ids `["4480f645","b8591d24","c7415420"]`. No rescue stage fires.
- The plan (`plans/s33/s33-reconstruction-plan.md`) is authoritative and carries every exact anchor
  (DAG ids, node ladders, revision counts, line counts, content literals). Follow it; do not re-derive.

## What Remains (execution order)
1. **Confirm baseline** — `npm test` 451/0, `npx tsc --noEmit` clean.
2. **Add `S33_JSONL`** to `tests/fixtures.ts` after `S32_JSONL` (exact path in the plan, Task 2).
3. **Write `tests/reconstruction_engine_s33.test.ts`** — 6 engine tests T1–T6 (copy the helper block
   verbatim from `tests/reconstruction_engine_s32.test.ts`; only the ground-truth constant changes).
4. **Write `tests/reconstruction_cli_s33.test.ts`** — 6 CLI tests C1–C6 (copy `fileVerboseBlock` /
   `finalRevisionSlice` verbatim from `tests/reconstruction_cli_s32.test.ts`).
5. **Update 3 docs** — append/prepend an S33 entry to `plans/roadmap.md` (suite 463),
   `plans/reconstruction-engine-design.md` (after the S32 block),
   `plans/implementation-notes-api-from-scenarios.md` (prepend). Do not rewrite prior entries.
6. **Verify** — `npm test` 463/0, `npx tsc --noEmit` clean, `git diff --stat -- src/` shows **zero
   S33-attributable change**.
7. **Create handoff** — write the S33 completion handoff to `plans/s33/` with a title whose first token
   is `s33` and that contains the whole word **IMPLEMENTED** (fires the S34 planning monitor).
8. **Commit (USER APPROVAL ONLY)** — stage exactly the S33 paths in "Commit hygiene"; never `git add -A`.

## Key Files
- `plans/s33/s33-reconstruction-plan.md` — authoritative plan (test-by-test anchors).
- `tests/fixtures.ts` — add `S33_JSONL`.
- `tests/reconstruction_engine_s32.test.ts` / `tests/reconstruction_cli_s32.test.ts` — the structural
  templates to copy helpers + test shape from.
- `scenarios/executed/s33-script-rename-csv-user-edit/` — rendered ground-truth files (byte-identical
  to the sibling store the fixture points at).
- `plans/script-handling.txt` — MUST READ; HAS-BEACON vs NO-BEACON premise.

## Context the Next Agent Won't Have
- **It's a pure LOCK — tests pass on first run; there is NO bug and NO `src/` change.** If any S33 test
  is RED, the test is wrong (or the baseline drifted), not the engine. Do not "fix" the engine.
- **The NOVEL element is the CSV user-edit, and it is LOAD-BEARING.** `renames.csv` reconstructs to a
  **2-revision** ladder: rev0 = 4 lines (header + 3 rows, NO `chk_stock,check_stock`), rev1 = 5 lines
  (+ the 4th row). The post-script `reorder` edit on `billing.py` calls `check_stock` — a name that
  exists ONLY because that 4th row flowed through the script. T3 + T5 + C6 pin this; keep their
  comments accurate (this is the one fact that distinguishes s33 from s31).
- **Three user-edits, mixed provenance.** `4480f645` (billing) and `c7415420` (test) are script-run
  beacons; **`b8591d24` (renames.csv) is a genuine MANUAL edit**, not a beacon. The engine treats all
  three uniformly — say so; don't call `b8591d24` a beacon.
- **NO kept-name hazard here (unlike S31/S32).** `tests/test_billing.py` method names are
  `test_empty_is_zero` / `test_single_item` / … — no terse substring survives, so do NOT import the
  S31/S32 `test_get_val_*` kept-name control; it has no subject. Still use `\bold\b` regex for old-name
  absence (the renamed import + call sites are the real surface).
- **Prose hazard:** NEW names appear ~16× in `billing.py` docstrings (e.g. `reorder`'s
  `:func:`check_stock``). Assert ABSENCE of OLD whole-word names, never absence of new names.
- **CLI verbose final-revision scoping:** `billing.py` early revisions carry OLD names — scope
  old-name absence to `finalRevisionSlice` (s32 lesson). Use `--verbose` sliced by `### …/<suffix>`
  header, NOT `--target` (returns empty for a basename).
- **Path disambiguation:** suffix `"/billing.py"` (leading slash) so it never matches
  `"/tests/test_billing.py"`. Reconstructed paths live under `…/run-scenario.uheh27w3/…`.
- **Ground-truth store the fixture points at (cross-source):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s33-script-rename-csv-user-edit`
  (byte-identical to the worktree `scenarios/executed/...` copy).

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY these S33 paths — never `git add -A`, never any `src/*` (S33 changes no source):
`tests/fixtures.ts`, `tests/reconstruction_engine_s33.test.ts`,
`tests/reconstruction_cli_s33.test.ts`, `plans/roadmap.md`,
`plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/s33/`.

**COORDINATION HAZARD (same as S28–S32):** the worktree carries uncommitted prior-scenario work —
`src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`,
`src/parse/loadTranscript.ts` (S32 fix), `tests/loadTranscript.test.ts`, the S28–S32 test/plan files,
and unrelated `src/Plan_template.md` / `src/Impl_template.md` edits by other agents. The three doc
files in this commit ALSO carry S28–S32 edits. `git diff --stat` is NOT S33-only — confirm the
commit-split with the user; do not assume.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 451 before, 463 after
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s33.test.ts tests/reconstruction_cli_s33.test.ts   # 12/12
git diff --stat -- src/    # NO s33-attributable change (pure characterization lock)
```
