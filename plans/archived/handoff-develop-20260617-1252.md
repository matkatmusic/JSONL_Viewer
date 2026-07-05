# Handoff: Roadmap Item 10 (+10a) — time-aware alias windows — SHIPPED; pick the next open item
Conversation name: implement RevEng item 10 — time-aware alias windows
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → 18 `??` entries + a pre-existing `M .gitignore`,
unrelated). **This project commits nothing during normal work**; the committed source mirror lives
on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline), **UNCHANGED this session**
(item 10 is sidecar-only and needed no re-baseline). Run ALL git + tests from `RevEng/`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the subdir.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction
(`plans/roadmap-100-percent-reconstruction.md`, 17 items). **Items 1–10 + 10a are now closed.**
This session implemented and shipped item 10 (+10a) end-to-end. The next agent picks and executes
the next open roadmap item (planning → strict red-green TDD → verify).

## Current State
**Item 10 (time-aware alias windows) + 10a (discovery reseed) are IMPLEMENTED, VERIFIED, and
DOCUMENTED — done, nothing pending.** Built via strict red-green TDD per the plan
(`~/.claude/plans/clever-swinging-toucan.md`). What changed:
- **NEW `api/alias-windows.js`** (113 L): `resolveAliasWindows(seedPaths, stampedOps)` → windowed
  BFS `Map<absPath, latestValidMs>` (`Infinity` = never cut); `aliasPathValidAt`;
  `filterEventsByAliasWindows`. Upper-bound only; cp → directed `dst→src` cut at the copy instant;
  mv/git-mv → undirected, no cut; tightest(min) wins; seed protected; null copy-instant → `Infinity`.
- `api/file-historical-lineage.js` (245→246): +1 line `stampTouchTimestamps(ops, parsed)` in
  `collectTouches` so cp/mv ops carry the copy instant. (`buildLineageGraph`/`gatherAllOps`/
  `resolveAliases`/`editBelongsToFile` left BYTE-IDENTICAL — probe depends on them.)
- **Annotate-then-filter:** every event gets an additive `aliasPath` at its emitter's existing
  membership site (10 sites): `api/file-events-extractors.js` (239→247; authored, originalFile,
  cat, read), `api/structured-patch-events.js` (+1), `api/bash-op-events.js` (+2: rm + redirect),
  `api/bash-read-events.js` (+1), `api/grep-tool-events.js` (+1), `api/snapshot-events.js` (77→95;
  new `matchedAliasPathForSnapshotKey` → annotate the FULL alias path that suffix-matched).
- `tools/track-line-states.js` (117→127): `resolveAliasWindowsForTarget` (build windows from
  `gatherAllOps`, return `{aliasPaths, windows}`); reseed `discoverJsonls` from the closure key-set
  (10a); apply `filterEventsByAliasWindows` before `trackLineStates`.
- Tests: NEW `tests/test-file-historical-lineage-windows.js` (Phase-1 op-stamp; sibling because the
  parent is at the 246-line cap); NEW `tests/test-alias-windows.js` (191 L: 8 unit + authored
  annotation + capstone + snapshot-trap = 11 tests).
- `plans/implementation-notes-item10-alias-windows.md` — design record + gate results + payoff.
- `plans/roadmap-100-percent-reconstruction.md` — items 10 and 10a flipped `[ ]`→`[x]` with
  `✅ DONE 2026-06-17` blocks.

**Gates GREEN (all re-run this session):** full suite **61 suites / 619 passed / 0 failed** (was
59/607; +12 tests, +2 suites); detect-rewinds **15/0**; **probe A/B vs `develop-baseline`
`identical: true`** (sidecar-only; no re-baseline); sidecar `plate_summary.py` **247/247
matchedObserved, 0 mismatched, conflicts=233 — UNCHANGED**. All edited/new files ≤250 lines.

**Payoff confirmed on real data** (baseline `880b69d` vs windowed on IDENTICAL current data):
`jot/RED_GREEN_TDD.md` conflicts **11→0** (the temporal cut dropping 3 post-copy `python-migration`
src edits); `handoff-prompt/SKILL.md` byte-identical to baseline (nothing to cut). See the
implementation notes.

## What Remains
1. **Pick the next open roadmap item and PLAN it** (per `~/.claude/guides/planning.md`: exact
   belief construction + exact assertions, every line defensible). Open items, roadmap's suggested
   order (line ~252) with 9/10/10a now done → **13 → 11 → 12**, then 14–17:
   - **13.** Git rung on the reference ladder (roadmap line ~350). **Recommended next** — it
     UNBLOCKS the §C chain (16 → 15) by giving list2's NOT_FOUND files a reference. Independent of
     9/10/11/12. Tracker/reference-only → probe byte-identical.
   - **11.** `floatingOverKnownRegion` conflict record (line ~313). Shares the floating flag with
     item 9. **STILL DEFER** unless real data triggers it (never fires on the fixture).
   - **12.** Collapse conflict cascades (line ~330). Report-only; e2e `conflicts:233` changes BY
     DESIGN → re-baseline that one assertion.
   - **14.** Trailing-extent mismatch class (line ~379) — most independent. **15.** Promote per-line
     verdict into probe (line ~401; discuss the new status NAME with the user first). **16.** Run
     the sidecar over list2 (line ~423; needs 13 for the NOT_FOUND set). **17.** Unify the two
     read-event scanners (line ~443).
