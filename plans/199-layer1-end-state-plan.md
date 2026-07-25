# Task 199 — Layer 1: on-disk end-state node + presumed-user-edit gap nodes (spec S2)

Repo: `jfred/` submodule. Runner: `node --test` via `npm test` (do NOT run tests — the
user runs them). All comparisons use enum members (`LayeredNodeKind.*`), never bare
strings. Module cap: 250 lines. New module → new test file `tests/<module>.test.ts`.

## Behavior (plain English)

1. A file's layer-1 timeline ends with its current on-disk state: an `EndStateNode`
   holding the file's bytes, placed positionally as the FINAL node (spec S2 wording:
   "the on-disk end state is the final node" — appended after the sorted evidence
   nodes, not sort-inserted). Its instant is the file's disk mtime (recorded evidence,
   never "now"). A file absent from disk gets no end-state node.
2. Between every adjacent pair of verified states (nodes carrying bytes: beacons and
   the end state) whose contents differ, a `PresumedUserEditNode` gap is inserted
   (Q8 invariant: unexplained diff = presumed user edit; never invent attribution).
   Byteless nodes (pre-anchor stubs) between two verified states are skipped when
   pairing — a gap needs both contents known. The gap's instant is the LATER verified
   state's instant ("by this instant the content had changed") and it is inserted
   immediately before that later node.
3. Both behaviors apply to each `SessionTimeline` built by `loadLayeredProject`
   (single-session is the per-file degenerate case; the S5 merged view — task 202 —
   will reuse the same pure functions).

Existing fixtures' target files are never written to disk and their write/edit beacon
contents are equal, so existing `layered_load.test.ts` assertions stay valid.

## Types already in place (no model changes)

`EndStateNode` (`layered_types.ts:42`), `PresumedUserEditNode` (`layered_types.ts:50`),
`LayeredNodeKind.endState` / `.presumedUserEdit` (`structures/vocabulary.ts:183-184`).

## Phase A — export the shared byte-carrier guard

File: `jfred/src/layered_anchor.ts`. Change `checkNodeCarriesBytes` (line 34) from
private to `export function`. It is the single source of "which node kinds carry
verified bytes" — task 199's gap pairing reuses it instead of redefining it.

## Phase B — RED: new test file `jfred/tests/layered_end_state.test.ts`

Follow the comment style of `layered_load.test.ts` (scenario + step comments). Build
`TimelineNode` literals directly for the pure-function tests (typed domain objects —
the "no hand-cast" rule is about wire records). Helper for a beacon literal:
`makeBeacon(instantIso: string, content: string): BeaconNode` returning
`{ kind: LayeredNodeKind.beacon, instant: new Date(instantIso), content, evidence: undefined }`.
Stub literal needs an evidence `JsonlRef` — use
`{ sessionFile: new Path("/fixture/a.jsonl"), line: 1 }`.

Tests (import from `../src/layered_end_state.ts`, which does not exist yet — RED):

1. `test_buildEndStateNode_reads_disk_bytes_and_mtime`
   - mkdtemp a dir, write `target.py` with known bytes.
   - `buildEndStateNode(new Path(targetPath))` returns kind `LayeredNodeKind.endState`,
     `content` = the bytes, `instant.getTime()` = `statSync(targetPath).mtime.getTime()`.
2. `test_buildEndStateNode_absent_file_yields_undefined`
   - a path inside the tmp dir that was never written → `undefined`.
3. `test_insertPresumedUserEditGaps_gap_only_between_differing_verified_states`
   - nodes: beacon "x", beacon "x", beacon "y" → result length 4; a
     `LayeredNodeKind.presumedUserEdit` node sits at index 2 (immediately before the
     "y" beacon) with the "y" beacon's instant; no gap between the equal pair.
4. `test_insertPresumedUserEditGaps_skips_byteless_stubs_when_pairing`
   - nodes: beacon "x", stub, beacon "y" → gap inserted between the stub and the "y"
     beacon (order: beacon, stub, gap, beacon).
   - nodes: beacon "x", stub, beacon "x" → no gap (result identical order, length 3).
5. `test_completeLayer1Timeline_appends_end_state_then_inserts_gaps`
   - real tmp file holding "changed\n"; input nodes: one beacon "original\n".
   - result: [beacon, presumedUserEdit, endState] — end state last, gap before it.
