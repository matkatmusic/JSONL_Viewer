MUST READ: plans/script-handling.txt

# Handoff: S25 (`s25-script-rename-multi-file`) IMPLEMENTED — characterization/regression LOCK, NO `src/` change, suite 347 → 359
Conversation name: api-from-scenarios — S25 impl monitor → implement S25 (script-rename-multi-file)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/52d94dd7-8312-411c-b526-9d6dafb7b47b.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s25/s25-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `f561b25 s24 handling implemented` (S1–S24 + m1–m7
committed; clean baseline was 347 tests). NOTHING from S25 is committed yet — the work is staged in
the working tree only, pending explicit user approval.

## Goal
Lock the engine's **already-correct** reconstruction of S25 — a multi-file script rename where ONE
`python3 rename_geo.py` Bash run rewrites THREE tracked files (`geo_core.py`, `geo_report.py`,
`tests/test_geo_core.py`), captured by THREE `edited_text_file` beacons. The engine reconstructs all
three byte-perfect with **zero `src/` change**, so this is a characterization/regression LOCK: ADD a
fixture + 12 lock tests + 3 doc edits (347 → 359). S25's distinguishing twist is **mixed
reader-dependence** — two files are reader-independent (S24-style), but `geo_report.py` needs the
backup reader because its beacon is incomplete relative to a later Edit's base.

## Current State
- **COMPLETE and verified.** `npm test` = **359 pass / 0 fail**; `npx tsc --noEmit` exit 0 (clean);
  `git diff src/` carries **NO S25 change** (only the pre-existing, unrelated `src/Plan_Impl_template.md`
  edit + untracked `src/Impl_template.md` / `src/Plan_template.md` — never stage those).
- New files (untracked): `tests/reconstruction_engine_s25.test.ts` (6 tests, all green),
  `tests/reconstruction_cli_s25.test.ts` (6 tests, all green), `plans/s25/` (plan + handoffs).
- Modified: `tests/fixtures.ts` (+`S25_JSONL`), `plans/roadmap.md` (S25 line),
  `plans/implementation-notes-api-from-scenarios.md` (prepended S25 entry),
  `plans/reconstruction-engine-design.md` (appended S25 note).
- All four crux locks proven RED→GREEN then reverted (engine: changeId, overwrite-key, final-literal,
  no-reader; CLI: `def totals(`). Final suite green.
- Live-verified ground truth (matches the plan exactly): one Bash run `T_exec = 20:02:53.938Z` → 3
  beacons at `20:02:55.775Z`. `geo_core.py` = 8 revs, rev4 userEdit `755a78dd…`, 196 ln / 5263 ch,
  reader-INDEPENDENT. `tests/test_geo_core.py` = 2 revs, rev1 userEdit `fcaacf80…`, 42 ln / 1145 ch,
  reader-INDEPENDENT. `geo_report.py` = 7 revs, rev3 userEdit `dd04eabc…` (incomplete 77-line beacon),
  rev4 `overwrite` `a5675d5dd5201ac8@v4` (95-line backup-seed), 120 ln / 3810 ch, reader-DEPENDENT
  (no-reader = 6 revs / wrong). Linear: `rewound=0`, 4 surviving files, CLI tip `#e3b43fcc`.

## What Remains
1. **(User-gated) Commit S25.** Only on explicit user approval (project rule: one commit per
   scenario). Stage EXACTLY these 6 files — never `git add -A` (the tree carries the unrelated
   `src/Plan_Impl_template.md` edit and untracked `src/*_template.md` files):
   ```
   tests/fixtures.ts
   tests/reconstruction_engine_s25.test.ts
   tests/reconstruction_cli_s25.test.ts
   plans/roadmap.md
   plans/implementation-notes-api-from-scenarios.md
   plans/reconstruction-engine-design.md
   ```
   Commit message: `Implemented S25 handling` (+ standard Co-Authored-By / Claude-Session trailers).
   Decide separately whether to also commit `plans/s25/` (plan + handoffs).
