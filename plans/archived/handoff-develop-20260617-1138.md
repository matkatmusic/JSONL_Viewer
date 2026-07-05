# Handoff: Roadmap Item 9 (replaceAll splice across ALL runs) — SHIPPED; pick the next open item
Conversation name: implement RevEng item 9 — replaceAll splice across all runs (indexed-hartmanis)
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is **UNTRACKED by
design** (`git status --short` → 18 `??` entries + one pre-existing `M` on `.gitignore`, +6 lines,
unrelated). **No commit was made this session** — this project commits nothing during normal work; the
committed source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline),
**UNCHANGED this session** (item 9 is tracker-only and needed no re-baseline).

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code JSONL
transcripts, driving toward 100% reconstruction (`plans/roadmap-100-percent-reconstruction.md`, 17 items).
**Items 1–9 are now closed.** This session implemented and shipped item 9 end-to-end. The next agent picks
and executes the next open roadmap item (planning → strict red-green TDD → verify).

## Current State
**Item 9 (replaceAll splice across ALL runs) is IMPLEMENTED, VERIFIED, and DOCUMENTED — done, nothing
pending.** Built via strict red-green TDD. What changed:
- `api/edit-splice.js` (135 L → **173 L**): added internal `locateAllRunsContaining(runs, oldString)` and
  `applyReplaceAllToBelief(belief, splice, unixMs, refForLine)`; `applyEditToBelief` now branches on
  `splice.replaceAll` (one guard line). The `replaceAll:true` path splices **every** known run containing
  `old_string` (bottom-run-first, descending `startLine`) and floats below an unknown gap. The
  `replaceAll:false` path is **byte-identical**. `module.exports` unchanged (the two new functions are
  internal). Reuses `applyLocatedSplice`/`rebuildEntriesForSplice`/`firstGapLine`/`applyFloating` unchanged.
- `tests/test-edit-splice.js` (100 L → **220 L**): +6 tests (exemplar + 5), **12 pass / 0 fail**.
- `plans/implementation-notes-item9-replaceall.md` — NEW design record + gate results.
- `plans/roadmap-100-percent-reconstruction.md` — item 9 flipped `[ ]`→`[x]` with a `✅ DONE 2026-06-17`
  block (line 255), planning sub-bullets replaced (item-8 convention).

**Gates GREEN (all re-run this session):** full suite **59 suites / 607 passed / 0 failed** (was 601; +6);
detect-rewinds **15 / 0**; probe A/B vs `develop-baseline` **identical: true** (no re-baseline); sidecar
`track-line-states.js` on `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts=233 —
UNCHANGED**. Both `edit-splice.js` (173 L) and `test-edit-splice.js` (220 L) are under the 250-line cap.

## What Remains
1. **Pick the next open roadmap item and PLAN it** (per `~/.claude/guides/planning.md`: exact belief
   construction + exact assertions, every line defensible). Open items and the roadmap's suggested order
   (line 252, with item 9 now done → **13 → 10a → 11 → 12 → 10**, then 14–17):
   - **13.** Git rung on the reference ladder (roadmap line 350).
   - **10a.** Precise-cp: seed transcript discovery from the alias closure, not just `[target]` (line 300;
     a nested prerequisite for item 10 — "land 10a first").
   - **11.** `floatingOverKnownRegion` conflict record (line 313). NOTE: shares the floating flag with
     item 9, which **can newly reach `floatingOverKnownRegion`** (dep note, line 321).
   - **12.** Collapse conflict cascades (line 330).
   - **10.** Time-aware alias windows for mid-timeline renames (line 278) — largest/riskiest §B item; land
     10a first. **Temporal cut = tracker-only.**
   - **14.** Trailing-extent mismatch class (line 379). **15.** Promote per-line verdict into probe verdict
     logic (line 401). **16.** Run the sidecar over list2 (line 423). **17.** Unify the two read-event
     scanners (line 443).
2. **Implement via strict red-green TDD** (`~/.claude/guides/tdd.md`: granular one-behavior tests,
   `test_<behavior>` names, plain-English step comments; RED before GREEN).
3. **Verify** with the standard gate suite (How to Verify), then write `implementation-notes-item<N>-*.md`
   and flip the roadmap item — flip **only after** the sidecar check is confirmed (get sign-off first if
   `plate_summary.py` numbers move from 247/247, conflicts=233).

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` (42 KB) — **authoritative** item list. Read the chosen
  item's block AND the §B Constraints/order header (lines ~248–253) before planning.
- `api/edit-splice.js` (173 L) — item 9's home; `applyEditToBelief` (entry), `applyReplaceAllToBelief`,
  `locateAllRunsContaining`, `locateInRuns`, `applyLocatedSplice`, `rebuildEntriesForSplice`,
  `firstGapLine`, `applyFloating`.
