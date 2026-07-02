MUST READ: plans/script-handling.txt

# Handoff: IMPLEMENT Scenario S26 (`s26-script-rename-csv-map`) — a characterization/regression LOCK, NO `src/` change, suite 359 → 371
Conversation name: api-from-scenarios — S26 planning (monitor-gated on S25 impl handoff)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4a433684-7ad3-404c-8518-7f74b945b466.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s26/s26-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `063054a added skills for spawning agents`
(S1–S25 + m1–m7 committed; S25 at `1b78786 S25 handling implemented`). Clean **359**-test baseline.
The only uncommitted item at plan time is the untracked `plans/s26/` dir (this plan + this handoff).

## Goal
Lock the engine's **already-correct** reconstruction of S26 — a **CSV-map** multi-file script rename
where ONE `python3 apply_renames.py` Bash run rewrites TWO tracked sources (`billing.py`,
`tests/test_billing.py`), with the rename mapping READ from a tracked `renames.csv` (not hardcoded),
captured by TWO `edited_text_file` beacons. The engine reconstructs all four files byte-perfect with
**zero `src/` change**, so this is a characterization/regression LOCK: ADD a fixture + 12 lock tests +
3 doc edits (359 → 371). Execute the plan exactly; it carries every live-verified ground-truth number
and the exact test code.

## Current State
- **NOT STARTED.** The plan is written, complete, and its numbers are live-verified against the engine
  at HEAD. No test/fixture/doc files for S26 exist yet.
- Baseline expected GREEN at **359 / 0**. The implementer's Task 1 reconfirms this before the +12 delta.
- Live-verified facts the plan is built on (re-derivable via the §5 capture command + a CLI run):
  - One Bash run `T_exec ≈ 20:02:29.030Z` → 2 beacons at `20:02:52.622Z` (one per rewritten source).
  - `billing.py` = 4 revs `[write, edit, userEdit, edit]`, rev2 userEdit `298a585d-…` (149-line
    **complete** beacon), final 177 ln / **5813** ch — **reader-INDEPENDENT**.
  - `tests/test_billing.py` = 2 revs `[write, userEdit]`, rev1 userEdit `507c3e6b-…`, final 60 ln /
    **1394** ch — **reader-INDEPENDENT**.
  - `renames.csv` = 1 rev `[write]`, final 5 ln / **106** ch (the rename map: header + 4 pairs).
  - `apply_renames.py` = 1 rev `[write]`, final 43 ln / **1125** ch (reads `renames.csv`).
  - Linear: `rewound=0`, 4 surviving files, CLI tip `#ae7838c8`.
  - **NO `overwrite` revision anywhere; no backup is requested** — every file is reader-independent
    under no-reader, poison-reader, and the real reader (all three byte-identical).

## What Remains (in execution order — all detail is in the plan)
1. **Task 1** — confirm baseline `npm test` = 359/0 + `npx tsc --noEmit` clean; add `S26_JSONL` to
   `tests/fixtures.ts` (Desktop path, after `S25_JSONL`).
2. **Task 2** — create `tests/reconstruction_engine_s26.test.ts` (6 tests). Capture the 4 final
   literals via the plan §5 command (`billing` 5813, `test` 1394, `renames.csv` 106, `apply_renames`
   1125). ALL tests are reader-free with a poison guard — **NO hermetic backup map needed** (S26 is
   fully reader-independent). Prove the crux locks bite (changeId / final-literal / overwrite-ABSENCE /
   csv-literal → RED, then restore).
3. **Task 3** — create `tests/reconstruction_cli_s26.test.ts` (6 tests, real CLI). Use the
   `fileVerboseBlock` helper (`revision 0` appears for all four files). Prove one liveness probe RED→GREEN.
4. **Task 4** — docs: add S26 line to `plans/roadmap.md` (after the S25 line, ~line 33); PREPEND an S26
   entry to `plans/implementation-notes-api-from-scenarios.md` (above the S25 entry at line 1); APPEND
   an S26 note to `plans/reconstruction-engine-design.md` (after the S25 note, ~line 344).
5. **Task 5** — verify: both test files green (6 + 6), `npm test` = **371/0**, `tsc` clean,
   `git diff src/` **EMPTY**.
6. **Task 6** — commit ONLY on explicit user approval (exact 6-file stage list in plan §9; never
   `git add -A`). Commit message `Implemented S26 handling`. Then **create handoff** (below).
7. **create handoff** — write a COMPLETION handoff via `/jot:handoff-prompt` into `plans/s26/`, with
   `MUST READ: plans/script-handling.txt` at the very top: record 371 green / tsc clean / NO src change;
   crux locks proven RED→GREEN; the "all reader-INDEPENDENT — inversion of S25" framing; name the next
   scenario **`scenarios/s27-script-rename-edited-before-run.txt`**; arm the downstream monitor on the
   S26 completion handoff landing (NOT on this plan/handoff).

