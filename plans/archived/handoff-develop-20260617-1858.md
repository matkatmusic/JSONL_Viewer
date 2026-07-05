# Handoff: Roadmap Item 15 (promote per-line verdict into the probe — `PASS_PER_LINE` status) — DONE, re-baselined
Conversation name: implement RevEng item 15 — promote per-line verdict (PASS_PER_LINE)
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`, **UNCHANGED** this session. The whole
working tree is **UNTRACKED by design** (`git status --short` → 19 `??` entries + a pre-existing
`M .gitignore`, unrelated — UNCHANGED this session). This project commits nothing during normal work;
the committed source mirror lives on **`develop-baseline`**, advanced this session **`880b69d → a8947fc`**
(item-15 re-baseline, temp-index source mirror). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `/Users/matkatmusicllc/Desktop/claude
code src` is the Claude Code TS source (PRODUCER of the JSONL), NOT a git repo. `RevEng/` (CONSUMER)
is the subdir git repo.

## Goal
The RevEng probe (`tools/probe-projects-v2.js`) scored each reconstructed file PASS / MISMATCH /
NOT_FOUND by **pure byte-equality**. The separate sidecar engine (`api/track-line-states.js`) builds a
richer per-line belief (items 1–12) and scores it via `api/final-line-verdict.js` →
`finalVerdict.perLineStats`. **Item 15**: after the probe assigns MISMATCH, re-score the file per-line
against the SAME reference, and when the verdict is per-line-perfect, relabel it with a NEW,
separately-counted status **`PASS_PER_LINE`**. Reconstruction bytes are never touched — only the status
label and summary counts change. **DONE: 98 of 160 on-disk MISMATCH files promoted.**

## Current State
**Item 15 COMPLETE and gate-clean.** All code written via strict red-green TDD (each test watched RED
first). Gates (re-run after every cycle, final state):
- Full suite: **66 suites / 673 passed / 0 failed** (going-in was 65/657 — +1 suite, +16 tests).
- detect-rewinds: **15/15** (UNCHANGED).
- Sidecar e2e `plate_summary.py`: `{matchedObserved:247, mismatched:0, neverObserved:0}` conflicts=**8**
  (UNCHANGED — item 15 touches no belief/conflict/verdict code).
- Probe A/B vs new `develop-baseline` (`a8947fc`): **`identical: true`**.

**Payoff (probe A/B vs old baseline `880b69d`, characterized record-by-record):** every change is
exactly `MISMATCH → PASS_PER_LINE`; **0 added/removed records, 0 provenance diffs** (reconstruction
bytes byte-identical, only `status` moved).
- list1 (`filesInProject`): MISMATCH **54 → 12** (+42 PASS_PER_LINE); `actionablePassRate` **82.9 → 96.2**.
- list2 (`filesNotInProject`): MISMATCH **106 → 50** (+56 PASS_PER_LINE); `actionablePassRate` **60.9 → 73.8**.
- PASS (261/265) and NOT_FOUND (0/64) UNCHANGED. **98 total flips.** (Item 14 had already landed, so
  the EOF/phantom-trailing class is included in the 98.)

Re-baseline (user-signed-off): `develop-baseline` `880b69d → a8947fc` via the verbatim temp-index
source-mirror method (item 5.6 §). **Rollback: `git update-ref refs/heads/develop-baseline 880b69d`.**

## What Remains
Item 15 is fully closed. Remaining roadmap items, in the §C load-bearing order **16 → (15 already done) → 17 → 18**:
1. **Item 16 — run the sidecar over list2.** Item 13 (git rung) landed, so the 64 NOT_FOUND list2
   files now have a git reference; drive the sidecar across list2's MISMATCH + NOT_FOUND targets.
   Item 15's promotion already runs inside the probe, so item 16 is mainly about confirming/extending
   coverage to the NOT_FOUND set now that they are scorable.
2. **Item 17 — unify the two read-event scanners** (`extractReadEdits` vs `extractReadEvents`); parity
   refactor, byte-identical scanner output required across all three repointed callers. A plan is
   already in flight in a parallel session (see `plans/handoff-develop-20260617-*` item-17 drafts).
3. **Item 18 — first-class user-edit tracking via `userModified`** (DORMANT/defensive, item-8 class).

## Key Files
- `api/promote-per-line-status.js` — **NEW** 55 L pure module (4-space): `promotePerLineStatus`
  (guard `=== 'MISMATCH'`; `reference={via: decision.comparedVia, content: decision.usedSource.content}`;
  `extractFileEvents` per transcript × aliasPaths → `trackLineStates` → verdict),
  `verdictIsPerLinePerfect` (`mismatched===0` AND `neverObserved===0`), `gatherFileEventsAcrossTranscripts`.
- `tests/test-promote-per-line-status.js` — **NEW** 10 tests (5 pure `verdictIsPerLinePerfect`,
  2 pass-through, 3 temp-JSONL integration).
- `tools/probe-v2-shared.js` — `countByStatus` +`PASS_PER_LINE:0` bucket; `computeActionablePassRate`
  Option A (counts `PASS_PER_LINE` in numerator AND denominator).
- `tools/probe-v2-report.js` — `summarizeList` +1 `PASS_PER_LINE` field (`buildFileRecord` copies
  `decision.status` verbatim → the literal auto-propagates; no other change).
- `tools/probe-v2-assembly.js` — `maybePromotePerLine(decision, identity, assembled, snapshotsDir)`
  thin adapter + `require('../api/promote-per-line-status')`.
- `tools/probe-projects-v2.js` — **289 L, AT cap** — net-zero wrap of `decision` at `:206` (no new
  line, no new import; `assembly` already required at `:21`).
- `tests/test-probe-v2-shared.js` / `-report.js` / `-assembly.js` — added tests.
- `plans/implementation-notes-item15-pass-per-line.md` — full per-phase notes + decisions.
- `plans/roadmap-100-percent-reconstruction.md` — item 15 marked `[x]` (line ~564) with the summary.

## Plan File
`/Users/matkatmusicllc/.claude/plans/breezy-purring-rainbow.md` (the executed item-15 plan).

## Context the Next Agent Won't Have
- **Mechanism is the REAL engine, not a string compare.** A reductive `splitContentLines` byte-class
  compare was explicitly rejected during planning. Item 15 runs `extractFileEvents → trackLineStates →
  perLineStats` — that catches more than the trailing-newline class (the sidecar's items-1–12 belief
  vindicates files the byte-probe fails).
- **Criterion is stricter than the roadmap's literal `mismatched === 0`:** also requires
  `neverObserved === 0`. A line the belief never witnessed buckets as `neverObserved`, never
  `mismatched`, so an empty/partial belief passes `mismatched===0` **vacuously**. Drop the second
  guard only if the literal criterion is later preferred.
- **The guard MUST be `=== 'MISMATCH'`, never `!== 'PASS'`.** NOT_FOUND has `comparedVia:'none'`,
  whose verdict early-returns empty stats → `mismatched===0` vacuously → a `!== 'PASS'` guard would
  wrongly upgrade every NOT_FOUND file. (Verified: NOT_FOUND counts stayed 0/64.)
- **`probe-projects-v2.js` cannot grow** (289 L, over the 250 WRITE cap; the hook reports the size on
  every edit but a **net-zero** edit to the already-over-cap file IS permitted — confirmed this
  session). The only edit there wraps `decision` through the already-imported `assembly` module.
- **`transcriptsUsed[].jsonl` is absolute** (from `orderedTranscripts[t].transcriptPath`) → fed
  straight to `extractFileEvents`. Conservative trade-off: a transcript that reads-but-never-edits the
  file is absent from `transcriptsUsed`, so its observations are omitted → slightly more
  `neverObserved` → a few files may stay un-promoted (under-promote, never over-promote).
- **Re-baseline method (reuse verbatim, do not improvise):** temp-index source mirror —
  `GIT_INDEX_FILE=/tmp/bl-idx git read-tree --empty; git add -- <mirror set>; git write-tree;
  git commit-tree <tree> -p develop-baseline -m '…'; git update-ref refs/heads/develop-baseline <commit>`.
  Mirror set: `api common tools tests diff jfred unified viewer web-shared copy-scenario-outputs.py
  jsonl-tree-viewer.ts run-all-scenarios.py LICENSE README.md .gitignore`. This never touches `develop`'s
  working tree or the real index. Full detail in `plans/implementation-notes-item5.6-bashread-touches.md:79`.
- **Probe A/B diffing uses Node fs-walk + JSON-compare**, never recursive `grep`/`diff` (established
  gate mechanic). **Never run the probe against live claude-data** (self-contaminates); use the frozen
  fixture `~/Programming/jot-recovery/probe-fixture-20260615/`.
- The `computeActionablePassRate` Option-A RED test asserts **50.0** (the plan predicted the pre-fix
  value as 25.0; it is actually 33.3 — RED still held).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# 1. Full suite (expect 66 suites / 673 passed / 0 failed):
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. New item-15 suite (expect 10 passed):
node tests/test-promote-per-line-status.js 2>/dev/null | grep -E "passed,|FAIL:"

# 3. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 4. Probe A/B vs develop-baseline (a8947fc) on the FROZEN fixture (MUST be "identical: true"):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# 5. Sidecar e2e (plate_summary.py) — MUST be 247/247, 0 mismatched, conflicts=8:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'

# 6. Smoke: probe summary carries PASS_PER_LINE:
node -e 'var j=require("./tools/probe-results-v2.json"); console.log(JSON.stringify(j.summary))'
```
