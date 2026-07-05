# Handoff: Roadmap Item 13 (git rung on the reference ladder) — PLANNED, ready to implement
Conversation name: plan RevEng item 13 — git rung on the reference ladder
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is **UNTRACKED
by design** (`git status --short` → 19 `??` entries + a pre-existing `M .gitignore`, 6 insertions,
unrelated — UNCHANGED this session). This project commits nothing during normal work; the committed
source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline),
**UNCHANGED this session** (planning only). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the JSONL),
NOT a git repo. `RevEng/` (CONSUMER) is the subdir git repo.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, then scores its final belief against the *best available reference*
(`plans/roadmap-100-percent-reconstruction.md`). Items 1–11 are closed; item 12 (collapse conflict
cascades) is PLANNED (`plans/handoff-develop-20260617-1515.md`). This session **PLANNED roadmap item
13** — add a **git rung** to the sidecar CLI's reference ladder. Today the CLI
`tools/track-line-states.js` `chooseReference` (`:65-70`) picks **on-disk → snapshot → none**; files
deleted/moved since the session (the probe's `NOT_FOUND` class — list2's 64 files) have neither an
on-disk copy nor a snapshot, so they fall to `{via:'none'}` and the verdict early-returns empty
(`api/final-line-verdict.js:53`) — scored against nothing. Their content often still lives in **git**.
Item 13 inserts a git rung **between snapshot and none** producing `{via:'git', content}`. The verdict
ALREADY accepts `via:'git'` (`final-line-verdict.js:44-45`). **This unblocks item 16.** The next agent
EXECUTES the plan via strict red-green TDD. **No item-13 code was written this session.**

## Current State
**Planning only — no code changes this session.** The RevEng working tree is UNCHANGED from the
item-12 handoff; the only tracked `git diff` is the pre-existing `M .gitignore` (unrelated). The four
gates were GREEN at baseline (per the item-11/12 handoffs; NOT re-run here, nothing changed): full
suite **61 suites / 619 passed / 0 failed**; detect-rewinds **15/15**; probe A/B vs `develop-baseline`
**`identical: true`**; sidecar `plate_summary.py` **247/247 matchedObserved, 0 mismatched,
conflicts=233**.

The item-13 plan is COMPLETE and ready at **`~/.claude/plans/noble-floating-volcano.md`** (conformant
to `~/.claude/guides/planning.md`, `tdd.md`, `coding-standards.md`, `single-condition-branching.md`,
`verify-work.md`). It was validated by two parallel Plan agents against the live source — every
file:line claim in it is confirmed.

## What Remains
Execute in this order (full detail + the module body, the 8-test suite, and the CLI snippets are in
`~/.claude/plans/noble-floating-volcano.md`):

1. **Step 0 (no code):** confirm the four baseline gates are green (§ How to Verify below). Record the
   going-in numbers (61/619/0; conflicts=233; probe `identical:true`).
2. **Phase 1 (RED→GREEN) — the pure module.** Create `tests/test-reference-ladder.js` and
   `api/reference-ladder.js` together, strict red-green. Write Test 1 + the `require` → watch the RED
   `MODULE_NOT_FOUND`; create the module with a STUB `resolveGitReference` returning `null` → Test 1
   RED becomes a real assertion fail → implement to GREEN. Then add the remaining 7 tests one at a
   time, each failing first: (2) null metadata ×3, (3) file not tracked, (4) tries all alias
   basenames, (5) most-recent-first fallback, (6) **empty file → `''` not null (CRITICAL)**, (7) HEAD
   fallback with no remote, (8) cwd not in a git repo. The module is a ~55-line port of the probe's
   `gatherGitSource` (`api/reconstruction-reference-sources.js:148-172`) that reuses
   `resolveRepoRootWalkingUp`/`buildMultiRefs`/`resolveGitContentMultiRef` and builds its filePathMap
   from `[target].concat(aliasPaths)`.
3. **Phase 2 (RED→GREEN) — CLI wiring + ordering tests.** Export `chooseReference` from
   `tools/track-line-states.js` (write the failing ordering test first → RED `chooseReference is not a
   function`), then: add `var referenceLadder = require('../api/reference-ladder');`; insert the git
   rung between snapshot and none guarded by `gitContent !== null` (NOT truthiness, so `''` wins); in
   `main()` build `transcriptTexts` by `fs.readFileSync` in the existing `jsonls` loop and pass it to
   `chooseReference`. Add `tests/test-track-line-states-reference.js` with the 5 ordering tests
   (on-disk > snapshot > git > none; empty-string accepted as `via:'git'`).
4. **Phase 3 — run the four gates.** Probe MUST stay `identical:true` (no re-baseline);
   `plate_summary.py` MUST stay 247/247, 0 mismatched, **conflicts=233** (item 13 touches no belief
   and no conflict logic).
5. **Mark item 13 `[x]` in `plans/roadmap-100-percent-reconstruction.md`** (line 439) with the
   completion summary, and write an implementation-notes file + a fresh handoff.

## Key Files
- `~/.claude/plans/noble-floating-volcano.md` — the full item-13 plan (module body + test list + CLI snippets).
- `tools/track-line-states.js` — the ONLY production edit: `chooseReference` (`:65-70`), call site
  (`:115`), `main()` transcript-read loop (`:107-116`); add a require, the git rung, and export
  `chooseReference`. Currently 127L → ~135L (250-line WRITE cap; plenty of room).
- `api/reference-ladder.js` — **NEW** ~55L pure module: `resolveGitReference(target, aliasPaths,
  transcriptTexts)` + `resolveGitFromTranscript` + `buildFilePathMapFromPaths`.
