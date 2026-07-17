# Plan — TASKS.md item 34: Deterministic synthetic changeIds for script-execution events

## Behavior being built (plain English)

When a script run (e.g. `python3 apply_renames.py`) changes a file but the transcript
contains no Write/Edit/beacon carrying the result, the engine injects a synthetic
`ScriptExecutionEvent`. Today its `changeId` is `new Uuid(randomUUID())`
(`src/reconstruction_script_stage.ts:309`), so the step-timeline replay and the
file-history replay — two independent replays of the same records — stamp the SAME
physical change with two DIFFERENT ids. The timeline step can then never join to the
file-history revision it created (zero-chip pickable turns, unattributed lanes in 29
scenarios).

After this change, the changeId is derived deterministically from data both replays
share — the run's tool_use id (or its timestamp when no tool_use produced the run) plus
the target path — so both replays produce the identical id, the path join works
(`indexChangeIdsToPaths`), and the session join works
(`indexChangeIdsToSessionIds` via the embedded tool_use id).

## Id format

```
scriptRun:<sourceSegment>:<targetPath>
```

- `sourceSegment` = the run's tool_use id (`toolu_…`, `cse_…` — never contains `:`),
  or `String(run.timestamp.getTime())` (epoch ms — never contains `:`) when the run has
  no tool_use id. Because the segment never contains `:`, the first `:` after the
  prefix always terminates it, even though `<targetPath>` may contain anything.
- `<targetPath>` makes the id unique per file when one run changes several files.
- `Uuid` is NOT RFC-4122-restricted (`src/structures/domain.ts:28` — it already models
  `toolu_…`/`cse_…` ids), and the `originalFile:<id>` prefix scheme
  (`src/reconstruction_reseed.ts:87,98` + `resolveSyntheticChangeIdToSourceId`,
  `src/reconstruction_json.ts:142`) is the established precedent for prefixed synthetic
  ids that unwrap to a session-attributable source id. Follow it exactly.

## Out of scope

- `src/reconstruction_git_evidence.ts:377` also uses `randomUUID()` (evidence-spliced
  commit user-edits). The viewer deliberately uses commit MARKERS, not changeIds, for
  those (documented at `src/reconstruction_json.ts` above `CommitMarker`). Do not touch.
- The `webapp/styles.css` "(unattributed)" hide rule (item 31) — re-checked by the user
  after the scenario sweep, not in this change.
- Running any test or suite. Write tests only; the user runs them.

## Files touched

| File | Change |
|---|---|
| `src/reconstruction_script_execution.ts` | `ScriptRun` gains `toolUseId?: Uuid`; `runsInRecord` populates it; new exported `SCRIPT_RUN_CHANGE_ID_PREFIX`, `computeScriptExecutionChangeId`, `resolveScriptRunChangeIdToSourceId` |
| `src/reconstruction_script_stage.ts` | `beaconlessScriptExecutions` uses `computeScriptExecutionChangeId`; drop the now-unused `randomUUID` import |
| `src/reconstruction_json.ts` | `resolveSyntheticChangeIdToSourceId` also unwraps `scriptRun:` ids; update the stale "best-effort" comment in `buildStepSnapshots` (~175-177) |
| `tests/reconstruction_script_execution.test.ts` | unit tests for the two new functions + `toolUseId` plumbing |
| `tests/reconstruction_script_stage.test.ts` | stage-level determinism test (two calls → identical changeIds) |
| `TASKS.md` | mark item 34 done with a closing summary |

No import cycle: `reconstruction_json.ts` does not currently import
`reconstruction_script_execution.ts`, and `reconstruction_script_execution.ts` never
imports `reconstruction_json.ts`.

## Steps — strict red-green order

### Step 1 (RED): unit tests for the new id functions

In `tests/reconstruction_script_execution.test.ts`, add tests (they will fail to compile
until Step 3 — that is the RED phase; do NOT run them, just write them):

