# Handoff: Implement "mark engine-B timeline entries that match a git commit's version"
Conversation name: add matching git commit SHAs to engine B extractions
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/1bc39243-e1c7-4712-a2c4-a6a3093315ac.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/engine-b-produces-a-jiggly-cray.md

## Branch
`develop` based on `develop` (root). Only one commit exists — `1a9f098 Initial commit`; all
RevEng source is currently untracked/uncommitted (working tree is the live code). CWD
`RevEng/` is its own git repo.

## Goal
Add per-entry tagging to Engine B (`api/track-line-states.js`): when the reconstructed
per-line state at a timeline `unixMs` *exactly reproduces* some git commit's version of the
file, tag that timeline entry with the commit (`{sha, shortSha, path}`). This lets a reader
pick a commit, jump to the timestamp where the JSONL replay reproduced it, and read the diff
of the edits that came after. It is the **discovery complement** to the existing git-seed
feature (`--seed-commit`): marking tells you which SHA to feed git-seed.

## Current State
**Planning complete; NOTHING implemented yet — no code/test files written.** The plan was
authored, then revised twice: (1) function names aligned to the 252-rename convention, (2)
**rebuilt against the current architecture** after discovering the codebase changed
(git-seed + `api/reconstruct-file.js` now exist; see "Context" below). The plan as it stands
matches the current tree. All cited existing functions were re-read this session and verified
present. No tests have been run for this feature (none exist yet).

## What Remains
Execute the plan's 6 tasks **in order**, strict red-green TDD (test first, then minimum code).
Plan file has full code snippets and exact test names for each.

1. **Task 1 — `parseCommitHashAndPathFromFollowLog(stdout)`** in NEW `api/git-commit-matches.js`
   (4-space). Parses `git log --all --follow --name-status --format=%H` output into
   `[{sha, path}]` newest-first (rename target for R/C). Also export `isRenameOrCopy` from
   `api/git-file-state.js`. RED tests go in NEW `tests/test-git-commit-matches.js`.
2. **Task 2 — `buildCommittedVersionMatcher(committedVersions)`** (same module). Returns a
   pure `function(belief)` that, when `belief.eofConfirmed`, calls
   `buildFinalVerdict(belief, {via:'git-commit', content})` and returns `{sha,shortSha,path}`
   for every version with `perLineStats.mismatched===0 && neverObserved===0`.
3. **Task 3 — engine annotation** in `api/track-line-states.js` (2-space, surgical). Add
   `options.committedVersionMatcher`; after `degradeUntouchedToPresumed`, attach non-empty
   matches as `entry.matchingCommits`. RED tests in NEW
   `tests/test-track-line-states-commit-match.js` (mirror
   `tests/test-track-line-states-git-seed.js`, inject a STUB matcher — hermetic, no git).
4. **Task 4 — `collectCommittedFileVersions(repoRoot, relPath)`** (same module). `git log
   --follow` → parse → `readGitFileContent` per commit → `[{sha,shortSha,path,content}]`.
   RED integration tests reuse the `checkGitAvailable`/temp-repo harness from
   `tests/test-git-seed.js`.
5. **Task 5 — wire into `api/reconstruct-file.js`** (4-space). In `reconstructFileWithSeed`,
   build the matcher from `collectCommittedFileVersions(repoRoot, repoRelPath)` (repo context
   already in `opts`), pass `committedVersionMatcher` in `trackOptions`, and attach a
   `result.commitMatches` roll-up (`[{sha,shortSha,unixMs,timestamp}]`). Always-on (no flag).
   Extend `tests/test-reconstruct-file.js`.