- `tests/test-reference-ladder.js` — **NEW** ~206L (one file unless a hard run exceeds 250, then split
  the real-repo tests into `tests/test-reference-ladder-git.js`).
- `tests/test-track-line-states-reference.js` — **NEW** 5 small CLI-ordering tests.
- `api/git-file-state.js` — reused, unchanged: `resolveRepoRootWalkingUp` (`:88`), `buildMultiRefs`
  (`:51`), `resolveGitContentMultiRef` (`:65`), `computeRepoRelativePath` (`:17`).
- `api/reconstruction-reference-sources.js` — reused `distinctBasenames` (`:89`); the structural
  template `gatherGitSource`/`gatherGitSourceFromTranscript` (`:148-172`) to mirror.
- `api/transcript-parsers.js` — `extractSessionMetadata` (`:156` → `{gitBranch, cwd, sessionId}`).
- `api/final-line-verdict.js` — the consumer; already accepts `via:'git'` (`:44-45,53`). No edit.
- `tests/test-git-file-state.js:257-272` — the canonical real-temp-git-repo test scaffold to copy
  (git-availability guard + `ctx.tempDir` + init/config/add/commit).
- `tests/test-helpers.js` — `runWithContext`/`ctx.tempDir` (`:31-49`), `makeSystemLine` (`:152-160`),
  `makeNonEditLine` (`:99-105`).

## Plan File
`~/.claude/plans/noble-floating-volcano.md`

## Context the Next Agent Won't Have
- **Module-home decision was the user's explicit choice.** The roadmap says "the rung lives in the CLI
  by design" and only sanctions a sibling module "if it overflows" (it won't — CLI lands ~135L). The
  user nonetheless chose the **new `api/reference-ladder.js` module** over inlining, because the test
  hook runs `tests/test-<basename>.js` and the CLI's `main()`/`chooseReference` are unreachable for
  strict red-green — a pure `api/` module is testable with a real temp git repo. Do NOT "simplify" by
  inlining it back into the CLI; that silently drops all unit coverage of the rung.
- **The `!== null` contract is load-bearing — never use `if (content)` truthiness.** A git-tracked
  EMPTY file returns `""`, which is a *valid scored reference*, not a miss. `resolveGitContentMultiRef`
  keys on `content !== null` (`git-file-state.js:71-73`); the module and the CLI rung must too. Test 6
  asserts both `=== ''` and `!== null`. A truthiness guard would collapse `''` → `via:'none'` and
  silently un-score empty files.
- **Fixture invariant (the #1 false-green trap):** every `target` and every `aliasPaths` entry in the
  tests MUST be an **absolute path INSIDE the temp repo** (e.g. `path.join(repo,'foo.js')`), even when
  the file is off disk — because `computeRepoRelativePath` (`git-file-state.js:17`) strips the repo
  root and feeds the remainder to `git show <ref>:<relpath>`. A bare basename or out-of-repo path
  returns null and the test passes against the stub for the wrong reason.
- **repoRoot comes from session `cwd`, never from `target`.** When the rung runs, the target is
  provably off disk; `resolveRepoRootWalkingUp(meta.cwd)` uses the session's actual repo (matching the
  probe), keeping repoRoot and branch from the same session.
- **`transcriptTexts` ordering = most-recent LAST** (the loop walks `length-1 → 0` = newest first,
  matching `gatherGitSource`'s reverse scan). The CLI passes them in `jsonls` order; the rung returns
  the first transcript whose git metadata resolves the file.
- **Item 13 is independent of items 9/11/12** (roadmap §B) — do NOT wait for item 12's
  conflict-cascade collapse to land. The item-12 handoff (`handoff-develop-20260617-1515.md`) already
  exists (PLANNED); that was this session's go-signal.
- **Probe stays byte-identical — no re-baseline.** The probe uses `chooseReferenceSource` +
  `gatherGitSource` in `api/reconstruction-reference-sources.js`, a different module/function the CLI's
  `chooseReference` never calls. This change touches only `tools/track-line-states.js` selection + the
  new module/tests. `develop-baseline` stays at `880b69d`.
- **Exporting `chooseReference` does not change CLI behavior** — `main()` stays gated behind the
  existing `require.main === module` guard (`:127`); the export only makes the ladder ordering
  unit-testable.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. Exact commands in
`plans/handoff-develop-20260617-1252.md` § How to Verify (also `…-20260615-1833.md`).

1. **New unit tests fail first, then pass:** `node tests/test-reference-ladder.js` (RED on first run,
   GREEN after each step) and `node tests/test-track-line-states-reference.js`. A *failing*
   verification: a stub returning `null` for the empty-file case fails Test 6 (`'' !== null`); a
   truthiness guard makes the empty-string ordering test fall to `via:'none'`.
2. **Full suite:** expect **63 suites / >619 passed / 0 failed** (added 2 test files; +~13 tests).
3. **detect-rewinds:** **15/15** unchanged.
4. **Probe A/B vs `develop-baseline`:** **`identical: true`** — any non-empty diff means the change
   leaked into a probe-reachable path; stop and investigate.
5. **Sidecar e2e** `plate_summary.py`: **247/247 matchedObserved, 0 mismatched, conflicts=233**
   unchanged — a changed conflict count means belief/conflict logic was wrongly touched.
6. **Optional payoff smoke:** run `node tools/track-line-states.js --path <a list2 NOT_FOUND file whose
   session had a git branch>`; confirm the verdict now prints `vs git` with non-empty `perLineStats`
   instead of `vs none` with an empty verdict — end-to-end evidence item 16 is unblocked.