6. `test_loadLayeredProject_session_timeline_ends_with_end_state_and_gap`
   (integration, in this same file; reuse `multi-source-test-helpers.ts` exactly as
   `layered_load.test.ts` does — `makeSourceTree`, `buildWriteRecordPair`,
   `buildPromptRecord`, `writeTranscriptFixture`)
   - fixture: one session writing `gamma.py` with "line one\n"; then
     `mkdirSync(workspaceRoot, { recursive: true })` and
     `writeFileSync(gammaPath, "line one\nuser change\n")` so the target EXISTS on
     disk with content differing from the write beacon.
   - `loadLayeredProject` → gamma's single session timeline nodes are exactly:
     beacon (write), presumedUserEdit, endState with the disk bytes, in that order.

## Phase C — GREEN: new module `jfred/src/layered_end_state.ts`

Header comment: task 199 (spec S2) — layer-1 timeline completion: on-disk end state
as the final node; presumed-user-edit gaps between differing verified states (Q8).

```ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { LayeredNodeKind } from "./structures/vocabulary.ts";
import type { Path } from "./structures/domain.ts";
import { checkNodeCarriesBytes } from "./layered_anchor.ts";
import type { BeaconNode, EndStateNode, TimelineNode } from "./layered_types.ts";

// The file's current on-disk bytes as its timeline's final node (spec S2), or undefined
// when the file no longer exists on disk (a vanished file has no end state to verify).
// Instant = disk mtime — recorded evidence, never "now" (Q7).
export function buildEndStateNode(filename: Path): EndStateNode | undefined {
    if (!existsSync(filename.toString())) {
        return undefined;
    }
    return {
        kind: LayeredNodeKind.endState,
        instant: statSync(filename.toString()).mtime,
        content: readFileSync(filename.toString(), "utf8"),
    };
}

// Insert a presumed-user-edit gap before each verified state whose previous verified
// state holds different bytes (Q8: unexplained diff = presumed user edit). Byteless
// stubs are skipped when pairing — a gap needs both contents known. The gap's instant
// is the later state's instant: "by this instant the content had changed".
export function insertPresumedUserEditGaps(nodes: TimelineNode[]): TimelineNode[] {
    const completed: TimelineNode[] = [];
    let previousVerified: BeaconNode | EndStateNode | undefined;
    for (const node of nodes) {
        if (checkNodeCarriesBytes(node)) {
            if (previousVerified !== undefined && previousVerified.content !== node.content) {
                completed.push({ kind: LayeredNodeKind.presumedUserEdit, instant: node.instant });
            }
            previousVerified = node;
        }
        completed.push(node);
    }
    return completed;
}

// The completed layer-1 timeline: sorted evidence nodes, then the on-disk end state as
// the final node (appended positionally, per spec S2), then presumption gaps.
export function completeLayer1Timeline(nodes: TimelineNode[], filename: Path): TimelineNode[] {
    const endState = buildEndStateNode(filename);
    const withEndState = endState === undefined ? nodes : [...nodes, endState];
    return insertPresumedUserEditGaps(withEndState);
}
```

## Phase D — wire into the loader

File: `jfred/src/layered_load.ts` (203 lines; +4 stays under cap).

1. Import `completeLayer1Timeline` from `./layered_end_state.ts`.
2. `buildSessionTimeline` gains a `filename: Path` third parameter; its timeline
   becomes `{ nodes: completeLayer1Timeline(sortNodesOntoAxis(nodes), filename) }`.
3. `buildEntities` passes `new Path(fileKey)` at the call site.
4. Update the module header's last sentence: end state + presumption gaps are now
   task 199 (done), not future work.

## Phase E — bookkeeping

1. `specs/from-scratch-SPEC.md` S2 Status → note #199 implemented 2026-07-24, staged
   (layered_end_state.ts; wired per session timeline in layered_load.ts), S2 complete
   pending user validation.
2. Stage (never commit) in both `jfred/` and RevEng root.

## Out of scope (deliberate)

- Merged-view dedupe of per-session end-state nodes — task 202 owns the merged view
  and will call the same pure functions there.
- Deletion evidence ("file existed, now gone") — no node kind models it; spec S2 only
  demands the end state when the file is on disk.
- The webapp renders nothing per-node yet (task 207) — no webapp change.
