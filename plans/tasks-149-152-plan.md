# Plan — tasks 150, 149, 151, 152

Order is 150 → 149 → 151 → 152: task 150's garbage targets are suspected to be the bulk of
task 149's stall, so the target-list fix lands before the progress work. All source edits are in
the `jfred/` submodule. **Write every test BEFORE its implementation edit (red), then make the
edit (green), but do NOT execute any test suite — the user runs tests afterwards.** Verify each
step with `npx tsc --noEmit` (typecheck only, not a test run) from `jfred/`.

Shared style constraints for every edit (from `jfred`'s coding requirements +
`~/.claude/guides/coding-standards.md`):
- 4-space indent, one condition per `if`, verb-named functions, domain types (`Path`, `Uuid`,
  `Date`) over primitives, enum-member comparisons.
- Comment new code the way the surrounding file does; tag deliberate ceilings with `ponytail:`.
- Tests: `test_<behavior>` names, plain-English step comments, in the existing
  `tests/<module>.test.ts` file for the module touched.

---

## Task 150 — reject non-path redirect targets (the bogus-target root cause)

**Root cause found:** `bashOverwriteRedirect` (`src/regex_expressions.ts:95`,
`/(?<!>)>\s*(?!&)(\S+)\s*$/`) matches the `>` inside a JS arrow. A transcript Bash command like
`node -e "console.log(tasks.map(x => x.taskNumber).join(','))"` therefore yields an overwrite
event whose target is the token `x.taskNumber).join(','))"`. That garbage path flows through
`extractFileEvents` → `distinctFinalPaths` → the reconstruction target list
(`reconstruction_renderable.ts:31`), inflating it and burning full per-target reconstruction
chains on nonsense. The single choke point for redirect targets is `parseRedirect`
(`src/reconstruction_bash_events.ts:65`) — both callers (`bashEventsFrom` and
`reconstruction_parse_lines.ts:34`) route through it, so the guard goes there, not per caller.

### 150.1 RED — extend `tests/reconstruction_bash_events.test.ts`

Add these tests (reuse the file's existing `buildBashRecord`/`parseRedirect` imports):

- `test_parseRedirect_rejects_a_js_arrow_inside_a_node_one_liner` — Step comments, then:
  `assert.equal(parseRedirect("node -e \"console.log(tasks.map(x => x.taskNumber).join(','))\""), undefined);`
- `test_parseRedirect_rejects_targets_containing_shell_or_js_punctuation` — each of
  `echo hi > out(1).txt`, `echo hi > \"quoted.txt\"`, `echo hi > a,b.txt` returns `undefined`.
- `test_parseRedirect_still_accepts_plain_and_absolute_targets` — `echo hi > out.txt` →
  target `out.txt`; `echo hi >> /a/log.txt` → target `/a/log.txt`, `appends === true`
  (guards the two existing green paths so the new filter provably does not over-reject).

### 150.2 GREEN — add the validator to `src/reconstruction_bash_events.ts`

Immediately above `parseRedirect`, add:

```ts
// Characters that never appear in a real recorded redirect target but are common in command
// text the redirect regex can misfire on (a `node -e` one-liner's `=>` arrow, quoted JS,
// argument lists). A candidate containing any of them is command-text shrapnel, not a path.
// ponytail: deny-list, not a path grammar — extend the string if a new shrapnel shape appears.
const NON_PATH_CHARACTERS = "\"'`()<>{}$;,|";

// Whether a redirect-target candidate is plausible as a filesystem path (task 150): free of
// shell/JS punctuation that marks it as a fragment of command text.
function checkCandidateLooksLikePath(candidate: string): boolean {
    for (const character of NON_PATH_CHARACTERS) {
        if (candidate.includes(character)) {
            return false;
        }
    }
    return true;
}
```

Then guard both branches of `parseRedirect`: after each regex match, before building the
`ParsedRedirect`, reject the candidate when `checkCandidateLooksLikePath(match[1]!)` is false
(fall through to the next branch / `return undefined`). Concretely, restructure as:

```ts
export function parseRedirect(command: string): ParsedRedirect | undefined {
    const appended = command.match(bashAppendRedirect);
    if (appended && appended[1] !== NULL_DEVICE && checkCandidateLooksLikePath(appended[1]!)) {
        return { target: new Path(appended[1]!), appends: true };
    }
    const overwritten = command.match(bashOverwriteRedirect);
    if (overwritten && overwritten[1] !== NULL_DEVICE && checkCandidateLooksLikePath(overwritten[1]!)) {
        return { target: new Path(overwritten[1]!), appends: false };
    }
    // `> /dev/null` (and `>>`) discards output — it is not a real file, so it must
    // never become a file event or show up in the Files list (task 76).
    return undefined;
}
```

(The existing compound-condition shape in this function is kept — this file already chains the
match+null-device check in one `if`; match its idiom rather than re-styling it.)

No regex change: the validator alone kills the arrow case (`x.taskNumber).join(','))"` contains
`(`, `)`, `,`, `"`), and fixing at the value level also covers garbage the regexes could admit
from other command shapes.

