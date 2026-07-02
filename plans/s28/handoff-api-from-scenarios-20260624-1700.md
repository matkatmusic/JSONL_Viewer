MUST READ: plans/script-handling.txt

# Handoff: Scenario s28 (`s28-script-rename-scope`) IMPLEMENTED — REAL engine fix for ELIDED/WINDOWED `edited_text_file` beacons (`completeElidedBeacons`); 398 tests green, `tsc` clean; NOTHING COMMITTED (awaiting user approval). Next: s29.
Conversation name: api-from-scenarios — S28 impl (/impl-scenario 28)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/49ee63cb-c784-4f25-ae43-dd24641d3ad0.jsonl
Plan file: plans/s28/s28-reconstruction-plan.md (authoritative; §3 has the exact code, applied verbatim)

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (S1–S27 + m1–m7 committed). The S28 work is
UNCOMMITTED in the working tree (8 modified files + 3 untracked paths — see Current State).

## Goal
Make the reconstruction engine reconstruct all of S28's files byte-for-byte. S28 is a script-driven
SCOPED rename (a `scoped_renames.csv` with an `isExported` column: `Y` rows rename across all files, `N`
rows rename only one named file). The new failure mode: two of the three post-script `edited_text_file`
beacons are ELIDED — the harness showed only a WINDOW of the file (`...` separators and/or starting past
line 1), and the engine adopted that window verbatim. The fix detects elision from the snippet's raw line
numbers and splices a content-validated file-history backup as a synthetic `overwrite`.

## Current State — IMPLEMENTED, fully green, NOT committed
- **Tests: 398 pass / 0 fail** (`npm test`); baseline was 384, +14 new S28 tests (8 engine + 6 CLI).
- **`npx tsc --noEmit` clean.** Every touched `src/` file ≤ 250 lines: `reconstruction_user_edit.ts` 85,
  `reconstruction_sidecar.ts` 241, `reconstruction_reseed.ts` 216, `reconstruction_branches.ts` 186.
- **The fix (plan §3, applied verbatim) — 4 src files:**
  - `src/reconstruction_user_edit.ts`: `+beaconSnippetFor` / `BeaconLine` / `BeaconSnippet` /
    `parseNumberedSnippet` (re-reads the RAW `cat -n` snippet preserving line numbers); imports `Uuid`.
  - `src/reconstruction_sidecar.ts`: `+backupWritesFor` (enumerates ALL backup versions, time-ascending);
    `latestBackupWriteFor` rewritten to reuse it (required to stay ≤ 250).
  - `src/reconstruction_reseed.ts`: `+beaconIsElided` / `backupMatchesBeacon` / `elidedBeaconSeed` /
    `completeElidedBeacons`; module-header gained a third bullet.
  - `src/reconstruction_branches.ts`: wires `completeElidedBeacons` as a reader-only stage BEFORE
    `seedStaleEditBases` and `completeTruncatedBeacon`.
- **New/changed tests:** `tests/reconstruction_engine_s28.test.ts` (8), `tests/reconstruction_cli_s28.test.ts`
  (6), `S28_JSONL` added to `tests/fixtures.ts`.
- **Docs updated:** `plans/roadmap.md` (S28 line), `plans/implementation-notes-api-from-scenarios.md`
  (full S28 entry incl. the deviation log), `plans/reconstruction-engine-design.md` (S28 design note).
