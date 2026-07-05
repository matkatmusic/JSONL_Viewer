# Handoff: Engine B fileAbsent fix shipped; git-seed beacon planned as Phase 1 of the 100%-reconstruction tool
Conversation name: (omitted per handoff rules)
JSONL: (omitted per handoff rules)

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; all RevEng source is untracked).
CWD: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
Drive Engine B (the per-line sidecar reconstruction engine) toward 100% file-history reconstruction,
and consolidate the tool onto a single engine. This session: (1) shipped the Engine B `fileAbsent`
verdict fix from the prior handoff, (2) proved the remaining `util_lib.py` failure was a corpus gap
not an engine bug, and (3) designed the git-seed feature + the final tool shape into a phased plan.
The next agent builds **Phase 1 (the git-seed beacon)**.

## Current State

### Shipped & verified this session (all tests green)
- **Engine B `fileAbsent` verdict fix (belief preservation)** in `api/track-line-states.js`: added
  `cloneBeliefWithText`, `checkGroupHasFileAbsentEvent`, `selectBeliefForVerdict`. Before a group
  containing a `fileAbsent` beacon clears belief, the last populated belief is cloned; when final
  belief is empty AND a reference exists, the verdict uses that historical belief and sets
  `finalVerdict.verdictUsedHistorical = true`. Step 0 (`tools/diagnose-fileabsent-aliaspath.js`,
  new) proved the fix direction was belief-preservation, NOT alias scoping.
- **Tests**: 3 new tests in `tests/test-track-line-states-verdict.js` + `makeFileAbsentLine` helper in
  `tests/track-line-states-fixtures.js`. Verdict suite 9/9 pass.
- **Probe CLI bug fixes**: `tools/probe-engine-b.js:131` and `tools/track-line-states.js:147` —
  `require.runMain` → `require.main` (the entry points were dead). The handoff's prescribed second
  probe fix (`payload.printTestSummary` → `payload.summary`) was WRONG and intentionally NOT applied.
- **Rigorous before/after** (fixture corpus): the fix moved **+56 files MISMATCH→PASS** (531→587),
  zero regressions.
- **Fresh full-corpus probe** against `~/Programming/jot-recovery/claude-data/projects` (1085 jsonls):
  **1281 identities — 966 PASS / 245 MISMATCH / 70 NOT_FOUND**. `util_lib.py` now PASSes (470/0/0/0).
- Plan written: `/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md`.

### Not started
- Everything in the plan (git-seed beacon and beyond). No code for it exists yet.

## What Remains
Execute **Phase 1 of `flickering-marinating-pike.md`** (git-seed beacon, explicit `--seed-commit`,
single file), in order, strict red-green TDD:
1. Add `readGitCommitTimestamp(repoRoot, sha)` to `api/git-file-state.js` (`git show -s --format=%cI`
   via `cp.execFileSync`; return ms via `Date.parse`, null on failure). Export it.
2. Create `api/git-seed.js` (4-space indent): `seedBeliefFromGitContent(belief, content, seedMs, sha)`,
   `buildGitSeedRef(sha, lineNum)`, `filterEventsAfter(events, seedMs)`, `resolveSeedFromCommit(repoRoot, sha, relPath)`.
3. Wire `options.gitSeed = {content, seedMs, sha}` into `api/track-line-states.js` (~4 lines: after
   `lb.createBelief()`, seed belief + `events = gitSeed.filterEventsAfter(events, seedMs)`).
4. Add `--seed-commit` to `tools/track-line-states.js` CLI (resolve repo root + relPath, build
   `options.gitSeed`, pass it in, print a seed summary).
5. Write `tests/test-git-seed.js` and `tests/test-track-line-states-git-seed.js` (the exact cases are
   in the plan).
6. Prove on `util_lib.py`: negative control (seed BEFORE the line-3839 edit, fixture corpus → still
   mismatches) and positive (seed AT/AFTER → 0 mismatched, 0 neverObserved).

Then Phases 2–4 are sketched in the plan; do NOT start them without reading the **3 open items** there
(bulk auto-seed algorithm, category-(b) deleted/moved target, Engine A retirement timing) — the bulk
auto-seed in particular needs the user's fuller explanation before building.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md` — THE plan (Phase 1 detailed, 2–4 sketched, open items).
- `RevEng/plans/implementation-notes-engine-b-fileabsent-fix.md` — full notes on the shipped fix (deviations, Step 0 result, verification).
- `RevEng/api/track-line-states.js` (234/250 lines) — Engine B tracker; `trackLineStates`; gets `options.gitSeed`.
- `RevEng/api/line-belief.js` (246/250 lines — AT CAP, do NOT add functions) — belief model; reuse `makeClaimEntry`.
- `RevEng/api/git-file-state.js` (~196 lines) — git content/ref/rename helpers; add `readGitCommitTimestamp`.
- `RevEng/api/final-line-verdict.js` — `buildFinalVerdict` (unchanged by git-seed; the fix is which belief it sees).
- `RevEng/api/line-state-evidence.js` — `splitContentIntoLineSpans` (reuse to split git content into lines).
- `RevEng/tools/track-line-states.js` — the single-file CLI; add `--seed-commit`.
- `RevEng/tools/probe-engine-b.js` — Engine-B-only probe (now runnable).
- `RevEng/tools/diagnose-fileabsent-aliaspath.js` — Step 0 aliasPath diagnostic (reusable).
- `RevEng/plans/engine-b-mismatches.md` — the 99 fixture mismatches (43 zero-belief / 56 partial), pre-fresh-corpus.

