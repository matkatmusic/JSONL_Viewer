# Handoff: Roadmap Item 15 (promote per-line verdict into the probe — new `PASS_PER_LINE` status) — PLANNED, ready to implement
Conversation name: plan RevEng item 15 — promote per-line verdict (PASS_PER_LINE)
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is **UNTRACKED
by design** (`git status --short` → 19 `??` entries + a pre-existing `M .gitignore`, 6 insertions,
unrelated — UNCHANGED this session). This project commits nothing during normal work; the committed
source mirror lives on **`develop-baseline`** (tip `880b69d` — "Re-baseline (item 5.6): bash-read
discovery touches"), **UNCHANGED this session** (planning only). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `/Users/matkatmusicllc/Desktop/claude
code src` is the Claude Code TS source (PRODUCER of the JSONL), NOT a git repo. `RevEng/` (CONSUMER)
is the subdir git repo.

## Goal
The RevEng probe (`tools/probe-projects-v2.js`) scores each reconstructed file **PASS / MISMATCH /
NOT_FOUND** by **pure byte-equality** of its edit-replay against the best reference. The separate
**sidecar engine** (`api/track-line-states.js`) builds a richer per-line belief from all the event
kinds added in items 1–12 and scores it via `api/final-line-verdict.js` → `finalVerdict.perLineStats`.
Today the probe **never invokes the sidecar** (0 references). **Item 15**: after the probe assigns
MISMATCH, run the sidecar against the **same reference the probe compared**, and when the per-line
verdict is perfect, relabel the file with a NEW, separately-counted status **`PASS_PER_LINE`**.
Reconstruction bytes are never touched — only the status label and summary counts change. It runs
**today** on the **160 on-disk MISMATCH files** (54 `list1` + 106 `list2`) without items 13/16. The
next agent EXECUTES the plan via strict red-green TDD. **No item-15 code was written this session.**

## Current State
**Planning only — no code changes this session.** Working tree UNCHANGED from the item-12/13/14
handoffs; the only tracked `git diff` is the pre-existing `M .gitignore` (unrelated). Items 1–12 are
closed; **items 13 (git rung) and 14 (trailing-extent mismatch class) are PLANNED/in-flight in
parallel sessions** (`plans/handoff-develop-20260617-1603.md`, `…-1658.md`) and may land before item
15 starts — both are gate-neutral re: the probe baseline (`develop-baseline` stays `880b69d`). The four
standing gates were GREEN at the post-item-12 baseline (per the item-12 handoff
`plans/handoff-develop-20260617-1548.md`; NOT re-run here): full suite ≈ **62 suites / 635 passed / 0
failed** (items 13/14 each add suites/tests — **read the newest handoff and record the going-in count
at Phase 0**, do not trust ≈62); detect-rewinds **15/15**; probe A/B vs `develop-baseline`
**`identical: true`**; sidecar `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts =
8 collapsedCascade**.

The item-15 plan is COMPLETE and ready at **`/Users/matkatmusicllc/.claude/plans/breezy-purring-rainbow.md`**
(conformant to `~/.claude/guides/planning.md`, `tdd.md`, `coding-standards.md`,
`single-condition-branching.md`, `verify-work.md`). It was built from a verified file:line map of the
probe status pipeline and the sidecar engine API, and validated by two parallel design agents against
live source; every file:line claim in it was confirmed by reading the actual files.

**Three user decisions were taken this session (do NOT re-litigate):** status literal **`PASS_PER_LINE`**
(SCREAMING_SNAKE; MUST NOT fold into PASS); `actionablePassRate` **counts `PASS_PER_LINE` as a pass**
(Option A — numerator + denominator, so flips raise the rate); `buildMismatchesSkeleton` **keeps**
`PASS_PER_LINE` files in the findings list (**no change** there — it already matches `status !== 'PASS'`).

## What Remains
Execute in this order (full detail — module body, the test list, exact diffs, the gate/re-baseline
steps — is in the plan file):

1. **Phase 0 (no code):** confirm the four standing gates are green and record going-in numbers; read
   `tools/probe-results-v2.json` `summary` (baseline: `list1 {315, PASS 261, MISMATCH 54}`,
   `list2 {435, PASS 265, MISMATCH 106, NOT_FOUND 64}`). **Cap probe:** confirm the WRITE hook permits
   a *non-growing* edit to `tools/probe-projects-v2.js` (289L, over the 250 cap); if it blocks even
   net-zero writes, use the Phase 4 contingency (relocate the two retry helpers to `probe-v2-assembly.js`).
2. **Phase 1 (RED→GREEN) — new pure module.** Create `tests/test-promote-per-line-status.js` with
   `require('../api/promote-per-line-status')` → RED `Cannot find module`. Create the 4-space module
   `api/promote-per-line-status.js` (body in the plan): `promotePerLineStatus(decision, aliasPaths,
   transcriptJsonlPaths, snapshotsDir)` (guard `=== 'MISMATCH'`; build `{via: decision.comparedVia,
   content: decision.usedSource.content}`; loop `extractFileEvents` per transcript + merge; call
   `trackLineStates`; upgrade on a perfect verdict), `verdictIsPerLinePerfect` (the criterion —
   **`mismatched === 0` AND `neverObserved === 0`**), `gatherFileEventsAcrossTranscripts`. Add the unit +
   temp-JSONL integration tests one at a time, each RED first.
3. **Phase 2 (RED→GREEN) — `tools/probe-v2-shared.js`.** `countByStatus` (`:78`): add `PASS_PER_LINE: 0`
   to the initializer. `computeActionablePassRate` (`:27-31`, Option A): include `PASS_PER_LINE` in both
   `passing` and `actionable`. Add the two tests to `tests/test-probe-v2-shared.js` (RED first).
4. **Phase 3 (RED→GREEN) — `tools/probe-v2-report.js`.** `summarizeList` (`:75-84`): add one
   `PASS_PER_LINE: counts.PASS_PER_LINE || 0` field. Test in `tests/test-probe-v2-report.js` (RED first).
   No other report change (`buildResultsPayload`/`buildMismatchesSkeleton`/`buildFileRecord` untouched).
5. **Phase 4 (RED→GREEN) — wire it live.** `tools/probe-v2-assembly.js`: add `var promote =
   require('../api/promote-per-line-status');` + thin adapter `maybePromotePerLine(decision, identity,
   assembled, snapshotsDir)` (maps `identity.aliasPaths` + `assembled.transcriptsUsed[].jsonl` →
   `promotePerLineStatus`); test in `tests/test-probe-v2-assembly.js`. Then the **net-zero** edit to
   `tools/probe-projects-v2.js` return at `:205-206` — wrap `decision` →
   `assembly.maybePromotePerLine(decision, identity, assembled, snapshotBaseDir)` (no new line, no new
   require; `snapshotBaseDir` is the fn's own param at `:177`).
6. **Phase 5 — full probe run, characterize, gate, re-baseline.** Run the probe against the frozen
   fixture; A/B vs `develop-baseline` **diverges by design** — characterize that every flip is exactly
   `MISMATCH → PASS_PER_LINE` with byte-identical reconstruction provenance, summary deltas only,
   detect-rewinds + `plate_summary.py` UNCHANGED; **user sign-off**; re-baseline `develop-baseline` via
   the temp-index-commit / source-mirror method (items 5.5/5.6/12).
7. **Close out.** Mark item 15 `[x]` in `plans/roadmap-100-percent-reconstruction.md` (line 509) with
   the flip count + new `actionablePassRate` + new baseline tip; write
   `plans/implementation-notes-item15-pass-per-line.md`; write a fresh handoff via `/jot:handoff-prompt`.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/breezy-purring-rainbow.md` — the full item-15 plan (module body,
  the red-green test list, exact diffs, gate/re-baseline steps, the flagged design decisions).
- `api/promote-per-line-status.js` — **NEW** ~40L pure module (4-space, flat early-returns):
  `promotePerLineStatus`, `verdictIsPerLinePerfect`, `gatherFileEventsAcrossTranscripts`. Requires
  `api/file-events-extractors.js` (`extractFileEvents`, `:234`) + `api/track-line-states.js`
  (`trackLineStates`, `:152`). No import cycle.
- `tests/test-promote-per-line-status.js` — **NEW** unit (pure) + integration (temp-JSONL) tests; reuse
  `tests/test-helpers.js` + the `trackFixture` pattern from `tests/test-track-line-states-verdict.js:39-61`.
- `tools/probe-v2-shared.js` — `countByStatus` (`:77-84`, +1 bucket at `:78`); `computeActionablePassRate`
  (`:27-31`, Option A).
- `tools/probe-v2-report.js` — `summarizeList` (`:75-84`, +1 field). `buildFileRecord` (`:21-41`) copies
  `decision.status` verbatim → the new literal auto-propagates (no edit).
- `tools/probe-v2-assembly.js` — thin `maybePromotePerLine` adapter + require (has headroom). Only under
  the Phase-4 contingency does it also receive the relocated retry helpers.
- `tools/probe-projects-v2.js` — **289L, AT the 250 cap → net-zero edit ONLY.** Wrap `decision` in the
  `report.buildFileRecord(...)` return at `:205-206`. `assembly` is already required (`:21`),
  `snapshotBaseDir` is a param (`:177`) — no new import, no new line.
- `tests/test-probe-v2-shared.js`, `tests/test-probe-v2-report.js`, `tests/test-probe-v2-assembly.js` —
  added tests.
- `api/final-line-verdict.js` (`buildFinalVerdict:46-62`) — the `perLineStats` source; the consumer,
  **no edit**.

## Plan File
`/Users/matkatmusicllc/.claude/plans/breezy-purring-rainbow.md`

## Context the Next Agent Won't Have
- **Mechanism is the REAL engine, not a string compare.** A design agent that lacked the roadmap text
  proposed a reductive `splitContentLines` byte-class comparison; it was **rejected**. The roadmap §15
  "Home/approach" is explicit: run `extractFileEvents → trackLineStates(events, {reference}) →
  perLineStats`. That is the whole point ("promote the per-line **verdict**") and catches more than the
  trailing-newline class — the sidecar's belief (items 1–12) vindicates files the byte-probe fails.
- **The promotion criterion is INTENTIONALLY stricter than the roadmap's literal `mismatched === 0`.**
  Verified from `api/final-line-verdict.js:46-62`: a line the belief never witnessed buckets as
  `neverObserved`, never `mismatched`, so an **empty/partial belief passes `mismatched === 0`
  vacuously**. The plan requires **`mismatched === 0` AND `neverObserved === 0`** so promotion never
  claims correctness for unseen lines (and the empty-belief case is rejected). Files with full read
  coverage (the EOF/phantom class) still promote. If the user later prefers the literal criterion, drop
  the `neverObserved` guard — but conservative is recommended.
- **THE #1 TRAP — `probe-projects-v2.js` cannot grow.** It is 289L, over the 250 WRITE cap; the hook
  blocks growth. BOTH design agents initially proposed adding a `require` + guard lines there — that
  would be **blocked**. The plan therefore makes the only edit a **net-zero** wrap of `decision` in the
  existing return statement, routed through the already-imported `assembly` module. Verify at Phase 0
  that a non-growing write is permitted; contingency (relocate the two retry helpers `:140-171` to
  `probe-v2-assembly.js`) is in the plan if not.
- **The guard MUST be `=== 'MISMATCH'`, never `!== 'PASS'`.** NOT_FOUND files have `comparedVia: 'none'`,
  whose verdict early-returns empty stats (`final-line-verdict.js:53`) → `mismatched === 0` vacuously →
  a `!== 'PASS'` guard would wrongly upgrade every NOT_FOUND file.
- **No via remap needed.** `decision.comparedVia` is already `'on-disk'|'snapshot'|'git'|'none'` (set at
  `reconstruction-reference-sources.js:79` from `COMPARED_VIA_BY_SOURCE`), exactly the literals
  `buildFinalVerdict` accepts. Reference = `{via: decision.comparedVia, content: decision.usedSource.content}`.
- **`transcriptsUsed[].jsonl` is absolute** (populated from `transcriptPath`) → feed straight to
  `extractFileEvents`, no join. Conservative trade-off (per roadmap): a transcript that *reads but never
  edits* the file is not in `transcriptsUsed`, so its observations are omitted → slightly more
  `neverObserved` → possibly a few un-promoted files. Acceptable (under-promote, never over-promote).
- **Item-14 interaction (payoff magnitude, not mechanism).** Item 14 fixes a systematic Read-tool
  phantom trailing-`''` artifact (found on 32/65 numbered Read results) that currently leaves files at
  sidecar `mismatched === 1`. **Pre-item-14** those are NOT promoted; **post-item-14** they reach
  `mismatched === 0` and DO promote. So item 15's `PASS_PER_LINE` count grows once item 14 lands — run
  item 15 after item 14 to capture the EOF-class promotions, but it is correct standalone. Record the
  flip count as the item-15 finding and note which of items 13/14 had landed.
- **Item 15 touches NO belief/conflict/verdict code** → detect-rewinds (15/15) and the sidecar e2e
  (`plate_summary.py` 247/247, conflicts unchanged) MUST stay byte-for-byte unchanged. Movement there
  means the change leaked — stop and investigate. The probe A/B WILL diverge by design (item-12 class):
  characterize + user sign-off + re-baseline `develop-baseline`. **Never run the probe against live
  claude-data** (self-contaminates); use the frozen fixture `~/Programming/jot-recovery/probe-fixture-20260615/`.
- **`buildMismatchesSkeleton` stays unchanged on purpose** (user choice): `PASS_PER_LINE` files remain in
  the findings skeleton (they're `!== 'PASS'`) so the byte-only/EOF cases stay visible for investigation.
- **Probe A/B diffing uses Node fs-walk + JSON-compare, never recursive `grep`/`diff`** (established gate
  mechanic).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. Exact full-suite + probe-A/B commands
are in `plans/handoff-develop-20260617-1658.md` § How to Verify (also `…-1252.md`, `…-20260615-1833.md`).

1. **New suite fails first, then passes:** `node tests/test-promote-per-line-status.js` (RED
   `Cannot find module` on the first run; GREEN after each step). A *failing* verification: removing the
   `neverObserved === 0` guard makes the coverage-guard case (5 ref lines / 3 belief) wrongly promote.
2. **Counter/rate/summary/adapter suites:** `node tests/test-probe-v2-shared.js`,
   `node tests/test-probe-v2-report.js`, `node tests/test-probe-v2-assembly.js` all green (RED on each
   added assertion first).
3. **Full suite** all-pass (**+1 new suite** `test-promote-per-line-status.js`, plus added tests in three
   existing suites); **detect-rewinds 15/15**; **sidecar e2e `plate_summary.py` 247/247, 0 mismatched,
   conflicts unchanged**.
4. **Probe** runs clean against the frozen fixture; A/B vs `develop-baseline` shows **only**
   `MISMATCH → PASS_PER_LINE` flips + matching summary deltas; characterized, signed off, `develop-baseline`
   re-baselined, then A/B `identical: true`.
5. **Smoke:** `tools/probe-results-v2.json` `summary.list1`/`list2` each carry a `PASS_PER_LINE` field;
   `MISMATCH` dropped by the flip count; a flipped record shows identical reconstruction provenance with
   `status: "PASS_PER_LINE"`.
