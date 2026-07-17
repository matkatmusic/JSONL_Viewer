# Implementation notes — Roadmap Item 15 (promote per-line verdict → `PASS_PER_LINE`)

## 2026-06-17:18:30:00 — Item 15: PASS_PER_LINE probe status
Chat title: implement RevEng item 15 — promote per-line verdict (PASS_PER_LINE)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/24f55cbf-7c4f-454b-a66c-970b40282d7b.jsonl

### References
- /Users/matkatmusicllc/.claude/plans/breezy-purring-rainbow.md (the item-15 plan being implemented)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1720.md (item-15 handoff)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md (item 15 @ line 564)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1658.md (item 14, just landed)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1252.md (§ How to Verify — gate commands)

### Phase 0 — going-in baseline (recorded before any code)
- Branch `develop`; `develop-baseline` tip `880b69d` (UNCHANGED — re-baseline only at Phase 5).
- Full suite: **65 suites / 657 passed / 0 failed** (items 13 + 14 both landed).
- detect-rewinds: **15 passed / 0 failed**.
- Sidecar e2e `plate_summary.py`: `{matchedObserved:247, matchedPresumed:0, mismatched:0, neverObserved:0}` conflicts=**8**.
- Probe A/B vs `develop-baseline` on frozen fixture (`probe-fixture-20260615`): **identical: true**.
- `tools/probe-results-v2.json` summary: `list1 {count 315, PASS 261, MISMATCH 54, NOT_FOUND 0, rate 82.9}`,
  `list2 {count 435, PASS 265, MISMATCH 106, NOT_FOUND 64, rate 60.9}` → 160 on-disk MISMATCH.
- Cap probe: `tools/probe-projects-v2.js` is 289 L (over the 250 cap). Plan's edit is net-zero (wrap
  `decision` in the existing `:205-206` return). Verified at Phase 4 by the actual write.

### Design decisions
- Promotion criterion `mismatched === 0` AND `neverObserved === 0` (stricter than roadmap's literal
  `mismatched === 0`) — rejects the empty/partial-belief vacuous pass. (Plan §Design-decision 2.)
- Guard `decision.status === 'MISMATCH'` (never `!== 'PASS'`) — NOT_FOUND has `comparedVia:'none'`,
  whose verdict early-returns empty → would vacuously pass.
- Drive engine from the record's `transcriptsUsed[].jsonl` (absolute) × `aliasPaths` — under-promote,
  never over-promote.
- `actionablePassRate` counts `PASS_PER_LINE` as a pass (numerator + denominator). User decision.

### Implementation (strict red-green, all phases GREEN)
- **Phase 1** — NEW `api/promote-per-line-status.js` (55 L) + `tests/test-promote-per-line-status.js`
  (10 tests). RED order: `Cannot find module` → wrong-value stub (2 real assertion fails: the
  `true` case + the upgrade integration) → real impl GREEN.
- **Phase 2** — `tools/probe-v2-shared.js`: `countByStatus` initializer +`PASS_PER_LINE:0`;
  `computeActionablePassRate` Option A (`passing = PASS + PASS_PER_LINE`, in numerator AND
  denominator). +2 tests (RED `undefined!==0`, `33.3!==50`).
- **Phase 3** — `tools/probe-v2-report.js`: `summarizeList` +1 field. +1 test (RED `undefined!==1`).
- **Phase 4** — `tools/probe-v2-assembly.js`: `maybePromotePerLine` adapter + require (+2 tests,
  RED `is not a function`). `tools/probe-projects-v2.js:206`: net-zero wrap of `decision`.

### Phase 5 — payoff + gates + re-baseline
- Probe A/B vs `880b69d`, characterized record-by-record: **list1 42 flips, list2 56 flips, ALL
  `MISMATCH→PASS_PER_LINE`; 0 added/removed records, 0 provenance diffs** (only `status` moved).
  Summary: list1 MISMATCH 54→12 rate 82.9→96.2; list2 MISMATCH 106→50 rate 60.9→73.8;
  PASS/NOT_FOUND unchanged. **98 of 160 on-disk MISMATCH promoted.** (Item 14 had landed, so the
  EOF/phantom class is included in the 98.)
- Unchanged gates: full suite **66 suites / 673 passed / 0 failed**; detect-rewinds **15/15**;
  `plate_summary.py` 247/247, 0 mismatched, conflicts=8.
- **Re-baseline** `develop-baseline` `880b69d → a8947fc` via the verbatim temp-index source-mirror
  method (item 5.6 §); `develop` HEAD unchanged at `1a9f098`, working tree untouched (temp index
  only). A/B vs new baseline → **`identical: true`**. **Rollback:
  `git update-ref refs/heads/develop-baseline 880b69d`.**

### Deviations
- None of substance. The `computeActionablePassRate` Option-A test asserts **50.0** (plan predicted
  the pre-fix value as 25.0; it is actually 33.3) — the RED still held; assertion uses the correct
  post-fix value.

### Tradeoffs
- Drive the engine from `transcriptsUsed` (edit-bearing transcripts) not the full referencing set:
  a read-only transcript's observations are omitted → slightly more `neverObserved` → a few files
  may stay un-promoted. Accepted (under-promote, never over-promote).
- Promotion criterion stricter than the roadmap literal (`mismatched===0` AND `neverObserved===0`):
  blocks the empty/partial-belief vacuous pass. Drop the `neverObserved` guard only if the literal
  criterion is later preferred.

### Open questions
- None. Working tree is the canonical by-design state (19 `??` entries + pre-existing `M .gitignore`,
  unrelated to item 15); `develop` HEAD unchanged at `1a9f098`. The temp-index re-baseline never
  touches the working tree or the real index.