2. **Next scenario: `scenarios/s26-script-rename-csv-map.txt`** (confirmed present; s26–s38 are
   defined). The planning agent for s26 should produce a plan + handoff into `plans/s26/`; the
   downstream monitor should gate s26 implementation on that handoff landing (NOT on the plan).

## Key Files
- `plans/s25/s25-reconstruction-plan.md` — THE plan (exact assertions, capture commands, test code).
- `plans/script-handling.txt` — the HAS-BEACON vs NO-BEACON premise (READ FIRST).
- `tests/reconstruction_engine_s25.test.ts` / `tests/reconstruction_cli_s25.test.ts` — the 12 locks.
- `tests/reconstruction_engine_s24.test.ts` / `tests/reconstruction_engine_m7.test.ts` — the templates
  this mirrors (reader-free poison guard; hermetic `@v4` backup map).
- `tests/fixtures.ts` — `S25_JSONL` (Desktop path).
- `scenarios/executed/s25-script-rename-multi-file/{geo_core.py,geo_report.py,tests/test_geo_core.py}`
  — the rendered byte-for-byte ground truth.

## Context the Next Agent Won't Have
- **S25 is NOT a clean "S24 ×3."** `geo_report.py` is reader-DEPENDENT and that is the whole point.
  Its beacon is an INCOMPLETE 77-line snapshot, while the post-script `totals` Edit was computed
  against the true 95-line disk state. So the m5/m6 backup-seed fires: a synthetic `overwrite` rev4
  keyed `a5675d5dd5201ac8@v4` (the 95-line disk base) is injected, then the `totals` Edit replays onto
  it. Only the real backup reader supplies that content (no-reader truncates to 6 revs / 102 ln; a
  poison reader corrupts to 35 ln). This REFINES, does not contradict, `script-handling.txt`: "beacon
  alone suffices" governs the post-script revision; a LATER Edit's base alignment is the m6 concern,
  already solved by a backup-seed (NOT a script transform). **Do NOT add any script-execution-replay /
  forward-validation feature — wrong tool, unnecessary.**
- **TWO plan assertions were wrong and were corrected (test-only, not `src/`):**
  1. Engine Test 4 (geo_report) reused `geo_core`'s `def <name>(` header check. `geo_report.py`
     IMPORTS `geo_core` and CALLS `geo_core.rectangle_area(...)` — it never DEFINES area/perim/vol, so
     those `def` headers live in `geo_core.py`. The byte-lock passed first (reconstruction is
     byte-perfect); only the supplementary check was wrong. Replaced with a call-site lock (renamed
     call forms `.rectangle_area(` etc. present; terse `.area(` etc. absent). A bare-word `\barea\b`
     check is ALSO unsafe — the post-rename `totals` docstring contains the English word "area".
  2. CLI Test 4 (verbose geo_core) used a whole-block terse-absence check, but `--verbose` prints
     EVERY revision and the terse pre-rename revisions (0..3) legitimately contain `def area(`. Scoped
     the renamed-present / terse-absent check to the FINAL revision only.
  If you re-derive S25 from the plan verbatim, you will hit these two REDs — apply the same fixes.
- **The 4 byte-exact literals** (backup 3024, geo_core 5263, geo_report 3810, test 1145 chars) were
  injected from the rendered files via a generator (placeholder-token substitution), never hand-typed,
  and length-guarded. If you regenerate, use the plan §5 capture commands and the same length guards.
- **changeId of a beacon user-edit = the attachment record's own message uuid** (per
  `userEditEventFrom`), NOT a `toolu_` id and NOT `parent_uuid`.
- **6 DAG events expand to 8/7 revisions** for geo_core/geo_report: Edits that both remove and add
  lines splice as a (removal, addition) revision pair sharing one changeId — normal engine behavior.
- **The `overwrite` reseed is a REVISION, not a DAG event** — it appears in `rev.kind` and in verbose
  content (95 lines) but NOT in the conversationDAG/fileDAG and NOT as the word "overwrite".

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s25.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s25.test.ts      # 6 green
npm test          # 359 pass / 0 fail
npx tsc --noEmit  # exit 0, no errors
git diff --stat src/   # NO S25 change (only the unrelated Plan_Impl_template.md)
```