---

## Task 149 — progress labels inside the silent Phase-4 stretch

**Where the silence lives:** `reconstructFilesOver` emits `reconstructing <target> k/n` BEFORE
each target's work (`reconstruction_renderable.ts:44`), so the `n/n` label sticks while the last
target's whole stage chain grinds. Inside the chain (`computeFileRevisionsOver`,
`src/reconstruction_branches.ts:107`) only sandbox-related calls emit; the nine chain stages
themselves (`seedBaseCommitBeacon` … `completeTruncatedBeacon`) are silent, as is each branch
pass of `collectAcceptedUserEditIds` (`reconstruction_renderable.ts:64`), which silently re-runs
the whole per-target loop per conversation branch. A timer heartbeat is impossible — the engine
is synchronous on one thread, so no interval can fire mid-build; the fix is labels at real work
boundaries. New labels must contain the substring `reconstructing ` so
`classifyLoadPhase` (webapp/app-progress.ts:34) keeps them in phase 4.

### 149.1 RED — extend `tests/reconstruction_branches.test.ts`

- `test_run_stage_tolerantly_announces_each_stage_through_the_progress_sink` — Steps:
  install a capturing sink via `setReconstructionProgressSink` (import from
  `../src/reconstruction_progress.ts`), call `reconstructFileOver` over a tiny record fixture
  (reuse this file's existing fixture helpers), restore the sink with
  `setReconstructionProgressSink(undefined)` in a `finally`, then assert the captured labels
  include one matching `/^reconstructing .* — seedBaseCommitBeacon$/` (stage labels are emitted
  per chain stage).

### 149.2 RED — extend `tests/reconstruction_renderable.test.ts` (create the file if absent; if
a renderable test file already exists under another name, extend that one instead)

- `test_collect_accepted_user_edit_ids_announces_each_branch_pass` — capture the sink as above,
  call `collectAcceptedUserEditIds` over a small fixture, assert a label matching
  `/^reconstructing accepted user edits — branch 1\/\d+$/` was emitted.

### 149.3 GREEN — `src/reconstruction_branches.ts`

In `runStageTolerantly` (line 93), emit the stage label before running the stage — one edit
covers all nine chain stages for every target, including nested lineage/copy re-entries (which
are exactly the silent grind):

```ts
    reportReconstructionProgress(`reconstructing ${target} — ${stage}`);
    try {
        return run();
```

(`reportReconstructionProgress` is already imported in this file.)

### 149.4 GREEN — `src/reconstruction_renderable.ts`

In `collectAcceptedUserEditIds`, label each branch pass. Replace the loop body's first line:

```ts
    const branches = findConversationBranches(records);
    for (const [branchIndex, branch] of branches.entries()) {
        reportReconstructionProgress(`reconstructing accepted user edits — branch ${branchIndex + 1}/${branches.length}`);
        const branchRecords = selectBranchRecords(records, branch.tip);
        addBranchUserEditIds(reconstructFilesOver(branchRecords, reader), accepted);
    }
```

That is the whole task: the per-target counter already exists; with per-stage and per-branch
labels every previously silent stretch now advances the console. Do not add labels to the
`executionsByRun` cache-hit path in `executeRunOnce` — cache hits are microseconds and would
flood the stream without conveying progress.

---

## Task 151 — extend the pre-baseline "No" skip into script execution

**Current state:** "No" (`preBaselineReconstructionAllowed === false`,
`src/reconstruction_base_commit.ts:34`) only trims events in `seedBaseCommitBeacon`. Every
script run — including runs wholly before the baseline commit — still executes via
`executeRunOnce` (`src/reconstruction_script_runs.ts:70`), which is the single choke point all
script-execution consumers route through (`discoverScriptCreatedPaths`, `runTouchesTarget`, the
script stage, `summarizeScriptRunFileChanges`). The skip therefore goes there, mirroring the
item-68 read-only gate directly above it. A run is superseded by the baseline exactly when its
timestamp is at-or-before the commit timestamp (matching `seedBaseCommitBeacon`'s insertion
rule: events strictly after the beacon survive).

