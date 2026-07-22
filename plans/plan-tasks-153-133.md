# Plan — tasks 153 + 133 (jfred submodule)

All file paths below are relative to `jfred/` (the submodule root). Do not run any
tests or suites — the user runs them after the work is staged. TDD still applies:
write each RED test before its GREEN code; verification is by reading, and by the
user's later run.

Established facts (verified this session; do not re-derive):

- Task 153: `GET /api/project-paths?project=<name>` already returns the merged
  `WireProjectPathsEntry` including `fileHistory`
  (`src/viewer_api_repo.ts:158` → `getMergedProjectPaths`). The popover's
  `refreshProjectPathsSection` (`webapp/app-paths-project.ts:145`) prefills only
  `repo`/`baseCommit`.
- Task 133: in the baseline-demo project, the agent turn at JSONL line 78 owns TWO
  step snapshots (an external user-edit at 23:44:01.904Z and the `least_valuable`
  Edit at 23:44:09.283Z). Both revisions exist in `filesTouched`; the Edit's chip is
  swallowed because `mergeSnapshotFileChanges` (`webapp/views/timeline-changes.ts:187`)
  dedupes a turn's merged chips by PATH, first chip wins. The pre-baseline trim named
  in the task description is NOT the mechanism (the Edit is 4s after the baseline
  instant and survives it in both consent modes).

## Part A — task 153: prefill the per-project file-history override

### A1. RED: unit tests for the prefill helper (tests/app-header.test.ts)

Append three tests to `tests/app-header.test.ts` (150 lines today; stays well under
the 250-line hook cap). Use the existing harness (`setupWebappDom`). The helper
under test is `prefillFileHistoryOverrideField` exported from `webapp/app-header.ts`
(created in A2). Each test names its steps in plain-English comments per the TDD
guide.

1. `test_prefill_with_override_shows_fields_and_fills_value`
   - `setupWebappDom()`; import `prefillFileHistoryOverrideField` from
     `../webapp/app-header.ts`.
   - Call it with `"/overrides/fh"`.
   - Assert `#file-history-fields` is not hidden and
     `#file-history-dir-input` value is `"/overrides/fh"`.
2. `test_prefill_without_override_restores_derived_state_after_a_prefill`
   - `setupWebappDom()`; call with `"/overrides/fh"`, then call with `undefined`.
   - Assert `#file-history-fields` is hidden again and the input value is no
     longer `"/overrides/fh"`. (Do NOT assert an exact restored value: earlier
     tests in this file may have run `initializeHeader` in the same process and
     set the module's `reportedFileHistoryDir` to a stubbed dir — the restore
     target is whatever that module state holds.)
3. `test_prefill_without_override_leaves_untouched_state_alone`
   - `setupWebappDom()`; do NOT prefill first. Unhide `#file-history-fields`
     manually and set the input to `"/typed/by/user"` (simulating the task-136
     explicit-override gesture).
   - Call the helper with `undefined`.
   - Assert the fields are still visible and the value is unchanged — a project
     with no stored override must never clobber a user's manual global gesture.

Module-state caveat for the test file: `app-header.ts` is imported once per test
process, so the helper's module state persists across tests. Test 3 must therefore
run the `undefined` call only after re-running `setupWebappDom()` AND after the
prior test's prefill was already cleared by its own `undefined` call (test 2 ends
cleared). Keep the tests in the order listed.

### A2. GREEN: the helper in webapp/app-header.ts

1. Hoist the existing closure variable `reportedFileHistoryDir` (line 94, inside
   `initializeHeader`) to module scope, directly above `initializeHeader`. Keep its
   comment. `applyConfig` keeps assigning it; no other behavior change.
2. Add module state + the exported helper (module scope, near the hoisted
   variable). The helper is the ONE place both the task-153 prefill and its
   restore live, so a stored override surfaces on popover open and a prior
   project's prefill can never leak into the next project or into the global
   "Change folder" POST:

```ts
// task 153: the per-project fileHistory override currently prefilled into the task-136
// field ("" = none). Lets computeFileHistoryDirToPost treat the prefilled value as
// UNEDITED (post "" = derive) and lets the next popover open restore the derived state.
let prefilledProjectOverrideDir = "";

// task 153: surface a stored per-project fileHistory override in the task-136 field on
// popover open. No override restores the derived state ONLY when a prefill is active —
// a user's manual explicit-override gesture is never clobbered.
export function prefillFileHistoryOverrideField(overrideDir: string | undefined): void {
    const fileHistoryFields = document.getElementById("file-history-fields")!;
    const fileHistoryInput = document.getElementById("file-history-dir-input") as HTMLInputElement;
    if (overrideDir !== undefined) {
        fileHistoryFields.hidden = false;
        fileHistoryInput.value = overrideDir;
        prefilledProjectOverrideDir = overrideDir;
        return;
    }
    if (prefilledProjectOverrideDir === "") {
        return;
    }
    fileHistoryFields.hidden = true;
    fileHistoryInput.value = reportedFileHistoryDir;
    prefilledProjectOverrideDir = "";
}
```

3. In `computeFileHistoryDirToPost` (inside `initializeHeader`), add one guard
   between the `reportedFileHistoryDir` check and the final return, so an
   unedited prefilled per-project value is posted as `""` (= re-derive) instead of
   silently becoming a GLOBAL override:

