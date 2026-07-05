# Handoff: Engine B vs Engine A reconstruction analysis — root cause found, fix planned, unverified assumption flagged
Conversation name: (omitted per handoff rules)
JSONL: (omitted per handoff rules)

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; all RevEng source is
untracked). A function-rename pass (252 renames, 176 files) was applied by a prior session —
see `plans/handoff-develop-20260619-0130.md`. CWD: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
Determine whether Engine B (the per-line sidecar) could replace Engine A (the step-based
unified-reconstruct pipeline) for file reconstruction, or whether the two engines are
complementary. The user's driving question: "is the sidecar fully functional, or is there more
to build?"

## Current State

### Research complete — Engine B cannot replace Engine A alone

Created `tools/probe-engine-b.js` — an Engine B-only probe that bypasses Engine A's edit
replay and uses `trackLineStates` exclusively. Ran it against the full jot-recovery probe
fixture (750 file identities). Results:

| Metric | Engine A+B combined | Engine B only | Engine A only |
|---|---|---|---|
| list1 passing | 303/315 (96.2%) | 289/315 (91.7%) | 261/315 (82.9%) |
| list2 passing (actionable) | 321/371 (86.5%) | 242/371 (65.2%) | 265/371 (71.4%) |
| Remaining failures | 126 | 219 | 190 |

The two engines have complementary strengths:
- **98 files** where Engine B passes but Engine A fails (complex edit histories, renames, rewinds)
- **93 files** where Engine A passes but Engine B fails (78 due to `fileAbsent` clearing belief, 15 due to mismatched/neverObserved lines)

The current "Engine A first, Engine B rescue" approach is already the optimal union.

### Root cause found for the 78 zero-belief Engine B failures

Traced `fibonacci.py` end-to-end: Engine B extracts 43 events (including Write and Read), builds
full 14-line belief, then 25 `fileAbsent` beacon events clear `belief.entries = {}`. The final
verdict sees empty belief vs 14-line reference → `neverObserved: 14`.

The initial hypothesis ("Write tool content isn't counted as per-line evidence") was **wrong**.
Write content IS extracted, materialized into per-line beliefs, and applied correctly. The
problem is that `applyFileAbsent()` in `api/line-belief.js:154` sets `belief.entries = {}`,
erasing all historical knowledge when the file is later deleted.

### Unverified assumption in the plan

The plan's Context section claimed files were "recreated outside the tracked transcripts." This
is **unproven**. The `fileAbsent` events may target a different alias path (e.g. `.bak`) rather
than the primary path. Step 0 of the plan requires checking `event.aliasPath` on the
`fileAbsent` events before committing to a fix direction. If alias-path confusion is the cause,
the fix is scoping, not belief preservation.

### Engine B origin traced

Found the JSONL session where Engine B was conceived:
`~/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/6f139673-8fd3-400a-9880-5d02facf00ab.jsonl`
(June 11, 2026). The user proposed `dict[lineNum]` per-line tracking at 16:01 UTC, named it
"sidecar" at 16:13 UTC. The spec (`plans/per-line-state-sidecar-plan.md`) explicitly states it
was conceived as a **diagnostic tool, not a replacement**: "It does NOT change PASS/MISMATCH
decisions — it runs beside the existing pipeline (sidecar)."

## What Remains

1. **Run Step 0 diagnostic**: For 5 zero-belief files, check `event.aliasPath` on every
   `fileAbsent` event. Determine whether the absences target the primary path or a different
   alias. This decides whether the fix is belief-preservation or alias-path scoping.
2. **Implement the fix** per `~/.claude/plans/read-users-matkatmusicllc-desktop-claude-structured-iverson.md`:
   - If `fileAbsent` targets the correct path: add `cloneBeliefWithText` to
     `api/track-line-states.js`, save last populated belief before `fileAbsent` clears it,
     use it for the verdict when final belief is empty.
   - If alias-path confusion: scope `fileAbsent` handling to only clear belief when the
     absence event's `aliasPath` matches the file's primary path.
3. **Add tests** to `tests/test-track-line-states-verdict.js` (177 lines, room for ~30 more):
   Write → fileAbsent → verify verdict uses historical belief.
