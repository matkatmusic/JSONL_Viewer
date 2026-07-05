# Handoff: Phase 1 git-seed beacon IMPLEMENTED (Items 1–8 green); decide deferred "durable seed" (option B) before Phases 2–4
Conversation name: Plan 'make engine B the main engine' (execution session)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/18508605-dcf5-4fe9-93e7-17541a3bbac4.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; all RevEng source is untracked — nothing was committed this session).
CWD: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
Drive Engine B (the per-line sidecar reconstruction engine, `api/track-line-states.js`) toward 100% file-history
reconstruction and consolidate onto a single engine. This session **executed Phase 1 of the plan — the git-seed
beacon**: seed a line belief from a git commit's file content (a known-good baseline), then replay only the JSONL
events strictly after the commit instant, so a corpus missing edits can still reconstruct from the commit baseline.

## Current State
**Phase 1 Items 1–8 are implemented in strict red-green TDD and all tests pass** (10 new tests green; full JS sweep
green; `pytest` 6 passed; no-seed path byte-identical → opt-in confirmed). No source was committed (branch still at
`1a9f098`). Files are untracked/modified in the working tree.

What was built:
- **Item 1** `readGitCommitTimestamp(repoRoot, sha)` + helper `readCommitterDateRaw` in `api/git-file-state.js` (exported).
- **Items 2–5** NEW `api/git-seed.js`: `seedBeliefFromGitContent`, `buildGitSeedRef`, `filterEventsAfter`, `resolveSeedFromCommit`.
- **Item 6** `opts.gitSeed` wired into `trackLineStates` (one guard block after `lb.createBelief()`); `api/track-line-states.js` now 242/250.
- **Item 7** `--seed-commit <SHA>` CLI flag in `tools/track-line-states.js` (+ `resolveGitSeedOption`, `printSeedSummary`); prints `Seeded from <shortSha> @ <iso>; replaying N post-seed events`. No unit test by design.
- **Item 8** Real-data proof on `util_lib.py` PASSED Item 8's criteria (positive 470/0/0/0, negative still 120 mismatched) — see "Context" for the important caveat.

Tests: `tests/test-git-seed.js` (7 tests, Items 1–5), `tests/test-track-line-states-git-seed.js` (3 tests, Item 6).

## What Remains
1. **DECIDE the deferred "durable seed" question (option B) — this is the gate before Phase 3.** The git seed as built
   is CLOBBERED by any post-seed Tier-1 beacon (`Write`/`snapshot`/`create` → `applyWrite`/`applySnapshotVerify` do
   `belief.entries = {}`). So it repairs a gap only when NO post-seed Tier-1 beacon follows in the corpus. For bulk
   100% on beacon-heavy files, the seed must SURVIVE/reconcile against post-seed beacons instead of being wiped.
   Get the user's design decision before building Phase 3 bulk auto-seed.
