# Handoff: Item 5.5 SHIPPED (file-path resolution for raw-matching kinds); Item 5.6 is next
Conversation name: plan roadmap item 5.5
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. Everything (`api/`, `tools/`, `tests/`,
`plans/`, …) is present in the working tree but **UNTRACKED** (`git status` → `??`) — EXPECTED, not a
mistake (only `.gitignore` is tracked). Review changes with `git diff develop-baseline -- <path>`. The
committed source tree lives on the **`develop-baseline`** branch. No `-plate` branch exists.

NOTE: if `git status` ever shows files as staged (`A`) instead of untracked (`??`), that is a stray
IDE/index artifact — unstage with `git reset` to restore the intended all-untracked view; it does not
affect the work (develop's HEAD stays at `Initial commit`).

## Goal
The sidecar (`RevEng/`) rebuilds a file's per-line history from events extracted out of Claude Code JSONL
transcripts, driving toward 100% reconstruction (roadmap:
`plans/roadmap-100-percent-reconstruction.md`). This session SHIPPED roadmap **Item 5.5** (apply the
File-path-handling convention — cwd-resolution — to the three remaining RAW-path match sites). The next
agent's job is **Item 5.6** (make bash-reads discovery touches), then items 7–17.

## Current State
**Item 5.5 — SHIPPED & CLOSED this session.** Three RAW-path match sites now resolve each captured path
with `resolveAgainstCwd(sessionCwd, rawPath)` BEFORE the `aliasSet` test (the `api/bash-op-events.js`
convention), strict red-green per site (each new test failed before its code change, passed after):
1. `api/bash-read-events.js` (120 L) — `head/sed/tail/wc/grep` emission (`bashReadChunk`/`bashExtent`/
   `bashGrep`); cwd derived from `jsonlText`, carried on `ctx`. Tracker-only (probe-safe).
2. `api/file-events-extractors.js` (239 L) — `catEventsForFile` emission; signature `lines`→`jsonlText`;
   `catEventsForFile` now EXPORTED for its unit test. Tracker-only.
3. `api/file-historical-lineage.js` (243 L) — cat TOUCH in `appendEditTouches` (gained a `cwd` param +
   `edit.source === 'cat' ? resolveAgainstCwd(...) : ...` ternary; `collectTouches` passes its `cwd`).
   The ONLY probe-affecting site.

Gates GREEN: full suite **57 suites / 582 passed / 0 failed** (was 56/579: +3 tests; +1 suite because
`tests/test-file-events-extractors.js` was at 247/250 and the Step-2 test wouldn't fit, so the
Bash-derived-events tests were split into NEW `tests/test-file-events-extractors-bash.js` —
user-approved); detect-rewinds **15/0**; sidecar e2e `plate_summary.py` **247/247**, 0 mismatched,
conflicts **233**; all edited files ≤250. **Probe A/B `identical: true`** AFTER re-baseline.

**Probe diverged (the intended case) and was re-baselined.** Step 3 moved probe output on 4
`filesInProject` entries, ALL `status PASS→PASS`, reconstruction byte-identical (only discovery metadata
changed): `.claude-plugin/plugin.json` + `marketplace.json` each gained one discovered transcript
(kept=0); `scripts/fibonacci.py` + `tests/test_fibonacci.py` had `earliestTimestamp` pulled earlier. User
chose to re-baseline by MIRRORING the source tree → `develop-baseline` advanced `9968536 → 124dfbc`.

## What Remains
Implement **Item 5.6** (the stub in `plans/roadmap-100-percent-reconstruction.md`, right after 5.5),
strict red-green TDD (failing test FIRST):
1. **Add `collectBashReadTouches(parsed, cwd)`** mirroring `collectGrepTouches` (in
   `api/grep-tool-results.js` → used by `file-historical-lineage.js`). head/tail/sed/`grep -n`/`wc -l`
   bash reads are NOT yet discovery touches, so a transcript that ONLY bash-reads a file never discovers
   it. Reuse `parseBashReadCommand` (`api/bash-read-commands.js`, returns `.path` for `bashReadChunk`/
   `bashExtent`/`bashGrep`); resolve each path against `cwd` (the cat-touch fix in 5.5 is the pattern).
   Emit a touch kind (e.g. `'read'` or a new `'bashread'`) per resolved path that the transcript reads.
2. **Wire it into `collectTouches`** (`api/file-historical-lineage.js`, currently **243/250 — TIGHT**;
   if the wiring would exceed 250, STOP and extract/relocate before adding). Add a
   `Array.prototype.push.apply(touches, collectBashReadTouches(parsed, cwd))` next to the existing
   `collectGrepTouches` call (line ~129).
3. **Test** in `tests/test-file-historical-lineage.js` (currently **246/250 — TIGHT**, only ~4 lines of
   headroom; if a meaningful test won't fit, split a cohesive section into a new suite file like 5.5 did
   with `test-file-events-extractors-bash.js`, and expect suites 57→58). A transcript that only
   `head -n 5 sub/f.py` (relative) should produce a touch at `/abs/proj/sub/f.py`.
4. **Gates + probe A/B** (Item-5.5 §How to Verify below). This is a DISCOVERY change → the probe WILL
   likely diverge again. If it does: confirm scoped + no-regression (all changed entries stay `PASS`,
   reconstruction byte-identical), surface to the user, then re-baseline `develop-baseline` again by the
   SAME mirror method used in 5.5 (see Context below). Expect suite count to rise by the number of new
   tests (and +1 if you split a test file).
5. **Close out**: flip roadmap 5.6 `[ ]`→`[x]` with a DONE block; write
   `plans/implementation-notes-item5.6-*.md`.
6. **After 5.6**: items 7–17 per the roadmap.

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — 17-item roadmap (items 1–6 + 5.5 `[x]`; **5.6 `[ ]` next**).
- `plans/implementation-notes-item5.5-filepath-resolution.md` — full 5.5 record (decisions, the probe
  divergence evidence, the re-baseline mechanism). READ THIS for the re-baseline how-to.
- `api/file-historical-lineage.js` — `collectTouches`/`appendEditTouches`/`resolveAgainstCwd` (243 L, tight);
  Item 5.6's wiring target.
- `api/grep-tool-results.js` — `collectGrepTouches(parsed, cwd)`, the EXACT template to mirror for 5.6.
- `api/bash-read-commands.js` — `parseBashReadCommand(cmd)` → `.path` for the three bash-read kinds (5.6 reuses).
- `api/bash-read-events.js`, `api/file-events-extractors.js` — the 5.5 emission edits (convention reference).
- `tests/test-file-historical-lineage.js` (246 L, tight) — where the 5.6 failing test goes.
- `plans/handoff-develop-20260616-1858.md` §How to Verify — the exact gate commands (suite loop,
  detect-rewinds, probe A/B, sidecar e2e). Reused verbatim below.

## Plan File
None yet for 5.6 (only the roadmap stub). 5.5's executed plan was
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-item5.5-filepath-resolution.md`.

## Context the Next Agent Won't Have
- **The re-baseline mechanism (first defined this session).** `develop-baseline` is a BRANCH. Pre-5.5 it
  was a frozen PRE-migration 126-file tree (`common/collect-touches.js`, no `api/`) that stayed A/B
  byte-identical because the migration + items 1–6 were all probe-equivalent. 5.5 was the FIRST item to
  move probe output. The user chose to re-baseline by **mirroring the current source tree**. The mechanism
  (use it again for 5.6 if the probe diverges): build the commit with a **temp index** so `develop`'s
  all-untracked state is never touched —
  ```
  OLD=$(git rev-parse develop-baseline)            # record for rollback
  export GIT_INDEX_FILE=/tmp/bl-idx
  git read-tree --empty
  git add -- api common tools tests diff jfred unified viewer web-shared \
    copy-scenario-outputs.py jsonl-tree-viewer.ts run-all-scenarios.py LICENSE README.md .gitignore
  TREE=$(git write-tree); unset GIT_INDEX_FILE
  COMMIT=$(git commit-tree "$TREE" -p develop-baseline -m "Re-baseline (item 5.6): ...")
  git update-ref refs/heads/develop-baseline "$COMMIT"; rm -f /tmp/bl-idx
  ```
  **EXCLUDE** from the mirror: `plans/` (docs), `.claude/` (local), `projects` + `test-transcript.jsonl`
  (**symlinks into live `~/.claude/projects` — never commit these**), root `probe-results.json` +
  `.copy-seen.txt` (artifacts). Generated probe JSONs under `tools/` ARE included (the original baseline
  tracked them too). Current baseline SHA: **`124dfbc`**; rollback to pre-5.5: `git update-ref
  refs/heads/develop-baseline 9968536`.
- **Probe-gate gotchas:** the A/B writes via `path.join(__dirname, …)`, so each tree writes its OWN
  `tools/probe-results-v2.json`; compare with a `node` fs-walk that strips `generatedAt` (read-only
  grep/diff give false negatives — status-line injectors). NEVER run the probe against live claude-data —
  use the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/projects` only.
- **The probe never calls the emission pipeline.** It reconstructs via `extractEditsFromJSONL` +
  `replayEdits` and discovers via `collectTouches`. So emission changes are PROVABLY probe-safe; only
  TOUCH/discovery changes (like 5.6) move probe output. This is why 5.5 Steps 1–2 were probe-safe and only
  Step 3 (and all of 5.6) re-baselines.
- **The 250-line cap is enforced by a post-write hook on the WHOLE edited file** (test files included —
  this is what forced the 5.5 test-file split). `file-historical-lineage.js` (243) and
  `test-file-historical-lineage.js` (246) are both near the cap; budget tightly or split.
- **Test runner:** `node tests/test-*.js` (custom `h.run`/`h.summary`; exits 1 on failure). NODE_OPTIONS
  carries a VS Code debugger bootloader that prints "Debugger listening…"/"Waiting to disconnect" on
  stderr — filter with `2>/dev/null | grep -E "passed,|FAIL:"`.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`:
- **Full suite** (currently **57 / 582 / 0**): loop over `tests/test-*.js` excluding `test-helpers.js`
  and `*output-data.js` — exact loop in `plans/handoff-develop-20260616-1858.md` §How to Verify #1.
- **detect-rewinds:** `node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1`
  → 15 passed / 0 failed.
- **Probe A/B byte-identity** vs `develop-baseline` against the FROZEN fixture (handoff-1858 §3 command;
  `node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects`,
  worktree `develop-baseline`, compare stripping `generatedAt`) → `identical: true` (or re-baselined with
  a scoped, no-regression, user-confirmed diff).
- **Sidecar e2e (`plate_summary.py`):** handoff-1858 §4 command → perLineStats 247/247, 0 mismatched,
  conflicts 233.
- **Line caps:** `wc -l` every edited/new file ≤ 250.
