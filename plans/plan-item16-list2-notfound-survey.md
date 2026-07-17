# Plan — Roadmap Item 16: run the sidecar over list2 → SURVEY → DEFER + reopen-gate tool

> For the implementing agent. Strict red-green TDD; 250-line WRITE cap (split into a new sibling, never
> grow a capped file); 4-space indent; one condition per `if` (nest, never `&&`/`||`). Code snippets
> here already conform to `~/.claude/guides/coding-standards.md`.

## Context (why this change is being made)
Roadmap item 16 (§C, lines ~531-545) wanted to drive the per-line sidecar across **list2**
(`filesNotInProject`) so per-line-perfect files get a better status. Two findings reshaped the work:

1. **The MISMATCH half is already done.** Item 15 (`plans/handoff-develop-20260617-1858.md`) added
   in-probe promotion (`api/promote-per-line-status.js` via `tools/probe-v2-assembly.js`
   `maybePromotePerLine`): for every probe **MISMATCH** it runs `extractFileEvents → trackLineStates`
   and relabels per-line-perfect files to `PASS_PER_LINE`. On the frozen fixture this flipped
   **list2 MISMATCH 106 → 50** (+56). Nothing more to build there.
2. **The NOT_FOUND half is not buildable now.** The 64 list2 NOT_FOUND files have no on-disk copy, no
   snapshot, and — verified by a full 64-file census plus live CLI sidecar runs against representative
   targets — **0 of 64 are git-recoverable**. They are ephemeral/foreign artifacts (see census below).
   The item-15 handoff's claim that item 13's git rung makes them scoreable is **false**: item 13's
   rung lives in the sidecar CLI, but the failure here is upstream (no repo / no committed ref), which
   no rung fixes.

**Therefore item 16 ships as a SURVEY → DEFER**, mirroring items 6 & 7
(`implementation-notes-item6-context-mode-survey.md`, `implementation-notes-item7-timestampless-survey.md`):
a read-only **reopen-gate tool** that re-measures recoverability, its tests, a survey note, and the
roadmap checkbox. **No production reconstruction/probe code is added → probe byte-identical → no
re-baseline.**

### The 64 NOT_FOUND files (census — paste into the survey note)
| Bucket | Count | Why no reference exists |
|---|---|---|
| A. foreign `/home/user/repo/*` | 14 | another machine; `/home/user` absent here → no on-disk, no local repo |
| B. `~/.claude/plans` + `/root/.claude/plans` | 11 | plans folder is not a git repo (and `/root` is a foreign home) |
| C. `jot-worktrees/*` | 6 | worktree-local plan/debate/migration artifacts, never committed |
| D. `jot-recovery/*` | 1 | scratch/recovery tree |
| E. `~/Programming/jot/*` | 31 | repo exists but these are gitignored `.plate/Debates/Todos`; `git log --all -- <f>` empty |
| F. other | 1 | `jotVerifySequence/*` scratch |

## What item 16 is deliberately NOT (settled decisions — do not revisit)
- **NOT** extending in-probe promotion to NOT_FOUND. For NOT_FOUND, `decision.usedSource` is `null`
  (`api/reconstruction-reference-sources.js:72-80`), so `reference.content = decision.usedSource.content`
  would throw. Even past that, a `via:'none'` reference makes `buildFinalVerdict` early-return
  (`api/final-line-verdict.js:53`) → `mismatched===0` *vacuously* → false promotion. **Leave the
  `=== 'MISMATCH'` guard in `api/promote-per-line-status.js` exactly as-is; never relax to `!== 'PASS'`.**
- **NOT** building a standalone production batch driver now (`tools/run-sidecar-over-list2.js`). Proven
  to return nothing for every NOT_FOUND class today. The reopen-gate tool below is its read-only
  essence; the production driver is the *future* lever, built only if the gate flips.

