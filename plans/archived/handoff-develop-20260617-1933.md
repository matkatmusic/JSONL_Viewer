# Handoff: Roadmap Item 16 (run the sidecar over list2) — COMPLETE (survey → defer + reopen-gate tool); next is item 17
Conversation name: Implement RevEng item 16 — run the sidecar over list2
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`, UNCHANGED this session (the RevEng
working tree is UNTRACKED by design — `git status --short` → 19 collapsed `??` directory entries + a
pre-existing unrelated `M .gitignore`; new files live inside the already-untracked `tools/`/`tests/`/
`plans/` dirs). The committed source mirror lives on **`develop-baseline`**, currently `a8947fc`
(item-15 re-baseline), **UNCHANGED this session — item 16 added no probe code, so NO re-baseline.** Run
all git + tests from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. The cwd
`…/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the JSONL), NOT a git repo;
`RevEng/` (CONSUMER) is the git repo.

## Goal
Close roadmap item 16 — "run the sidecar over list2" (the probe's `filesNotInProject`). Item 15 already
drove the sidecar over list2's MISMATCH files in-probe (106 → 50 `PASS_PER_LINE`); the only residual was
the 64 NOT_FOUND files. Those have no on-disk copy, no snapshot, and **0 of 64 are git-recoverable**, so
item 16 ships as a **SURVEY → DEFER** (mirroring items 6/7): a read-only reopen-gate tool + tests +
survey note + roadmap checkbox. No production reconstruction/probe code added.

## Current State
**Item 16 COMPLETE — all gates GREEN.** Implemented strict red-green TDD:
- **NEW** `tools/spike-item16-list2-notfound-yield.js` (115 L, 4-space, read-only reopen-gate). IO behind
  `require.main===module`; exports pure helpers `selectNotFoundList2` / `classifyNotFoundTarget` /
  `summarizeYield`. Reuses `api/reference-ladder.js resolveGitReference` (the CLI git rung's EXACT
  resolver, for parity) + `api/git-file-state.js resolveRepoRootWalkingUp` + `api/transcript-parsers.js
  extractSessionMetadata`. Live verdict over all 64 NOT_FOUND: `{noRepo:30, repoButNoRef:34,
  RECOVERABLE:0}`, `viable:false` → **NON-VIABLE**.
- **NEW** `tests/test-spike-item16-list2-notfound-yield.js` (148 L, 6 tests — the RECOVERABLE test uses a
  real temp git repo to prove the gate CAN flip, guarding against a false-permanent DEFER).
- **NEW** `plans/implementation-notes-item16-list2-notfound-survey.md` — the survey deliverable (census +
  why git can't reach the 64 + reopen trigger + outcome).
- **NEW** `plans/implementation-notes-item16-list2-notfound.md` — the `/jot:implement` decision log.
- **EDITED** `plans/roadmap-100-percent-reconstruction.md` — item 16 `[ ]`→`[x]` with the deferred-outcome
  summary.
- **Gates:** full suite **67 suites / 679 passed / 0 failed** (+1 suite, +6 tests vs going-in 66/673 by
  the awk gate method); new item-16 suite 6/0; detect-rewinds 15/0; `plate_summary.py` e2e
  `{matchedObserved:247, mismatched:0, neverObserved:0}` conflicts=8 (UNCHANGED); **probe A/B
  `identical: true`** vs `develop-baseline` `a8947fc` → NO re-baseline.

## What Remains
Item 16 is closed. The next open roadmap item is **17** (the only remaining unchecked box — §D):
1. **Plan + implement item 17 — "Unify the two read-event scanners"** (roadmap lines ~631-661).
   Make `api/split-read-assembly.js extractReadEvents`'s richer per-chunk event the canonical output,
   add a pure `chunkEventToEditRecord` derivation for `api/file-event-observations.js extractReadEdits`'s
   `{type,content}` shape (a one-event `assembleSplitReads` minus multi-chunk stitching), then **repoint
   all three production callers** (`api/file-events-extractors.js:166` `readEventsForFile`;
   `api/edit-stream-extraction.js:146` `appendFilteredReadEdits`, written-files-only;
   `api/file-historical-lineage.js:45` `appendReadTouches`, unfiltered → DISCOVERY) + the CLI + test
   suites. Keep the two filter policies AT the call sites; no forwarding. Likely a new sibling
   `api/read-event-scanner.js` so neither host file overflows the 250 cap.
2. **Gate item 17 carefully (MIXED gate):** repointing `readEventsForFile` + `appendFilteredReadEdits` is
   tracker/replay-internal → must stay byte-identical; but `appendReadTouches` feeds DISCOVERY → either
   hold touch output byte-identical OR re-baseline (same class as items 5/5.5/5.6). **Strict requirement:
   byte-identical scanner output across all three repointed callers.**
3. Item-5.6's notes pre-designate item 17 as ALSO the place to unify bash-read/grep timestampless-result
   handling (`plans/implementation-notes-item5.6-bashread-touches.md:26,105`).

## Key Files
- `plans/plan-item16-list2-notfound-survey.md` — the (now-implemented) item-16 plan.
- `plans/implementation-notes-item16-list2-notfound-survey.md` — item-16 survey deliverable (read for the census + reopen lever).
- `tools/spike-item16-list2-notfound-yield.js` — the reopen-gate tool (run it to re-measure recoverability).
- `tests/test-spike-item16-list2-notfound-yield.js` — its 6-test suite.
- `plans/roadmap-100-percent-reconstruction.md` — item 16 now `[x]`; item 17 is the next `[ ]` (§D).
- For item 17: `api/split-read-assembly.js` (`extractReadEvents`, `assembleSplitReads`),
  `api/file-event-observations.js` (`extractReadEdits`), `api/file-events-extractors.js` (`readEventsForFile`),
  `api/edit-stream-extraction.js` (`appendFilteredReadEdits`), `api/file-historical-lineage.js` (`appendReadTouches`).
- `api/promote-per-line-status.js` — item-15 in-probe promotion; **read only, do NOT edit** (guard stays `=== 'MISMATCH'`).
- `plans/handoff-develop-20260617-1915.md` — the item-16 planning handoff (predecessor context).

## Plan File
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-item16-list2-notfound-survey.md`
(item 16, implemented). No plan file exists yet for item 17 — it must be authored first.

## Context the Next Agent Won't Have
- **Item 16's MISMATCH half was already shipped by item 15** (in-probe promotion). It was NOT rebuilt.
  Item 16's only residual was the 64 NOT_FOUND files.
- **The item-15 handoff is WRONG on one point** (re-confirmed this session): it claims item 13's git rung
  makes the 64 NOT_FOUND files scoreable. It does NOT — the live spike measured 0/64 RECOVERABLE. Item
  13's rung is in the sidecar CLI; the failure for these files is upstream (no repo on this machine, or
  gitignored/never-committed), which no rung fixes.
- **Do NOT extend in-probe promotion to NOT_FOUND.** For NOT_FOUND `decision.usedSource` is `null`, so
  `reference.content = decision.usedSource.content` throws; and a `via:'none'` reference makes
  `buildFinalVerdict` early-return → `mismatched===0` vacuously → false promotion. Keep the
  `=== 'MISMATCH'` guard; never relax to `!== 'PASS'`.
- **`resolveGitReference`'s real signature is `(target, aliasPaths, transcriptTexts)`** — the
  plan/handoff "reuse" notes loosely wrote `(…, gitOpts)`. It derives cwd/branch from each transcript via
  `extractSessionMetadata`; there is no `gitOpts` param. The spike calls the real signature.
- **Suite-count method matters:** `ls tests/test-*.js | wc -l` returns 68/69 raw files, but the project's
  awk gate method counts only files that emit a `passed,` summary line (66 going-in → 67 after item 16).
  The reliable signal is the **delta** (+1 suite, +6 tests), not the absolute. The item-15 handoff's
  "66/673" was the awk count; its "68" was the raw `ls`.
- **The probe A/B gate regenerates the working-tree `tools/probe-results-v2.json`** (fresh `generatedAt`);
  content stays byte-identical to baseline. This is documented gate behavior, not a change to commit.
- **The reopen lever for item 16 is DATA, not code:** the 31 `~/Programming/jot/*` files become
  recoverable only if their gitignored `Debates`/`.plate`/`Todos` artifacts get committed; the foreign
  `/home/user`+`/root` files need their source machine. When the spike's `RECOVERABLE >= 1`, reopen item
  16 and build the standalone batch driver as production code.
- **Never run the probe against live claude-data** (self-contaminates); use the frozen fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/`.
- **250-line WRITE cap is hook-enforced;** one condition per `if` (nest, never `&&`/`||`); strict
  red-green TDD (the Stop hook runs `tests/test-<basename>.js` and blocks on RED).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# 1. Item-16 suite (expect 6 passed):
node tests/test-spike-item16-list2-notfound-yield.js 2>/dev/null | grep -E "passed,|FAIL:"

# 2. Spike smoke (current state = NON-VIABLE; reopen when RECOVERABLE >= 1):
node tools/spike-item16-list2-notfound-yield.js
#   expect {counts:{noRepo:30,repoButNoRef:34,RECOVERABLE:0}, viable:false}

# 3. Full suite — expect +1 suite vs going-in (67 suites / 679 passed / 0 failed):
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 4. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 5. Probe A/B vs develop-baseline (a8947fc) on the FROZEN fixture (MUST be "identical: true"):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# 6. Sidecar e2e (plate_summary.py) — MUST be 247/247, 0 mismatched, conflicts=8:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'
```