## Key Files
- `plans/s26/s26-reconstruction-plan.md` — THE plan (exact assertions, capture command, full test code).
- `plans/script-handling.txt` — the HAS-BEACON vs NO-BEACON premise (READ FIRST).
- `plans/s25/s25-reconstruction-plan.md` + `plans/s25/handoff-…-1428.md` — the S25 LOCK this mirrors
  (S26 is its **inverse**: complete beacon, so no backup-seed).
- `tests/reconstruction_engine_s25.test.ts` / `tests/reconstruction_engine_s24.test.ts` — reader-free
  char-lock templates (copy the helpers + poison guard). S26 needs **no** hermetic backup map.
- `tests/reconstruction_cli_s25.test.ts` / `tests/reconstruction_cli_s24.test.ts` — CLI lock templates
  (`fileVerboseBlock` helper).
- `tests/fixtures.ts` — append `S26_JSONL` (Desktop path).
- `scenarios/executed/s26-script-rename-csv-map/{billing.py,tests/test_billing.py,renames.csv,apply_renames.py}`
  — the rendered byte-for-byte ground truth (the §5 capture command reads these).

## Context the Next Agent Won't Have
- **S26 is the INVERSION of S25's crux.** S25's `geo_report.py` had a post-script Edit whose base was
  the *disk* state while its beacon was an *incomplete* 77-line snapshot → the m6 backup-seed fired (a
  synthetic `overwrite` rev keyed `a5675d5dd5201ac8@v4`). S26's `billing.py` ALSO has a post-script Edit
  (`print_invoice`, step 5), but its beacon is a **complete** 149-line snapshot, so that Edit splices
  cleanly (149 → 177) with **NO backup-seed, NO `overwrite` revision, reader-INDEPENDENT**. Engine
  Test 3 locks this precisely (no overwrite + no-reader history == reader history). **Do NOT add any
  script-execution-replay / forward-validation feature, and do NOT expect a backup map — both are the
  wrong tools here.** This REFINES `script-handling.txt`: a post-script Edit forces reader-dependence
  ONLY when the beacon is incomplete.
- **Whole-word rename TRAP in the test file (test-only assertion hazard).** The script renames whole
  words via the CSV map (`calc_tot→calculate_total`, `fmt_money→format_currency`, `chk_stock→check_stock`,
  `apply_disc→apply_discount`). `tests/test_billing.py` STILL contains the terse substrings `calc_tot`
  and `fmt_money` — inside test METHOD names like `def test_calc_tot_empty():` / `def test_fmt_money_zero():`
  — because the whole-word rename correctly skips them (`_` is a word char, so `\bcalc_tot\b` doesn't
  match inside `test_calc_tot`). So a bare `!includes("calc_tot")` check would FALSELY fail. Lock the
  test-file rename via the **import line** (`from billing import calculate_total, format_currency`) +
  the renamed **call forms** — NOT bare tokens. (The plan's Test 4 already does this.)
- **`def <name>(` headers, never bare substrings** for `billing.py`: `apply_disc` is a substring of
  `apply_discount`, so the trailing `(` is load-bearing (`def apply_disc(` vs `def apply_discount(`).
  Renamed: calculate_total/format_currency/check_stock/apply_discount. NOT renamed (present, don't assert
  absence): `mk_order`, `validate`, `print_invoice`.
- **changeId of a beacon user-edit = the attachment record's own message uuid** (per `userEditEventFrom`),
  NOT a `toolu_` id and NOT `parent_uuid`. `billing`→`298a585d-…`, `test_billing`→`507c3e6b-…`.
- **`billing.py` edits do NOT split** into (removal, addition) revision pairs (unlike S25): each Edit
  here is a pure insertion (`validate`, `print_invoice`), so 4 DAG events → 4 revisions. Assert the kinds
  array exactly as the plan states.
- **`renames.csv` is the new wrinkle vs S24/S25:** the rename mapping is a tracked DATA file the script
  reads, not hardcoded in the script body. Engine Test 5 byte-locks it (5 ln / 106 ch) and checks the 4
  pairs — this is the "csv-map" essence.
- **Git state moved during planning:** S25 got committed (`1b78786`) and a `063054a added skills`
  commit landed; the tree is now CLEAN except untracked `plans/s26/`. (The earlier S25 handoff's
  "nothing committed / stray `src/Plan_Impl_template.md`" caveats are STALE — ignore them; run
  `git status` yourself.)

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # baseline (before): 359 pass / 0 fail
node --import tsx --test tests/reconstruction_engine_s26.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s26.test.ts      # 6 green
npm test          # after: 371 pass / 0 fail
npx tsc --noEmit  # No errors found
git diff --stat src/   # EMPTY — S26 adds NO src change
```
