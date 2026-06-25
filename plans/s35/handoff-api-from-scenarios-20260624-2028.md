# Handoff: IMPLEMENT Scenario s35 (`s35-script-rename-script-user-edit`) — PLANNED, CHAR-LOCK, suite 475→487
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S35 planning (/plan-scenario 35) → produce the s35 reconstruction plan + this handoff
JSONL (this planning session): /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/7e7cc3db-8f8c-4aca-8a25-04d7367574ac.jsonl
Plan file (authoritative — READ IT FIRST): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s35/s35-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (UNCHANGED — NOTHING committed; the worktree
carries uncommitted S28–S34 work plus this new S35 plan, see Coordination Hazard).

## Goal
Lock the engine's already-correct reconstruction of Scenario s35 with a fixture + 12 tests + 3 doc
entries. **S35 is a CHAR-LOCK: NO `src/` change.** `reconstruction_cli` already reconstructs all three
touched files byte-perfectly (with the real file-history reader). Your job is to pin that behavior so it
can't regress — exactly as S33 did, but S35 is **reader-DEPENDENT** (so build the reader like S34 did).

## Current State — PLANNED, not yet implemented
- Plan written and **live-verified at HEAD** (baseline 475/475 green, `tsc` clean). Every number, id,
  ladder, and changeId in the plan was captured from a real `reconstructBranches` / `runCli` run, not
  derived. Re-confirm, don't re-derive.
- Nothing else done. No fixture, no tests, no doc edits yet.

## The scenario in one paragraph
A `python3 rename_inv.py` Bash rename (3 whole-word pairs: `qty_chk→check_quantity`,
`add_item→insert_item`, `rm_item→remove_item`). The NOVEL twist: the rename **script itself**
(`rename_inv.py`) is **user-edited twice** (scenario steps 4 & 5 add the 2nd/3rd rename tuples) between
its Write (1 tuple) and its run — and those two edits **coalesce into a single ELIDED `edited_text_file`
beacon** (`#c67cfd9c`). S35 is the **complement of S33**: same "user-edit before the run" shape, but the
beacons here are INCOMPLETE, so the rescue stages FIRE. It composes shipped machinery — **S28
`completeElidedBeacons`** (rename_inv.py → backup `41364cab6ad88cbb@v2`, 17L fragment → 45L), **S27
`completeTruncatedBeacon`** (test_inventory.py → backup `5ea404c2628560f6@v3`, 51L prefix → 79L), and a
COMPLETE beacon on inventory.py (no rescue, reader-INDEPENDENT). Final states byte-match ground truth:
inventory.py 244, test_inventory.py 79, rename_inv.py 45.

## What Remains (execution order — full detail in the plan's "Tasks" section)
1. **Confirm baseline:** `npm test` → 475/0, `npx tsc --noEmit` clean. If not 475, STOP and reconcile
   with the S34 handoff (`plans/s34/handoff-api-from-scenarios-20260624-2010.md`).
2. **Add fixture** `S35_JSONL` to `tests/fixtures.ts` after `S34_JSONL` (path in the plan, Task 2).
3. **Write `tests/reconstruction_engine_s35.test.ts`** — 6 tests T1–T6. Copy the helper block VERBATIM
   from `tests/reconstruction_engine_s34.test.ts` (it already has `realReader`, `poison`, `defBlock`,
   `readGroundTruth`, etc.); change only `S35_GT` and the `FILES` array. Exact assertions in the plan.
4. **Write `tests/reconstruction_cli_s35.test.ts`** — 6 tests C1–C6. Copy `fileVerboseBlock` +
   `finalRevisionSlice` VERBATIM from `tests/reconstruction_cli_s34.test.ts`. Exact assertions in the plan.
5. **Update 3 docs** (append/prepend S35 entry, never rewrite prior entries): `plans/roadmap.md`
   (suite 487), `plans/reconstruction-engine-design.md` (S35 note after S34 block),
   `plans/implementation-notes-api-from-scenarios.md` (prepend S35 entry).
6. **Verify & commit (USER APPROVAL ONLY):** `npm test` → 487/0; `tsc` clean; `git diff --stat -- src/`
   shows ZERO S35 hunks. Stage EXACTLY the S35 paths (Commit hygiene in the plan) — never `git add -A`.
