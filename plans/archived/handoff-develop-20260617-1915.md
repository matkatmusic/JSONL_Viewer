# Handoff: Roadmap Item 16 (run the sidecar over list2) — PLANNED (survey → defer + reopen-gate tool), ready to implement
Conversation name: Plan RevEng item 16 — run the sidecar over list2
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`, UNCHANGED this session — this was a
PLANNING session, no code written. Working tree is UNTRACKED by design (`git status --short` → many
`??` + a pre-existing unrelated `M .gitignore`). The committed source mirror lives on
**`develop-baseline`**, currently `a8947fc` (item-15 re-baseline), UNCHANGED this session. Run all git +
tests from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `…/Desktop/claude code src`
is the Claude Code TS source (PRODUCER of the JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the git repo.

## Goal
Close roadmap item 16 — "run the sidecar over list2" (the probe's `filesNotInProject`). Item 15 already
drove the sidecar over list2's **MISMATCH** files in-probe (106 → 50, +56 `PASS_PER_LINE`), so the only
residual is the **64 NOT_FOUND** files. Those have no on-disk copy, no snapshot, and (verified) **0 of
64 are git-recoverable**, so item 16 ships as a **SURVEY → DEFER** mirroring items 6/7: a read-only
reopen-gate tool + tests + survey note + roadmap checkbox. No production probe/belief code is added.

## Current State
**Planning COMPLETE; implementation NOT started.** The plan is written and user-approved in scope
(user explicitly chose "Survey + reopen-gate tool" over "note only" and "build the driver anyway").
- Plan authored: `plans/plan-item16-list2-notfound-survey.md` (and `~/.claude/plans/peaceful-tumbling-phoenix.md`).
- No tests run this session beyond a read-only `node -e` census of the 64 NOT_FOUND files. Per the
  item-15 handoff, going-in gates were: full suite 66/673 (but `tests/test-*.js` may now be 68 files —
  re-measure, do not trust the 66), detect-rewinds 15/15, plate e2e 247/247 conflicts=8, probe A/B
  identical vs `a8947fc`.
- Empirical finding driving the plan: full 64-file census + live CLI-sidecar runs against representative
  NOT_FOUND targets → `{noRepo:31, repoButNoRef:33, RECOVERABLE:0}`. Path classes: 14 foreign
  `/home/user/repo/*`, 11 `~/.claude/plans`+`/root/.claude/plans` (not a repo), 6 `jot-worktrees/*`,
  1 `jot-recovery/*`, 31 `~/Programming/jot/*` gitignored (`.plate`/`Debates`/`Todos`), 1 other.

## What Remains
Implement the plan (`plans/plan-item16-list2-notfound-survey.md`), in this order, strict red-green TDD:
1. **Write the test suite first** `tests/test-spike-item16-list2-notfound-yield.js` (~6 tests, ≤250 L) —
   watch each fail RED before writing the helper: `test_selectNotFoundList2_picks_only_status_NOT_FOUND`,
   `test_classifyNotFoundTarget_returns_noRepo_when_repo_root_is_null`,
   `test_classifyNotFoundTarget_returns_repoButNoRef_when_repo_resolves_but_file_uncommitted`,
   `test_classifyNotFoundTarget_returns_RECOVERABLE_when_file_committed_at_HEAD`,
   `test_summarizeYield_sets_viable_false_when_RECOVERABLE_is_zero`,
   `test_summarizeYield_sets_viable_true_when_RECOVERABLE_at_least_one`.
2. **Build the tool** `tools/spike-item16-list2-notfound-yield.js` (~120-150 L) using
   `tools/spike-item6-context-mode-yield.js` as the template — git/fs IO behind `require.main===module`,
   export pure helpers `selectNotFoundList2`/`classifyNotFoundTarget`/`summarizeYield`. Reuse
   `api/reference-ladder.js resolveGitReference`, `api/git-file-state.js`
   (`resolveRepoRootWalkingUp`/`resolveGitContentMultiRef`/`buildMultiRefs`), and
   `api/transcript-parsers.js extractSessionMetadata`. Drive helpers to GREEN.
3. **Write the survey note** `plans/implementation-notes-item16-list2-notfound-survey.md`, mirroring
   `plans/implementation-notes-item7-timestampless-survey.md`: include the census table, why git can't
   reach them, the reopen trigger (`viable`/`RECOVERABLE>=1`), and the outcome (MISMATCH half via item 15).
4. **Mark the roadmap** — flip item 16 `[ ]`→`[x]` (line ~531) in
   `plans/roadmap-100-percent-reconstruction.md` with the deferred-outcome summary.
5. **Run all gates** (see How to Verify); confirm probe A/B `identical: true` (byte-identical → NO
   re-baseline). Then write a completion handoff.

## Key Files
- `plans/plan-item16-list2-notfound-survey.md` — THE plan to implement (read first).
- `tools/spike-item6-context-mode-yield.js` — template for the new spike tool (read-only spike pattern).
- `plans/implementation-notes-item7-timestampless-survey.md` — survey-note structure to mirror.
- `api/reference-ladder.js` (`resolveGitReference`, `:46`) — call for parity with the CLI git rung.
- `api/git-file-state.js` (`resolveRepoRootWalkingUp :88`, `resolveGitContentMultiRef :65`, `buildMultiRefs :51`).
- `api/transcript-parsers.js` (`extractSessionMetadata`) — per-transcript cwd/branch.
- `api/promote-per-line-status.js` — item-15 in-probe promotion; **read only, do NOT edit** (guard stays `=== 'MISMATCH'`).
- `tools/probe-results-v2.json` — list2 = `filesNotInProject`; the 64 NOT_FOUND entries the tool reads.
- `plans/handoff-develop-20260617-1858.md` — the item-15 handoff (predecessor context).

## Plan File
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-item16-list2-notfound-survey.md`
(duplicated at `/Users/matkatmusicllc/.claude/plans/peaceful-tumbling-phoenix.md`).

## Context the Next Agent Won't Have
- **Item 16's MISMATCH half was already shipped by item 15** (in-probe promotion). Do not rebuild it.
  Item 16's only residual is the 64 NOT_FOUND files.
- **The item-15 handoff is WRONG on one point:** it claims item 13's git rung makes the 64 NOT_FOUND
  files scoreable. It does not — verified 0/64. Item 13's rung is in the sidecar CLI; the failure for
  these files is upstream (no repo on this machine, or gitignored/never-committed), which no rung fixes.
- **Do NOT extend in-probe promotion to NOT_FOUND.** For NOT_FOUND, `decision.usedSource` is `null`, so
  `reference.content = decision.usedSource.content` would throw a TypeError; and a `via:'none'` reference
  makes `buildFinalVerdict` early-return → `mismatched===0` *vacuously* → false promotion. **Keep the
  `=== 'MISMATCH'` guard; never relax to `!== 'PASS'`** (the item-15 handoff says the same).
- **Item 16 adds NO probe code → probe A/B MUST stay byte-identical → NO re-baseline** (contrast item 15,
  which re-baselined `880b69d → a8947fc`). If probe A/B diverges, something is wrong.
- **Going-in suite count is uncertain:** the item-15 handoff says 66/673 but `tests/test-*.js` may now be
  68 files. Measure the going-in number with gate #1 before starting; expect +1 suite after item 16.
- **The reopen lever is data, not code:** the 31 `~/Programming/jot/*` files only become recoverable if
  their gitignored `Debates`/`.plate`/`Todos` artifacts get committed; the foreign `/home/user`+`/root`
  files need their source machine. When the spike's `RECOVERABLE >= 1`, reopen item 16 and build the
  standalone batch driver (candidate B) as production code.
- **Never run the probe against live claude-data** (self-contaminates); use the frozen fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/`.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# 1. Full suite — measure going-in first, then expect +1 suite, 0 failed:
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. New item-16 suite (expect 6 passed):
node tests/test-spike-item16-list2-notfound-yield.js 2>/dev/null | grep -E "passed,|FAIL:"

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

# 6. Spike smoke (current state = NON-VIABLE): expect counts.RECOVERABLE 0, viable false:
node tools/spike-item16-list2-notfound-yield.js
```