6. **Task 6 — CLI print** in `tools/track-line-states.js` (2-space). Add
   `printCommitMatches(result.commitMatches)` after `printVerdict`.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/engine-b-produces-a-jiggly-cray.md` — THE PLAN; full
  code snippets, test names, conventions, verification. Read first.
- `api/track-line-states.js` — engine; edit `buildTimelineEntry` + the `trackLineStates` loop.
- `api/reconstruct-file.js` — orchestration; `reconstructFileWithSeed` is where the matcher is
  built and `commitMatches` attached. Mirrors `computeContributingPaths`/`buildSeedSummary`.
- `api/git-file-state.js` — has `resolveGitFollowHistory`, `readGitFileContent`,
  `isRenameOrCopy` (private — export it), `readGitCommitTimestamp`.
- `api/git-seed.js` — the adjacent feature; `seedBeliefFromGitContent` shows the
  `splitContentIntoLineSpans` content model the matcher relies on.
- `api/final-line-verdict.js` — `buildFinalVerdict`; the reuse anchor for matching.
- `tests/test-git-seed.js` — copy `checkGitAvailable` + `initRepoWithOneCommit` from here.
- `tests/test-track-line-states-git-seed.js` — mirror its `writeTranscript`/stub pattern and
  its `deepStrictEqual` no-op test.
- `tools/track-line-states.js` — CLI; delegates to `reconstructFileWithSeed`, prints result.

## Context the Next Agent Won't Have
- **The codebase changed under an earlier draft of this plan.** Engine B is no longer driven
  directly by the CLI: `tools/track-line-states.js` → `api/reconstruct-file.js`
  `reconstructFileWithSeed` → `tls.trackLineStates`. Wire the matcher in `reconstruct-file.js`,
  NOT the CLI.
- **Repo context is already resolved** in `reconstruct-file.js` (`opts.repoRoot`,
  `opts.repoRelPath` from the CLI's `resolveRepoContext`). An earlier draft had a
  `resolveCommittedFileVersionsFromSession` that walked session metadata for a repo root —
  that was DROPPED as unnecessary. Call `collectCommittedFileVersions(repoRoot, repoRelPath)`
  directly.
- **The timeline stores NO text** (`line-belief.js` `cloneEntriesForTimeline` persists
  evidence refs only). Per-line `.text` lives only on the live `belief` during the replay
  loop, so matching MUST happen inside `trackLineStates` — it cannot be bolted on from the
  saved report JSON.
- **Do not re-implement content comparison.** Route matching through `buildFinalVerdict`
  (exact match ⇔ `mismatched===0 && neverObserved===0`) so it can never diverge from how the
  verdict scores the git reference. This is the single most important design decision.
- **Per-file indent hook.** A PreToolUse hook enforces each file's existing indent (see the
  inline note at `git-file-state.js:186`). New files = 4-space; edits in the 2-space files
  (`api/track-line-states.js`, `tools/track-line-states.js`) MUST stay 2-space;
  `api/reconstruct-file.js` is 4-space. Match the file you're editing or the hook complains.
- **Vocabulary:** use `sha`/`shortSha` (not `hash`) to match git-seed (`buildGitSeedRef`,
  `--seed-commit`, `opts.sha`).
- **git-seed interaction:** when a seed is applied, events are filtered to strictly-post-seed
  and belief is seeded first, but the per-instant loop (and thus matching) is unaffected.
  Matching works seeded or not.
- **Decision made & defended in the plan, open to challenge:** commit-matching is ALWAYS-ON
  (no `--mark-commits` flag), mirroring the always-on git reference rung; it's a clean no-op
  off-repo (`resolveGitFollowHistory` returns `''` → zero versions → matcher returns `[]`).
  Cost is one `git log` + one `git show` per commit touching the file. If a target has a huge
  history and this proves slow, reconsider an opt-in flag.
- **User cadence:** the user repeatedly interrupted `ExitPlanMode` to demand the plan be
  tightened (align names to the rename CSV; conform to `~/.claude/guides/planning.md` +
  `tdd.md` + `coding-standards.md` + `single-condition-branching.md`; refresh the cached view
  of the codebase). They care about: verb-first self-documenting names, strict red-green TDD
  with `test_<behavior>` + plain-English step comments, and one-condition-per-`if` (nest, no
  `&&`/`||`; ternaries only for value selection). Honor these in the implementation.
- **`test-output-data.js` is a browser fixture, not a Node test** — exclude it from any
  `for f in tests/test-*.js` sweep (it always fails under `node`).

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# New feature tests (must each print "N passed, 0 failed"):
node tests/test-git-commit-matches.js
node tests/test-track-line-states-commit-match.js
# Extended + regression:
node tests/test-reconstruct-file.js
node tests/test-git-seed.js && node tests/test-track-line-states-git-seed.js
node tests/test-git-file-state.js && node tests/test-reference-ladder.js
# Full sweep (exclude the browser fixture):
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" || { echo "FAIL: $f"; exit 1; }; done
# End-to-end on a git-tracked file the JSONL touched:
node tools/track-line-states.js --path <file-under-git>
#   → summary lists "commit <shortSha> matched at <timestamp>"; report JSON has
#     matchingCommits on those entries + a commitMatches roll-up; non-git target = empty.
#   Cross-check: re-run with --seed-commit <a-matched-sha> and see post-seed edits replay.
```