## Behavior to build (plain English — drives the TDD)
The reopen-gate tool answers ONE question reproducibly: *"Of list2's NOT_FOUND files, how many can NOW
be given a real reference via git (i.e. would item 13's CLI git rung recover them)?"* It:
1. reads `tools/probe-results-v2.json` and **selects** `filesNotInProject` entries with
   `status === 'NOT_FOUND'`;
2. **classifies** each into `noRepo` / `repoButNoRef` / `RECOVERABLE` using the same git resolution the
   CLI rung uses;
3. **summarizes** the counts and sets `viable` (`true` iff `RECOVERABLE >= 1`);
4. prints the JSON verdict. **Kill threshold: `RECOVERABLE === 0` → NON-VIABLE (today). Reopen trigger:
   `RECOVERABLE >= 1`** (a future session commits the gitignored files, or the foreign `/home/user` +
   `/root` data is re-collected on a machine where it exists).

## Files to create / modify
**Create** (4-space, ≤250 L, one-condition-per-`if`, verb-named functions):
- `tools/spike-item16-list2-notfound-yield.js` — the reopen-gate tool (~120-150 L). **Template:
  `tools/spike-item6-context-mode-yield.js`** (read-only spike, never mutates). Keep git/fs IO behind
  `require.main === module`; export the pure helpers for tests.
- `tests/test-spike-item16-list2-notfound-yield.js` — its suite (~6 tests, ≤250 L). The hook runs
  `tests/test-<basename>.js`, so the filename must match the tool basename.
- `plans/implementation-notes-item16-list2-notfound-survey.md` — survey note; **mirror the section
  shape of `implementation-notes-item7-timestampless-survey.md`**: title `… SURVEYED → DEFERRED`, "The
  item as written", "What the 64 NOT_FOUND files actually are" (paste the census table + path classes),
  "Why git cannot reach them", "Reopen trigger" (the `viable`/`RECOVERABLE>=1` gate + exact spike
  invocation), "Outcome" (MISMATCH half delivered by item 15: list2 106→50).

**Modify:**
- `plans/roadmap-100-percent-reconstruction.md` — flip item 16 `[ ]`→`[x]` (line ~531) with the
  deferred outcome (MISMATCH half via item 15; NOT_FOUND 0/64 git-recoverable; reopen gate = the spike).
  Docs file, not under the code cap.

**Explicitly do NOT touch** (at/near cap; editing risks the byte-identical probe gate):
`tools/probe-projects-v2.js` (289 L, over cap), `api/promote-per-line-status.js` (55 L — guard stays),
`api/reconstruction-reference-sources.js` (287 L), `tools/track-line-states.js`, `api/reference-ladder.js`,
`api/git-file-state.js` — the spike *imports* these, it does not edit them.

## Reuse (do not re-implement)
- `api/git-file-state.js`: `resolveRepoRootWalkingUp(cwd)` (`:88`), `resolveGitContent` /
  `resolveGitContentMultiRef` (`:41`,`:65`), `buildMultiRefs(branch)` (`:51`).
- `api/reference-ladder.js`: `resolveGitReference(target, aliasPaths, gitOpts)` (`:46`) — call this so
  the spike measures **exactly** what the production CLI rung would recover (parity).
- `api/transcript-parsers.js`: `extractSessionMetadata(jsonlText)` for each transcript's `cwd`/`gitBranch`.

## Spike tool — helper shapes (signatures; bodies via TDD)
```js
// Select only the NOT_FOUND entries from a parsed probe-results object.
function selectNotFoundList2(probeResults) {
    const entries = probeResults.filesNotInProject || [];
    return entries.filter((entry) => entry.status === "NOT_FOUND");
}

// Classify one NOT_FOUND entry by git-recoverability.
// Returns "noRepo" | "repoButNoRef" | "RECOVERABLE".
//   noRepo:       no transcript cwd resolves to a git repo root.
//   repoButNoRef: a repo resolves, but no ref in buildMultiRefs holds the file.
//   RECOVERABLE:  resolveGitReference returns non-null content for some alias path.
function classifyNotFoundTarget(entry) { /* uses the reuse helpers above */ }

// Aggregate classifications into the verdict; viable iff at least one RECOVERABLE.
function summarizeYield(classifications) {
    const counts = { noRepo: 0, repoButNoRef: 0, RECOVERABLE: 0 };
    for (const verdict of classifications) {
        counts[verdict] += 1;
    }
    const viable = counts.RECOVERABLE >= 1;
    return { counts, viable };
}
```

## TDD test plan (strict red-green — watch each fail first)
New suite `tests/test-spike-item16-list2-notfound-yield.js`. Git/fs IO stays behind require-main, so the
**pure helpers are the testable surface** (same pattern as spike-item6). One behavior per test:
1. `test_selectNotFoundList2_picks_only_status_NOT_FOUND` — fixture with mixed
   PASS/MISMATCH/NOT_FOUND/PASS_PER_LINE; assert only NOT_FOUND returned.
2. `test_classifyNotFoundTarget_returns_noRepo_when_repo_root_is_null` — entry whose only transcript
   cwd resolves to a null repo root; assert `"noRepo"`.
3. `test_classifyNotFoundTarget_returns_repoButNoRef_when_repo_resolves_but_file_uncommitted` — temp
   git repo (canonicalize via `fs.realpathSync`, per the item-13 `makeRepo` helper, roadmap `:501`),
   file on disk but never committed; assert `"repoButNoRef"`.
4. `test_classifyNotFoundTarget_returns_RECOVERABLE_when_file_committed_at_HEAD` — temp repo with the
   file committed; assert `"RECOVERABLE"`. **Guards against a false-permanent-DEFER — proves the gate
   can flip.**
5. `test_summarizeYield_sets_viable_false_when_RECOVERABLE_is_zero` — pure aggregation; assert
   `viable === false`.
6. `test_summarizeYield_sets_viable_true_when_RECOVERABLE_at_least_one` — assert `viable === true`.

No probe/belief/verdict code changes → no probe RED/GREEN.

## Verification / gates (all must hold)
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. **First measure the going-in suite
count via gate #1 — the handoff reports 66/673 but `tests/test-*.js` may already be 68 files; do not
hardcode.** Item 16 adds **+1 suite (~6 tests), 0 failed**.
1. **Full suite** — going-in count +1 suite, 0 failed.
2. **New item-16 suite**: `node tests/test-spike-item16-list2-notfound-yield.js` → 6 passed.
3. **detect-rewinds**: `node tests/detect-rewinds.test.js` → 15/15 UNCHANGED.
4. **plate_summary.py e2e**: `{matchedObserved:247, mismatched:0, neverObserved:0}`, conflicts=8 —
   UNCHANGED (no belief/conflict/verdict code touched).
5. **Probe A/B vs `develop-baseline` (`a8947fc`) on the frozen fixture
   `~/Programming/jot-recovery/probe-fixture-20260615/`**: `identical: true` — **the load-bearing
   gate**; item 16 adds no probe code → byte-identical → **no re-baseline**.
6. **Spike smoke**: `node tools/spike-item16-list2-notfound-yield.js` →
   `{counts:{noRepo,repoButNoRef,RECOVERABLE:0}, viable:false}` (current state = NON-VIABLE).

## Future lever (record in the survey note; build nothing now)
The 31 `~/Programming/jot/*` files become recoverable only if those gitignored `Debates`/`.plate`/`Todos`
artifacts are committed (a data-collection fix outside RevEng); the foreign `/home/user` + `/root` files
need their source machine. When the spike's `RECOVERABLE >= 1`, reopen item 16 and build the standalone
batch driver as production code.
