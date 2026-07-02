# Handoff: IMPLEMENT Scenario S25 (`s25-script-rename-multi-file`) — a characterization/regression LOCK, NO `src/` change, suite 347 → 359
Conversation name: api-from-scenarios — S25 planning (monitor-gated on S24 impl handoff)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/6492384b-1bf9-4419-bb68-cc39fb728bdb.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s25/s25-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `f561b25 s24 handling implemented` (S1–S24 + m1–m7
committed; clean **347**-test baseline). Nothing from S25 is committed yet.

## Goal
Lock the engine's **already-correct** reconstruction of S25 — a multi-file script rename where one
`python3 rename_geo.py` Bash run rewrites THREE tracked files (`geo_core.py`, `geo_report.py`,
`tests/test_geo_core.py`), captured by THREE `edited_text_file` beacons. The engine reconstructs all
three byte-perfect **via the real sidecar reader** with **zero `src/` change**, so this is a
characterization/regression LOCK: ADD a fixture + 12 lock tests + 3 doc edits (347 → 359). Execute the
plan exactly; the plan carries every live-verified ground-truth number and the exact test code.

## Current State
- **NOT STARTED.** The plan is written and complete; no test/fixture/doc files for S25 exist yet.
- Baseline expected GREEN at **347 / 0** (S24 committed at `f561b25`). The implementer's Task 1
  reconfirms this before adding the +12 delta.
- Live-verified facts the plan is built on (re-derivable via the §2 / §5 capture commands):
  - One Bash run `T_exec = 20:02:53.938Z` → 3 beacons at `20:02:55.775Z` (one per file).
  - `geo_core.py` = 8 revs `[write,edit,edit,edit,userEdit,edit,edit,edit]`, rev4 userEdit
    `755a78dd-…`, final 196 ln / **5263** ch — **reader-INDEPENDENT**.
  - `tests/test_geo_core.py` = 2 revs `[write,userEdit]`, rev1 userEdit `fcaacf80-…`, final 42 ln /
    **1145** ch — **reader-INDEPENDENT**.
  - `geo_report.py` = 7 revs `[write,edit,edit,userEdit,overwrite,edit,edit]`, rev3 userEdit
    `dd04eabc-…` (incomplete **77**-line beacon), rev4 **overwrite** `a5675d5dd5201ac8@v4` (95-line
    backup-seed), final 120 ln / **3810** ch — **reader-DEPENDENT** (no-reader = 6 revs / wrong).
  - Linear: `rewound=0`, 4 surviving files, CLI tip `#e3b43fcc`.

## What Remains (in execution order — all detail is in the plan)
1. **Task 1** — confirm baseline `npm test` = 347/0 + `npx tsc --noEmit` clean; add `S25_JSONL` to
   `tests/fixtures.ts` (Desktop path, after `S24_JSONL`).
2. **Task 2** — create `tests/reconstruction_engine_s25.test.ts` (6 tests). Capture the 4 literals via
   the plan §5 commands (`@v4` backup 3024 ch; finals 5263 / 3810 / 1145). geo_core + test are
   reader-free with a poison guard; geo_report uses the hermetic `s25Reader` backup map (m7-style).
   Prove the crux locks bite (changeId / overwrite-key / final-literal / no-reader → RED, then restore).
3. **Task 3** — create `tests/reconstruction_cli_s25.test.ts` (6 tests, real CLI). Use the
   `fileVerboseBlock` helper to scope per-file verbose assertions (revision numbers overlap across
   files). Prove one liveness probe RED→GREEN.
4. **Task 4** — docs: add S25 line to `plans/roadmap.md`; PREPEND an S25 entry to
   `plans/implementation-notes-api-from-scenarios.md`; APPEND an S25 note to
   `plans/reconstruction-engine-design.md`.
5. **Task 5** — verify: both test files green (6 + 6), `npm test` = **359/0**, `tsc` clean,
   `git diff src/` **EMPTY**.
6. **Task 6** — commit ONLY on explicit user approval (exact 6-file stage list in plan §9; never
   `git add -A` — the tree carries an unrelated `src/Plan_Impl_template.md` edit and new
   `src/{Plan_template,Impl_template}.md` files). Then **create handoff** (see below).
