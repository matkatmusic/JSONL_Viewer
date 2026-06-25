MUST READ: plans/script-handling.txt

# Handoff: IMPLEMENT Scenario s28 (`s28-script-rename-scope`) — PLANNED, a REAL ENGINE FIX (the elided/windowed `edited_text_file` beacon). Fix prototyped LIVE during planning (suite 384→386 byte-perfect, `tsc` clean, all src ≤250 lines) then reverted. Implement via TDD per the plan. Next: s29.
Conversation name: api-from-scenarios — S28 planning (/plan-scenario 28)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/1b10867e-6663-4be3-b283-05d56e9b8659.jsonl
Plan file: plans/s28/s28-reconstruction-plan.md  (AUTHORITATIVE — every ladder/changeId/byte/line count in it was verified live)

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (S1–S27 + m1–m7 committed; `6cfec6c S27 handling
implemented` is the immediate predecessor). The working tree is clean except the new untracked `plans/s28/`.

## Goal
Make the reconstruction engine reconstruct all of S28's files byte-for-byte. S28 is a script-driven
SCOPED rename (a CSV with an `isExported` column: `Y` rows rename across all files, `N` rows rename only
one named file). The new failure mode: two of the three post-script `edited_text_file` beacons are
**ELIDED** — the harness showed only a WINDOW of the file (`...` separators and/or starting past line 1),
and the engine adopts that window verbatim, so `tests/test_catalog.py` and `catalog_view.py` reconstruct
short/garbled. The fix detects elision from the snippet's line numbers and splices a content-validated
file-history backup as a synthetic overwrite.

## Current State — PLANNED, fix VERIFIED LIVE then REVERTED (nothing in src/ changed)
- Baseline confirmed GREEN: `npm test` = **384 pass / 0 fail**; `npx tsc --noEmit` clean; `git diff src/`
  empty.
- The fix (§3 of the plan: four edits across `reconstruction_user_edit.ts`, `reconstruction_sidecar.ts`,
  `reconstruction_reseed.ts`, `reconstruction_branches.ts`) was applied as a live prototype and proved
  byte-perfect: WITH a reader, `tests/test_catalog.py` → 2665 `[write,user-edit,overwrite]` and
  `catalog_view.py` → 2067 `[write,user-edit,overwrite,edit,edit,edit]`; the other three files unchanged
  and reader-INDEPENDENT. Full suite stayed green (384 + 2 probe tests = 386), `tsc` clean, all four
  touched files ≤ 250 lines (85 / 241 / 211 / 186). Then the prototype was REVERTED — src is at HEAD.
- No commit has been made for S28. Implementing agent re-applies the fix via TDD (RED→GREEN), adds the
  two lock test files, updates 3 docs, then commits ONLY on explicit user approval.

## What Remains (in execution order — full detail in the plan §4–§10)
1. **Task 1 — fixture:** add `S28_JSONL` to `tests/fixtures.ts` (after `S27_JSONL`), pointing at
   `scenarios/executed/s28-script-rename-scope/08e627ff-de50-4de7-aa03-5133366d9f25.jsonl`; run the plan
   §2.7 capture command to get the five rendered-file literals + `S28_CATALOG_VIEW_V3` (the one inline
   backup literal, 1521 bytes).
2. **Task 2 — engine fix, TDD:** write the catalog_view crux test RED first, then apply plan §3 (a)+(b)+(c)+(d).
   Confirm GREEN, `tsc` clean, every src file ≤ 250.
3. **Task 3 — engine lock** `tests/reconstruction_engine_s28.test.ts` (hermetic reader; 8 tests in plan §6,
   including the two crux ladders, the reader-dependence guard, the poison guard, and the version-selection
   lock that `@v3` not `@v4` is chosen for catalog_view).
4. **Task 4 — CLI lock** `tests/reconstruction_cli_s28.test.ts` (real `runCli` + real sidecar reader; plan §7).
5. **Task 5 — docs:** `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
   `plans/reconstruction-engine-design.md` (plan §8).
6. **Task 6 — full verification** + mutation probe (plan §9): neutralizing `beaconIsElided` must turn
   EXACTLY the two crux tests red and leave S27's tests green (proves disjointness).
7. **Task 7 — commit (USER APPROVAL ONLY) then create the completion handoff** via `/jot:handoff-prompt`
   with title `# Handoff: Scenario s28 (...) IMPLEMENTED …` and `MUST READ: plans/script-handling.txt` on
   line 1 (so any downstream s29 monitor fires). `create handoff` is a required task in your list.