## Plan File
`/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md`

## Context the Next Agent Won't Have
- **The 252-function rename pass introduced a recurring `require.runMain` bug** (the Node API is
  `require.main`). Fixed in 2 tools this session; CHECK OTHER `tools/*.js` for the same dead-entry bug.
- **The Engine A gate reports 28 MATCH / 1 MISMATCH / 4 SKIP, not the handoff's "29/0/4".** The 1
  MISMATCH (a `celsius_to_fahrenheit` scenario) is PRE-EXISTING — proven by disabling the new fix and
  re-running (still 28/1/4). Likely from the rename pass. Out of scope; triage separately.
- **`tools/probe-results-engine-b.json` now reflects the FRESH `claude-data` corpus, not the fixture.**
  The fixture results were backed up to `/tmp/probe-results-engine-b-FIXTURE.json` (may not survive a reboot).
- **`util_lib.py` was never an Engine B bug — it was a corpus gap.** The edit at line 3839 of transcript
  `e32ca8d7-d3a6-490c-9093-4a0de9454ebd.jsonl` (a Finder→Terminal replacement of the `if maximize=="tall":`
  block) was ABSENT from `probe-fixture-20260615` (which has no `-src` project folder) but PRESENT in the
  fresh `~/Programming/jot-recovery/claude-data/projects`. With the full corpus it reconstructs 470/0/0/0.
- **Git-seed design (locked with user):** pass a SHA → `git show <SHA>:<path>` content seeds belief as a
  Tier-1 `observed` beacon (eofConfirmed); then **only replay JSONL events with `unixMs > commit timestamp`**.
  No SHA → reconstruct from JSONL as today (fully opt-in). Defaults: committer date (`%cI`), strictly-after,
  seeded lines `observed`.
- **Decisions locked with user:** (1) **Engine B becomes the SOLE engine** (gains full-text emission +
  git-seed; Engine A retired later; viewers rewired to B). (2) Build git-seed first. (3) "Completed file
  state at any timestamp" is NOT a separate Engine C — it is Engine B's **Phase 2 `stateAtTimestamp(T)`
  contract** (the live belief already holds per-line text every instant; the persisted timeline drops it via
  `cloneEntriesForTimeline`). This is only a FULL file at complete states (`eofConfirmed` + no unknown lines);
  elsewhere it's partial + per-line confidence — that distinction defines which timestamps are 100%-reconstructable.
- **The viewers reconstruct in-browser** via a THIRD path (`api/file-state-history.js` + `api/edit-replay.js`,
  seam `jfred/jfred-load.js:41`), not Engine A or B. Engine B is node-only, so Phase 4 pre-bakes its output to JSON.
- **No `git ls-tree`/`ls-files` exists anywhere** — the git-file-list axis (Phase 3) is net-new.
- **Coding standards** (enforced, with a Stop hook that runs tests on edit): 4-space indent, verb-first names,
  one condition per `if` (no `&&`/`||`), 250-line file cap, "the name IS the documentation". A PostToolBatch
  hook warns when an edited source file has no matching test — ignore for one-off tools/diagnostics.
- **Exclude `tests/test-output-data.js`** from `for f in tests/test-*.js` sweeps — it's a browser data fixture.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# Engine B verdict + full JS sweep (exclude browser fixture):
node tests/test-track-line-states-verdict.js
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" || { echo "FAIL: $f"; exit 1; }; done

# Python + Engine A gate (gate is 28/1/4; the 1 MISMATCH is pre-existing):
python3 -m pytest tests/test_run_all_scenarios.py
node tests/verify-unified-scenarios.js

# After building Phase 1, the new tests + the util_lib.py proof:
node tests/test-git-seed.js
node tests/test-track-line-states-git-seed.js
# Fresh-corpus Engine B probe (sanity; ~1281 identities):
node tools/probe-engine-b.js \
  --projects-dir /Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects \
  --snapshots /Users/matkatmusicllc/Programming/jot-recovery/claude-data/file-history
```
