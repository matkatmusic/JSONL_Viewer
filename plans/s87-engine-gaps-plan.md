# Plan: close the s87-demo-composite engine gaps (56/118 → 118/118)

Engine repo: `jfred/` (all `src/` and `tests/` paths below are relative to it).
Oracle: `npx tsx scripts/check_scenario_coverage.ts s87` against
`scenarios/executed/s87-demo-composite/`. Full suite: `npm test` (node --test via
tsx; 776 tests, only the s87 coverage test fails today at 56/118).

The scenario file and its capture are ground truth — never modify them. Three
independent root causes, fixed in this order because each later phase's coverage
gain is masked until the earlier ones land. Follow
`plans/coding-requirements.md` (RevEng root) for all code.

---

## Phase 1 — sandbox cwd remap (steps 57–65: `tot_value` → `total_value` rename)

The step-57 rename script hardcodes the recorded temp cwd in its body
(`base = "/private/var/folders/.../run-scenario.7y52smqe"`). The replay sandbox
(`runScriptAgainstState`, `src/reconstruction_script_sandbox.ts:154`) copies
pre-state into a fresh `mkdtemp` dir and runs `python3 __script__.py` with
`cwd: tempDir`, but never rewrites absolute paths inside the script — so the
replay escapes the sandbox, returns `post: undefined`, and NO script event is
injected at the rename instant. (Verified: substituting the recorded cwd with
the sandbox dir yields `inventory.py` byte-identical to
`.step_states/step-057/inventory.py`.)

1. **Failing test first** (`tests/reconstruction_script_sandbox.test.ts`): a
   script whose body contains an absolute directory literal (create a real temp
   dir for the test so escape would be observable), run through
   `runScriptAgainstState` with that literal passed as the recorded cwd; assert
   the transform applies to the SANDBOX copy and the real dir is untouched.
2. **Fix**: add an optional `recordedCwd?: Path` parameter to
   `runScriptAgainstState`. Before writing `__script__.py`:
   `const script = recordedCwd === undefined ? run.code : run.code.replaceAll(recordedCwd.toString(), tempDir)`.
3. **Call sites** — pass the run's recorded cwd at all three:
   - `src/reconstruction_script_runs.ts:98` (`executeRunOnce`)
   - `src/reconstruction_script_beaconless.ts:61` (rolling/chained branch)
   - `src/reconstruction_git_placement.ts:98`
4. Do NOT touch `reconstruction_beacons.ts`, `backupIsWithinBound`, or stage
   order in `computeFileRevisionsOver` (`src/reconstruction_branches.ts:89-113`)
   — the elided splice at 23:48:14 is CORRECT for its timestamp; the gap is the
   missing 23:49:28 event, nothing else.
5. Gate: coverage steps 57–65 flip to PASS (expect ≥ 65/118); `npm test` — zero
   regressions (s34/s37/s85 scripts are relative or `__file__`-based, so the
   remap is a textual no-op for them).

## Phase 2 — mid-stream tail-truncated beacon completion (steps 66–88)

Driver-edit echoes at 23:55:04 / 23:55:18 / 23:57:50 (changeIds `0f5cb329`,
`f37b3cdb`, `a7e4b522`) are snippets contiguous from line 1 with no ellipsis
(274/277/276 lines of a 297-line file). `beaconIsElided`
(`src/reconstruction_beacons.ts:77`) deliberately excludes contiguous-from-1
snippets, and `completeTruncatedBeacon` (`src/reconstruction_reseed.ts:47`
region) completes only the TERMINAL beacon — so nothing completes these, and
replayed content stops short of line 287. The matching complete backup exists
(298-line blob at 23:55:19.134).

1. **Failing test first** (`tests/` beside the existing truncated-beacon tests):
   a mid-stream user-edit beacon whose snippet is a strict line-1-prefix of an
   existing backup, with a later lineage event after it; assert the completed
   revision adopts the backup content.
2. **Fix**: extend the truncated-beacon completion to mid-stream beacons:
   candidate = beacon whose snippet is contiguous-from-line-1 AND a strict
   prefix of a backup blob's content (validate prefix byte-for-byte, per the
   never-fabricate rule). Bound candidate backups with an s45-style `notAfter`
   (≤ next lineage event timestamp) so a later-era backup can never complete an
   earlier beacon.
3. Constraints: terminal-beacon behavior must stay byte-identical (s27), and
   elided-beacon handling untouched (s28/s45). Reuse the existing
   backup-candidate helpers (`backupIsWithinBound` / `notAfter`) rather than
   new plumbing.
4. Gate: coverage ≥ 88/118 (steps 66–88 close; step 79–88 test_inventory.py
   import line also derives from these beacons); `npm test` green except s87.

## Phase 3 — script-rename registration for move-born files (steps 89–118)

Both `shutil.move` runs leave zero usable rename evidence, so
`inventory_core.py`, `core_inventory.py`, and `reporting_core.py` are never
registered and reconstruct as absent. Step 89's run prints no `old -> new`
stdout line; step 106's line matches `renameArrowLine` but the phantom guard
(`src/reconstruction_script_renames.ts:74-76`,
`if (!writtenBasenames.has(basenameOf(from!))) continue;`) drops it because its
source is move-born, not a Write/Edit target.

1. **Failing tests first** (`tests/` beside existing script-rename tests):
   (a) a completed executor run whose CODE contains literal
   `shutil.move("a.py", "b.py")` with no stdout arrow line → rename event
   extracted; (b) a two-run chain where run 2 renames a file born as run 1's
   destination, with run 2's record loaded BEFORE run 1's (readdir order) →
   both events accepted in timestamp order.
2. **Fix** (both in `extractScriptRenameEvents`,
   `src/reconstruction_script_renames.ts`):
   - Second evidence channel: parse literal two-string-argument
     `shutil.move("a","b")` / `os.rename("a","b")` calls from a KNOWN completed
     run's code (the tool_result confirms completion — step 89's result lists
     the destinations). Resolve through the same `resolveAgainstCwd` + basename
     guard as the stdout channel.
   - Chain-aware phantom guard: sort candidate rename events by executor
     timestamp (records arrive in readdir order — wrong order), then accept
     each event whose source basename ∈ `writtenBasenames` ∪ destinations of
     already-accepted renames.
3. No sandbox change: once the rename events exist,
   `buildRenameChain`/`resolveFinalPath` in `getPreExecutionState`
   (`src/reconstruction_script_prestate.ts:135-152`) seeds content at the
   resolved name, and the step-109 Bash rename plus the reporting-rename run
   are already sandbox-green.
4. TRAP: do not make step 89's run replay by following its recorded tmpdir —
   `/private/var/folders/.../run-scenario.7y52smqe` still exists on disk and a
   real-cwd replay can MUTATE the capture. (Phase 1's remap already makes that
   run replay safely in-sandbox.)
5. Gate: coverage 118/118; `npm test` fully green (776/776), including s80/s82/
   s83/s85 (stdout-rename + script-born-path scenarios must not regress).

## Final verification

- `npx tsx scripts/check_scenario_coverage.ts s87` → PASS 118/118.
- `npm test` → 776/776.
- Run the full scenario ledger sweep if one exists in scripts/ (coverage_ledger)
  and confirm no other scenario moved.
