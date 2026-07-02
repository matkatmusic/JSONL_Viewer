# Handoff: per-step coverage — 4 scenarios fixed (uncommitted); s28 is the lone remaining FAIL (root cause known)
Conversation JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/7e7caa35-2808-488e-b81b-7f7d6a5b9185.jsonl

## Branch
`api-from-scenarios` (based on `master`). Recent tip: `ecd3978 implemented script replay during reconstruction`. **Five files are uncommitted** (4 source/script + the auto-generated ledger). NOTHING has been committed this session — **the user makes ALL commits.**

## Goal
The session `/goal`: for every covered scenario in `scenarios/executed/` (a dir containing a `.step_states/` ground truth), the reconstructed state of its touched files at each captured step must match the `.step_states/` contents byte-for-byte when the scenario's JSONL(s) run through the engine. Multi-JSONL (concurrent / `/clear` / compact) scenarios are in scope. Coverage is per-step via `scripts/check_scenario_coverage.ts` (uses `someStepReproduces` — ANY engine snapshot must match a folder byte-for-byte; `manifest.json`/`__pycache__`/`.claude` excluded by `NON_SOURCE_NAMES`).

## Current State
- **Sweep: every covered scenario passes EXCEPT s28.** Covered now = s24–s32 + s37 + s53–s71 (the user regenerates `.step_states` externally, in batches). Run `npx tsx scripts/check_scenario_coverage.ts <id>`.
- **s28-script-rename-scope: FAIL 3/8** (steps 4–8 fail on `catalog_view.py`). This is the ONLY failure.
- Unit suite `node --import tsx --test tests/*.test.ts`: **228 pass / 6 fail**; the 6 are PRE-EXISTING fixtures with no `.step_states` (`test_findCoveredScenarios_includes_s19`, `test_readStepStateFiles_…`, `test_checkScenario_reports_every_step_passes_for_s19`, `test_a_file_less_surviving_branch_…`, `test_findPromptForkPoints_…_S13_fork`, `test_findDeepestPromptOrReply_…`). Do not let the count rise.
- `npx tsc --noEmit`: clean. All edited files ≤250 lines (hook-enforced cap).