```ts
test("test_computeScriptExecutionChangeId_is_deterministic_for_same_run_and_target", () => {
    // Scenario: two independent replays derive the changeId for the same run+target.
    // Steps:
    // a run with a tool_use id and a target path exists.
    const run: ScriptRun = { code: "python3 apply_renames.py", timestamp: new Date("2026-07-01T20:53:49.772Z"), toolUseId: new Uuid("toolu_01GkePu7Mj4DmkPivZapZB8z") };
    const target = new Path("/tmp/demo/core_inventory.py");
    // computing the id twice must yield the identical value.
    const firstChangeId = computeScriptExecutionChangeId(run, target);
    const secondChangeId = computeScriptExecutionChangeId(run, target);
    assert.equal(firstChangeId.toString(), secondChangeId.toString());
});

test("test_computeScriptExecutionChangeId_differs_per_target", () => {
    // Scenario: one run changing two files yields two distinct changeIds.
    // (same run literal as above; two different Path targets; assert.notEqual on toString())
});

test("test_computeScriptExecutionChangeId_embeds_tool_use_id", () => {
    // Scenario: the id's source segment is the run's tool_use id so session attribution can resolve it.
    // assert the id equals `scriptRun:toolu_01GkePu7Mj4DmkPivZapZB8z:/tmp/demo/core_inventory.py`.
});

test("test_computeScriptExecutionChangeId_falls_back_to_timestamp_without_tool_use_id", () => {
    // Scenario: a synthetic run with no tool_use id still gets a deterministic id.
    // run has toolUseId undefined; assert the id equals `scriptRun:<run.timestamp.getTime()>:<target>`.
});

test("test_resolveScriptRunChangeIdToSourceId_extracts_source_segment", () => {
    // Scenario: unwrapping a scriptRun changeId exposes the tool_use id the session index knows.
    // assert resolveScriptRunChangeIdToSourceId("scriptRun:toolu_abc:/a/b.py") === "toolu_abc".
});

test("test_resolveScriptRunChangeIdToSourceId_returns_undefined_for_other_ids", () => {
    // Scenario: real record uuids and originalFile: ids pass through untouched.
    // assert undefined for "0b7f2b4c-…" and for "originalFile:toolu_x".
});

test("test_findScriptExecutionRuns_carries_the_tool_use_id", () => {
    // Scenario: a run parsed from a transcript record remembers which tool_use produced it.
    // Fabricate one assistant record with a Bash tool_use block (copy the fixture style already
    // used in this test file / reconstruction_script_stage.test.ts), call findScriptExecutionRuns,
    // assert runs[0].toolUseId.toString() equals the block id.
});
```

Import `computeScriptExecutionChangeId`, `resolveScriptRunChangeIdToSourceId`, and
`SCRIPT_RUN_CHANGE_ID_PREFIX` from `../src/reconstruction_script_execution.ts`; `Uuid`,
`Path` from `../src/structures/domain.ts`. Match the existing test-file style exactly
(node:test + assert, plain-English step comments).

### Step 2 (RED): stage-level determinism test

In `tests/reconstruction_script_stage.test.ts`, next to the existing
`injectScriptExecutions` tests (which already fabricate records — reuse their fixture
helpers verbatim):

```ts
test("test_injectScriptExecutions_stamps_the_same_changeId_across_replays", () => {
    // Scenario: the step-timeline replay and the file-history replay each call the stage
    // independently; the synthetic event must carry the identical changeId both times.
    // Steps:
    // build the same fabricated records/reader/target the existing injection test uses.
    // call injectScriptExecutions twice with identical inputs.
    // assert both result sets contain a scriptExecution event and their changeIds are equal.
});
```

This test FAILS against current code (randomUUID differs per call) — it is the
regression lock for the whole item.

### Step 3 (GREEN): implement in `reconstruction_script_execution.ts`

1. Extend the type (line 40):

```ts
export type ScriptRun = { code: string; timestamp: Date; cwd?: Path; source?: RecordSource; toolUseId?: Uuid };
```

2. In `runsInRecord` (line 80), add the block id:

```ts
runs.push({ code, timestamp, cwd, source, toolUseId: block.id });
```

(`block.id` is already a `Uuid` — see `indexChangeIdsToSessionIds` calling
`block.id.toString()`.) `resolveScriptIndirection` spreads the run (`{ ...run, code: body }`)
so `toolUseId` survives indirection untouched.

3. Add, next to the `ScriptRun` type:

