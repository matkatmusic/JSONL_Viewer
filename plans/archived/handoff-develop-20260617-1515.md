# Handoff: Roadmap Item 12 (collapse conflict cascades) — PLANNED, ready to implement
Conversation name: plan RevEng item 12 — collapse conflict cascades
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → many `??` entries + a pre-existing `M .gitignore`,
unrelated — UNCHANGED this session). This project commits nothing during normal work; the committed
source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline),
**UNCHANGED this session** (planning only). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the subdir. No `develop-plate` branch exists.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction
(`plans/roadmap-100-percent-reconstruction.md`). Items 1–10 + 10a are closed; item 11
(`floatingOverKnownRegion` conflict record) is PLANNED (`plans/handoff-develop-20260617-1452.md`).
This session **PLANNED roadmap item 12** — collapse the per-line conflict-record **cascades** that
appear when one untracked insertion of K lines shifts every downstream line, producing N conflict
records for one logical event. Item 12 replaces each such cascade with ONE synthetic record. It is
**cosmetic on the diagnostic `conflicts` list only** — belief and the per-line verdict are NOT
touched. The next agent EXECUTES the item-12 plan via strict red-green TDD. **No item-12 code was
written this session.**

## Current State
**Planning only — no code changes this session.** The RevEng working tree is UNCHANGED from the
item-10/11 handoffs; the only `git diff` is the pre-existing `M .gitignore` (6 insertions,
unrelated). The four gates were GREEN at baseline (per the item-11 handoff; NOT re-run here, nothing
changed): full suite **61 suites / 619 passed / 0 failed**; detect-rewinds **15/0**; probe A/B vs
`develop-baseline` **`identical: true`**; sidecar `plate_summary.py` **247/247 matchedObserved, 0
mismatched, conflicts=233**.

The item-12 plan is COMPLETE and ready at **`~/.claude/plans/giggly-roaming-adleman.md`** (conformant
to `~/.claude/guides/planning.md`, `tdd.md`, `coding-standards.md`). It was reconciled against the
item-11 handoff: item 12 coexists with item 11's floating conflict variant. **Ordering:** the
roadmap's suggested order is `… 9 → 11 → 12 → 10`, so item 11 should land first
(`~/.claude/plans/calm-jingling-cookie.md`); item 12's plan is robust either way — its skip-guard is
harmless if no floating records exist yet. **Confirm ordering with the user** before starting.

## What Remains
Execute in this order (full detail + exact test list and code snippets in
`~/.claude/plans/giggly-roaming-adleman.md`):

1. **(Coordinate) item 11 first.** Per the roadmap order, implement item 11 from its handoff
   (`plans/handoff-develop-20260617-1452.md` → `~/.claude/plans/calm-jingling-cookie.md`) before
   item 12, unless the user says otherwise. Item 12 does not strictly block on it (the skip-guard is
   inert without floating records), but the e2e baseline and the floating-record shape come from item 11.
2. **Item 12 — Step 0 (no code):** confirm the four baseline gates are green
   (`plans/handoff-develop-20260617-1252.md` § How to Verify). Record the going-in `conflicts` count
   (233) and `perLineStats` for `plate_summary.py`. **Audit** existing `trackLineStates`-driven tests
   (`tests/test-track-line-states.js`, `-verdict.js`, `-originalfile.js`, fixtures) for any case
   producing ≥2 consecutive same-moment conflicts the collapse would merge (note them for Phase 3).
3. **Phase 1 (RED→GREEN):** add the 13 pure-unit tests from the plan to NEW
   `tests/test-conflict-cascade-collapse.js`, one behavior each, watching each FAIL first
   (`isPerLineConflict` skip-guard, `groupConflictsByMoment`, `splitIntoConsecutiveLineRuns`,
   `computeShiftOffset` insertion/deletion/reject, `buildCollapsedConflictRecord`,
   `collapseConflictCascades` collapse/single/floating-passthrough/mixed/purity, `describeCollapsedConflict`).
4. **Phase 2 (GREEN):** create `api/conflict-cascade-collapse.js` (**4-space**, pure, no IO) to pass
   Phase 1: `collapseConflictCascades(conflicts)` → partition per-line vs pass-through (floating) →
   group by `(timestampOfContradictingRecord, window.fromBeaconMs, window.toBeaconMs)` → split into
   consecutive-line runs → per run, confirm a constant-offset shift via REUSED `lineDiff`
   (`api/line-diff.js`) with criterion `2*ctxCount >= run.length` (run≥2) → replace with one
   `kind:'collapsedCascade'` record (span, count, signed `shiftOffset`, `memberLines`). ≤250 lines.
