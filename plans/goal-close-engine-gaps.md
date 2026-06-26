# Goal: close every engine gap so all covered scenarios reconstruct at every step

## Mission
For every **covered** scenario in `scenarios/executed/` (a directory containing a `.step_states/` ground
truth): for each captured step state, the reconstructed state of that scenario's touched files matches the
corresponding `.step_states/` contents **byte-for-byte**, when that scenario's JSONL file(s) are run through
the reconstruction engine. Scenarios with **multiple** JSONL (concurrent multi-agent) are in scope.

The set of covered scenarios is **not fixed** — more scenario folders get added over time. The goal is
*however many* covered scenarios exist, all of them green. Drive the FAIL set to zero — one fix at a time,
never regressing a green one.

### Prerequisite: multi-JSONL ingestion
`scripts/check_scenario_coverage.ts` / `scripts/coverage_scenarios.ts` currently hard-skip any scenario with
more than one JSONL (`"expected exactly one .jsonl"`), so the concurrent scenarios never reach the ledger.
Before they can be measured, teach the checker to **load and merge all of a scenario's JSONL** into one
record stream for reconstruction. This is *extending the checker's input handling* — explicitly allowed, and
distinct from the invariant against weakening the checker's correctness **comparison**. Until it lands, those
scenarios are absent from the ledger rather than passing; do not treat their absence as done.

## The loop (repeat until every covered scenario is green)
1. Pick the **lowest-numbered FAIL** scenario from `scenarios/coverage-ledger.md`.
2. Run `npx tsx scripts/check_scenario_coverage.ts <scenarioId>` (e.g. `s32` — the checker accepts the
   scenarioId or the full dir name, so no lookup is needed).
   Read the per-step diff: the failing `.step_states/<n>/` folder, the differing file, the first differing
   line, the JSONL line of the reconstructed snapshot that best matches that folder, and the provenance
   stages that touched the file.

   **Two independent numbering spaces — never assume they align.** The `.step_states/<n>/` folders are
   numbered by *instruction number*. The engine emits an ordered sequence of reconstructed snapshots with
   their own positional index; their count and ordinals need not match the folder numbers (folder `n` is
   NOT necessarily the n-th emitted snapshot). Pass/fail is purely "*some* reconstructed snapshot reproduces
   this folder byte-for-byte" (`someStepReproduces`) — never a positional folder↔snapshot alignment. The
   diff's "best match" is chosen by *content* (`selectBestEngineStep`), so the snapshot it shows may sit at
   any index. A mismatch can therefore mean either (a) the right content was reconstructed but no snapshot
   captured that exact intermediate state, or (b) the content is wrong; distinguish the two before fixing.
3. **Investigate the ENGINE, root cause — not the symptom.** The engine lives in `src/reconstruction_*.ts`;
   entry points are `reconstructStepStates` / `reconstructStepChanges` (in `src/reconstruction_steps.ts`),
   which the checker calls. What is the engine producing wrong, or what feature is missing, that makes this
   step diverge? Grep every caller of the function you'd touch; fix it once where all callers route through.
   Do NOT weaken the coverage suite or the checker to make it pass.
4. Implement the minimal engine fix. `npx tsc --noEmit` must stay clean.
5. **Re-sweep ALL scenarios:** `npx tsx scripts/coverage_ledger.ts`. Then `git diff scenarios/coverage-ledger.md`.
   - The targeted row must flip **FAIL→PASS**. A shared root-cause fix may green several scenarios at once —
     that is a win, not a violation; just confirm each newly-green row is genuinely fixed.
   - **Zero rows may flip PASS→FAIL.** Any regression = your fix is wrong; revert or repair before continuing.
   - `npm test` must show the previously-green tests still green (it is the authoritative oracle).
6. **STOP. Tell user to Commit.** One commit **per fix** (not per scenario) — a single fix that greens
   several scenarios is one commit. Hand back to the user for the commit. Do not start the next fix until the
   current one is committed.
7. Go to 1.

## Invariants (never violate)
- The ledger and `scenario_coverage.test.ts` are the regression record. A PASS that becomes FAIL is a stop-
  the-line event, not a tradeoff.
- Fixes go in the engine (`src/`), never in the checker's correctness comparison
  (`scripts/check_scenario_coverage.ts`, `coverage_compare.ts`) or the content suite — those define
  correctness. (Extending the checker's *input handling*, e.g. multi-JSONL ingestion above, is allowed.)
- Keep source files < 250 lines (project rule) and indentations less than 3 levels.  A hook will automatically warn you if these 2 coding style rules are violated. 
- Reuse existing helpers before adding new ones.  
- Always refactor instead of duplicating existing logic when writing any new function that copies identical code from elsewhere in the codebase.
- One runnable check accompanies any non-trivial new logic.

## Commands
- Single scenario, per-step diff: `npx tsx scripts/check_scenario_coverage.ts <dir-name>` (exit 0 ok / 1 gap / 2 unknown name).
- Full sweep + ledger refresh: `npx tsx scripts/coverage_ledger.ts`.
- Authoritative regression oracle: `npm test` (node --import tsx --test, NOT vitest).
- Types: `npx tsc --noEmit`.
- `rtk` aliases hijack bare `grep` — use `/usr/bin/grep`.

## Definition of done
Every row in `scenarios/coverage-ledger.md` is PASS (including the concurrent multi-JSONL scenarios once
ingestion lands), `npm test` has zero scenario-coverage reds, `tsc` clean.