```ts
// Prefix marking a synthetic script-execution changeId. Follows the originalFile: precedent
// (reconstruction_reseed.ts): a prefixed id that resolveSyntheticChangeIdToSourceId can unwrap.
export const SCRIPT_RUN_CHANGE_ID_PREFIX = "scriptRun:";

// Deterministic changeId for a synthetic script-execution event. Both the step-timeline replay
// and the file-history replay derive it from the same records, so their events join — the fix
// for per-replay randomUUID ids that could never match (TASKS.md item 34). The source segment
// (tool_use id, or epoch-ms timestamp for a run no tool_use produced) never contains ":", so
// the first ":" after the prefix always terminates it even when the target path is unusual.
export function computeScriptExecutionChangeId(run: ScriptRun, target: Path): Uuid {
    const sourceSegment = run.toolUseId?.toString() ?? String(run.timestamp.getTime());
    return new Uuid(`${SCRIPT_RUN_CHANGE_ID_PREFIX}${sourceSegment}:${target.toString()}`);
}

// The session-attributable source id inside a scriptRun: changeId, or undefined when the id is
// not a scriptRun: id (real record uuids, originalFile: seeds, blob refs pass through).
export function resolveScriptRunChangeIdToSourceId(changeId: string): string | undefined {
    if (!changeId.startsWith(SCRIPT_RUN_CHANGE_ID_PREFIX)) {
        return undefined;
    }
    const rest = changeId.slice(SCRIPT_RUN_CHANGE_ID_PREFIX.length);
    const separatorIndex = rest.indexOf(":");
    return separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
}
```

Note: `Uuid` is currently imported as `type Uuid` in this file (line 6) — the new code
constructs `new Uuid(...)`, so change that import to a value import.

### Step 4 (GREEN): use it in `reconstruction_script_stage.ts`

At line 309, replace:

```ts
changeId: new Uuid(randomUUID()),
```

with:

```ts
changeId: computeScriptExecutionChangeId(run, target),
```

Add `computeScriptExecutionChangeId` to the existing import from
`./reconstruction_script_execution.ts` (line 24 area). Remove the now-unused
`import { randomUUID } from "node:crypto";` (line 5) and, if `Uuid` becomes unused in
this file, its import too (check with `grep -n "Uuid" src/reconstruction_script_stage.ts`
— other uses may remain).

### Step 5 (GREEN): unwrap in `reconstruction_json.ts`

1. Add to the imports: `resolveScriptRunChangeIdToSourceId` from
   `./reconstruction_script_execution.ts`.
2. Extend `resolveSyntheticChangeIdToSourceId` (line 142):

```ts
function resolveSyntheticChangeIdToSourceId(changeId: string): string {
    if (changeId.startsWith(ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX)) {
        return changeId.slice(ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX.length);
    }
    const scriptRunSourceId = resolveScriptRunChangeIdToSourceId(changeId);
    if (scriptRunSourceId !== undefined) {
        return scriptRunSourceId;
    }
    return changeId;
}
```

Also update its doc comment to mention the second prefix. A timestamp-fallback source
segment (epoch ms) matches nothing in the session index and resolves to no session —
identical to today's behavior for those runs, by design.

3. Update the stale "best-effort" ponytail comment inside `buildStepSnapshots`
   (~lines 175-177): script-execution changeIds are now deterministic and DO join;
   the remaining unresolvable cases are re-stamped/off-branch revisions.

### Step 6: verify compilation only

Run `npx tsc --noEmit` (compile check, not a test run) and fix any type errors.
Do NOT run `npm test` or the scenario sweep — the user does that.

### Step 7: close TASKS.md item 34

Mark item 34 `[x]` with a 3-5 line closing summary naming the id format, the three new
exports, and the note that item 31's CSS rule re-check now becomes possible after the
user's scenario sweep confirms the 29 scenarios attribute their script turns.

## Risks checked

- **Uniqueness**: per (run, target) — `beaconlessScriptExecutions` emits at most one
  event per run per target (loop over `runs`, one `outcome` each). Chained runs have
  distinct tool_use ids/timestamps. Duplicate ids across the surviving/rewound replays
  are the POINT (they must join); `indexChangeIdsToPaths` maps both to the same path
  and `changedPaths` dedups via `Set`.
- **No test assumes randomness**: `grep -rn "randomUUID" tests/` is empty; no test
  asserts RFC-4122 shape for script-event changeIds.
- **No cycle**: `reconstruction_json.ts` gains an import of
  `reconstruction_script_execution.ts`, which imports nothing from json.
- **Webapp**: consumes changeIds as opaque strings; prefixed ids already flow today
  (`originalFile:`), so no webapp change is needed.
