## 2026-06-19:08:30:00 — Engine B fileAbsent verdict fix (What Remains)
Chat title: engine-b-fileabsent-fix (develop branch)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/96739101-04f3-4278-97e9-895bc878f1ca.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260619-0821.md
/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-structured-iverson.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260619-0130.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/per-line-state-sidecar-plan.md

### Design decisions

- **2026-06-19 08:35** — STEP 0 RESULT (the fix-direction gate): ran
  `tools/diagnose-fileabsent-aliaspath.js` over the probe fixture, breaking down event aliasPath
  per kind for the first 5 zero-belief identities. In ALL 5, the belief-CLEARING `fileAbsent`
  events target the SAME alias path that the belief-BUILDING `write`/`snapshot`/`edit` events
  targeted. There is NO alias-path confusion — the `.bak`-alias hypothesis from the plan's
  Context/Step 0 is DISPROVEN. Even the one multi-alias identity
  (`...umbrella.md` + `gemini-policy-engine-migration.md`) built belief on alias A (via write +
  4 snapshots), then `fileAbsent` cleared alias A; the reference is the live on-disk copy at
  sibling alias B. fileAbsent legitimately targets the belief-source path there too.
  DECISION: implement the plan's primary Approach — **belief preservation** (save last populated
  belief before fileAbsent clears it; use it for the verdict when final belief is empty and a
  reference exists). Alias-path scoping is NOT the fix and would not help the multi-alias case.
  This gate resolved unambiguously toward one direction, so implementation proceeds without a
  blocking user question.

### Deviations

- **2026-06-19 08:30** — `probe-engine-b.js` rename-bug fix: handoff item 5 prescribed TWO
  fixes: (1) `require.runMain` → `require.main`, and (2) `payload.printTestSummary` →
  `payload.summary` on lines 125-126. Only fix (1) was applied. Fix (2) is WRONG: the working
  original probe driver `tools/probe-projects-v2.js:270-271` reads `payload.printTestSummary`,
  and `buildResultsPayload` (`tools/probe-v2-report.js:94`) emits the key `printTestSummary`.
  The 252-function rename pass corrupted the property key `summary` → `printTestSummary`
  CONSISTENTLY across both the report builder and both consumers, so `payload.printTestSummary`
  in probe-engine-b.js is already correct. Changing it to `payload.summary` would have broken
  the CLI summary print. Per coding standards (surgical changes — touch only what you must), the
  ugly-but-consistent `printTestSummary` key was left as-is. Only the genuine bug
  (`require.runMain`, which is not a Node API and left the CLI entry point dead) was fixed.

### Implementation summary

- **Fix (belief preservation)** in `api/track-line-states.js` (185 → 234 lines, under 250 cap):
  added `cloneBeliefWithText` (full clone keeping `.text`), `checkGroupHasFileAbsentEvent`, and
  `selectBeliefForVerdict`. In `trackLineStates`, belief is cloned to `lastPopulatedBelief`
  BEFORE any group containing a fileAbsent beacon clears it; after the loop, when final belief
  is empty AND a populated historical belief exists AND `reference.via !== 'none'`, the verdict
  compares against the historical belief and sets `finalVerdict.verdictUsedHistorical = true`.
- **Tests** added to `tests/test-track-line-states-verdict.js` (177 → 229 lines) + a
  `makeFileAbsentLine` helper in `tests/track-line-states-fixtures.js`. Followed strict
  red-green TDD: the historical-belief test failed first (RED), then passed after the fix
  (GREEN); two regression guards (no fileAbsent / never-populated belief) confirm the fallback
  does not over-fire. Full verdict suite: 9 passed, 0 failed.
- **Probe bug fix**: only `require.runMain` → `require.main` in `tools/probe-engine-b.js`
  (see Deviations — the second prescribed fix was wrong).
- **Step 0 diagnostic tool kept**: `tools/diagnose-fileabsent-aliaspath.js` — reusable, gives
  reproducible per-kind aliasPath breakdown of zero-belief identities.

### Verification (rigorous before/after, same fixture, same code)

Engine B probe run with the fallback DISABLED (baseline) vs ENABLED (fix), identical fixture:

| List | PASS baseline | PASS with fix | Δ |
|---|---|---|---|
| list1 (in project) | 289 | 291 | +2 |
| list2 (not in project) | 242 | 296 | +54 |
| **Total** | **531** | **587** | **+56** |

56 files moved MISMATCH→PASS; MISMATCH 155→99; NOT_FOUND unchanged (64); zero PASS→MISMATCH
regressions. Baseline exactly matched the handoff's documented Engine-B numbers (289 / 242),
confirming comparability. 42 zero-belief identities remain — cases where the preserved
historical belief genuinely differs from the current reference (correct MISMATCHes, e.g. the
multi-alias case where belief was built on a now-deleted alias whose content diverged from the
live sibling). The plan's "most of the 78 move to PASS" held: 56 of ~78.

Other gates: full JS test sweep clean (excluding the browser fixture `test-output-data.js`);
`python3 -m pytest tests/test_run_all_scenarios.py` → 6 passed; Engine A gate
`verify-unified-scenarios.js` → 28 MATCH / 1 MISMATCH / 4 SKIP.

### Tradeoffs

- **Belief preservation vs alias-path scoping**: Step 0 disproved the alias-confusion
  hypothesis, so belief preservation was chosen. It is the more general fix — it also rescues
  the multi-alias case (belief built on alias A, A deleted, reference is live alias B) that
  alias scoping could not handle without a notion of a "primary" alias.
- **`cloneBeliefWithText` lives in `track-line-states.js`, not `line-belief.js`** — per the
  plan, because `line-belief.js` is at 246/250 lines with no headroom. It deliberately keeps
  `.text` (which `lb.cloneEntriesForTimeline` drops) because the verdict compares text.

### Open questions

- The property key `printTestSummary` (emitted by `buildResultsPayload`, also set on each
  timeline entry in `track-line-states.js:124` as `printTestSummary: lb.summarizeBelief(belief)`)
  is a corruption introduced by the rename pass — the semantically correct name is `summary`.
  It is internally consistent so nothing is broken, but it reads poorly. NOT fixed here (out of
  scope, would be a cross-file rename). Flagging for a future cleanup pass if desired.
- The Engine A gate (`verify-unified-scenarios.js`) reports 1 MISMATCH (a `celsius_to_fahrenheit`
  scenario), NOT the 0 the handoff's "How to Verify" predicted (29/0/4). PROVEN pre-existing and
  NOT caused by this work: with the new fallback disabled, the gate still reports 28/1/4. Likely
  introduced by the 252-function rename pass. Out of scope for this fileAbsent fix — flagging so
  it can be triaged separately.
- 42 zero-belief identities still MISMATCH after the fix. These are NOT regressions and NOT
  fixable by belief preservation (the preserved belief diverges from the live reference). If
  recovering them matters, a follow-up would need to reconcile divergent-alias content — a
  larger investigation, not a verdict tweak.