2. **Answer the 3 pre-existing Open items** before any of Phases 2–4: (a) bulk auto-seed algorithm (walk-forward to the
   commit matching each file's first JSONL beacon), (b) category-(b) deleted/moved target, (c) Engine A retirement timing.
3. **Phase 2** — `stateAtTimestamp(T)` contract in NEW `api/belief-text-state.js` (`joinBeliefToText`, `stateAtTimestamp`); see plan.
4. **Phase 3** — git categorizer + bulk auto-seed (NEW `git ls-tree -r` wrapper); blocked on items 1+2(a).
5. **Phase 4** — viewer rewiring (`jfred/jfred-load.js:41`) + retire Engine A; blocked on item 2(c).
6. **Optional hardening** (low priority, documented): empty-git-file seeding (`resolveSeedFromCommit` uses `!content`,
   so an empty committed file won't seed); symlinked-path robustness in `computeRepoRelativePath` (`/var` vs `/private/var`).

## Key Files
- `/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md` — THE plan (Phase 1 detailed, 2–4 sketched, Open items).
- `RevEng/plans/implementation-notes-make-engine-b-the-main-engine.md` — **READ THIS**: full design decisions, deviations, and the "Item 8 result" section with the clobber analysis + the option A/B/C decision (user chose C).
- `RevEng/api/git-seed.js` — NEW; the four git-seed primitives (4-space; new-file convention).
- `RevEng/api/git-file-state.js` — `readGitCommitTimestamp` added (2-space; matches file).
- `RevEng/api/track-line-states.js` (242/250) — `opts.gitSeed` guard; reuses `degradeUntouchedToPresumed` (see caveat).
- `RevEng/tools/track-line-states.js` (182L) — `--seed-commit` flag + summary line.
- `RevEng/api/line-belief.js` (246/250 — AT CAP, do NOT add functions) — `makeClaimEntry` reused by the seed.
- `RevEng/api/apply-one-event.js` — `applyWrite`/`applySnapshotVerify` are the clobber sites (relevant to option B).
- `RevEng/tests/test-git-seed.js`, `RevEng/tests/test-track-line-states-git-seed.js` — the new suites.
- `/tmp/gitseed-e2e.js`, `/tmp/gitseed-clobber.js` — throwaway E2E harnesses (synthetic mechanism proof + clobber isolation); not committed, may not survive reboot.

## Context the Next Agent Won't Have
- **Item 8's positive proof is DEGENERATE — do not over-read it.** The 470/0/0/0 positive seeded from a commit
  whose committer date POSTDATES every corpus event, so it replayed **0 events** (the seed alone IS the full file).
  It proves the real plumbing works but NOT post-seed replay-on-seed. Genuine replay-on-seed is proven only by the
  synthetic E2E `/tmp/gitseed-e2e.js`. The general "repair a gap that sits AFTER a post-seed beacon" case is the
  unsolved option B.
- **Why util_lib.py couldn't give a non-degenerate proof (both verified this session):** (1) its Finder→Terminal edit
  (the 8-line "tall" Terminal block ~lines 340–346 + a blank at 386) is UNCOMMITTED — in NO commit — so no commit
  baseline supplies it; (2) the fixture corpus has post-seed Tier-1 beacons that clobber any earlier seed. The fresh
  `~/Programming/jot-recovery/claude-data` corpus already reconstructs 470/0/0/0 WITHOUT any seed (it carries the edit).
- **A real commit `e41f32e` was created in `~/Programming/jot` and then fully reverted.** I path-committed util_lib.py
  (for the Item 8 positive), ran the proof, then `git reset --soft HEAD~1` + unstaged it. The jot repo was left
  BYTE-IDENTICAL: HEAD back at `c201b63`, util_lib.py back to ` M`, 229 uncommitted changes. Do not look for `e41f32e`.
- **Item 6 deviation: the plan said "seeded line 1 reports matchedObserved" — it's actually matchedPresumed.** The
  engine's `degradeUntouchedToPresumed` degrades any seeded line not re-confirmed at a later instant to `presumed`.
  Both are matches; verdict still perfect. Tests assert the honest behavior.
- **Item 7 plan-snippet bug fixed:** the plan called `computeRepoRelativePath(repoRoot, args.path)`, but the real
  signature is `computeRepoRelativePath(filePath, repoRoot)`. Implemented with the correct order + a null-repoRoot guard.
- **Indentation rule (hook-enforced):** the PostToolUse nesting hook keys "deep nesting" on each file's DOMINANT indent.
  New code in the existing 2-space files (`git-file-state.js`, `track-line-states.js`, `tools/track-line-states.js`) is
  2-space; the NEW file `git-seed.js` is 4-space. A 4-space try/catch in a 2-space file trips the hook.
- **Coding standards (Stop hook runs tests on edit):** 4-space-for-new-files, verb-first names, one condition per `if`
  (no `&&`/`||`), 250-line file cap. Exclude `tests/test-output-data.js` from `for f in tests/test-*.js` sweeps.
- **macOS note for E2E harnesses:** `os.tmpdir()` is `/var/...` but git's `--show-toplevel` is `/private/var/...`;
  `realpathSync` the temp dir or `computeRepoRelativePath` returns null and the seed silently no-ops.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# New unit suites (Items 1–6):
node tests/test-git-seed.js                       # 7 passed
node tests/test-track-line-states-git-seed.js     # 3 passed

# Full JS sweep (exclude the browser fixture) + scenarios:
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" >/dev/null 2>&1 || { echo "FAIL: $f"; exit 1; }; done && echo "ALL JS PASS"
python3 -m pytest tests/test_run_all_scenarios.py        # 6 passed

# Real-data Item 8 (degenerate positive + genuine negative control), fixture corpus:
#   F=~/Programming/jot-recovery/probe-fixture-20260615 ; T=~/Programming/jot/common/scripts/util_lib.py
#   (positive needs a commit CONTAINING util_lib.py's current on-disk content — it is currently uncommitted;
#    seed an OLD commit e.g. 625e1b5 for the negative control -> {1,342,120,7}.)

# Regression: node tools/track-line-states.js --path <file>  with NO --seed-commit -> byte-identical to before.
```