- `tests/test-edit-splice.js` (220 L) — item 9 tests; **near the 250 cap** → put new tests for *other*
  items in a sibling file (item-8 precedent: `tests/test-array-tool-use-result.js`).
- `api/line-belief.js` — reference: `knownRuns` (:34), `firstGapLine`, `applyWrite` sets `eofConfirmed`,
  entry shape. Not modified by item 9.
- `api/apply-one-event.js` (:28) — sole consumer of `applyEditToBelief`; reads `result.floating` /
  `result.floatingOverKnownRegion` (directly relevant to item 11).
- `plans/implementation-notes-item9-replaceall.md` — item 9 design record (descending-order rationale,
  located+gap float change, documented missing-key limitation, gate results).
- `plans/handoff-develop-20260617-1111.md` — the plan-phase handoff that fed this session.

## Plan File
The item-9 plan at `/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-indexed-hartmanis.md`
is **fully executed** (no longer active). There is **no active plan** for the next item — the next agent
should create one for the item they choose.

## Context the Next Agent Won't Have
- **Item 9 is tracker-only — probe A/B MUST stay `identical: true`.** `api/edit-splice.js`'s ONLY caller is
  `api/apply-one-event.js` (the sidecar). The probe (`tools/probe-projects-v2.js`) replays whole content
  via `api/edit-replay.js` and **never calls `edit-splice.js`**. Treat any probe divergence as a bug, NOT a
  re-baseline trigger. (This corrected an earlier item-8 handoff that wrongly warned item 9 could move
  probe output.) General re-baseline rule: only a `collectTouches`/discovery change can move probe output;
  everything else stays byte-identical.
- **Descending-`startLine` splice order in `applyReplaceAllToBelief` is MANDATORY** (adversarially
  validated with a counter-example). All targets are captured up front from one `knownRuns` call, then
  spliced bottom run first so each splice only shifts lines below it — higher runs keep their captured
  coordinates without re-deriving runs. Do NOT let anyone "simplify" the sort away;
  `test_replaceAll_authorsNewLinesBelowEachOccurrenceAcrossRuns` guards it.
- **Item 9 introduced a real (currently dormant) behavioral change:** a located `replaceAll` over a belief
  WITH an open unknown gap now returns `floating:true` (was `false`) and unanchors numbering below the gap.
  It was DORMANT on `plate_summary.py` (247/247 unchanged). A future fixture whose history exercises
  multi-run or gap-float `replaceAll` WILL move sidecar numbers — that is the intended correctness
  improvement; characterize the delta and **get user sign-off before flipping a roadmap item** if numbers
  move. Item 11 builds on this (shares the floating flag).
- **Style for surgical edits in `edit-splice.js` + `test-edit-splice.js`:** **2-space indentation + `var` +
  one-condition-per-`if`** (no `&&`/`||`; nesting ≤3) — NOT the global 4-space default (surgical-changes
  rule). The **250-line cap is hook-enforced on the WHOLE file, including tests**; both files are near it.
- **A Stop hook (`PostToolBatch`) auto-runs the test suite after every edit and BLOCKS on test failures.**
  This is expected during the RED phase and clears at GREEN — don't mistake a RED block for breakage.
- **Lint noise to ignore:** the TS language server flags unused `var result =` in test bodies (TS 6133 —
  drop the binding when the test asserts on belief state, not the return) and a benign "CommonJS module
  may be converted to ESM" advisory (TS 80001) on every `.js` file (pre-existing).
- **User process:** enforces `~/.claude/guides/planning.md` (no ambiguity — exact test construction +
  expected values) and `~/.claude/guides/tdd.md` (granular tests, step comments). A plan draft was rejected
  for ambiguity earlier in the item-9 chain; plans must be exact.
- **cwd `/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
  JSONL); the RevEng project (CONSUMER) is the subdir `RevEng/`.** Run ALL git + tests from `RevEng/`; the
  cwd itself is not a git repo.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. No code is pending, so all gates pass at
the current baseline; confirm before starting the next item, then re-run after each TDD cycle.
```bash
# 0. Item-9 unit file (expect 12 passed):
node tests/test-edit-splice.js 2>/dev/null | grep -E "passed,|FAIL:"

# 1. Full suite (currently 59 suites / 607 passed / 0 failed):
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 3. Probe A/B vs develop-baseline on the FROZEN fixture (MUST stay "identical: true"):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# 4. Sidecar e2e (plate_summary.py) — compare to 247/247, 0 mismatched, conflicts=233:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null
```
