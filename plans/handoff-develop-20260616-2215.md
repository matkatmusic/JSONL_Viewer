# Handoff: Item 6 SHIPPED (closed NON-VIABLE); Item 5.5 plan COMPLETE and ready to implement
Conversation name: plan roadmap item 5.5
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. The committed source tree exists ONLY on `develop-baseline` (a ref;
`git log develop` shows just `Initial commit`). On `develop` everything (`api/`, `tools/`, `tests/`,
`plans/`, …) is present but UNTRACKED (`git status` → `??`) — EXPECTED, not a mistake (only
`.gitignore` is tracked). Review changes with `git diff develop-baseline -- <path>`. No `-plate`
branch exists. No uncommitted tracked changes; no open task list.

## Goal
The sidecar (`RevEng/`) rebuilds a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction (roadmap:
`plans/roadmap-100-percent-reconstruction.md`). This session closed roadmap **Item 6** and produced
the full implementation plan for **Item 5.5**. The next agent's job is to **implement Item 5.5** per
that plan.

## Current State
**Item 6 — SHIPPED & CLOSED (NON-VIABLE) this session.** "MCP-tool file reads / context-mode store"
surveyed and closed: context-mode is a ≤14-day purgeable cache, not an archive; it supplies no file
content the JSONL lacks. Delivered: read-only re-run gate `tools/spike-item6-context-mode-yield.js`
(243 L) + `tests/test-spike-item6-context-mode-yield.js` (44 L, 4/4 pass);
`plans/implementation-notes-item6-context-mode-survey.md`; roadmap item-6 box flipped to `[x]`.
Spike on the frozen fixture prints `UNIQUE_TARGET_COVERAGE: 0` (VERDICT NON-VIABLE); content store
byte-identical before/after (read-only confirmed). Gates green: full suite **56 suites / 579 passed
/ 0 failed**; detect-rewinds 15/0; **probe A/B byte-identical** vs `develop-baseline`; both new
files ≤250 L.

**Item 5.5 — PLANNED, not yet implemented.** Plan written to
`plans/plan-item5.5-filepath-resolution.md`. Two scoping decisions are settled (see plan + Context
below). No code changed for 5.5 yet.

## What Remains
Implement `plans/plan-item5.5-filepath-resolution.md` in order (strict red-green TDD — write the
failing test FIRST for each site):

1. **Step 0** — Add the `5.6. Bash-reads as discovery touches` stub to
   `plans/roadmap-100-percent-reconstruction.md` (right after item 5.5). Records the deferred
   sub-item; no code.
2. **Step 1 — bash-read emission resolution** (`api/bash-read-events.js`, 116 L). Add
   `resolveAgainstCwd` + `extractSessionMetadata` requires; derive `cwd` from the already-reserved
   `jsonlText` param; in `emitResultEvent` (line 85) resolve `parsedCmd.path` BEFORE
   `aliasSet.has`. Test in `tests/test-bash-read-events.js`
   (`test_bashReadEventsForFile_matches_a_relative_read_path_resolved_against_session_cwd`).
   Tracker-only — probe-safe.
3. **Step 2 — cat emission resolution** (`api/file-events-extractors.js`, 233 L). Change
   `catEventsForFile`'s unused `lines` param to `jsonlText`; derive `cwd`; resolve
   `catEdits[i].filePath` before `aliasSet.has` (line 181); update the call site (line 210). Test in
   `tests/test-file-events-extractors.js`
   (`test_catEventsForFile_matches_a_relative_cat_path_resolved_against_session_cwd`). Tracker-only.
4. **Step 3 — cat TOUCH resolution** (`api/file-historical-lineage.js`, **240 L — tightest file**).
   Give `appendEditTouches` a `cwd` param; resolve cat-sourced edit paths with a value-selection
   ternary; pass `cwd` from `collectTouches` (line 128). Test in
   `tests/test-file-historical-lineage.js`
   (`test_collectTouches_resolves_a_relative_cat_touch_to_an_absolute_path`). **This is the ONLY
   probe-affecting site.** If the edit would push the file past 250 L, STOP and ask before extracting.
5. **Step 4 — gates + probe A/B.** Full suite (expect **56 / 582 / 0**); detect-rewinds 15/0;
   sidecar e2e `plate_summary.py` 247/247. Then probe A/B: **byte-identical → done, no re-baseline**;
   **diverged → EXPECTED**: confirm the changed `filesInProject` set ⊆ files reachable via the 6
   relative cats (expected `plugin.json`, `marketplace.json`), confirm every changed entry stays
   `status: PASS` (enrichment, not regression), surface the scoped diff to the user, then advance
   `develop-baseline` to the post-5.5 tree (confirm branch-vs-tag first; verify A/B turns
   `identical: true`; NEVER hand-edit the results JSON).
6. **Step 5 — close out.** Flip roadmap 5.5 `[ ]`→`[x]` with a DONE block; write
   `plans/implementation-notes-item5.5-filepath-resolution.md`.
