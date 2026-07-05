# Handoff: Roadmap Item 13 (git rung on the reference ladder) — DONE; item 16 now unblocked
Conversation name: implement RevEng item 13 — git rung on the reference ladder
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is **UNTRACKED
by design** (`git status --short` → `?? ` for `api/`, `tools/`, `tests/`, `plans/`, etc. + a
pre-existing `M .gitignore`, 6 insertions, unrelated — UNCHANGED this session). This project commits
nothing during normal work; the committed source mirror lives on **`develop-baseline`** (tip
`880b69d`, the item-5.6 re-baseline), **UNCHANGED this session** (item 13 is probe-byte-identical).
Run ALL git + tests from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the JSONL),
NOT a git repo. `RevEng/` (CONSUMER) is the subdir git repo.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, then scores its final belief against the *best available reference*. Item 13 added
a **git rung** to the sidecar CLI's reference ladder so files deleted/moved since the session (the
probe's `NOT_FOUND` / off-disk class) can be scored from git when neither on-disk nor a snapshot
exists. **Item 13 is COMPLETE and was the load-bearing unblock for item 16** (run the sidecar over
list2). The next agent should pick up the §C chain — most naturally **item 16**, then **item 15**.

## Current State
**Item 13 implemented and verified GREEN; roadmap marked `[x]` (line 458).** Production change is
sidecar/reference-only — the probe is byte-identical, no re-baseline.

Files this session (all UNTRACKED working-tree changes, on `develop`):
- NEW `api/reference-ladder.js` (60 L, 4-space) — `resolveGitReference(target, aliasPaths, transcriptTexts)`.
- NEW `tests/test-reference-ladder.js` (184 L) — 8 unit tests (real temp git repos, git-guarded).
- NEW `tests/test-track-line-states-reference.js` (139 L) — 5 CLI ladder-ordering tests.
- EDITED `tools/track-line-states.js` (127→147 L, in-place 2-space) — require + git rung in
  `chooseReference` + `transcriptTexts` read in `main()` + `chooseReference` exported.
- EDITED `plans/roadmap-100-percent-reconstruction.md` — item 13 `[x]` + completion summary.
- NEW `plans/implementation-notes-item13-git-rung-reference-ladder.md` — the design record.