## Key Files
- `plans/s28/s28-reconstruction-plan.md` — the authoritative plan; §3 has the exact code to add (it was
  prototyped verbatim); §6/§7 list every test; §2 has the verified ground truth.
- `plans/script-handling.txt` — the MUST-READ premise (HAS-BEACON vs NO-BEACON / forward-validation).
- `scenarios/s28-script-rename-scope.txt` — the scenario script (steps 1–8).
- `scenarios/executed/s28-script-rename-scope/` — the executed transcript (the JSONL fixture) + rendered
  ground-truth files; backups at `~/.claude/file-history/08e627ff-de50-4de7-aa03-5133366d9f25/`.
- Files the fix touches: `src/reconstruction_user_edit.ts` (add `beaconSnippetFor` + types),
  `src/reconstruction_sidecar.ts` (add `backupWritesFor`; make `latestBackupWriteFor` reuse it),
  `src/reconstruction_reseed.ts` (add the `completeElidedBeacons` family), `src/reconstruction_branches.ts`
  (wire it as a stage BEFORE `seedStaleEditBases`).
- Mirror for tests: `tests/reconstruction_engine_s27.test.ts`, `tests/reconstruction_cli_s27.test.ts`.

## Context the Next Agent Won't Have
- **The line numbers are the whole game.** `stripLineNumberPrefixes` (`reconstruction_user_edit.ts:15-20`)
  discards the `N\t` prefixes, so by the time a beacon is a `UserEditEvent` the elision is invisible. The
  fix re-reads the RAW numbered snippet from `records` (via the beacon's changeId = attachment uuid) to
  see the gaps. Detect elision as: first line# > 1 (head), a gap between consecutive line#s (interior), or
  a literal `...` line. Do NOT treat a clean contiguous-from-1 prefix as elided — that's S27's job
  (`completeTruncatedBeacon`); the two triggers MUST stay disjoint (the plan's mutation probe proves it).
- **Version selection is by CONTENT, not recency.** `catalog_view.py`'s correct overwrite base is `@v3`
  (post-script, pre-`preview`), NOT the latest `@v4` (post-`preview`) — `@v4`'s lines at 11–41 differ from
  the beacon because the `preview` insertion shifted them, so `@v4` fails `backupMatchesBeacon`. This is
  why the fix enumerates ALL versions (`backupWritesFor`) and validates, rather than using
  `latestBackupWriteFor`. The s28 engine test reader deliberately returns real content for `@v4` so this
  rejection is exercised.
- **Stage order matters.** `completeElidedBeacons` runs BEFORE `seedStaleEditBases` so catalog_view's
  injected `@v3` overwrite makes the two `preview` Edits' bases correct (leaving `seedStaleEditBases`
  inert for them, no double-seed), and before `completeTruncatedBeacon` so terminal triggers don't
  double-fire.
- **The 250-line cap is hook-enforced.** Adding `backupWritesFor` to `reconstruction_sidecar.ts` pushes it
  to 258 → BLOCKED. You MUST also rewrite `latestBackupWriteFor` to reuse `backupWritesFor` (same
  behaviour, newest non-null backup) to drop back to 241. The plan §3(b) gives the exact reuse.
- **catalog_view renders as 3 edit revisions from 2 Edit tool calls** (the first Edit yields two
  revisions, same changeId) — this is pre-existing engine behaviour, present with AND without the fix; not
  a bug to chase.
- **surviving.length === 6, not 5:** the five tracked files PLUS `/tmp/cat.txt` (a stray `cat`-redirect
  side file in the transcript). Assert the five real suffixes; expect the sixth.
- **A Stop-hook WARNING "no test file for reconstruction_reseed.ts" is expected and benign** (the module's
  functions are covered by the scenario tests, as with S27).
- **Reader-dependence is MIXED:** `catalog.py` (complete beacon), `scoped_rename.py`, `scoped_renames.csv`
  are reader-INDEPENDENT; `tests/test_catalog.py` and `catalog_view.py` are reader-DEPENDENT.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # baseline 384 → 384 + new s28 tests, 0 fail
npx tsc --noEmit    # No errors found
wc -l src/reconstruction_user_edit.ts src/reconstruction_sidecar.ts src/reconstruction_reseed.ts src/reconstruction_branches.ts
                    # expect 85 / 241 / 211 / 186 — each ≤ 250
node --import tsx --test tests/reconstruction_engine_s28.test.ts   # all green
node --import tsx --test tests/reconstruction_cli_s28.test.ts      # all green
```
Then the mutation probe in plan §9 (flip each crux assertion + neutralize `beaconIsElided`; each must go
RED, S27 tests stay green; restore).
