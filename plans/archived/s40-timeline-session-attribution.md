# Plan: Attribute s40 user-edit evidence steps to their evidencing session

## Problem (one paragraph of Why, for the implementer's orientation)

On the s40 timeline, session 2's header renders twice and its rail has gaps. One
root cause: two `orders.py` user-edit evidence steps carry **synthetic** changeIds
that appear in no `tool_use` block, so `buildStepSnapshots`
(`src/reconstruction_json.ts`) resolves their `sessionId` to `undefined`. The
webapp then collects both into one synthetic `undefined`-session agent turn that
sorts into the middle of session 2's run, splitting it. The fix attributes those
steps to the session whose records actually evidenced them, at the reconstruction
layer — no webapp change.

## Ground truth established this session (do not re-derive)

The two unresolved s40 steps carry these synthetic changeIds, and each resolves to
session `12136035…` (session 2 — the correct one) by two mechanisms:

- Step 3 changeId `originalFile:toolu_01CRtnU7HvFipMPUFAdnqnXQ` — the
  `originalFile:` prefix wraps a **real `tool_use` id** already indexed. Strip the
  prefix and it resolves.
- Step 5 changeIds `9cf3da78-7705-4f7f-9d68-0a79d6d7c642` (a file-history-snapshot
  **record uuid** in session 2) and `e4f98d0309ff4caa@v2` (a blob ref). The record
  uuid resolves once the index also maps each record's own `uuid → sessionId`. The
  `@v2` blob form resolves to nothing and is not needed (its base is a hash, not a
  record uuid) — do NOT add `@vN` handling (YAGNI).

Verified non-regression: s84's one unresolved step (`98084ab8…`) and s85's three
unresolved steps match **neither** a `tool_use` id nor a record uuid even with the
extended index, so their attribution stays `undefined` — unchanged. s39 has zero
unresolved steps. These are the scenarios with prior session-attribution regression
history; the fix provably does not touch them.

## Files

- `src/reconstruction_json.ts` — `indexChangeIdsToSessionIds` (lines 118–131) and
  its use in `buildStepSnapshots` (line 171). The fix's home.
- `src/reconstruction_reseed.ts` — line 93 creates `originalFile:${event.changeId}`.
  Owns the prefix literal; export it as a constant so the normalizer in
  reconstruction_json.ts references one canonical source (coding-requirements §3).
- `tests/fixtures.ts` — add the multi-session s40 fixture path list.
- `tests/timeline-viewmodels.test.ts` — the regression tests go here.

---

## Step 0 — Confirm a green baseline

Run the timeline view-model suite BEFORE any change so a later failure is
attributable to this change:

```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npx tsx --test tests/timeline-viewmodels.test.ts
```

Expect all current tests passing. If not, stop and report — do not build on a red
baseline.

---

## Step 1 (RED) — Add the multi-session s40 fixture

In `tests/fixtures.ts`, after the existing `S39_JSONL_PATHS` block (near line 97),
add — matching the S39/S84 pattern exactly (a directory-resolved path LIST, because
s40 is multi-session and must be built from BOTH transcripts):

```ts
export const S40_PROJECT_DIR: Path = new Path(resolveScenarioDir(SCENARIO_ROOTS, "s40-git-baseline-user-edits"));
export const S40_JSONL_PATHS: Path[] = listScenarioJsonlPaths(S40_PROJECT_DIR);
```

`SCENARIO_ROOTS`, `resolveScenarioDir`, `listScenarioJsonlPaths`, and `Path` are
already imported in that file. Leave the existing single-transcript `S40_JSONL`
constant in place (other suites may use it); this adds the multi-session list.

## Step 2 (RED) — Write the two failing regression tests

In `tests/timeline-viewmodels.test.ts`:

- Add `S40_JSONL_PATHS` to the fixtures import (line 25).
- After the existing shared-document constants (near line 31), add:

```ts
const s40Document = JSON.parse(JSON.stringify(buildProjectDocument(S40_JSONL_PATHS, undefined)));
```

Then add these two tests (place beside the other node/session tests). Both MUST fail
now (the bug is present) and pass after Step 4.