## Three fixes already landed this session (uncommitted, all verified non-regressing)
1. **Cross-session backup blob collision** (`src/reconstruction_sidecar.ts`, `scripts/coverage_sidecar.ts`) — file-history blobs are `<pathHash>@vN` with a PER-SESSION `vN`, so a merged multi-session transcript has the same blob name in several session dirs with DIFFERENT content. `BackupReader` gained an optional `sessionId`; `BackupPoint`/`buildBackupTimeline` track the owning session (snapshot records carry NO sessionId → derive as the latest envelope `sessionId` seen so far in the per-session-contiguous merged stream); the checker's reader reads the owning session's dir. Fixed **s56, s59, s64**.
2. **Stale-seed prefix gate** (`src/reconstruction_reseed.ts`, `outOfWindowEditSeed`) — required the reconstructed base to be a strict PREFIX of the backup seed (s34's real "trailing append" shape), rejecting mid-file-divergent older backups that reverted a captured edit. Fixed **s70**.
3. **Elided-beacon closeout-stale re-timing** (`src/reconstruction_beacons.ts`, `completeElidedBeacons`) — a terminal user-edit beacon echoed only at agent closeout was dated ~20s late. New `bracketMidpointTime` = midpoint between the latest backup WITHOUT the content and the earliest WITH it. Applied ONLY when (a) beacon is terminal (`notAfter` undefined), (b) midpoint is earlier than the echo, and (c) pulling earlier does NOT cross a real same-file edit (collision guard — without it s56's mid-stream beacon regresses). Beacon AND seed both move. Fixed **s62** (the hardest — a driver out-of-band `# checked` edit with no tool_use record).

## What Remains
1. **Fix s28** (the lone FAIL). See root cause below. Recommended approach: **edit-reversal** (option A). Prototype it, then run the FULL sweep (s24–s71) + unit suite to confirm no regression. Do NOT regress s24/s25/s26/s27/s29/s30/s31/s32/s35/s37/s45 (the other beacon/script-rename scenarios).
2. After s28 is green, ask the user to commit. They commit; you do not.
3. (Ongoing) The user keeps regenerating more `.step_states` batches (s1–s23, s33–s52, s72 are still uncovered). Re-run the sweep as they land.

## s28 ROOT CAUSE (fully diagnosed — NOT a regression; fails on the baseline engine too)
s28 = scoped script rename. Instruction 4 runs **Bash `python3 scoped_rename.py`** at 03:05:53, renaming `load_all→load_catalog` across catalog.py / catalog_view.py / tests/test_catalog.py (CSV `scoped_renames.csv` has `old,new,isExported,file`: `load_all,load_catalog,Y,` global; `_norm,normalize_entry,N,catalog.py` local). Instruction 5 edits catalog_view.py to add `preview()`.

`catalog_view.py` is the SOLE blocker (catalog.py / test_catalog.py / csv / scoped_rename.py all match at engine steps 11–14). The failure chain:
1. The script's rename of catalog_view.py leaves NO per-file Write/Edit. Its only echo is the instruction-5 read at 03:10:38 — an `edited_text_file` beacon **truncated to 16 lines** (a contiguous-from-1 PREFIX of the real ~24-line renamed file).
2. The beacon is a tail-truncation, NOT elided (contiguous from line 1, no gaps/`...`), so `completeElidedBeacons` skips it; and it is NOT terminal (the preview edit follows), so `completeTruncatedBeacon` (terminal-only) skips it. It falls through incomplete.
3. The preview edit's hunk anchors at **line 22**; the 16-line base lacks it → `editBaseIsStale` is TRUE → `seedStaleEditBases` reseeds from the at-or-before backup = `b75fe17f…@v2` @ 03:05:17, which is **pre-rename `load_all`**.
4. That reseed (a) reverts `render()` to `load_all` so the FINAL state is also wrong (~3 bytes off at step 5), and (b) its early timestamp (03:05:17) shadows the load_catalog beacon (03:10:38) because `lastRevisionAtOrBefore` (`src/reconstruction_branches.ts:98`) returns the last revision in ARRAY order ≤ when, not the latest by timestamp, and the reseed is spliced at a later array position. Net: catalog_view.py reconstructs as `load_all` for steps 1–13, then jumps to `load_catalog`+preview at step 14. The renamed-no-preview state (762B, = GT step-4) NEVER appears.

The correct base for the preview edit is the FULL renamed-no-preview catalog_view.py (24 lines, load_catalog). It exists in NO backup: the at-or-before backup is pre-rename load_all; the after backup (`@v3` @ 03:11:07) is renamed+preview. `injectScriptExecutions` does NOT model this because the run is Bash `python3 scoped_rename.py` — the command names neither the CSV nor the targets (both live inside the `.py`), and the CSV is scoped; `deriveRenameSubs` (csvBasenameOf scans the run's own code) returns undefined → fallback.

### Fix options (recommend A)
- **A. Edit-reversal (leanest, general, not script-specific).** When a stale edit has a file-history backup taken just AFTER it (`@v3` = renamed+preview), recover the pre-edit base by reversing the edit's added lines onto that after-backup instead of reseeding from the pre-rename at-or-before backup. This was the deferred "item 3" in the prior s37 handoff. Gives renamed-no-preview directly. Verify the new seed step lands so GT step-4 matches.
- **B. Extend `injectScriptExecutions` to Bash-run scoped renames** (`src/reconstruction_script_execution.ts`): resolve `python3 X.py`→X.py source (from its Write/backup), parse the scoped CSV (Y=all files / N=named file), forward-transform per target. Most principled (dates the rename at script time 03:05:53), but the scoped script has branching logic — high effort/risk.
- **C. Generalize `completeTruncatedBeacon` to the non-terminal case**, capped to the render's end (before preview). Medium effort, fragile around the truncation-vs-preview boundary.

## Key Files
- `scripts/check_scenario_coverage.ts` — the per-step checker (UI is open on it). `scripts/coverage_scenarios.ts` — discovery + `readStepStateFiles` + `NON_SOURCE_NAMES`. `scripts/coverage_sidecar.ts` — multi-session `buildSidecarReader` (fix 1).
- `src/reconstruction_branches.ts` — `reconstructFileOver` pipeline (lines 50–57): seedCopy → fillRedirect → seedEditBaseFromBackup → **injectScriptExecutions** → **completeElidedBeacons** → **seedStaleEditBases** → completeTruncatedBeacon → replay. `lastRevisionAtOrBefore` at line 98 (array-order scan).
- `src/reconstruction_reseed.ts` — `seedStaleEditBases` / `staleEditSeedFor` / `editBaseIsStale` / `outOfWindowEditSeed` (fix 2 here).
- `src/reconstruction_beacons.ts` — `completeElidedBeacons` / `completeTruncatedBeacon` / `bracketMidpointTime` (fix 3 here).
- `src/reconstruction_script_execution.ts` + `src/reconstruction_script_stage.ts` — `injectScriptExecutions` / `deriveRenameSubs` (option B would extend these).
- `scenarios/executed/s28-script-rename-scope/` — fixture (1 JSONL `d6c4dd3f…`, `scoped_renames.csv`, `scoped_rename.py`, `.step_states/step-001..008`). `scenarios/` is a SYMLINK — never `git add` under it.

## Context the Next Agent Won't Have
- **The user makes ALL commits — never commit yourself.** Ponytail-ultra (lazy/minimal) is active; prefer the leanest fix that holds.
- **250-line-per-file cap is hook-enforced** ("split, never condense"). A PostToolUse hook runs the suite on every edit and warns on missing test files / deep nesting. Test runner is `node --import tsx --test`, NOT vitest. Filter `Debugger`/`inspector`/`Waiting for` from stderr.
- **The s28 failure is NOT caused by this session's 3 fixes** — verified by `git stash`ing them and re-running (still 3/8). It is a pre-existing gap the regenerated oracle exposes. Do not chase the 3 fixes.
- **`someStepReproduces` semantics:** a folder passes if ANY engine snapshot matches it byte-for-byte — so the fix only needs catalog_view.py's renamed-no-preview (762B) state to appear at SOME engine step where catalog.py/test/csv/scoped_rename also match (they share steps 11–14). You do NOT need the exact script-run timestamp; any placement that produces the renamed-no-preview snapshot in that window works.
- **Diagnostic recipe used:** drive the engine from a throwaway script importing `reconstructFilesOver`/`reconstructStepStates`/`linesTextOf` + `buildSidecarReader` from `scripts/coverage_sidecar.ts`; enable `reconstruction_provenance` to see which stage fired; dump per-step `snapshotFileText` vs `readStepStateFiles`. The revisions array from `reconstructFilesOver` is NOT timestamp-sorted (reseeds splice out of order) — that interacts with `lastRevisionAtOrBefore`'s array-order scan.
- Memory updated: `~/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/memory/multi-session-perstep-fixes.md` (+ MEMORY.md pointer) records the 3 fixes.

## How to Verify
- s28: `npx tsx scripts/check_scenario_coverage.ts s28 2>&1 | grep -viE 'Debugger|inspector|Waiting for' | grep -E '^(OK|FAIL)|step '` → target `OK s28 8/8`.
- Full sweep: loop `s24..s32 s37 s53..s71` through the checker; all must stay `OK`.
- Suite: `node --import tsx --test tests/*.test.ts 2>&1 | grep -viE 'Debugger|inspector|Waiting for' | grep -E '^ℹ (tests|pass|fail)'` → `pass 228 / fail 6` (the 6 pre-existing; must not rise; an s28 pass adds to `pass`).
- Type check: `npx tsc --noEmit` → clean.