4. **Re-run Engine B probe** and compare before/after: the 78 zero-belief MISMATCH files should
   move to PASS.
5. **Fix `tools/probe-engine-b.js` bugs from the rename pass**: `require.runMain` should be
   `require.main` (Node.js built-in); `payload.printTestSummary` should be `payload.summary`
   (the key from `buildResultsPayload`). These were introduced by the 252-function rename
   session and break the CLI entry point.

## Key Files
- `~/.claude/plans/read-users-matkatmusicllc-desktop-claude-structured-iverson.md` — the approved plan (post-rename function names)
- `tools/probe-engine-b.js` — Engine B-only probe (has 2 rename bugs in CLI entry, see item 5)
- `tools/probe-results-engine-b.json` — Engine B-only results (750 files)
- `tools/probe-results-v2.json` — Engine A+B combined results (750 files)
- `api/track-line-states.js` (185 lines) — the tracker; main modification target
- `api/line-belief.js` (246 lines) — belief model; `applyFileAbsent` at line 154 clears belief
- `api/final-line-verdict.js` — `buildFinalVerdict` / `compareLineForVerdict`; unchanged by fix
- `api/promote-per-line-status.js` — `checkVerdictPerLinePerfect` (renamed from `verdictIsPerLinePerfect`)
- `api/file-events-extractors.js` — event extraction; confirmed working correctly for Write events
- `tests/test-track-line-states-verdict.js` (177 lines) — verdict tests; target for new tests
- `tests/track-line-states-fixtures.js` — `trackFixture`, `stampJsonlRecordTimestamp` (renamed from `withTimestamp`)
- `plans/handoff-develop-20260619-0130.md` — the function-rename handoff (252 renames)
- `plans/per-line-state-sidecar-plan.md` — original sidecar spec (30KB)

## Plan File
`/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-structured-iverson.md`

## Context the Next Agent Won't Have
- **The 252-function rename introduced 2 bugs in `probe-engine-b.js`**: (1) `require.runMain` on line 131 should be `require.main` — it's a Node.js built-in, not a user function. (2) `payload.printTestSummary` on lines 125-126 should be `payload.summary` — the key name comes from `buildResultsPayload` in `probe-v2-report.js`, which uses `summary`. The CLI entry point is broken until these are fixed.
- **Write events ARE working in Engine B**. Confirmed by tracing `fibonacci.py`: `extractFileEvents` returns 8 events from the first transcript including a `write` at line 183. The write creates full per-line belief (14 lines). The problem is downstream — `fileAbsent` events erase it.
- **`cloneEntriesForTimeline` in `line-belief.js` omits the `.text` field** — it's for timeline persistence, not verdict comparison. A new `cloneBeliefWithText` is needed in `track-line-states.js` that includes `.text`.
- **`line-belief.js` is at 246/250 lines** — cannot add functions there. Any new helpers go in `track-line-states.js` (185 lines, 65 lines of headroom).
- **`test-output-data.js` is NOT a test** — it's a browser data fixture (`window.JSONL_RAW`). Exclude it from `for f in tests/test-*.js` sweeps: `[ "$f" = "tests/test-output-data.js" ] && continue`.
- **The user challenged the "recreated outside tracked transcripts" claim**. The plan was updated to include Step 0 (alias-path investigation) before committing to a fix. Do NOT assume the `fileAbsent` events target the correct path without checking `event.aliasPath`.
- **Coding standards**: 4-space indent, verb-first function names, one condition per `if` (no `&&`/`||`), 250-line file cap. The rename handoff established the naming principle: "The name IS the documentation."

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# All tests pass (exclude browser fixture):
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" || { echo "FAIL: $f"; exit 1; }; done

# Python tests:
python3 -m pytest tests/test_run_all_scenarios.py

# Engine A gate unchanged:
node tests/verify-unified-scenarios.js

# Engine B probe (after fixing the 2 rename bugs in probe-engine-b.js):
node tools/probe-engine-b.js \
  --projects-dir /Users/matkatmusicllc/Programming/jot-recovery/probe-fixture-20260615/projects \
  --snapshots /Users/matkatmusicllc/Programming/jot-recovery/probe-fixture-20260615/file-history
```