7. **create handoff** — write a COMPLETION handoff via `/jot:handoff-prompt` into `plans/s25/`:
   record 359 green / tsc clean / NO src change; crux locks proven RED→GREEN; the mixed-reader framing;
   name the next scenario **`scenarios/s26-script-rename-csv-map.txt`**; arm the downstream monitor.

## Key Files
- `plans/s25/s25-reconstruction-plan.md` — THE plan (exact assertions, capture commands, test code).
- `plans/s24/s24-reconstruction-plan.md` + `plans/s24/handoff-…-1348.md` — the S24 LOCK this mirrors.
- `tests/reconstruction_engine_s24.test.ts` — reader-free char-lock template (copy helpers).
- `tests/reconstruction_engine_m7.test.ts` — the hermetic backup-map (`BackupReader`) pattern for the
  reader-dependent file (`geo_report.py`).
- `tests/reconstruction_cli_s24.test.ts` / `reconstruction_cli_m7.test.ts` — CLI lock templates.
- `tests/fixtures.ts` — append `S25_JSONL`.
- `plans/script-handling.txt` — the HAS-BEACON premise (READ FIRST).
- `scenarios/executed/s25-script-rename-multi-file/{geo_core.py,geo_report.py,tests/test_geo_core.py}`
  — the rendered byte-for-byte ground truth.

## Context the Next Agent Won't Have
- **S25 is NOT a clean "S24 ×3."** Two of the three files are reader-independent (S24-style), but
  **`geo_report.py` is reader-DEPENDENT** — and that is the whole point of the scenario. Its beacon is
  an **incomplete 77-line snapshot**, while the post-script `totals` Edit was computed against the true
  **95-line** disk state. So the m5/m6 **backup-seed** machinery fires: a synthetic `overwrite`
  revision keyed `a5675d5dd5201ac8@v4` (the 95-line disk base) is injected, then the `totals` Edit
  replays onto it. **Only the real backup reader supplies that content** — no-reader truncates the file
  (6 revs, 102 ln / 3276 ch) and a poison reader corrupts it (35 ln / 970 ch). This REFINES, does not
  contradict, `script-handling.txt`: "beacon alone suffices" is about the post-script revision; a
  *later* Edit's base alignment is the m6 concern, already solved. **Do NOT add any
  script-execution-replay / forward-validation feature — it is the wrong tool and unnecessary.**
- **changeId of a beacon user-edit = the attachment record's own `entry.uuid`** (per
  `userEditEventFrom`), NOT a `toolu_` id and NOT `parent_uuid`. (A forensic pass mislabeled these as
  `parent_uuid` and shifted the file→uuid mapping by one; the engine-truth mapping in the plan §2.2 was
  cross-checked against the CLI DAG and is authoritative: geo_report→`dd04eabc`, geo_core→`755a78dd`,
  test→`fcaacf80`.)
- **6 DAG events expand to 8/7 revisions** for geo_core/geo_report because Edits that both remove and
  add lines splice as a (removal, addition) **revision pair sharing one changeId** — normal engine
  behavior, not a bug. Assert the kinds arrays exactly as the plan states.
- **The `overwrite` reseed is a REVISION, not a DAG event** — it appears in the engine `rev.kind` and
  in verbose content (as 95 lines), but NOT in the conversationDAG/fileDAG and NOT as the word
  "overwrite" in verbose. CLI tests assert revision COUNTS + content, engine tests assert the kind.
- **Verbose revision numbers overlap across files** (geo_core & geo_report both reach `revision 6`/`7`)
  — scope every verbose assertion to one file's `### …/<file>` section via the `fileVerboseBlock`
  helper in the plan, or you'll get cross-file false matches.
- **Whole-word trap:** match `def <name>(` headers, never bare substrings (`area` is a substring of
  `rectangle_area`). Only `area`/`perim`/`vol` are renamed; `diag`/`scale` are NOT — do not assert
  their absence.
- **Commit gating:** the worktree carries an unrelated `M src/Plan_Impl_template.md` and two new
  untracked `src/*_template.md` files — never stage them; `git diff src/` must be EMPTY of S25 changes.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # baseline (before): 347 pass / 0 fail
node --import tsx --test tests/reconstruction_engine_s25.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s25.test.ts      # 6 green
npm test          # after: 359 pass / 0 fail
npx tsc --noEmit  # No errors found
git diff --stat src/   # EMPTY — S25 adds NO src change
```