Four gates GREEN (2026-06-17): full suite **64 suites / 648 passed / 0 failed**; detect-rewinds
**15/15**; probe A/B vs `develop-baseline` **`identical: true`** (NO re-baseline, `880b69d`
unchanged); sidecar `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts=8**
(UNCHANGED — plate compares on-disk, git rung dormant there). **Payoff (before/after, frozen fixture,
list2 off-disk file `jot/skills/debate/scripts/debate-orchestrator.sh`):** `develop-baseline` CLI →
`comparedVia=none`, empty verdict; item-13 CLI → `comparedVia=git`, `{matchedObserved:23,
mismatched:1}`. The file is now scoreable.

## What Remains
Roadmap §B order was `13 → 10a → 9 → 11 → 12 → 10`; §A/§B/§D items 1–12 + 10a are all `[x]`. Item 13
is now `[x]`. Remaining open items: **16, 15, 14, 17, 18** (and the deferred items 2-`cp`, 6, 7 stay
deferred). The §C chain header says **13 → 16 → 15**. Execute in this order:

1. **Item 16 — Run the sidecar over list2** (§C, NOW UNBLOCKED by item 13). Drive
   `tools/track-line-states.js` (or `trackLineStates(events,{reference})` directly) across list2's
   MISMATCH (106) + NOT_FOUND (64) targets in `tools/probe-results-v2.json` `filesNotInProject`,
   reusing each entry's `aliasPaths`/`transcriptsUsed`/`gitRef`. The 64 NOT_FOUND files needed the git
   rung (now present); the 106 MISMATCH already had a reference. Produces per-line verdicts for item 15.
   **Re-read the frozen `tools/probe-results-v2.json` for current list2 counts before planning** (the
   roadmap's "103+68" is stale; this session observed PASS 265 / MISMATCH 106 / NOT_FOUND 64, plus 24
   list2 files the probe already scored `comparedVia=git`).
2. **Item 15 — Promote per-line verdict into probe verdict** (consumer of 13 + 16). Add a NEW status
   (proposal `PASS-PER-LINE`) when probe MISMATCH but `finalVerdict.perLineStats.mismatched === 0`.
   **MUST discuss the status name with the user FIRST; MUST NOT silently merge into PASS.** The 160
   on-disk MISMATCH files (54 list1 + 106 list2) can run WITHOUT item 13.
3. **Item 14 — Trailing-extent mismatch class** (most independent; no dep on 13/15/16/17). Two MISMATCH
   files differ by one phantom trailing `''`; decide real-blank vs extractor-artifact and fix the named
   materializer if artifact.
4. **Item 17 — Unify the two read-event scanners** (parity refactor). **Item 18 — first-class
   `userModified`** (dormant/defensive, item-8 class).

Plan each chosen item per `~/.claude/guides/planning.md` + `tdd.md`; no active plan exists for 14–18.

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — authoritative item list; read the chosen item's block
  AND §C header (~480) before planning. Item 13 summary is at ~line 477.
- `plans/implementation-notes-item13-git-rung-reference-ladder.md` — item-13 design record (the
  alias-closure `filePathMap` choice, the macOS realpath test fix, the payoff numbers).
- `api/reference-ladder.js` — the git rung. `resolveGitReference` scans transcripts most-recent-LAST,
  resolves repoRoot from each session's `cwd`, tries every alias basename against `buildMultiRefs`.
- `tools/track-line-states.js` — the sidecar CLI; `chooseReference` (`:69-80`) now on-disk → snapshot →
  git → none; `main()` builds `transcriptTexts` in the `jsonls` loop; `chooseReference` is exported.
- `api/reconstruction-reference-sources.js` — the PROBE's parallel ladder (`gatherGitSource` :165,
  `chooseReferenceSource` :72); item 15 adds the new status near `:75`.
- `api/final-line-verdict.js` — `buildFinalVerdict` (`:46`); accepts `via:'git'`, early-returns only on
  `'none'`; `perLineStats` shape `{matchedObserved, matchedPresumed, mismatched, neverObserved}`.
- `tools/probe-projects-v2.js` (289 L, AT cap) / `tools/probe-v2-report.js` / `tools/probe-v2-shared.js`
  — probe driver/report/counts; item 15's promotion belongs in a NEW sibling (probe file is at cap).
- `tools/probe-results-v2.json` — frozen list2 data for item 16 (`filesNotInProject`).
- `tests/test-git-file-state.js:257-272` — the canonical real-temp-git-repo test scaffold (now with the
  `fs.realpathSync` canonicalization, see below).

## Plan File
None active. `~/.claude/plans/noble-floating-volcano.md` (the item-13 plan) is fully executed — no
longer active. The next agent creates a plan for the item they choose.

## Context the Next Agent Won't Have
- **The plan's baseline numbers were STALE.** The item-13 plan/handoff stated baseline `61 suites / 619
  passed`, `conflicts=233`. Item 12 had ALREADY shipped, so the real going-in baseline was `62 / 635`
  and `conflicts=8` (233 collapsed into 8 `collapsedCascade` records). Post-item-13 is `64 / 648`.
  Don't trust a handoff's baseline number — measure it (commands below).
- **macOS `/var` → `/private/var` symlink trap in temp-git-repo tests.** `os.tmpdir()` yields
  `/var/folders/...` but `git rev-parse --show-toplevel` (inside `resolveRepoRootWalkingUp`) returns the
  realpath `/private/var/...`; `computeRepoRelativePath` (`git-file-state.js:19`) then sees the target
  NOT prefixed by repoRoot and returns null — a correct module fails RED for the WRONG reason. Fix is
  TEST-ONLY: wrap `ctx.tempDir(...)` in `fs.realpathSync` so target + cwd + repoRoot share one prefix
  (real sessions already do). Both new test files do this; reuse it for any future git-repo fixture.
- **`!== null`, never truthiness, for git content.** A git-tracked EMPTY file returns `''`, a VALID
  scored reference. `resolveGitContentMultiRef` keys on `content !== null` (`git-file-state.js:71`); the
  module and the CLI rung both do too. `if (content)` would collapse `''` → `via:'none'` and silently
  un-score empty files. Test 6 (unit) + the empty-string ordering test lock this.
- **CLI `chooseReference` ≠ probe `gatherGitSource`.** They are different functions in different
  modules; the probe never calls the CLI's selector. That is WHY this change is probe-byte-identical and
  needs no re-baseline. Item 15 will touch the PROBE side (`reconstruction-reference-sources.js`) — that
  IS probe-reachable and will need the additive-status characterization, not a reconstruction re-baseline.
- **In-place edits to existing 2-space files stay 2-space; NEW files are 4-space.** `tools/track-line-
  states.js` was edited in 2-space to match; `api/reference-ladder.js` + the two test files are 4-space.
  The deep-nesting hook counts in 2-space units but allows up to 3 block-nesting levels (`for`→`if`→body
  is fine, as in `conflict-cascade-collapse.js`); avoid multi-line 4-space object literals inside nested
  blocks.
- **The write hook auto-runs `tests/test-<basename>.js` after each source write and reports RED/GREEN as
  a Stop-hook "blocking error".** This is the red-green signal, not a failure to fix — it does not block
  the write. Editing a test file runs that test file directly; editing `tools/track-line-states.js` runs
  the ENGINE test `tests/test-track-line-states.js` (NOT the CLI ordering test — run that one manually).
- **Never run the probe against live `~/.claude/projects`/claude-data — it self-contaminates.** Probe
  gates and any CLI smoke run against the FROZEN fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/projects`. The sidecar e2e (`plate_summary.py`) runs
  against `~/Programming/jot-recovery/claude-data` — that is fine (a fixed file, not the probe).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# 1. Full suite (expect 64 suites / 648 passed / 0 failed):
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. The two new item-13 suites in isolation (8 + 5, all PASS or git-skip):
node tests/test-reference-ladder.js 2>/dev/null
node tests/test-track-line-states-reference.js 2>/dev/null

# 3. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 4. Probe A/B vs develop-baseline on the FROZEN fixture (MUST stay "identical: true"):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# 5. Sidecar e2e (plate_summary.py) — expect 247/247, 0 mismatched, conflicts=8:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length, "via="+d.finalVerdict.comparedVia)'

# 6. Item-13 payoff smoke (optional; off-disk list2 file now scores vs git on the FROZEN fixture):
node tools/track-line-states.js --path /Users/matkatmusicllc/Programming/jot/skills/debate/scripts/debate-orchestrator.sh \
  --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects --out /tmp/smoke13.json >/dev/null 2>&1
node -e 'var d=require("/tmp/smoke13.json");console.log("via="+d.finalVerdict.comparedVia, JSON.stringify(d.finalVerdict.perLineStats))'
```
