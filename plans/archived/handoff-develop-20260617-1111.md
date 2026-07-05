# Handoff: Roadmap Item 9 (replaceAll splice across ALL runs) — PLANNED, not yet approved/implemented
Conversation name: plan RevEng item 9 — replaceAll splice across all runs (indexed-hartmanis)
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is **UNTRACKED
by design** (`git status --short` → 18 `??` entries + one pre-existing `M` on `.gitignore`, +6 lines,
unrelated) — UNCHANGED this session (planning only). The committed source mirror lives on
**`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline) — **UNCHANGED this session**.
`git diff develop-baseline` reports "deletions" only as the known all-untracked quirk, NOT real
deletions. No discovery/touch code changed → no re-baseline.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction (`plans/roadmap-100-percent-reconstruction.md`,
17 items). Items 1–8 are closed. **This session PLANNED item 9** (replaceAll splice across all runs).
**No production code was written** — the plan is finalized and was presented for approval, but the user
interrupted before approving it. The next agent's job is to get approval (or apply edits) and then
**execute the plan via strict red-green TDD**.

## Current State
**Item 9 is fully planned and design-validated; nothing implemented.** The plan lives at
`/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-indexed-hartmanis.md`.

What item 9 changes: when an `Edit` has `replaceAll:true`, `api/edit-splice.js` currently splices only
the **first** known run containing `old_string` (`applyEditToBelief` :122 → `locateInRuns` :11),
leaving other known runs stale and silently ignoring occurrences hidden in unknown gaps. The plan makes
the `replaceAll:true` path splice **every** known run and go *floating* below an unknown gap.
`replaceAll:false` is untouched.

The plan was revised once: the first version was rejected by the user for ambiguity. The current
version conforms to `~/.claude/guides/planning.md` (exact belief construction + exact assertions for
every test, every line defensible) and `~/.claude/guides/tdd.md` (granular one-behavior-per-test,
`test_<behavior>` names, plain-English step comments).

Standing gates were GREEN as of the prior handoff (`handoff-develop-20260617-1026.md`): full suite
59 suites / 601 passed / 0 failed; detect-rewinds 15/0; probe A/B `identical: true`; sidecar
`plate_summary.py` 247/247, conflicts 233. **Not re-run this session** (no code changed) — confirm
before starting.

## What Remains
Ordered by execution sequence (the plan file is the authoritative source for exact code + tests):
1. **Execute item 9 plan, strict red-green TDD.** All production changes are in `api/edit-splice.js`
   (135 L → ~157 L): add `locateAllRunsContaining(runs, oldString)` (after :16), add
   `applyReplaceAllToBelief(belief, splice, unixMs, refForLine)` (before :122), and branch
   `applyEditToBelief` on `splice.replaceAll` (the `replaceAll:false` body stays byte-identical).
   - RED first: add the 6 tests in `tests/test-edit-splice.js` (100 L → ~190 L). Exemplar +
     5 specified tests are in the plan with exact setup/edit/assertions. NOTE: only the exemplar,
     test 1 (`authorsNewLinesBelowEachOccurrenceAcrossRuns`), and test 2
     (`floatsBelowUnknownGapWhenRunsLocated`) are truly RED against current code; tests 3–5 are
     regression/parity guards that already pass — label them as such so RED isn't misread.
   - Reuse `applyLocatedSplice`/`rebuildEntriesForSplice`/`splicedRunText`, `firstGapLine`,
     `applyFloating` (all already in `edit-splice.js`) unchanged. Match the file's **2-space / `var` /
     one-condition-per-`if`** style; keep both files ≤250 L.
2. Verify (commands in How to Verify): unit (12 pass), full suite (expect 59 / **607** / 0), detect-
   rewinds 15/0, probe A/B `identical: true` (MUST stay identical — see below), sidecar
   `plate_summary.py` (compare to 247/247, conflicts=233).
3. Write `plans/implementation-notes-item9-replaceall.md` (design record + gate results).
4. Flip roadmap item 9 `[ ]`→`[x]` with a `✅ DONE` block — **only after** the sidecar result is
   confirmed/signed off (see below).
5. Next open roadmap items after 9: 10 / 10a (time-aware alias windows), then 11–17.

## Key Files
- **PLAN:** `/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-indexed-hartmanis.md`
  — authoritative; exact code snippets, all 6 tests with exact construction/assertions, verification.
- `api/edit-splice.js` (135 L) — the only production file changed. `applyEditToBelief` (:122),
  `locateInRuns` (:11), `splicedRunText` (:19), `applyLocatedSplice` (:82),
  `rebuildEntriesForSplice` (:60 — the existing single-splice core, reused unchanged),
  `firstGapLine` (:98), `applyFloating` (:110).
- `tests/test-edit-splice.js` (100 L) — the 6 new tests; existing helpers `beliefWithLines` (:14),
  `ref` (:10), `authoredRefFor` (:21).
- `api/line-belief.js` — reference only: `knownRuns` (:34) (a `text===null` line BREAKS a run, so two
  separate runs REQUIRE a gap), `applyWrite` (:118) sets `eofConfirmed=true`, entry shape. Not modified.
- `api/apply-one-event.js` (:28) — sole consumer of `applyEditToBelief`; reads `result.floating`.
  Reference only; no replaceAll-specific handling needed.
- `plans/roadmap-100-percent-reconstruction.md` — §B item 9 (~line 255); read its Constraints section.
- `plans/handoff-develop-20260617-1026.md` — prior handoff (item 8 SHIPPED); verbatim gate commands and
  the temp-index re-baseline mechanism (NOT needed for item 9 — see below).

## Plan File
`/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-indexed-hartmanis.md`
— finalized, validated, **not yet approved for execution** (user interrupted before approving).

## Context the Next Agent Won't Have
- **CORRECTION to the item-8 handoff: item 9 does NOT move probe output and needs NO re-baseline.**
  The 1026 handoff warned item 9 "CAN move probe output." Verified false this session: the probe
  (`tools/probe-projects-v2.js`) replays whole content via `api/edit-replay.js` and **never calls
  `api/edit-splice.js`** — `applyEditToBelief`'s only caller is `api/apply-one-event.js` (the sidecar
  tracker). So probe A/B MUST stay `identical: true` (treat any divergence as a bug, not a re-baseline
  trigger). The real behavioral signal is the **sidecar** `track-line-states.js` on `plate_summary.py`.
- **Descending-`startLine` splice order is MANDATORY** (adversarially validated by a planning agent
  with a concrete counter-example). Capture all target runs up front from one `knownRuns` call, then
  splice **bottom run first**: each splice only shifts lines below it, so the existing single-splice
  `rebuildEntriesForSplice` stays valid for the not-yet-spliced higher runs **without re-deriving runs**.
  Ascending/source order splices at stale coordinates and corrupts the belief. Test 1 guards this — do
  NOT let anyone "simplify" the descending sort away.
- **The intended behavioral change that may move sidecar numbers:** today a `replaceAll` edit that
  locates a run returns `floating:false` even if an unknown gap exists. The plan makes it return
  `floating:true` and unanchor numbering below the gap (an occurrence could hide there). This is more
  conservative/correct. If `plate_summary.py`'s history contains replaceAll edits spanning multiple
  known runs or with an unknown gap, `perLineStats`/`conflicts` may shift from 247/247, conflicts=233.
  If so: characterize the delta as a correctness improvement and **get user sign-off BEFORE flipping
  the roadmap item.** `gapLine` must be computed AFTER the splices (splices above a gap shift its line).
- **Scope discipline:** `replaceAll:false` is UNCHANGED. The object-with-`edits` "MultiEdit" shape is
  NOT item 9 — that was item 8 (array-shaped `toolUseResult`), and the object-with-edits variant was
  deliberately left unimplemented (0 instances in corpus).
- **Known limitation to document (do NOT code):** two runs separated by a *missing interior key*
  (rather than an `unknown` entry) with `eofConfirmed===true` would let `firstGapLine` return `null`
  and wrongly report non-floating. Unreachable for real inputs (all belief writers produce contiguous
  `1..N` with `unknown` entries for gaps). Add a one-line comment noting it; no code.
- **Style:** match the existing file's **2-space indentation + `var`** (the surgical-changes rule),
  NOT the global 4-space default. One condition per `if` (no `&&`/`||`), nesting ≤3. 250-line cap is
  hook-enforced on the WHOLE file, including tests.
- **Order note:** the roadmap's suggested sequence is 13 → 10a → 9 → 11 → 12 → 10; the user explicitly
  chose to plan **item 9** now anyway.
- **Process:** the user enforces `~/.claude/guides/planning.md` (no ambiguity — exact test
  construction + exact expected values) and `~/.claude/guides/tdd.md` (granular tests, step comments).
  The first plan draft was rejected for ambiguity before being revised.
- **cwd `/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
  JSONL); the RevEng project (CONSUMER) is the subdir `RevEng/`.** Run ALL git + tests from `RevEng/`;
  the cwd itself is not a git repo.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. No code changed this session, so all
gates should currently pass at the prior baseline; confirm before starting, then re-run after each TDD
cycle.
```bash
# 0. Item-9 unit file (after implementing — expect 12 passed):
node tests/test-edit-splice.js 2>/dev/null | grep -E "passed,|FAIL:"

# 1. Full suite (currently 59 suites / 601 passed / 0 failed; after item 9 expect 607 passed):
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

# 4. Sidecar e2e (plate_summary.py) — compare to prior 247/247, 0 mismatched, conflicts=233:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null
```
