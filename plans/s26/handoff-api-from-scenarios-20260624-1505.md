MUST READ: plans/script-handling.txt

# Handoff: Scenario s26 (`s26-script-rename-csv-map`) IMPLEMENTED — characterization/regression LOCK, NO `src/` change, suite 359 → 371
Conversation name: api-from-scenarios — S26 impl monitor → implement S26 (script-rename-csv-map)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/5f016807-76b4-479c-9871-4efc0ca3b36c.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s26/s26-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `063054a added skills for spawning agents`
(S1–S25 + m1–m7 committed; S25 at `1b78786`). S26 work is UNCOMMITTED (awaiting user approval).

## Goal
Lock the engine's already-correct reconstruction of S26 — a CSV-map multi-file script rename where ONE
`python3 apply_renames.py` Bash run rewrites TWO tracked sources (`billing.py`, `tests/test_billing.py`)
with the rename mapping READ from a tracked `renames.csv` (not hardcoded), captured by TWO
`edited_text_file` beacons. Add a fixture + 12 lock tests + 3 doc edits with ZERO `src/` change.

## Current State
**IMPLEMENTED and fully verified. NOTHING COMMITTED** (one-commit-per-scenario rule is gated on
explicit user approval — not yet given).
- `npm test` = **371 pass / 0 fail** (was 359 baseline; +12).
- `npx tsc --noEmit` = **No errors found**.
- `git diff src/` = **EMPTY** — S26 added NO `src/` change (engine was already correct).
- All reader-INDEPENDENT — the **inversion of S25**: `billing.py` has a post-script Edit
  (`print_invoice`) yet needs NO backup-seed because its beacon is a COMPLETE 149-line snapshot, so the
  m5/m6 `seedEditBaseFromBackup`/`backupSeedWriteFor` reseed stays DORMANT and NO `overwrite` revision
  is injected anywhere. Proves "post-script Edit ⇏ reader-dependent" — only an INCOMPLETE beacon does.
- Crux locks proven RED→GREEN then reverted: engine changeId `298a585d`→`deadbeef` (RED); billing
  final one-char flip (5813 byte-lock, RED); Test 3 assert `overwrite` PRESENT (RED — the
  inverse-of-S25 signature); `renames.csv` one-char flip (RED); CLI `def print_invoice(`→`PRINT_INVOICE`
  (RED). All restored; suite green.

### Files changed/added (uncommitted)
- `tests/fixtures.ts` — `S26_JSONL` appended after `S25_JSONL` (Desktop path).
- `tests/reconstruction_engine_s26.test.ts` — NEW, 6 tests (reader-free + poison guard).
- `tests/reconstruction_cli_s26.test.ts` — NEW, 6 tests (real, inert sidecar reader).
- `plans/roadmap.md` — S26 line added after S25.
- `plans/implementation-notes-api-from-scenarios.md` — S26 entry prepended (top).
- `plans/reconstruction-engine-design.md` — S26 note appended after S25.
- `plans/s26/` — plan + this handoff (untracked).

## What Remains
1. **Commit gate (USER APPROVAL ONLY).** On approval, stage EXACTLY these 6 files (never `git add -A`;
   run `git status` first) — `tests/fixtures.ts`, `tests/reconstruction_engine_s26.test.ts`,
   `tests/reconstruction_cli_s26.test.ts`, `plans/roadmap.md`,
   `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`.
   Commit message: `Implemented S26 handling` (+ standard Co-Authored-By / Claude-Session trailers).
   Decide separately whether to also commit `plans/s26/`.
2. **Next scenario: `scenarios/s27-script-rename-edited-before-run.txt`** (s27–s42 are defined in
   `scenarios/`; executed output already present under `scenarios/executed/s27-script-rename-edited-before-run/`).
   The S27 twist: the rename script is EDITED 3× BEFORE its single run.
3. The downstream S27 PLANNING monitor is armed to fire on THIS S26 IMPLEMENTED handoff (predicate:
   line containing `s26` + `IMPLEMENTED`); the S27 IMPLEMENT monitor will gate on the future S27 handoff.

## Key Files
- `plans/s26/s26-reconstruction-plan.md` — THE plan (exact assertions, capture command, full test code).
- `plans/script-handling.txt` — HAS-BEACON vs NO-BEACON premise (READ FIRST).
- `tests/reconstruction_engine_s26.test.ts` / `tests/reconstruction_cli_s26.test.ts` — the S26 locks.
- `tests/reconstruction_engine_s25.test.ts` / `_cli_s25.test.ts` — the S25 LOCK S26 inverts (S25's
  `geo_report` NEEDS the `@v4` backup-seed; S26 needs none).
- `scenarios/executed/s26-script-rename-csv-map/{billing.py,tests/test_billing.py,renames.csv,apply_renames.py}`
  — rendered byte-for-byte ground truth (the §5 capture command reads these).

## Context the Next Agent Won't Have
- **The handoff/plan convention changed: `MUST READ: …` is now line 1, the `# Handoff:` title is on
  line 3.** A monitor predicate that reads literal line 1 for the scenario token will MISS it (this
  session's S26 impl monitor `bu1xi4320` did not auto-fire for that reason; the handoff was found by a
  manual check). Downstream monitors should scan the `# Handoff:` title line, not line 1.
- **One real deviation from the plan (test-authoring, NOT engine):** the plan's CLI Test 5
  (`test_S26_verbose_test_billing_two_revisions_renamed`) used an UNSCOPED `!block.includes("import
  calc_tot")`. `--verbose` prints EVERY revision, and `tests/test_billing.py` revision 0 (terse,
  pre-rename) legitimately still contains `from billing import calc_tot, fmt_money`, so the unscoped
  check failed RED. Fixed by scoping the terse-absence check to the FINAL revision (slice from
  `revision 1  @`), mirroring the plan's own billing.py Test 4. Engine is correct; no `src/` change.
- **Whole-word rename TRAP:** `tests/test_billing.py` STILL contains terse substrings `calc_tot` /
  `fmt_money` inside test METHOD names (`def test_calc_tot_empty():`) because `\bcalc_tot\b` does not
  match inside `test_calc_tot` (`_` is a word char). Lock the test-file rename via the renamed IMPORT
  line + call forms, NEVER bare tokens.
- **`def <name>(` headers, never bare substrings** for `billing.py`: `apply_disc` is a substring of
  `apply_discount`, so the trailing `(` is load-bearing.
- **All engine tests are reader-free with a poison guard — NO hermetic backup map needed** (unlike
  S25's `s25Reader`/`S25_GEO_REPORT_BACKUP`), because S26 is fully reader-independent.
- changeId of a beacon user-edit = the attachment record's own `entry.uuid` (per `userEditEventFrom`),
  NOT a `toolu_` id and NOT `parent_uuid`: `billing`→`298a585d-…`, `test_billing`→`507c3e6b-…`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s26.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s26.test.ts      # 6 green
npm test          # 371 pass / 0 fail
npx tsc --noEmit  # No errors found
git diff --stat src/   # EMPTY
```