7. **Create your completion handoff** via `/jot:handoff-prompt` (title must parse as `s35 … IMPLEMENTED`
   to fire the `monitor-handoff.sh s35 impl` gate that unblocks the s36 planner; `bim0p9s6w` is armed).

## Key Files
- `plans/s35/s35-reconstruction-plan.md` — the authoritative plan (every assertion, id, ladder, changeId).
- `scenarios/executed/s35-script-rename-script-user-edit/` — rendered ground-truth files (worktree copy).
- `tests/reconstruction_engine_s34.test.ts` / `tests/reconstruction_cli_s34.test.ts` — copy helpers from here.
- Fixture target (sibling store, md5-identical):
  `…/RevEng/plans/scenarios/executed/s35-script-rename-script-user-edit/2a208e10-4881-4f85-8006-2e24dfd523b7.jsonl`.

## Context the Next Agent Won't Have
- **CHAR-LOCK, not a fix.** A subagent confirmed S27/S28/S30 already LOCK the fragment+synthetic-overwrite
  TWO-revision pattern (`write + userEdit(fragment) + overwrite(backup)`). S35 reproduces it exactly, so
  the 3-revision ladders for test/rename are the ACCEPTED engine output — do NOT "fix" the 17L/51L
  fragment revisions; lock them.
- **Reader is MANDATORY for the byte-locks.** With NO reader, `test_inventory.py` final = 51 (2 revs) and
  `rename_inv.py` final = 17 (2 revs) — the fragments. `inventory.py` is reader-INDEPENDENT (244 either
  way). Build the reader as `createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot())`
  (the `realReader` helper). This is why S35 is MIXED reader-dependence (like S25).
- **The two script user-edits (steps 4 & 5) produce ONLY ONE beacon** (`#c67cfd9c`), already showing all 3
  tuples, ELIDED (lines 5–22, 17L). There is no separate 2-tuple revision to assert — the intermediate
  state is not independently observable.
- **KEPT-NAME HAZARD (S31/S32 pattern), PRESENT:** `find_item` and `tot_value` are terse but NOT in the
  rename list → they SURVIVE (assert presence, not absence). `test_inventory.py` method names
  `test_qty_chk_*` keep `qty_chk` as a SUBSTRING (leading `_`, so `\bqty_chk\b` doesn't match). Assert
  old-name absence with WHOLE-WORD `\bqty_chk\b` (count 0) — a bare `includes("qty_chk")` would WRONGLY
  fail (substring count is 5).
- **`re.sub` literal is the STRING-CONCAT form** `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` (use
  `String.raw`) — NOT the S33 f-string form. (S34 lesson.)
- **The synthetic overwrite adds NO DAG node** (changeId = backup blob name, spec 40) — fileDAG shows only
  observed events: inventory 4 nodes, test 2, rename 2.
- **LESSON (S33):** capture exact CLI strings from a live `runCli([S35_JSONL, "--verbose"])` (throwaway
  script) BEFORE writing the CLI assertions, so line-count / revision-header strings are byte-exact.
- **Live anchors:** prompt `#da499f4e`; surviving tip `#72049b4a`; `extractFileEvents` =
  `{write:3, edit:2, userEdit:3, overwrite:0}`, userEdit short ids `["c67cfd9c","dbc2e4c1","f3e90535"]`;
  rename_inv.py overwrite `41364cab6ad88cbb@v2`; test_inventory.py overwrite `5ea404c2628560f6@v3`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 487 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s35.test.ts tests/reconstruction_cli_s35.test.ts   # 12/12
git diff --stat -- src/    # NO s35-attributable change (pure characterization lock)
```

## Coordination Hazard (same as S28–S34)
The worktree carries uncommitted prior-scenario work — `src/parse/loadTranscript.ts` (S32 fix),
`src/reconstruction_reseed.ts`, `src/reconstruction_beacons.ts` (new in S34), `src/reconstruction_branches.ts`,
`_sidecar.ts`, `_user_edit.ts`, the S28–S34 test/plan/doc files, and unrelated `src/Plan_template.md` /
`src/Impl_template.md` edits by other agents. The three doc files in your commit also carry S28–S34 edits.
`git diff --stat` is NOT S35-only — confirm the commit-split with the user; never `git add -A`.