**Latent cache bug this touches:** `DerivedCaches` (`src/reconstruction_corpus.ts:21`) is
stamped with reader identity + exec-gate flag only, yet `historiesByTarget` ALREADY depends on
the pre-baseline flag today (the beacon trim), and `executionsByRun` will too. Stamp the flag
into the group so a "No" build's caches never serve a "Yes" build.

### 151.1 RED — extend `tests/reconstruction_base_commit.test.ts`

- `test_compute_skipped_baseline_cutoff_is_undefined_while_pre_baseline_reconstruction_is_allowed`
  — with overrides set to this file's existing fixture repo and the flag left at its default
  `true`, `computeSkippedBaselineCutoff()` returns `undefined`.
- `test_compute_skipped_baseline_cutoff_returns_the_commit_timestamp_when_pre_baseline_is_declined`
  — `setPreBaselineReconstructionAllowed(false)` + fixture repo overrides →
  `computeSkippedBaselineCutoff()` equals `readCommitTimestamp(repoDir, baseCommit)`. Reset the
  flag to `true` and overrides to `{}` in `afterEach` (module state — this file already has the
  `afterEach` overrides reset; extend it).

### 151.2 RED — extend `tests/exec-gate.test.ts` (home of the executeRunOnce gate tests)

- `test_execute_run_once_skips_a_run_at_or_before_a_declined_baseline` — Steps: declined flag +
  fixture repo overrides; build a `ScriptRun` timestamped before the fixture commit; call
  `executeRunOnce`; assert `post === undefined` and that the capturing progress sink saw a label
  starting with `PROGRESS_LABEL_PRE_BASELINE_SKIP_PREFIX` (new export). Assert a run
  timestamped AFTER the commit does not get that label.

### 151.3 RED — extend `tests/reconstruction_memo.test.ts`

- `test_derived_caches_rebuild_when_the_pre_baseline_flag_flips` — mirror this file's existing
  exec-gate invalidation test: same records+reader, flip
  `setPreBaselineReconstructionAllowed`, assert `getDerivedCaches` returns a fresh group.

### 151.4 GREEN — `src/reconstruction_base_commit.ts`

```ts
export function isPreBaselineReconstructionAllowed(): boolean {
    return preBaselineReconstructionAllowed;
}

// The declined-baseline cutoff instant, memoized per repo|commit pair: runs at-or-before it are
// superseded by the beacon (task 151). undefined while pre-baseline reconstruction is allowed,
// or when no baseline is configured/readable.
let skippedBaselineCutoffCache: { cachedFor: string; cutoff: Date | undefined } | undefined;

export function computeSkippedBaselineCutoff(): Date | undefined {
    if (preBaselineReconstructionAllowed) {
        return undefined;
    }
    const { repoDir, baseCommit } = getPathOverrides();
    if (repoDir === undefined) {
        return undefined;
    }
    if (baseCommit === undefined) {
        return undefined;
    }
    const cachedFor = `${repoDir.toString()}|${baseCommit.toString()}`;
    if (skippedBaselineCutoffCache?.cachedFor !== cachedFor) {
        skippedBaselineCutoffCache = { cachedFor, cutoff: readCommitTimestamp(repoDir, baseCommit) };
    }
    return skippedBaselineCutoffCache.cutoff;
}
```

### 151.5 GREEN — `src/reconstruction_script_runs.ts`

Import `computeSkippedBaselineCutoff` from `./reconstruction_base_commit.ts` (no cycle:
base_commit does not import this module). Add beside the read-only prefix:

```ts
// Progress label announced instead of a sandbox execution when the run precedes a declined
// baseline (task 151). Exported for the gate tests.
export const PROGRESS_LABEL_PRE_BASELINE_SKIP_PREFIX = "skipping pre-baseline script run";
```

In `executeRunOnce`, directly after the memo-hit return (before the item-68 gate), add:

```ts
    // Task 151: a "No" to the pre-baseline question means the baseline beacon supersedes
    // everything at-or-before the commit — running those scripts is provably wasted work.
    const baselineCutoff = computeSkippedBaselineCutoff();
    if (baselineCutoff !== undefined) {
        if (run.timestamp.getTime() <= baselineCutoff.getTime()) {
            reportReconstructionProgress(
                `${PROGRESS_LABEL_PRE_BASELINE_SKIP_PREFIX} @ ${run.timestamp.toISOString()}${formatRunSource(run)}`,
            );
            const skipped: RunExecution = { pre: new Map(), post: undefined };
            byRun.set(key, skipped);
            return skipped;
        }
    }
```

Every caller already treats `post === undefined` as "no evidence", so discovery, the script
stage, and the run summarizer all skip pre-baseline runs with no further edits.