```ts
test("test_s40_agent_turns_are_all_attributed_to_a_session", () => {
    // Scenario: every agent-turn node in the s40 timeline names the session whose
    // records produced it — no user-edit evidence step collapses into an
    // unattributed (sessionId === undefined) synthetic turn.
    // Steps:
    // build the turn timeline for s40's unified (two-session) document.
    const { nodes } = buildTurnTimelineViewModel(s40Document);
    // collect the agent-turn nodes.
    const agentTurns = nodes.filter((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND);
    // assert none of them has an undefined sessionId.
    const unattributed = agentTurns.filter((node: { sessionId?: string }) => node.sessionId === undefined);
    assert.equal(unattributed.length, 0);
});

test("test_s40_each_session_key_forms_one_contiguous_run", () => {
    // Scenario: the s40 timeline lays each session out as ONE contiguous run of
    // nodes, so the render emits each session header exactly once and the rail
    // spine is unbroken. Walking nodes in order, the sequence of sessionId keys
    // (an undefined key counts as its own key, exactly as the header/rail render
    // keys off it) must have as many contiguous runs as there are distinct keys.
    // Steps:
    // build the turn timeline for s40's unified document.
    const { nodes } = buildTurnTimelineViewModel(s40Document);
    // reduce the node order to its sequence of session keys, then count contiguous
    // runs (a run boundary is where the key changes from the previous node).
    const sessionKeys = nodes.map((node: { sessionId?: string }) => node.sessionId ?? "undefined");
    let contiguousRuns = 0;
    let previousKey: string | undefined;
    for (const key of sessionKeys) {
        if (key !== previousKey) {
            contiguousRuns += 1;
            previousKey = key;
        }
    }
    // assert the number of runs equals the number of distinct keys (each key
    // appears in exactly one run — none is split by another).
    const distinctKeyCount = new Set(sessionKeys).size;
    assert.equal(contiguousRuns, distinctKeyCount);
});
```

Run the suite; confirm BOTH new tests FAIL (`unattributed.length` is 1;
`contiguousRuns` 4 vs `distinctKeyCount` 3) and every prior test still passes.

## Step 3 (GREEN) — Export the synthetic-seed prefix as one canonical constant

In `src/reconstruction_reseed.ts`, replace the inline `"originalFile:"` literal at
line 93 with a shared exported constant so the normalizer references one source
(coding-requirements §3: repeated constants move to a shared home).

Add near the top of the file (after imports), or immediately above
`originalFileSeedFor`:

```ts
// The changeId prefix stamped onto an `originalFile` reseed Write (see originalFileSeedFor).
// Synthetic, so the seed stays out of the graphs; exported so consumers that must UN-wrap it back
// to the real edit changeId (reconstruction_json's session attribution) share this one literal.
export const ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX = "originalFile:";
```

Change line 93 from:

```ts
        changeId: new Uuid(`originalFile:${event.changeId}`),
```

to:

```ts
        changeId: new Uuid(`${ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX}${event.changeId}`),
```

## Step 4 (GREEN) — Extend the index and normalize the lookup

In `src/reconstruction_json.ts`:

1. Import the new constant (add to the existing `reconstruction_reseed` needs — there
   is currently no import from that module, so add one):

```ts
import { ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX } from "./reconstruction_reseed.ts";
```

2. Extend `indexChangeIdsToSessionIds` (lines 118–131) so it ALSO maps each record's
   own `uuid → sessionId` (this is what resolves the `9cf3da78…` file-history-snapshot
   record uuid). Update the comment to say the index now covers tool_use ids AND record
   uuids. New body:

```ts
// A changeId(string) -> source sessionId index. Two id namespaces resolve here, so a step's
// changeIds can be attributed to the session that evidenced them: every tool_use block's id, and
// every record's own uuid (a user-edit evidence splice carries a file-history-snapshot RECORD uuid
// as its changeId — s40 step 5). The two namespaces are disjoint (toolu_… / cse_… vs RFC-4122), so
// adding record uuids never shadows a tool_use id. Synthetic ids that match neither resolve to nothing.
function indexChangeIdsToSessionIds(records: TranscriptRecord[]): Map<string, Uuid> {
    const byChangeId = new Map<string, Uuid>();
    for (const record of records) {
        if (record.sessionId === undefined) {
            continue;
        }
        if (record.uuid !== undefined) {
            byChangeId.set(record.uuid.toString(), record.sessionId);
        }
        for (const block of getContentBlocks(record)) {
            if (block.type === BlockType.tool_use) {
                byChangeId.set(block.id.toString(), record.sessionId);
            }
        }
    }
    return byChangeId;
}
```

3. Add a small verb-named normalizer that un-wraps a synthetic `originalFile:`-prefixed
   changeId back to the real edit changeId it embeds (so step 3's
   `originalFile:toolu_…` resolves to the already-indexed tool_use id). Place it just
   above `buildStepSnapshots`:

```ts
// Un-wrap a synthetic reseed changeId to the source id the index knows. An `originalFile` seed
// stamps `originalFile:<real edit changeId>` (reconstruction_reseed); stripping the prefix exposes
// the real tool_use id. A plain changeId (real, or a record-uuid evidence splice) is returned as-is.
function resolveSyntheticChangeIdToSourceId(changeId: string): string {
    if (changeId.startsWith(ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX)) {
        return changeId.slice(ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX.length);
    }
    return changeId;
}
```

4. Apply the normalizer at the `sessionId` lookup in `buildStepSnapshots` (line 171).
   Change:

```ts
            sessionId: changeIds.map((id) => sessionOf.get(id.toString())).find((sessionId) => sessionId !== undefined),
```

to:

```ts
            sessionId: changeIds
                .map((id) => sessionOf.get(resolveSyntheticChangeIdToSourceId(id.toString())))
                .find((sessionId) => sessionId !== undefined),
```

`resolveSyntheticChangeIdToSourceId` is a no-op for ordinary changeIds, so
currently-resolved steps are unaffected.

## Step 5 (GREEN) — Confirm the tests pass and nothing regressed

```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npx tsx --test tests/timeline-viewmodels.test.ts
```

Both new s40 tests pass; every prior test (s84 multi-session, s85, s2, s45) still
passes. Then run the FULL suite the way the project runs it (per memory: `node --test`
via `npm test`, not vitest):

```
npm test
```

Expect the pre-existing green count plus the two new tests; zero new failures. Pay
specific attention to any s84 / s85 / s39 assertion (prior regression class).

## Step 6 — Typecheck

```
npx tsc --noEmit
```

Zero errors. (New code: 4-space indent per user rule even though the file is
2-space; domain types `Uuid`/`Path` preserved; enum member `BlockType.tool_use`;
verb-named functions.)

## Step 7 — Live app verification (DOM/API, no screenshots)

Per the handoff and user rule (verify via DOM/JS, never screenshots): start a fresh
viewer server on a spare port (the running 7343 instance has no auto-reload), fetch
`/api/document?project=s40-git-baseline-user-edits&allowScripts=1`, run
`buildTurnTimelineViewModel` over the final NDJSON document, and assert: zero
`AGENT_TURN` nodes with `sessionId === undefined`, and exactly two contiguous
session runs. (Equivalent to the Step 2 assertions against the served document —
sufficient, since that is how the bug was reproduced.)

## Out of scope (name it, don't do it)

- The `/api/document` NDJSON progress stream emitting the per-line walk twice per
  request is a SEPARATE cosmetic issue — do not touch it here.
- Commit `6b5a71a`'s CSS that hides the `(unattributed)` lane header becomes dead
  once attribution is fixed. Leave it; a follow-up can remove the rule with a commit
  note. Do not delete files (user rule).
- No `@vN` / blob-hash changeId normalization — no observed step needs it.

## Success criteria

1. `test_s40_agent_turns_are_all_attributed_to_a_session` and
   `test_s40_each_session_key_forms_one_contiguous_run` pass.
2. Full `npm test` shows no new failures (s84/s85/s39 intact).
3. `npx tsc --noEmit` clean.
4. No webapp/`timeline.js` change was required.