- **Verified ladders (real reader):** `catalog.py` `[write,edit,edit,edit,userEdit]` 6749 (reader-indep);
  `scoped_rename.py` `[write]` 1898; `scoped_renames.csv` `[write]` 83; **`tests/test_catalog.py`
  `[write,userEdit,overwrite(@v3)]` 2665** (the new code); **`catalog_view.py`
  `[write,userEdit,overwrite(@v3),edit,edit,edit]` 2067**. One surviving branch (tip #2114511a), six
  surviving incl. the stray `/tmp/cat.txt`, `rewound.length === 0`.
- **Mutation probe done:** neutralizing `beaconIsElided` turns EXACTLY the `test_catalog` crux red and
  leaves S27's engine tests green (disjointness proven); defeating `backupMatchesBeacon` turns the
  `catalog_view` version-selection crux + the poison test red (validation is load-bearing).

## What Remains
1. **COMMIT — USER APPROVAL ONLY.** `git status` first, then stage EXACTLY: `src/reconstruction_user_edit.ts`,
   `src/reconstruction_sidecar.ts`, `src/reconstruction_reseed.ts`, `src/reconstruction_branches.ts`,
   `tests/fixtures.ts`, `tests/reconstruction_engine_s28.test.ts`, `tests/reconstruction_cli_s28.test.ts`,
   `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
   `plans/reconstruction-engine-design.md`, and `plans/s28/` (plan + this handoff). NEVER `git add -A`; do
   NOT stage `src/Plan_template.md`, `src/Impl_template.md`, `monitor-handoff.sh`, or
   `plans/monitor-handoff-spec.md`. Message: `Implemented S28 handling` (+ the standard Co-Authored-By /
   Claude-Session trailers).
2. Proceed to **s29** (the next scenario; the planner for s29 watches for THIS handoff's `s28 … IMPLEMENTED`
   title).

## Key Files
- `plans/s28/s28-reconstruction-plan.md` — authoritative plan (§3 = exact code, §6/§7 = tests).
- `plans/script-handling.txt` — the MUST-READ premise (HAS-BEACON vs NO-BEACON / forward-validation).
- `scenarios/s28-script-rename-scope.txt` + `scenarios/executed/s28-script-rename-scope/` — scenario + the
  executed transcript (`08e627ff-…jsonl`), rendered ground-truth files, and `~/.claude/file-history/08e627ff-…/`
  backups (`a8b61336832f339e@v2/v3/v4`, `b50d0152214d341d@v2/v3`, `e736cafd0e8dcd15@v2/v3/v4`).
- `plans/implementation-notes-api-from-scenarios.md` — the S28 entry's Deviations section is essential
  reading before touching this code.

## Context the Next Agent Won't Have
- **The plan OVER-STATED the fix's scope; only `tests/test_catalog.py` genuinely needs the new code.**
  Verified live at HEAD (src clean): `catalog_view.py` WITH a reader was ALREADY correct (2067) via the
  PRE-EXISTING `seedStaleEditBases` (s19/s23) — the window renumbers its `preview` Edit anchors so
  `editBaseIsStale` returns TRUE (the plan §1.2 claimed it returns false). `completeElidedBeacons` is
  catalog_view's explicit PRIMARY handler (runs first) with `seedStaleEditBases` as an inert fallback; it
  is STRICTLY necessary only for the TERMINAL elided `test_catalog` beacon. Both reconstruct byte-identically.
- **Mutation-probe wording in plan §9 is wrong:** neutralizing `beaconIsElided` turns ONLY the
  `test_catalog` crux red (NOT both) — `catalog_view` stays green via `seedStaleEditBases`. The isolated
  proof of the new code is `test_S28_test_catalog_terminal_elided_beacon_overwrite`.
- **Raw events carry ONE overwrite (`/tmp/cat.txt`), not zero** (a stray cat-redirect). The extract test
  asserts that one overwrite targets `/tmp/cat.txt`, not a renamed source.
- **Version selection is by CONTENT, not recency** — `catalog_view`'s base is `a8b61336832f339e@v3`
  (pre-`preview`), NOT the latest `@v4` (whose lines shifted and fail `backupMatchesBeacon`). FIRST
  non-latest backup selected. The poison test is scoped to `test_catalog` only (catalog_view's poison
  behaviour is dominated by pre-existing `seedStaleEditBases`).
- The beacon `cat -n` snippet is `N\t<text>` with NO space-padding; a `...` elision separator is a bare
  `...` line — `parseNumberedSnippet`'s `^(\d+)\t` regex + `=== "..."` rely on this (confirmed in the data).
- `S28_JSONL` uses the Desktop canonical-store absolute path (matching S24–S27), not the worktree-relative
  path the plan's Task 1 text quotes.
- The Stop-hook WARNING "no test file for reconstruction_reseed.ts" is expected/benign (covered by the
  scenario tests, as with S27).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 398 pass / 0 fail
npx tsc --noEmit    # No errors found
wc -l src/reconstruction_user_edit.ts src/reconstruction_sidecar.ts src/reconstruction_reseed.ts src/reconstruction_branches.ts
                    # 85 / 241 / 216 / 186 — each ≤ 250
node --import tsx --test tests/reconstruction_engine_s28.test.ts   # 8 green
node --import tsx --test tests/reconstruction_cli_s28.test.ts      # 6 green
```