5. **Phase 3 (RED→GREEN + wire):** add the integration test
   `test_trackLineStates_collapsesStaleBeliefSnapshotVerifyCascade` (in
   `tests/test-track-line-states-verdict.js` if it has room, else a new sibling), watch RED, then wire:
   (a) `api/track-line-states.js` — add `var cascadeCollapse = require('./conflict-cascade-collapse');`
   and change the return's `conflicts: conflicts,` → `conflicts:
   cascadeCollapse.collapseConflictCascades(conflicts),`; (b) `tools/track-line-states.js`
   `printConflicts` — add ONE `kind === 'collapsedCascade'` branch calling
   `cascadeCollapse.describeCollapsedConflict(c)` (cap-tight file: if it overflows 250, move per-line
   formatting into the new module). Update any tests flagged in Step 0.
6. **Run the four gates.** `perLineStats` MUST stay **247/247, 0 mismatched** (independent of
   conflicts — if it moves, STOP, the collapse wrongly touched belief/verdict). `conflicts` drops
   **233 → N** BY DESIGN (purely per-line cascades; item-11 floating is dormant here). Probe A/B MUST
   stay byte-identical; detect-rewinds 15/0; full suite green.
7. **Document + flip.** Write `plans/implementation-notes-item12-collapse-conflict-cascades.md`;
   re-baseline the `233 → N` number in the roadmap baseline line, the item-12 gate text, and
   `plans/handoff-develop-20260615-1833.md` § How to Verify. Flip item 12 `[ ]`→`[x]` in the roadmap
   ONLY after the sidecar check is confirmed and the user signs off on N.

## Key Files
- `~/.claude/plans/giggly-roaming-adleman.md` — **THE plan** (item-12 steps, full test list, exact
  snippets, decisions). Read this first.
- `api/conflict-cascade-collapse.js` — **NEW module to create** (4-space, pure): the collapse logic.
- `api/track-line-states.js` (153 L) — `buildConflictRecord` / `appendConflictRecords` /
  `trackLineStates`; add the require + change the `conflicts` return field. Locate by SYMBOL.
- `api/line-diff.js` — **REUSE** `lineDiff(a, b)` → `[{op:'ctx'|'del'|'add', text}]` (LCS). Internal
  `buildLcsDp`/`traceLcs` are NOT exported — use `lineDiff`.
- `api/line-belief.js` (238 L) — mirror the `knownRuns` consecutive-run arithmetic;
  `conflictAgainstExisting` shows the per-line conflict-info shape.
- `api/line-state-evidence.js` (245 L, **AT CAP**) — `makeExcerpt` (REUSE; tolerates `null`); **do
  NOT edit** this file.
- `api/final-line-verdict.js` (66 L) — `buildFinalVerdict`/`perLineStats` computed from
  `belief.entries` + reference, INDEPENDENT of the conflicts array; **NO edit** (this is why item 12
  is safe for item 15).
- `tools/track-line-states.js` (~232 L, **cap-tight**) — `printConflicts` is the SOLE production
  consumer of `conflicts[]`; add one `kind:'collapsedCascade'` branch.
- `tests/test-conflict-cascade-collapse.js` — **NEW** unit-test file (hook runs it for the module).
- `tests/test-track-line-states-verdict.js` (~74 L) — home for the integration test (if room).
- `plans/roadmap-100-percent-reconstruction.md` — item-12 brief (§B); flip when done.
- `plans/handoff-develop-20260617-1452.md` — item-11 handoff (the floating conflict variant shape).
- `plans/handoff-develop-20260617-1252.md` — § How to Verify has the EXACT four-gate commands.
- `plans/implementation-notes-item4-bash-reads.md` — the canonical `plate_cli.py 0→34` cascade example.

## Plan File
`~/.claude/plans/giggly-roaming-adleman.md` — item-12 implementation steps + full test list + decisions.
Active and ready; not yet executed. (Per the item-11 precedent, the plan lives under `~/.claude/plans/`
and is REFERENCED from this handoff — it is NOT copied into `RevEng/plans/`.)

## Context the Next Agent Won't Have
- **Cosmetic only — belief and `perLineStats` are NOT touched.** `perLineStats` is computed in
  `final-line-verdict.js` from `belief.entries` + the reference, entirely independent of the
  `conflicts` array (verified by reading the code). Collapsing conflicts therefore cannot change
  item-15's raw per-line stats. This is the whole reason item 12 is safe — preserve it.
- **`result.conflicts` has exactly ONE non-test consumer:** `printConflicts`
  (`tools/track-line-states.js`). Verified by grep — no viewer reads it; the `tools/line-state-reports/*.json`
  are outputs, not consumers. So replacing `result.conflicts` inside `trackLineStates` is safe.
- **Item-11 coexistence is REQUIRED even though item 11 is dormant on real data.** Item 11
  (record-shape "Option B") adds a discriminated floating record: `kind:'floatingOverKnownRegion'`,
  **`line: null`**, carrying `window`/`timestampOfContradictingRecord`/`excerpt`. Item 12 MUST skip
  any record without a numeric `line` (`isPerLineConflict`: `typeof line === 'number'`) and pass it
  through untouched — otherwise `null`-line arithmetic corrupts grouping. The plan has the
  pass-through test. Item-11 floating never fires on `plate_summary.py` (conflicts stays 233), so the
  `233 → N` drop is ENTIRELY per-line cascades.
- **Collapsed record uses `kind:'collapsedCascade'`** (mirrors item-11's additive `kind` convention)
  so `printConflicts` is a clean branch. Existing per-line records carry NO `kind`; floating records
  render via the EXISTING per-line printer format (`line:null` prints as `"null"`, never crashes —
  item 11 makes NO printer change). Item 12 adds exactly ONE printer branch.
- **Criterion = LCS-overlap-dominates** (`2*ctxCount >= run.length`, run ≥ 2) via reused `lineDiff`.
  Subtlety: a BOUNDED insertion cascade produces ops `[K adds][large ctx][K dels]` — inserted lines
  appear as adds at the run's top, and the old tail lines pushed past the run's bottom appear as dels.
  So a strict "single boundary block" test would WRONGLY reject it; the overlap-dominates threshold is
  what correctly accepts it. `shiftOffset` = signed count of the LEADING non-ctx op run (+ for adds =
  insertion, − for dels = deletion).
- **Total-deletion (Bash `rm`) cascades are OUT OF SCOPE** — `observedText` is all `null` →
  `ctxCount === 0` → not collapsible → those records stay per-line. Intentional: item 12 targets
  constant-offset SHIFTs ("insertion of K lines at L"), not whole-file removal.
- **The e2e `conflicts` number changes BY DESIGN.** `233 → N` is the intended re-baseline (the roadmap
  says so). But `perLineStats` MUST stay `247/247, 0 mismatched` — if it moves, STOP, the collapse
  touched belief/verdict (a bug). Get user sign-off on N before flipping the roadmap item.
- **INDENTATION = 4-space (USER PREFERENCE).** New code (the entire new module) uses the global
  4-space standard even though RevEng's files are 2-space; new functions are **4-space ISLANDS** — do
  NOT reflow surrounding 2-space code. In-place edits (the require line, the return-field change, the
  `printConflicts` branch) match the local 2-space. (Saved memory: `global-4space-indent-overrides-match-existing`.)
- **Concurrent multi-session project.** Items 9 and 10 landed while item 11 was planned; item 11 was
  planned while item 12 was planned. Line anchors SHIFT — locate edit sites by **symbol, not line
  number**, and **re-read each file immediately before editing**. A failed Edit `old_string` match
  means the file changed out-of-band → re-read and re-target; never force a retry.
- **250-line WRITE cap is hook-enforced per file (incl. tests).** `tools/track-line-states.js` is
  cap-tight — if the `printConflicts` branch overflows, move the per-line formatting into a
  `describeLineConflict` export on the new module. New tests go in a NEW sibling file if a suite would
  exceed 250 lines.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. The exact four-gate commands are in
`plans/handoff-develop-20260617-1252.md` § How to Verify. Summary of expected post-item-12 state:
1. **Full suite** — green; +~14 tests (13 unit + 1 integration), +1 suite. 0 failed.
2. **detect-rewinds** — 15 passed / 0 failed (tracker-only change).
3. **Probe A/B vs `develop-baseline` (`880b69d`)** — `identical: true` (the probe never calls
   `trackLineStates`).
4. **`plate_summary.py`** — `247/247 matchedObserved, 0 mismatched` (**UNCHANGED**); `conflicts` drops
   **233 → N** (**CHANGED BY DESIGN** — record N, re-baseline, user sign-off). Exact command:
   ```
   node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
     --out /tmp/plate-check.json
   node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'
   ```
