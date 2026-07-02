# Handoff: IMPLEMENT Scenario s31 (`s31-script-rename-many-rows`) — PLANNED. CHARACTERIZATION/REGRESSION LOCK, NO engine `src/` change. Many-row (12) CSV bulk rename across two files; both HAS-BEACON; reader-INDEPENDENT. Add fixture + engine/CLI test files, lock byte-perfect output. Baseline 424→ (+new). Commit pending USER APPROVAL.
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S31 planning (/plan-scenario 31)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/fea85ee5-fc31-4873-9870-a8014bddcd0d.jsonl
Plan file: plans/s31/s31-reconstruction-plan.md (AUTHORITATIVE — every literal re-verified LIVE against the engine this planning session)

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae`. The tree is NOT clean: S28+S29+S30 work is
implemented but UNCOMMITTED (modified `src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`,
`_user_edit.ts`; untracked `tests/reconstruction_{engine,cli}_{s28,s29,s30}.test.ts`, `plans/s28/`,
`plans/s29/`, `plans/s30/`; S28/S29/S30 doc edits already present in `plans/roadmap.md`,
`plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`; plus unrelated
`src/Plan_template.md` AND `src/Impl_template.md` edits by other agents). **S31 adds NO `src/` change on
top of that.** `plans/s31/` now exists (this plan + handoff).

## Goal
Lock S31's byte-perfect reconstruction so a future change that breaks the many-row HAS-BEACON composition
is caught. S31 is the **MANY-ROW** sibling of S25/S26/S29: one `python3 bulk_rename.py` Bash run reads a
**12-row** `many_renames.csv` and applies all twelve whole-word renames across `textutil.py` and
`tests/test_textutil.py`. Both files are HAS-BEACON — the post-script `user-edit` beacon carries the
fully-renamed file, so the engine adopts it for free. A pre-script Edit (`normalize`, old-name body) and a
post-script Edit (`headline`, new-name body) bracket the run. **The engine already reconstructs all four
touched files byte-perfect; no new engine code is needed or wanted.**

## Current State — PLANNED (all verified LIVE this session)
- `npm test` baseline → **424 / 0**. `npx tsc --noEmit` → clean.
- **Live proof of correctness (how certainty was established):** ran the S31 JSONL through
  `reconstructBranches`, materialized each file's final revision, and diffed against the independently
  rendered ground-truth files. **All 4 files byte-identical** (only delta = one trailing `\n`, a line-model
  artifact stripped by `stripTrailingNewline`, exactly as S25–S30). Held **with AND without** the
  `BackupReader` → S31 is **reader-INDEPENDENT**.
- **No rescue stage fires:** beacons are COMPLETE (textutil rename beacon = 205 L full file; test = 71 L
  full), so `completeTruncatedBeacon` (S27) and `completeElidedBeacons` (S28) are inert; `seedStaleEditBases`
  (S19) inert (no reader needed). Clean poison matrix.
- **NOTHING for S31 written to disk yet except the plan + this handoff.** Implementer creates the tests.

## What Remains (ordered — TDD, tests must pass against the UNMODIFIED engine)
1. **Confirm baseline** — `npm test` → 424/0. If not 424, STOP and reconcile before writing tests.
2. **Task 1 — Fixture:** add `S31_JSONL` to `tests/fixtures.ts` immediately after `S30_JSONL`
   (path in plan §"Source of expected values").
3. **Task 2 — `tests/reconstruction_engine_s31.test.ts`** (model on `reconstruction_engine_s30.test.ts`;
   reuse helpers `finalTextOf`/`historyFinalText`/`historyEndingWith`/`stripTrailingNewline`/`readGroundTruth`).
   Tests T1–T6 per plan: four-file byte-lock, revision ladder, all-12-renames whole-word, edit-ordering
   crux (normalize renamed body + headline on renamed beacon), reader-independence, extractFileEvents 4w/3e/2ue/0ow.
4. **Task 3 — `tests/reconstruction_cli_s31.test.ts`** (model on `reconstruction_cli_s30.test.ts`):
   C1–C6 per plan: bare graphs, `--list-branches` tip `#1349c502`, `--graphFile` node ladders, verbose
   textutil.py (rev 3, headline/slugify), verbose test_textutil.py (rev 1, renamed import), CSV bytelock.
