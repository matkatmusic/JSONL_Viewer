# Task 67 — Script-run details: script + before/after diff panels

## Behavior (plain English)

When the reconstruction phase executes a consented script run in the sandbox, the engine
already computes the run's pre-execution and post-execution file states (`executeRunOnce`,
memoized). This plan captures the difference between those two states — which files the run
changed or created — onto the wire document as a new `scriptRuns` field, carries it forward
into the timeline render (a "modified N files" badge on the run's Bash/MCP tool-call row),
and gives that row its own Details-pane mode: **left panel = the script source, right panel
= each affected file's before/after diff for that run**.

## Constraints (mandatory)

- **DO NOT run any tests, test suites, or typecheck commands.** The user runs them after the
  work is complete. Author every test TDD-style (test written before the code it exercises,
  asserting the behavior described here), but defer execution to the user.
- Follow `plans/coding-requirements.md`: domain types (`Uuid`/`Path`/`Date`) in src, wire
  mirrors as plain strings in webapp; enum-member comparisons; verb-named functions; no
  re-export shims.
- Every touched file must stay ≤ 250 lines (post-edit hook). Line budgets are listed per step.
- Test runner is `node --import tsx --test` via `npm test` (NOT vitest) — but do not run it.

## Step 1 — Engine: capture per-run changed paths (`src/reconstruction_script_runs.ts`)

File is 183 lines; this step adds ~35 (~218 total).

1a. Write the test file `tests/script-run-changes.test.ts` FIRST (new file, imports the
    node:test / assert/strict pattern of `tests/document-timeline-fields.test.ts`):

    - `test_declined_build_lists_script_runs_with_empty_changed_paths`
      Build `buildProjectDocument([S25_JSONL], undefined)` (fixture from `tests/fixtures.ts`;
      s25 is the multi-file script rename) with the exec gate at its default (off).
      Assert `document.scriptRuns.length > 0`; every entry has a non-empty `code` string,
      a `timestamp` that is a `Date`, and `changedPaths` deep-equal `[]` (declined build:
      nothing may execute, so nothing is reported changed).

    - `test_consented_build_reports_script_changed_paths`
      Wrap in `setImpureExecutionAllowed(true)` / `finally setImpureExecutionAllowed(false)`
      (the `tests/exec-gate.test.ts` precedent, import from `src/reconstruction_exec_gate.ts`).
      Build the same s25 document. Assert at least one entry has `changedPaths.length >= 2`
      (the s25 script rewrites multiple files in one run), and every element of every
      `changedPaths` is `instanceof Path`.

    - `test_script_changed_paths_name_files_the_document_tracks`
      Same consented build. For the run with non-empty `changedPaths`, assert every changed
      path's basename appears among the basenames of `document.filesTouched[].target`
      (basename comparison, not full path — the sandbox state keys may be cwd-relative
      before resolution; basename is the stable join).

1b. Implement in `src/reconstruction_script_runs.ts`:

    ```ts
    // One recorded script run and the files its sandbox execution changed or created —
    // captured at reconstruction time (executeRunOnce is memoized, so consented builds pay
    // nothing extra) and carried onto the wire document for the timeline's script-run rows.
    export type ScriptRunFileChanges = {
        toolUseId: Uuid | undefined;
        timestamp: Date;
        code: string;
        changedPaths: Path[];
    };

    export function summarizeScriptRunFileChanges(
        records: TranscriptRecord[],
        reader: BackupReader | undefined,
    ): ScriptRunFileChanges[] {
        return findScriptExecutionRuns(records).map((run) => ({
            toolUseId: run.toolUseId,
            timestamp: run.timestamp,
            code: run.code,
            changedPaths: computeRunChangedPaths(run, records, reader),
        }));
    }

    // The absolute paths executeRunOnce's pre/post diff shows changed, created, or deleted —
    // [] on a declined build (nothing may execute) or when no sidecar reader exists.
    function computeRunChangedPaths(
        run: ScriptRun,
        records: TranscriptRecord[],
        reader: BackupReader | undefined,
    ): Path[] {
        if (reader === undefined || !isImpureExecutionAllowed()) return [];
        const execution = executeRunOnce(run, records, reader);
        if (execution.post === undefined) return [];
        const changed = new Map<string, Path>();
        for (const key of new Set([...execution.pre.keys(), ...execution.post.keys()])) {
            if (isJunkStateKey(key)) continue;
            if (execution.pre.get(key) === execution.post.get(key)) continue;
            const absolute = resolveAgainstCwd(run.cwd, new Path(key));
            if (!changed.has(absolute)) changed.set(absolute, new Path(absolute));
        }
        return [...changed.values()];
    }
    ```

    Rationale pins: the union of pre/post keys covers created (post-only), deleted
    (pre-only), and modified (both, different content) in one comparison; `isJunkStateKey`
    and `resolveAgainstCwd` already exist in this module (the `discoverScriptCreatedPaths`
    precedent at src/reconstruction_script_runs.ts:160). `Uuid`/`Path` imports already exist.
    The gate check comes BEFORE `executeRunOnce` so a declined build never executes a script.

## Step 2 — Wire the field into the document (`src/reconstruction_json.ts`)

File is 207 lines; this step adds ~6 (~213 total).

- Add `scriptRuns: ScriptRunFileChanges[]` to `ReconstructionDocument` (import the type from
  `./reconstruction_script_runs.ts`).
- In `buildReconstructionDocument`, after `const toolCalls = findToolCalls(records);` add:
  `reportReconstructionProgress("summarizing script-run file changes");`
  `const scriptRuns = summarizeScriptRunFileChanges(records, reader);`
  and include `scriptRuns` in the document literal.
- `Path`/`Uuid`/`Date` serialize via their `toJSON`/ISO forms — no extra serialization work.

## Step 3 — Disk-cache hydration check (`src/reconstruction_document_cache.ts`)

Read the module (item 79). If hydration rebuilds domain objects field-by-field (the
gitOperations / toolCalls precedent), extend it to rehydrate `scriptRuns` entries
(`toolUseId` → `Uuid | undefined`, `timestamp` → `Date`, `changedPaths` → `Path[]`);
if hydration is generic/pass-through, change nothing. Older cached documents without the
field must hydrate to `scriptRuns: []` (or stay absent — the webapp field is optional).
Add one test to `tests/script-run-changes.test.ts` ONLY if the module's existing tests
(`tests/reconstruction_document_cache.test.ts`) show a per-field hydration pattern to extend;
mirror that pattern.

## Step 4 — Webapp: wire type + timeline node stamp

4a. Test FIRST — new file `tests/script-run-details-view.test.ts` (wire-shaped literals, the
    `tests/details-viewmodels.test.ts` style):

    - `test_deriveToolCallNodes_stamps_scriptRun_on_modifying_runs`
      A wire document literal with `toolCalls: [{toolUseId: "toolu_1", ...}, {toolUseId:
      "toolu_2", ...}]` and `scriptRuns: [{toolUseId: "toolu_1", timestamp, code,
      changedPaths: ["/p/a.py"]}, {toolUseId: "toolu_2", ..., changedPaths: []}]`.
      Assert the toolu_1 node carries `scriptRun` (the matching wire entry), the toolu_2
      node's `scriptRun` is `undefined` (empty changedPaths = not a modifying run), and a
      document without `scriptRuns` stamps nothing.

4b. Implement:

    - `webapp/views/timeline-types.ts` (211 lines, +~12): add
      ```ts
      // One script run and the files its consented sandbox execution changed (task 67).
      export type WireScriptRun = {
          toolUseId?: string;
          timestamp: string;
          code: string;
          changedPaths: string[];
      };
      ```
      add `scriptRuns?: WireScriptRun[];` to `WireTimelineDocument` (optional — the
      older-cached-document convention `toolCalls` set), and `scriptRun?: WireScriptRun;`
      to `ToolCallNode` (plus `scriptRun?: undefined;` on the other node types ONLY if the
      discriminated-union style there requires it — mirror how `toolUseId?: undefined` is
      declared on `TurnNode`).

    - `webapp/views/timeline-node-derive.ts` (56 lines, +~12): in `deriveToolCallNodes`,
      build `const scriptRunsByToolUseId = new Map(...)` from `document.scriptRuns ?? []`,
      skipping entries whose `toolUseId` is undefined or whose `changedPaths` is empty;
      stamp `scriptRun: scriptRunsByToolUseId.get(call.toolUseId)` on each node.

## Step 5 — Timeline render carry-forward (`webapp/views/timeline-render-rows.ts` + CSS)

File is 213 lines, +~6. Directly after the task-103 FAILED badge block
(`if (node.isError === true) {...}`), add the modified-files badge:

```ts
// task 67: a script run the sandbox proved modified files carries its count on the row.
if (node.scriptRun !== undefined) {
    line.append(el("span", { class: "script-files-badge", text: `modified ${node.scriptRun.changedPaths.length} file(s)` }));
}
```

`webapp/styles.css`: add `.script-files-badge` styled like `.failed-badge` (find it in the
file and copy its shape) but in an informational color (the timeline's existing accent, not
red).

No DOM test — the project tests view-model halves only (details-viewmodels precedent).

## Step 6 — Details pane script-run mode

6a. Tests FIRST, appended to `tests/script-run-details-view.test.ts`:

    - `test_buildScriptRunDetailsViewModel_resolves_files_to_revisions`
      Wire literal: `filesTouched` holds a history `target: "/p/a.py"` with two revisions,
      the second's `changeId` = `"scriptRun:toolu_1:/p/a.py"`. The scriptRun entry is
      `{toolUseId: "toolu_1", changedPaths: ["/p/a.py", "/p/missing.py"], ...}`.
      Assert the view model returns `code` verbatim and two file entries: a.py resolved to
      `revisionNumber: 2` with its history target, missing.py with `target: undefined`
      (no reconstructed history).

    - `test_buildScriptRunDetailsViewModel_falls_back_to_first_revision_at_or_after_run`
      Same shape but NO revision carries a `scriptRun:` changeId (the beacon-evidenced case,
      s25): revisions timestamped before and at/after the run's timestamp. Assert the file
      resolves to the FIRST revision whose timestamp >= the run's timestamp; when none is
      at/after, to the LAST revision.

6b. Implement — new module `webapp/views/details-script-run.ts` (~130 lines), keeping the
    established split (pure view-model exported + DOM renderer):

    - Mirror constant: `timeline-changes.ts` already owns wire-string mirrors
      (`GIT_BASE_CHANGE_ID_PREFIX` precedent). Add
      `export const SCRIPT_RUN_CHANGE_ID_PREFIX = "scriptRun:";` there (+2 lines) and import
      it here — one canonical home, no duplicate literal.

    - View model (pure, tested):
      ```ts
      export type ScriptRunFileEntry = { path: string; target: string | undefined; revisionNumber: number | undefined };
      export type ScriptRunDetailsViewModel = { code: string; files: ScriptRunFileEntry[] };
      export function buildScriptRunDetailsViewModel(scriptRun: WireScriptRun, document: WireTimelineDocument): ScriptRunDetailsViewModel
      ```
      Per changed path: find the history in `document.filesTouched` whose `target` equals the
      path OR ends with `"/" + path` (the engine's `refForTarget` join, mirrored); absent →
      `{path, target: undefined, revisionNumber: undefined}`. Within a found history pick,
      in order: (1) the revision whose `changeId` starts with
      `SCRIPT_RUN_CHANGE_ID_PREFIX + scriptRun.toolUseId + ":"`; (2) the first revision whose
      `timestamp >= scriptRun.timestamp`; (3) the last revision. `revisionNumber` is 1-based
      (the `buildRevisionCards` convention).

    - DOM renderer:
      ```ts
      export async function renderDetailsScriptRunMode(node: ToolCallNode, nodeIndex: number, context: DetailsContext): Promise<void>
      ```
      - `revealDetailsPane()`; `setDetailsHeader(computeDetailsHeaderText(node, {index: nodeIndex, total: context.nodes.length}))`
        (both already handle tool-call nodes generically).
      - Left pane (`#details-left`): `replaceChildren` a `.pane-title` reading `"Script"` and a
        `<pre class="script-source">` containing `viewModel.code` as plain text.
        (ponytail: no syntax highlight — add `renderCodeInto` when asked.)
      - Right pane: `setRightPaneLabel("Before / after this run")`; `hideDiffModeToggle()`;
        `clearRightPaneBody()` returns the body element — append one section per file entry:
        a `.pane-title` with the file path, then the diff. **Before writing the diff render,
        read `webapp/views/details-revision-view.ts` and `webapp/views/details-diff.ts`** and
        reuse their exact per-revision path: fetch blocks via
        `fetchRevisionDiffBlocks(context.project, entry.target, fullContentsIsOn())`, select
        `blocks[entry.revisionNumber - 1]`, and render that block's text with the same
        diff-text renderer the Revision View uses (`renderDiffText` in
        `webapp/views/diff-vs-base.ts`, or whatever those two files actually call — reuse,
        never re-implement). Entries with `target: undefined` render a `.dempty` note
        `"no reconstructed history for <path>"` instead of a diff.
      - `webapp/styles.css`: `.script-source { }` — monospace, `overflow: auto`,
        `white-space: pre`, capped height consistent with the pane.

6c. Dispatch — `webapp/views/timeline-render-selection.ts` (106 lines, +~4): in
    `selectTimelineRow`'s mode branch, before the message-mode fallback:
    ```ts
    } else if (node.kind === TOOL_CALL_NODE_KIND && node.scriptRun !== undefined) {
        await renderDetailsScriptRunMode(node, nodeIndex, context.detailsContext);
    } else {
    ```
    Import `renderDetailsScriptRunMode` and `TOOL_CALL_NODE_KIND`. (`scriptRun` is only ever
    stamped when `changedPaths` is non-empty — Step 4b — so no length re-check here.)

## Step 7 — Wrap-up

- Update `webapp/views/timeline-changes.ts` header comment only if its top-of-file comment
  enumerates its exports (keep honest).
- Stage everything (`git add` the touched files). DO NOT commit. DO NOT run tests/typecheck.

## Files touched (summary)

| File | Change | Budget |
|---|---|---|
| src/reconstruction_script_runs.ts | + type + 2 functions | 183→~218 |
| src/reconstruction_json.ts | + document field + build call | 207→~213 |
| src/reconstruction_document_cache.ts | hydration for scriptRuns (only if per-field) | check |
| webapp/views/timeline-types.ts | + WireScriptRun, document + node fields | 211→~225 |
| webapp/views/timeline-node-derive.ts | join scriptRuns → node stamp | 56→~70 |
| webapp/views/timeline-render-rows.ts | modified-files badge | 213→~219 |
| webapp/views/timeline-render-selection.ts | dispatch to script-run mode | 106→~112 |
| webapp/views/timeline-changes.ts | + SCRIPT_RUN_CHANGE_ID_PREFIX mirror | +2 |
| webapp/views/details-script-run.ts | NEW: view model + renderer | ~130 |
| webapp/styles.css | .script-files-badge, .script-source | +~15 |
| tests/script-run-changes.test.ts | NEW: 3 engine tests | ~90 |
| tests/script-run-details-view.test.ts | NEW: 3 view-model tests | ~140 |