### 151.6 GREEN — `src/reconstruction_corpus.ts`

Import `isPreBaselineReconstructionAllowed` from `./reconstruction_base_commit.ts` (no cycle:
base_commit does not import corpus). Add `preBaselineAllowed: boolean` to `DerivedCaches`,
stamp it in `buildDerivedCaches`, and in `getDerivedCaches` rebuild the group when
`state.derived.preBaselineAllowed !== isPreBaselineReconstructionAllowed()` (a third
single-condition check matching the existing two). Update the module header comment's validity
sentence to name all three inputs.

---

## Task 152 — "Re-ask baseline" control on the timeline header

**Mechanics:** the answer lives under `baseline:<project>` in sessionStorage
(`webapp/app-fetch.ts:104-113`); `fetchDocument` only re-poses the question when the param is
absent AND the `documentCache` (keyed `${project}|${jsonl ?? "*"}` — note: no choice in the key)
misses. So the control must clear BOTH the stored answer and the project's cached documents,
then `renderRoute()`. Home: the timeline filter bar (`webapp/views/timeline-render-filterbar.ts`
— the timeline's header row, rebuilt per render, with `context.project` in hand). The button
only renders when an answer is stored — no answer means the question was never asked (no
baseline configured) or is already pending.

### 152.1 RED — extend `tests/baseline-question.test.ts`

These helpers are pure sessionStorage/Map operations; use the existing webapp DOM test setup
(`tests/webapp-dom-test-helpers.ts`) if sessionStorage needs a fake in node:

- `test_clear_baseline_choice_removes_the_stored_answer` — `storeBaselineChoice("p", "0")`;
  `clearBaselineChoice("p")`; `getBaselineChoice("p")` is `null`.
- `test_drop_project_documents_evicts_only_that_projects_cache_entries` — seed `documentCache`
  with keys `p|*`, `p|a.jsonl`, `q|*`; `dropProjectDocuments("p")`; only `q|*` remains.

### 152.2 GREEN — `webapp/app-fetch.ts`

Beside the existing choice helpers:

```ts
// task 152: forget the stored answer so the next document fetch sends no preBaseline param —
// which is what lets the server re-ask.
export function clearBaselineChoice(project: string): void {
    sessionStorage.removeItem(computeBaselineKey(project));
}

// task 152: evict one project's cached documents — a cache hit would answer from memory and
// the re-posed question would never reach the wire.
export function dropProjectDocuments(project: string): void {
    for (const key of [...documentCache.keys()]) {
        if (key.startsWith(`${project}|`)) {
            documentCache.delete(key);
        }
    }
}
```

### 152.3 GREEN — `webapp/views/timeline-render-filterbar.ts`

Import `clearBaselineChoice`, `dropProjectDocuments`, `getBaselineChoice` from
`../app-fetch.ts`. In `renderTimelineFilterBar`, after the `allLinesButton` block:

```ts
    // task 152: re-pose the pre-baseline question. Only offered once an answer is stored —
    // no stored answer means no baseline is configured or the question is already pending.
    const reaskBaselineButton = el("button", { class: "toolbar-btn", text: "Re-ask baseline" }) as HTMLButtonElement;
    reaskBaselineButton.hidden = getBaselineChoice(context.project) === null;
    reaskBaselineButton.onclick = () => {
        clearBaselineChoice(context.project);
        dropProjectDocuments(context.project);
        void renderRoute();
    };
```

and append `reaskBaselineButton` to the `bar.replaceChildren(...)` call. No new CSS —
`toolbar-btn` is the bar's existing button style.

---

## Close-out (after all four green)

0. New progress labels (149, 151) are additive, but grep the test tree for assertions that
   count or exactly match progress-sink output (`tests/viewer-progress.test.ts`,
   `tests/exec-gate.test.ts`, any `PROGRESS_LABEL_` matcher) and update any exact-sequence or
   exact-count expectation the new labels shift — by reasoning from the code, since suites are
   not run here.
1. `npx tsc --noEmit` in `jfred/` passes. Do NOT run test suites.
2. Append a dated entry to a `plans/implementation-notes-tasks-149-152.md` (RevEng root) noting
   decisions/deviations (jot:implement maintains this).
3. Stage (never commit): `git add` the touched files in `jfred/`, then in RevEng root stage the
   `jfred` gitlink + plan/notes files.
4. Close tasks 149 150 151 152 via the `taskTools:close-tasks` skill with per-task closure notes.
5. Sonnet-5 subagent writes a ≤40-word single-sentence commit summary; show it to the user.