5. **Task 4 — Docs:** `plans/roadmap.md` (S31 line, 424→new), `plans/implementation-notes-…md` (prepend S31
   entry), `plans/reconstruction-engine-design.md` (S31 note after S29/S30).
6. **Task 5 — Verify:** `npm test` all green; `npx tsc --noEmit` clean; `git diff -- src/` shows NO S31 hunks.
7. **Commit — USER APPROVAL ONLY.** Stage exactly the 7 paths in plan §"Commit hygiene"; never `git add -A`;
   never stage `src/*`. **COORDINATION HAZARD:** the 3 doc files also carry uncommitted S28/S29/S30 doc edits —
   confirm the commit-split with the user first. Message: `Implemented S31 handling` + standard trailers.
8. **Write the completion handoff** with a title whose first token is `s31` AND contains `IMPLEMENTED`
   (fires the s32 planner's `./monitor-handoff.sh s31 impl`).

## Key Files
- `plans/s31/s31-reconstruction-plan.md` — AUTHORITATIVE plan (ground-truth literals, DAGs, ladders,
  test assertions T1–T6 / C1–C6, crux note, commit hygiene).
- `plans/script-handling.txt` — the MUST-READ HAS-BEACON vs NO-BEACON premise (S31 is HAS-BEACON for both files).
- `tests/reconstruction_engine_s30.test.ts` + `tests/reconstruction_cli_s30.test.ts` — the templates to copy.
- `tests/fixtures.ts` — add `S31_JSONL`.
- Ground truth (read with `readFileSync`): `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s31-script-rename-many-rows/`
  (JSONL `ef17241e-…`; `textutil.py`, `tests/test_textutil.py`, `many_renames.csv`, `bulk_rename.py`).
  The worktree copy `scenarios/executed/s31-script-rename-many-rows/` is byte-identical (verified).

## Context the Next Agent Won't Have
- **NO engine change. This is a char-lock.** Byte-perfect reconstruction already holds on the post-S28/S29/S30
  engine. If a lock fails, the bug is in a test literal/path, NOT `src/`.
- **The rename is captured for free.** The engine never re-runs the script — it adopts the observed post-script
  `user-edit` beacons (`#98ce2cbf` textutil.py, `#590f882d` test_textutil.py), which already show all 12 renames.
- **Edit ordering is the interesting part.** `normalize` was added BEFORE the run (body referenced old `trim`/`low`)
  → the script renamed its body → final references `trim_whitespace`/`lowercase`. `headline` was added AFTER the run
  → references the NEW names `capitalize`/`slugify`; it replays on top of the renamed beacon (rev 3 of textutil.py).
- **Whole-word vs substring (assertion hazard).** Renames are `\bold\b`. 11/12 old names → 0 whole-word matches in
  final textutil.py, but `\bslug\b` legitimately appears **twice** (English prose in `headline`'s docstring, written
  post-rename — NOT a missed rename). Test fn names keep terse substrings (`test_cap_basic`, `test_rev_*`,
  `test_slug_*`) because they're `_`-bounded. **Use `/\bname\b/`, never bare `includes()`, in absence assertions.**
- **Single linear surviving branch, tip `#1349c502`.** No rewinds, no rewound branch.
- **Ground-truth lives in the sibling RevEng project**, not the worktree — fixtures/tests point at the Desktop path
  (same convention as every prior scenario). The worktree copy is identical but the tests must use the Desktop path.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # baseline 424/0 BEFORE; all green AFTER adding S31 tests
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s31.test.ts   # all green
node --import tsx --test tests/reconstruction_cli_s31.test.ts      # all green
git diff -- src/    # must show NO new S31 hunks (only pre-existing S28/S29/S30 deltas)
```
