# Task 155 — Represent script moves as true rename revisions

Goal behavior, in plain English: when an executed script provably MOVES a file
(the sandbox pre/post diff pairs a deleted key with a created key holding
byte-identical content — task 143's `matchRenamePairs` proof), the engine emits
a first-class `EventKind.rename` event for that pair. Rename events are what
`buildRenameChain` consumes, so the source's history then merges into the
destination automatically: s85's `one.py` stops appearing as an alive
1-revision history, and `core_one.py`'s ladder gains the source's `Write`
revision plus a rename revision — exactly how a Bash `mv` already renders.

Why a third evidence channel is needed (context for the implementer, not work):
`reconstruction_script_renames.ts` already emits rename events from two
channels — printed `old -> new` stdout lines and two-string-literal
`shutil.move("a.py","b.py")` code. s85's `move_files.py` moves glob-found
files with variable arguments and prints nothing that matches, so neither
fires. The sandbox diff is the only evidence, and it is already computed for
the wire (`computeRunFileOutcome` → `renamedPaths`) — this plan turns the same
proof into events.

## Constraints the implementation must respect

- **Do NOT run the full test suite or the scenario sweep** — the user runs
  them after. Write tests red-first; the Stop hook auto-runs edited test
  files. `npm run typecheck` is allowed and required at the end.
- **250-line cap per source file.** `reconstruction_script_runs.ts` is at 246
  and `reconstruction_branches.ts` at 244 — neither can host new logic. The
  new channel gets its own module. The branches.ts wiring below is budgeted
  at +5 lines (1 import + 4 body) = 249; do not exceed 250.
- **No import cycle**: the new module imports from `reconstruction_script_runs.ts`
  (which imports from `reconstruction_script_renames.ts`) — so the new module
  must not be imported by either of them. Only `reconstruction_branches.ts`
  and `reconstruction_renderable.ts` import it.
- **Do not touch `reconstruction_script_prestate.ts`'s rename chain**
  (line 150). The pre-state build runs INSIDE `executeRunOnce`; feeding
  sandbox-proven renames into it would recurse into the in-flight execution —
  the exact re-entrancy task 162's replay window exists to prevent.
- Project coding requirements apply (`plans/coding-requirements.md`): domain
  types (`Path`, `Uuid`, `Date`), verb-named functions, enum-member
  comparisons, DRY (reuse `matchRenamePairs`, `executeRunOnce`,
  `computeScriptExecutionChangeId`, `resolveAgainstCwd` — write no new
  matcher/resolver logic).

## Phase A — RED: tests for the new channel

New file `jfred/tests/reconstruction_script_move_events.test.ts` (naming per
the Stop hook rule `tests/<module>.test.ts`). Copy the record/reader/consent
fixture pattern from `jfred/tests/reconstruction_script_stage.test.ts` and
`tests/overrides-test-helpers.ts` (they fabricate transcript records with an
executor tool_use + tool_result and enable the impure-execution gate; the
sandbox genuinely runs Python in those tests, headless-safe). The fixture
script must move files the way s85 does — glob/variable form, e.g.:

```python
import glob, shutil
for path in sorted(glob.glob("*.py")):
    if path.startswith("core_"):
        continue
    shutil.move(path, "core_" + path)
```

so neither existing rename channel can match, and the fixture must include a
prior `Write` of `one.py` (content the sandbox pre-state can see via the
records) so the move is provable.

Tests (each one behavior, `test_<behavior>` names, plain-English step
comments in the body):

1. `test_sandbox_proven_move_becomes_rename_event` — calling
   `appendScriptMoveRenames(extractedEvents, records, reader, seed)` returns
   the input events PLUS one `EventKind.rename` event with `from` =
   `<cwd>/one.py`, `to` = `<cwd>/core_one.py`, `changeId` =
   `computeScriptExecutionChangeId(run, from)` (assert the `scriptRun:`
   prefix and the from-path suffix), `timestamp` = the run's timestamp.
2. `test_declined_consent_appends_nothing` — with the impure-execution gate
   OFF, the return value is the input events array content, unchanged.
3. `test_missing_reader_appends_nothing` — `reader` undefined → input
   unchanged (the channel needs sandbox execution).
4. `test_pair_already_evidenced_is_not_duplicated` — when the input events
   already contain a rename event with the same from/to (fabricate one, as
   the stdout channel would have produced), no second rename is appended.
5. `test_move_source_history_merges_into_destination` — end-to-end through
   `reconstructFilesOver(records, reader)`: the returned histories contain NO
   history keyed `…/one.py`; the history keyed `…/core_one.py` contains, in
   order, the source's write/create revision, a rename revision whose
   `rename.from` ends `one.py`, and the (script-execution) content state.

Run nothing manually; the Stop hook runs the new test file and it must FAIL
(module doesn't exist yet) before Phase B.

## Phase B — GREEN: new module `jfred/src/reconstruction_script_move_events.ts`

Header comment: sandbox-proven script moves (task 155) — the third rename
evidence channel; why the other two miss glob moves; that dedupe defers to
them.

```ts
import { EventKind } from "./structures/vocabulary.ts";
import { Path } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import type { FileEvent } from "./reconstruction_engine.ts";
import { isImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { resolveAgainstCwd } from "./structures/path-resolve.ts";
import {
    computeScriptExecutionChangeId,
    findScriptExecutionRuns,
} from "./reconstruction_script_execution.ts";
import { matchRenamePairs } from "./reconstruction_script_renames.ts";
import { executeRunOnce, selectRunsWithinReplayWindow } from "./reconstruction_script_runs.ts";
import type { LineageContentBefore } from "./reconstruction_script_prestate.ts";

// The `${from}|${to}` key of a rename event, for deduping this channel against
// the stdout / code-literal channels (and itself).
function renamePairKeyOf(from: Path, to: Path): string {
    return `${from.toString()}|${to.toString()}`;
}

// Sandbox-proven script moves as first-class rename events (task 155): a glob-driven
// shutil.move prints no arrow line and has no literal-argument call, so the only proof
// is the executed run's pre/post diff (matchRenamePairs). Emitting the pair as a rename
// event lets buildRenameChain merge the moved-away source's history into the destination.
// Returns the input events unchanged on a declined build or readerless reconstruction —
// the source then stays a separate history, exactly as before this channel existed.
// Runs are window-filtered (selectRunsWithinReplayWindow) so a lineage replay in
// progress never re-enters its own in-flight execution (task 162 discipline).
export function appendScriptMoveRenames(
    events: FileEvent[],
    records: TranscriptRecord[],
    reader: BackupReader | undefined,
    seedContent?: LineageContentBefore,
): FileEvent[] {
    if (reader === undefined || !isImpureExecutionAllowed()) {
        return events;
    }
    const knownPairKeys = new Set<string>();
    for (const event of events) {
        if (event.kind === EventKind.rename) {
            knownPairKeys.add(renamePairKeyOf(event.from, event.to));
        }
    }
    const appended: FileEvent[] = [...events];
    for (const run of selectRunsWithinReplayWindow(findScriptExecutionRuns(records))) {
        const execution = executeRunOnce(run, records, reader, seedContent);
        if (execution.post === undefined) {
            continue;
        }
        for (const pair of matchRenamePairs(execution.pre, execution.post)) {
            const from = new Path(resolveAgainstCwd(run.cwd, new Path(pair.fromKey)));
            const to = new Path(resolveAgainstCwd(run.cwd, new Path(pair.toKey)));
            const pairKey = renamePairKeyOf(from, to);
            if (knownPairKeys.has(pairKey)) {
                continue;
            }
            knownPairKeys.add(pairKey);
            appended.push({
                kind: EventKind.rename,
                changeId: computeScriptExecutionChangeId(run, from),
                from,
                to,
                timestamp: run.timestamp,
            });
        }
    }
    return appended;
}
```

Notes pinned to decisions the implementer must not re-derive:

- `changeId` uses the run × SOURCE path (`from`), not the destination: the
  destination already owns `computeScriptExecutionChangeId(run, to)` for its
  injected script-execution event, and the task-133 chips dedupe by
  path+changeId — the source-path id cannot collide with anything (a moved
  source never gets a script-execution event: its post content is undefined).
- `timestamp` = the run's tool_use instant, matching the beaconless
  script-execution events of the SAME run so the rename and the destination
  content revision stay adjacent. (The stdout channel's result-instant
  stamping exists for cross-run interleave proofs; within one run the
  tool-use instant is what every other event of that run carries.)
- Adjust the type-only vs value imports to satisfy `verbatimModuleSyntax`
  if tsc complains (match neighboring modules' style).

Tests 1–4 must pass after this phase; test 5 still fails (nothing calls the
channel yet).

## Phase C — GREEN: wire into both rename-chain build sites

**C1. `jfred/src/reconstruction_branches.ts`** (`computeFileRevisionsOver`,
currently lines 117–118) — replace:

```ts
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
```

with (budget: +4 body lines, +1 single-line import; file must stay ≤ 250):

```ts
    const extracted = extractFileEvents(records);
    // task 155: sandbox-proven script moves join the chain so a moved source's
    // lineage resolves to its destination; stage-tolerant like every impure stage.
    const events = reader
        ? runStageTolerantly("appendScriptMoveRenames", target, extracted, () => appendScriptMoveRenames(extracted, records, reader, getLineageContentBefore(records, reader)))
        : extracted;
    const renameChain = buildRenameChain(events);
```

(If the comment lines push the file past 250, drop the comment to one line —
the cap wins.) `runStageTolerantly` gives the task-119 degrade-to-input
behavior; `target` here is the requested (pre-resolution) target, which is
what the other stages' failure notes also carry at this point.

**C2. `jfred/src/reconstruction_renderable.ts`** (`reconstructFilesOver`,
lines 29–31) — replace:

```ts
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
```

with:

```ts
    const extracted = extractFileEvents(records);
    const events = appendScriptMoveRenames(extracted, records, reader, reader ? getLineageContentBefore(records, reader) : undefined);
    const renameChain = buildRenameChain(events);
```

(No tolerant wrapper here — `runStageTolerantly` is private to branches.ts,
and this site's precedent, `discoverScriptCreatedPaths`, also runs unwrapped;
the channel itself returns its input on any gate, and per-target failures are
caught by the existing per-file backstop below.)

Do NOT wire into `extractFileEvents` (pure, readerless), `extractRenderableEvents`
(pure by contract), or the prestate chain (recursion — see Constraints).

Test 5 passes after this phase. `npm run typecheck` must exit 0.

## Phase D — expected downstream effects (verify by reading, change nothing)

- `webapp/views/timeline-file-badges.ts` `findScriptRenameSource` fallback
  (task 145) stays: it still serves declined-consent/readerless documents
  where this channel is gated off. With the channel active, s85's
  `core_one.py` history now has a real rename revision, so the PRIMARY badge
  path serves it and the fallback is simply not reached.
- Confirm by reading `reconstruction_replay.ts` (`renameRevision`) and
  `reconstruction_render*.ts` that rename revisions from this channel need no
  new handling — they are ordinary `EventKind.rename` events.

## What the user's sweep run will show (do not run it)

- s85: filesTouched drops (the three moved-away sources merge into their
  `core_*.py` destinations); each destination ladder gains the source Write +
  a rename revision. `check_scenario_coverage.ts` for s85 and the full
  87-scenario sweep are the acceptance gate.
- Scenarios whose moves are already evidenced by the stdout/code-literal
  channels (s25, s33, s37, s87 …) must be byte-identical: the dedupe key
  makes this channel a no-op there. Any sweep diff in those scenarios means
  the dedupe key or timestamp choice is wrong — fix before anything else.
- Task 155's second paragraph (trunk absorb un-orphaning records in other
  parallel-tool-call transcripts) is a sweep OBSERVATION, not code in this
  plan — note whatever the sweep says in the implementation notes.

## Staging

Stage all changed/added files in jfred (`git add`); do not commit.