2. **Implement via strict red-green TDD** (`~/.claude/guides/tdd.md`: granular one-behavior tests,
   `test_<behavior>` names, plain-English step comments; RED before GREEN).
3. **Verify** with the standard gate suite (How to Verify), then write
   `implementation-notes-item<N>-*.md` and flip the roadmap item — flip **only after** the sidecar
   check is confirmed (get user sign-off first if `plate_summary.py` moves from 247/247,
   conflicts=233).

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` (~45 KB) — **authoritative** item list. Read the
  chosen item's block AND the §B Constraints/order header (~248–253) before planning.
- `api/alias-windows.js` (113 L) — item 10's home; the windowed closure + predicate + filter.
- `api/file-historical-lineage.js` (246 L) — `collectTouches` (now stamps ops);
  `stampTouchTimestamps` (reused for ops); the four probe-frozen functions live here.
- `api/file-events-extractors.js` (247 L — **3 lines under cap**) — the per-kind emitter
  orchestrator; if the next item needs to grow it, relocate `readEventsForFile`+`catEventsForFile`
  to a new `api/read-cat-events.js` sibling (do NOT grow it).
- `tools/track-line-states.js` (127 L) — the sidecar CLI; Phase-4 window wiring lives in
  `resolveAliasWindowsForTarget` / `main`.
- `api/final-line-verdict.js` — `perLineStats` shape `{matchedObserved, matchedPresumed,
  mismatched, neverObserved}`; the verdict comparison loop.
- `plans/implementation-notes-item10-alias-windows.md` — item 10 design record + the data-drift
  payoff analysis.
- `plans/handoff-develop-20260617-1220.md` — the item-10 plan-phase handoff that fed this session.

## Plan File
`~/.claude/plans/clever-swinging-toucan.md` (item-10 plan) is **fully executed** — no longer
active. There is **no active plan** for the next item; the next agent creates one for the item they
choose.

## Context the Next Agent Won't Have
- **The item-2 cp-spike numbers (2026-06-15) are STALE — never measure payoff against them.** The
  on-disk reference files drift as the user works. To judge a tracker change on live data, run
  `develop-baseline`'s CLI AND the working-tree CLI on the SAME current data and diff — NOT against
  a recorded spike. This session a raw read showed `SKILL.md` "mismatched 3→57" which looked like a
  regression; running `develop-baseline` on current data gave the IDENTICAL 57, proving it was
  on-disk drift, not the change. `RED_GREEN_TDD.md` (conflicts 11→0) is the real, isolated payoff.
- **Un-annotated events are SILENTLY DROPPED by the CLI filter.** In `main`, `windows` is always
  non-null (the seed is always present), so `aliasPathValidAt(windows, undefined, …)` returns
  `false`. Therefore EVERY emitter MUST set `event.aliasPath`; a missed one vanishes from the
  timeline. The `plate_summary.py` e2e (leans on snapshot/read/cat events) is the integration guard
  that all emitters are annotated — if a future event kind is added, annotate it at its membership
  site or plate will silently lose events.
- **Snapshot annotation trap:** snapshots match by repo-relative suffix, so they MUST annotate the
  FULL alias path that matched (`matchedAliasPathForSnapshotKey`), not the repo-relative key — else
  the event's `aliasPath` is not a key in the windows map and it is dropped. Tested.
- **The capstone false-green lesson:** a window-filter end-to-end test that only asserts
  `mismatched===0` can pass for the WRONG reason (a missing annotation drops ALL events → empty
  belief → 0 mismatches). The capstone also asserts `matchedObserved===2` to prove the pre-copy
  write was actually KEPT. Apply the same rigor to any "fewer mismatches" assertion.
- **Probe-safety is load-bearing.** The probe calls `buildLineageGraph`/`gatherAllOps`/
  `resolveAliases`/`editBelongsToFile` but NEVER `extractFileEvents`/`trackLineStates`. Those four
  stay byte-identical; windowing layers ALONGSIDE. Probe A/B MUST stay `identical: true` — any
  divergence is a bug, not a re-baseline.
- **Documented limitations (NOT regressions; reopen triggers in the notes):** (1) lower bound /
  pre-existing destination (the 1 residual RED_GREEN_TDD.md mismatch is this); (2) mv-overwrite of
  an existing path; (3) multi-lineage UNION windows (tightest-min is conservative against bleed).
- **Style:** RevEng is 2-space indent + `var` + CommonJS + ONE condition per `if` (nest; no
  `&&`/`||`; ternaries only for value selection) — NOT the global 4-space default (surgical-changes
  rule). 250-line cap is hook-enforced per file incl. tests; new tests go in NEW sibling files. A
  Stop hook auto-runs `tests/test-<basename>.js` after edits and BLOCKS on failure (expected during
  RED). TS 80001 ("CommonJS may be converted to ESM") + TS 6133 (unused test bindings) are benign.
- **User process:** strict `~/.claude/guides/planning.md` (no ambiguity — exact test construction +
  expected values) and `tdd.md` (granular `test_<behavior>` tests, plain-English step comments, RED
  before GREEN).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. No code is pending, so all gates
pass at the current state; confirm before starting the next item, then re-run after each TDD cycle.
```bash
# 1. Full suite (currently 61 suites / 619 passed / 0 failed):
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
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'
```