```ts
        if (fileHistoryInput.value === prefilledProjectOverrideDir) {
            return "";
        }
```

   (When no prefill is active the variable is `""`; an empty visible field already
   posted `""` before, so this guard changes nothing outside the prefill case.)

### A3. RED: popover-open prefill test (tests/app-paths-project.test.ts)

Append `test_refresh_prefills_file_history_field_from_stored_override` to
`tests/app-paths-project.test.ts` (mirrors the existing two tests' structure):

- `setupWebappDom()`; `stubFetchRoutes({ "/api/project-paths": { repo: "/repos/p", fileHistory: "/stored/fh" } })`.
- `await refreshProjectPathsSection("proj-a")`.
- Assert `#file-history-fields` is not hidden and `#file-history-dir-input` value
  is `"/stored/fh"`.
- Then re-stub with `{ repo: "/repos/p" }` (no `fileHistory`) and refresh again;
  assert the fields are hidden again — the stored-override prefill from the first
  refresh does not leak into a project without one.

### A4. GREEN: call the helper from refreshProjectPathsSection

In `webapp/app-paths-project.ts`:

1. Extend the import from `./app-header.ts` to also bring in
   `prefillFileHistoryOverrideField`.
2. In `refreshProjectPathsSection`, after the two existing prefill lines, add:

```ts
    prefillFileHistoryOverrideField(entry.fileHistory);
```

No other call sites: the popover-open path (`initializeProjectPathsSection`) already
routes through `refreshProjectPathsSection` for project routes, and non-project
routes keep the section hidden without touching the global fields.

## Part B — task 133: distinct same-file revisions on one turn each keep their chip

### B1. RED: merged-chips test (new file tests/timeline-changes-merged-chips.test.ts)

`tests/timeline-changes.test.ts` sits at 248 lines (250-line hook cap) — the new
test goes in a NEW file, precedent `tests/timeline-changes-baseline.test.ts`.

Write `test_two_snapshots_with_distinct_revisions_of_one_file_keep_both_chips`:

- Build a `WireTimelineDocument`-shaped fixture (mirror the fixture style already
  used in `tests/timeline-changes.test.ts`) whose `filesTouched` holds ONE history
  for target `/w/inventory.py` with two revisions: changeId `"user-edit-1"` (kind
  `user-edit`) and changeId `"toolu_edit_2"` (kind `edit`). `rewoundFilesTouched: []`.
- `indexRevisionsByChangeId(document)` → the index.
- One node object with `kind: "agent-turn"` and `snapshots` = two
  `WireStepSnapshot`s: first with `changeIds: ["user-edit-1"]`, second with
  `changeIds: ["toolu_edit_2"]` (both `changedPaths: []`, distinct `when`s).
- `deriveNodeFileChanges([node], index)`.
- Assert `node.fileChanges` has length 2, and the two chips carry changeIds
  `"user-edit-1"` and `"toolu_edit_2"` in snapshot order — this is exactly the
  baseline-demo shape where the Edit's chip was swallowed.

Also write `test_repeated_changeid_across_snapshots_still_collapses`:

- Same fixture, but BOTH snapshots carry `changeIds: ["user-edit-1"]`.
- Assert `node.fileChanges` has length 1 — the fix must not duplicate a chip when
  the SAME revision echoes across snapshots.

### B2. GREEN: dedupe by path+changeId in webapp/views/timeline-changes.ts

Replace the path-keyed dedupe in the MERGE pass only (the within-step dedupe in
`deriveFileChanges` keeps path keys — rename-pair collapse lives there):

```ts
// task 133: the merge dedupe key. Two snapshots on one turn may hold DISTINCT revisions
// of the same file (baseline-demo: an external user-edit then an agent Edit) — each keeps
// its chip; only a repeat of the SAME revision collapses. Fallback chips (no changeId)
// still collapse per path.
function computeMergedChipKey(change: FileChange): string {
    return `${change.path}|${change.changeId ?? ""}`;
}

// A turn's file chips: deriveFileChanges merged over its snapshots, deduped by
// path+changeId (task 133).
function mergeSnapshotFileChanges(snapshot: WireStepSnapshot, revisionIndex: RevisionIndex, seenChipKeys: Set<string>, changes: FileChange[]): void {
    for (const change of deriveFileChanges(snapshot, revisionIndex)) {
        if (seenChipKeys.has(computeMergedChipKey(change))) {
            continue;
        }
        seenChipKeys.add(computeMergedChipKey(change));
        changes.push(change);
    }
}
```

`deriveMergedFileChanges` renames its `seenPaths` local to `seenChipKeys` and types
it `Set<string>`. No caller signatures change. File is 226 lines; the additions keep
it under the 250 cap.

## Part C — wrap-up

1. Delete the throwaway probe `jfred/scratch-probe133.ts`.
2. Stage (do not commit) all changed/new files in the `jfred` submodule:
   `webapp/app-header.ts`, `webapp/app-paths-project.ts`,
   `webapp/views/timeline-changes.ts`, `tests/app-header.test.ts`,
   `tests/app-paths-project.test.ts`, `tests/timeline-changes-merged-chips.test.ts`.
3. Close tasks 153 and 133 via the close-tasks skill. Task 133's closure note must
   record that the described mechanism (pre-baseline trim) was refuted and the real
   root cause was the merged-chip path dedupe.
4. Run no tests; the user runs them.
