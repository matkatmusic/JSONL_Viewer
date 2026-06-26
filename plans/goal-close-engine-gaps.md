# Goal: close every engine gap so all covered scenarios reconstruct at every step

## Mission
Make all 64 covered scenarios (those with a `.step_states/` ground truth) reconstruct byte-for-byte at
every captured step. Today **46/64 pass, 18 fail**. Drive the FAIL set to zero — one scenario at a time,
never regressing a green one.

## The loop (repeat until 64/64)
1. Pick the **lowest-numbered FAIL** scenario from `scenarios/coverage-ledger.md`.
   Order: s29, s32, s35, s37, s38, s40, s41, s42, s43, s44, s45, s46, s47, s64, s67, s69, s70, s72.
2. Run `npx tsx scripts/check_scenario_coverage.ts <dir-name>` (e.g. `s32-script-rename-mcp-exec`).
   Read the per-step diff: the failing step folder, the differing file, the first differing line, the
   best-matching engine step's JSONL line, and the provenance stages that touched the file.
3. **Investigate the ENGINE, root cause — not the symptom.** What is the engine producing wrong, or what
   feature is missing, that makes this step diverge? Grep every caller of the function you'd touch; fix it
   once where all callers route through. Do NOT weaken the coverage suite or the checker to make it pass.
4. Implement the minimal engine fix. `npx tsc --noEmit` must stay clean.
5. **Re-sweep ALL scenarios:** `npx tsx scripts/coverage_ledger.ts`. Then `git diff scenarios/coverage-ledger.md`.
   - Exactly one row must flip **FAIL→PASS** (the one you targeted).
   - **Zero rows may flip PASS→FAIL.** Any regression = your fix is wrong; revert or repair before continuing.
   - `npm test` must show the previously-green tests still green (it is the authoritative oracle).
6. **STOP. Commit.** One commit per FAIL→PASS transition. Hand back to the user for the commit (or commit
   if explicitly authorized). Do not start the next scenario until the current fix is committed.
7. Go to 1.

## Invariants (never violate)
- The ledger and `scenario_coverage.test.ts` are the regression record. A PASS that becomes FAIL is a stop-
  the-line event, not a tradeoff.
- Fixes go in the engine (`src/`), never in the checker (`scripts/check_scenario_coverage.ts`,
  `coverage_compare.ts`) or the content suite. Those define correctness.
- Keep source files < 250 lines (project rule). Reuse existing helpers before adding new ones.
- One runnable check accompanies any non-trivial new logic.

## Known landscape (from the handoff — verify, don't trust)
- Rename family (s29 3/4, s32 2/4, s35 6/7, s37 9/10, s38 6/7): function-name disagreement
  (e.g. `qty_chk` vs `check_quantity`) — a rename-tracking bug. Likely a shared root cause across the five.
- Git-baseline family (s40–s44 fail all/most steps; s45/46/47 fail 1 of 2): seeded-reconstruction
  mismatches. `--excludeJSONL` drops the baseline session; rev0 is often backup/originalFile-seeded.
- Compact family (s64/s67/s69/s70/s72): genuine compact-session reconstruction gaps (5 sibling compacts
  already pass after the vocab work, so the parser is fine — this is reconstruction).

## Commands
- Single scenario, per-step diff: `npx tsx scripts/check_scenario_coverage.ts <dir-name>` (exit 0 ok / 1 gap / 2 unknown name).
- Full sweep + ledger refresh: `npx tsx scripts/coverage_ledger.ts`.
- Authoritative regression oracle: `npm test` (node --import tsx --test, NOT vitest).
- Types: `npx tsc --noEmit`.
- `rtk` aliases hijack bare `grep` — use `/usr/bin/grep`.

## Definition of done
`scenarios/coverage-ledger.md` shows **64/64 PASS**, `npm test` has zero scenario-coverage reds, `tsc` clean.