7. **After 5.5**: Item 5.6 (deferred bash-reads-as-touches), then items 7–17 per the roadmap.

## Key Files
- `plans/plan-item5.5-filepath-resolution.md` — THE plan to execute (exact snippets, test names, line budgets).
- `plans/roadmap-100-percent-reconstruction.md` — 17-item roadmap (items 1–6 `[x]`; 5.5 `[ ]` next).
- `api/bash-read-events.js`, `api/file-events-extractors.js`, `api/file-historical-lineage.js` — the three edit targets (Steps 1/2/3).
- `tests/test-bash-read-events.js`, `tests/test-file-events-extractors.js`, `tests/test-file-historical-lineage.js` — where the failing tests go.
- `api/bash-op-events.js` — the convention template (resolve→match); do NOT edit, copy its shape.
- `plans/handoff-develop-20260616-1858.md` §How to Verify — exact gate commands (suite loop, detect-rewinds, probe A/B, sidecar e2e).
- `plans/implementation-notes-item6-context-mode-survey.md` — Item 6 close-out record (for reference).

## Plan File
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-item5.5-filepath-resolution.md`

## Context the Next Agent Won't Have
- **The two settled decisions (do NOT re-open):** (1) bash-reads-as-touches is DEFERRED to a new
  item 5.6 — 5.5 is path resolution only, three functions; (2) full 5.5, and re-baseline the probe
  ONLY if it actually diverges (user pre-approved re-baselining).
- **Why only Step 3 is probe-affecting (verified by reading `tools/probe-projects-v2.js`):** the
  probe reconstructs via `extractEditsFromJSONL` + `replayEdits` and discovers via `collectTouches`
  — it NEVER calls the emission pipeline (`catEventsForFile` / `bashReadEventsForFile`). So Steps
  1–2 (emission) are provably tracker-only; only Step 3 (touch → discovery) can move probe output.
- **Empirical fixture impact (measured):** 96 `cat` commands, 6 relative; exactly **2** relative
  cats newly resolve to probe targets — `…/Programming/jot/.claude-plugin/plugin.json` and
  `…/marketplace.json`, BOTH currently `status: PASS` (on-disk; transcriptsUsed 3 and 10). So the
  probe MAY diverge for those two, or may stay byte-identical (if those transcripts were already
  discovered, or their cat edit isn't assembled into reconstruction) — like Item 5 did. Decided at
  implementation time in Step 4.
- **Require-cycle safety:** neither `file-historical-lineage` nor `transcript-parsers` imports
  `bash-read-events` / `file-events-extractors`, and `bash-op-events` already load-time-requires
  both `resolveAgainstCwd` and `extractSessionMetadata` — so the same requires are safe in Steps 1–2.
  In Step 3, `resolveAgainstCwd` is ALREADY defined in-module (no import).
- **`extractBashCatEdits(lines, parsed)` ignores its `lines` param** (`scanToolUseResults` reads
  only `parsed`) — that's why Step 2 can repurpose the `lines` slot for `jsonlText`.
- **`api/file-historical-lineage.js` is at 240/250** — Step 3 must stay tiny (one new line + a
  2-line comment ≈ 243). The post-write hook re-checks the WHOLE edited file (250-line cap, >3
  indent depth, one-condition-per-`if`) and flags PRE-EXISTING violations in any file you touch.
- **Re-baseline mechanism is UNDEFINED in this repo** — no prior item (1–6) ever moved probe output,
  so `develop-baseline` has never been advanced. If Step 4 diverges, do NOT guess the git mechanism;
  surface the scoped diff and confirm the advance approach (branch vs tag) with the user.
- **Probe-gate gotcha:** read-only `grep`/`diff` give FALSE NEGATIVES on the probe gate (status-line
  injectors). Use a `node` fs-walk + JSON compare (strip `generatedAt`), filter `2>/dev/null`. NEVER
  run the probe against live claude-data (self-contaminates) — use the FROZEN fixture only.
- **`develop` everything-untracked is intentional** — don't "fix" it; review via
  `git diff develop-baseline -- <path>`.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (exact commands in
`plans/handoff-develop-20260616-1858.md` §How to Verify):
- **Full suite** (loop over `tests/test-*.js`, excluding `test-helpers.js` and `*output-data.js`):
  baseline now **56 suites / 579 passed / 0 failed**; expect **56 / 582 / 0** after 5.5's 3 tests.
- **detect-rewinds:** `node tests/detect-rewinds.test.js` → 15 passed / 0 failed.
- **Probe A/B byte-identity** vs `develop-baseline` against the FROZEN fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/projects` — byte-identical (or re-baselined
  with a scoped, no-regression diff the user confirmed).
- **Sidecar e2e (`plate_summary.py`):** perLineStats 247/247, 0 mismatched, conflicts 233.
- **Line caps:** all three edited files ≤ 250 (`wc -l`).
