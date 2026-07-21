# Plan — Task 121: Merge the git-derived baseline turn into its base-commit row

All file paths are relative to the jfred submodule root (`RevEng/jfred/`) unless noted.
Decision (recorded 2026-07-20 in tasks.json): when the timeline's base-commit row exists, absorb
the git-derived baseline turn into it — ONE commit-kind row wearing the baseline dress (green
`git-derived baseline` pill instead of the "git commit" label, orange hash pill kept, baseline
text, baseline file chips). Filter model unchanged: the merged row is still a commit node (Git
mode matches natively) and now carries `fileChanges` (Files mode matches). Accepted trade:
Conversation mode no longer shows it. FALLBACK: when no commit node's `resultHash` matches the
baseline hash (e.g. demo-baseline's back-dated commit), keep today's standalone green baseline
agent-turn.

## Established facts (verified against the working tree)

- The baseline turn is created in `webapp/views/timeline-nodes.ts` →
  `recordGitBaselineSnapshot` (called from `attachSnapshotsToAgentTurns`), as an
  `AGENT_TURN_NODE_KIND` TurnNode with `isGitBaseline: true`.
- A baseline beacon changeId is `gitBase:<full-40-hex-hash>:<target>`
  (`GIT_BASE_CHANGE_ID_PREFIX` in `webapp/views/timeline-changes.ts`); commit nodes carry a
  SHORT `resultHash` (echoed from the tool_result, `deriveCommitNodes` in
  `webapp/views/timeline-node-derive.ts`). The match rule is therefore
  `fullBaselineHash.startsWith(resultHash)` with a non-empty `resultHash`.
- `extractGitBaseCommitHash(changeId)` already exists in `webapp/views/details-model.ts` — it
  will MOVE to `webapp/views/timeline-changes.ts` (the gitBase vocabulary's canonical home;
  no re-export left behind).
- `buildTurnTimelineViewModel` currently derives commit nodes AFTER snapshots are attached; the
  derivation must move BEFORE `attachSnapshotsToAgentTurns` so the merge can find its host.
- `deriveNodeFileChanges` (`timeline-changes.ts`) skips commit nodes by kind; the merged row
  needs chips, so the skip becomes "no snapshots owned".
- `filterPreBaselineNodes` (task 56) finds the baseline node via `isGitBaseline === true` on ANY
  node — it keeps working unchanged once the merged commit node carries the flag.
- `checkNodeIsPickable` (`timeline-picks.ts`) requires `AGENT_TURN_NODE_KIND` — the merged
  commit row stays unpickable and stays a pick-segment hard stop. No change there.
- Rendering: `appendCommitCells` (`webapp/views/timeline-render-rows.ts`) draws
  spacer + "git commit" label + orange `commit-pill`; the green pill CSS
  `.role-pill.role-pill-git-derived-baseline` already exists (styles.css:494).
  `checkRowIsExpandable` (`timeline-sessions.ts`) hard-codes commit rows unexpandable;
  `appendExpandedBubble` adds file chips only for agent turns.
- Tests: `node --test` via `npm test` (never vitest). Relevant files:
  `tests/timeline-nodes-git-baseline.test.ts` (fixtures `gitBaselineDocument` in
  `tests/timeline-test-helpers.ts`, local `midBaselineDocument`),
  `tests/timeline-sessions.test.ts` (checkRowIsExpandable),
  `tests/timeline-labels-summary.test.ts` (computeRowSummaryText),
  `tests/timeline-filter-model.test.ts` (mode predicate).
- DO NOT run `npm test` — the user runs tests after the work is staged. Run ONLY
  `npx tsc --noEmit` (compile check) after the code edits.

## Step 1 — Wire/view-model types: let a CommitNode host the baseline

File: `webapp/views/timeline-types.ts`, `CommitNode` type.

Replace the four `?: undefined` stubs with real optionals (they exist so the union narrows;
the merged row now genuinely carries them):

```ts
    text?: string;                       // task 121: the merged baseline row's summary text
    snapshots?: WireStepSnapshot[];      // task 121: the baseline beacons the row absorbed
    fileChanges?: FileChange[];          // task 121: stamped by deriveNodeFileChanges
    isGitBaseline?: boolean;             // task 121: true on the merged base-commit row
```

Leave every other member of `CommitNode` and all other node types untouched.

## Step 2 — Move `extractGitBaseCommitHash` to its canonical home

1. Add to `webapp/views/timeline-changes.ts` (next to `computeGitBaselineText`), moved verbatim
   from `details-model.ts` including its comment:

```ts
// The commit hash inside gitBase:<hash>:<target> — the second colon-separated field (hashes
// never contain colons); "" for a malformed id, never a throw.
export function extractGitBaseCommitHash(changeId: string): string {
    return changeId.split(":")[1] ?? "";
}
```

2. Rewrite `computeGitBaselineText` to call it (removes the duplicated split):

```ts
export function computeGitBaselineText(snapshot: WireStepSnapshot): string {
    return `Files seeded from git base commit ${extractGitBaseCommitHash(snapshot.changeIds[0]!)}`;
}
```

3. Delete the function from `webapp/views/details-model.ts`; import it there from
   `./timeline-changes.ts` instead (that import line already exists for
   `GIT_BASE_CHANGE_ID_PREFIX` — extend it). Update the import in
   `webapp/views/details-baseline.ts` from `./details-model.ts` to `./timeline-changes.ts`.
   No re-export anywhere (no forwarding layers).

## Step 3 — RED: model tests for the merge, the fallback, and the pre-baseline filter

File: `tests/timeline-nodes-git-baseline.test.ts`. Add a local fixture (same pattern as
`midBaselineDocument`): the `gitBaselineDocument` shape plus two recorded commits — one whose
short `resultHash` prefixes the full baseline hash, one control commit. Use a realistic
full-40-hex baseline hash so the test proves PREFIX matching, not equality:

```ts
// task 121: the same baseline shape, but the session RECORDED the base commit — one commit
// whose short resultHash prefixes the full gitBase hash (the merge host) and one control
// commit that must keep the plain commit dress.
const BASELINE_FULL_HASH = "14e26eced65bfc384a65a533e87a0da11221726c";
const recordedBaseCommitDocument = {
    messages: [{
        uuid: "prompt-1",
        role: RecordType.user,
        sessionId: "session-a",
        timestamp: "2026-01-01T00:10:00.000Z",
        text: "start working",
    }],
    steps: [
        { index: 1, when: "2026-01-01T00:00:00.000Z", sessionId: undefined, changeIds: [`gitBase:${BASELINE_FULL_HASH}:orders.py`], changedPaths: [], files: {} },
    ],
    filesTouched: [{
        target: "orders.py",
        revisions: [{ kind: EventKind.write, changeId: `gitBase:${BASELINE_FULL_HASH}:orders.py`, timestamp: "2026-01-01T00:00:00.000Z" }],
    }],
    rewoundFilesTouched: [],
    commitMarkers: [],
    gitOperations: [{
        kind: GitOperationKind.commit,
        detail: "baseline",
        command: 'git commit -m "baseline"',
        timestamp: "2026-01-01T00:05:00.000Z",
        sessionId: "session-a",
        resultHash: "14e26ec",
    }, {
        kind: GitOperationKind.commit,
        detail: "later work",
        command: 'git commit -m "later work"',
        timestamp: "2026-01-01T00:20:00.000Z",
        sessionId: "session-a",
        resultHash: "fffffff",
    }],
};
```

(`GitOperationKind` joins the existing `RecordType, EventKind` import from
`../src/structures/vocabulary.ts`; `COMMIT_NODE_KIND` joins the `AGENT_TURN_NODE_KIND` import.)

Four tests, plain-English step comments per the TDD guide:

1. `test_buildTurnTimelineViewModel_merges_baseline_into_recorded_base_commit_row` —
   build from `recordedBaseCommitDocument`; assert exactly one node has
   `isGitBaseline === true`; assert its `kind` is `COMMIT_NODE_KIND`; assert its
   `resultHash` is `"14e26ec"`; assert its `fileChanges` paths are `["orders.py"]`;
   assert its `text` contains `BASELINE_FULL_HASH`; assert NO `AGENT_TURN_NODE_KIND`
   node carries `isGitBaseline`.
2. `test_buildTurnTimelineViewModel_keeps_other_commit_rows_plain` — same build; find the
   commit node with `resultHash === "fffffff"`; assert `isGitBaseline` is not `true` and
   `fileChanges` is `undefined`.
3. `test_buildTurnTimelineViewModel_keeps_standalone_baseline_when_no_commit_matches` —
   build from `{ ...recordedBaseCommitDocument, gitOperations: [<only the "fffffff" commit>] }`;
   assert the single `isGitBaseline` node is `AGENT_TURN_NODE_KIND` (the fallback), and no
   commit node carries the flag.
4. `test_timeline_drops_nodes_before_merged_baseline_row_when_pre_baseline_skipped` —
   build from `{ ...recordedBaseCommitDocument, preBaselineSkipped: true }`; assert
   `nodes[0].isGitBaseline === true` and `nodes[0].kind === COMMIT_NODE_KIND` (task 56's
   filter keys on the flag, not the node kind).

File: `tests/timeline-filter-model.test.ts` — two tests over a literal merged-shape node
`{ kind: COMMIT_NODE_KIND, when: "...", sessionId: undefined, isGitBaseline: true, fileChanges: [<one chip>] }`:

5. `test_merged_baseline_commit_row_matches_git_and_files_modes` — assert
   `checkNodeMatchesFilterMode` returns true for `git` and for `files`.
6. `test_merged_baseline_commit_row_leaves_conversation_mode` — assert false for
   `conversation` (the accepted trade, pinned so it is deliberate).

File: `tests/timeline-labels-summary.test.ts`:

7. `test_computeRowSummaryText_prefers_commit_node_text` — a commit node with
   `text: "Files seeded from git base commit abc"` returns that text; the same node without
   `text` still returns its `detail`.

File: `tests/timeline-sessions.test.ts`:

8. `test_checkRowIsExpandable_expands_only_merged_baseline_commit_rows` — a commit node with
   `isGitBaseline: true` is expandable; a plain commit node is not (locked decision 4 intact).

Follow each file's existing import/fixture conventions. RED = the new model tests fail on the
current code (the merge does not exist); do NOT run them — the user runs `npm test`.

## Step 4 — GREEN: the node-build-time merge (`webapp/views/timeline-nodes.ts`)

1. Import `extractGitBaseCommitHash` from `./timeline-changes.ts` and `CommitNode` from
   `./timeline-types.ts`.

2. Add the host finder (single-condition branching — one test per `if`):

```ts
// (task 121) the recorded base-commit row: the commit node whose short resultHash prefixes the
// baseline beacon's full commit hash — the row the git-derived baseline merges into.
function findBaseCommitNode(commitNodes: CommitNode[], snapshot: WireStepSnapshot): CommitNode | undefined {
    const baselineCommitHash = extractGitBaseCommitHash(snapshot.changeIds[0]!);
    return commitNodes.find((node) => {
        if (node.resultHash === undefined) {
            return false;
        }
        if (node.resultHash === "") {
            return false;
        }
        return baselineCommitHash.startsWith(node.resultHash);
    });
}
```

3. Split host selection out of `recordGitBaselineSnapshot`. The commit host keeps its own
   `when`/`sessionId` (the commit instant is the row's place in the timeline); it gains the
   flag, the baseline text, and a snapshots array. The fallback branch is today's TurnNode
   literal, unchanged:

```ts
// (task 121) the node hosting baseline snapshots: the recorded base-commit row when the session
// captured that commit (merged row), else a fresh standalone baseline turn (fallback — e.g. a
// back-dated base commit no session ever recorded).
function claimBaselineHost(turnNodes: TurnNode[], commitNodes: CommitNode[], snapshot: WireStepSnapshot): TurnNode | CommitNode {
    const baseCommitNode = findBaseCommitNode(commitNodes, snapshot);
    if (baseCommitNode !== undefined) {
        baseCommitNode.isGitBaseline = true;
        baseCommitNode.text = computeGitBaselineText(snapshot);
        baseCommitNode.snapshots = [];
        return baseCommitNode;
    }
    const baselineTurn: TurnNode = {
        kind: AGENT_TURN_NODE_KIND,
        when: snapshot.when,
        sessionId: snapshot.sessionId,
        text: computeGitBaselineText(snapshot),
        isGitBaseline: true,
        snapshots: [],
        gitOperations: [],
    };
    turnNodes.push(baselineTurn);
    return baselineTurn;
}

// (task 86) attach a gitBase-only snapshot to the baseline host, claiming it on first use;
// returns the (possibly just-claimed) host.
function recordGitBaselineSnapshot(turnNodes: TurnNode[], commitNodes: CommitNode[], snapshot: WireStepSnapshot, baselineHost: TurnNode | CommitNode | undefined): TurnNode | CommitNode {
    if (baselineHost === undefined) {
        baselineHost = claimBaselineHost(turnNodes, commitNodes, snapshot);
    }
    baselineHost.snapshots!.push(snapshot);
    return baselineHost;
}
```

4. Thread `commitNodes` through `attachSnapshotsToAgentTurns(turnNodes, commitNodes, steps)`
   (the `baselineTurn` local becomes `baselineHost: TurnNode | CommitNode | undefined`), and in
   `buildTurnTimelineViewModel` move `const commitNodes = deriveCommitNodes(document);` to just
   BEFORE the `attachSnapshotsToAgentTurns` call (delete the later duplicate line). Everything
   downstream (`appendSessionEndNodes`, sort, `filterPreBaselineNodes`, `assignStepNumbers`,
   `deriveNodeFileChanges`) is order-insensitive to this move — commit nodes were only created
   earlier, and they still join the same sort.

## Step 5 — GREEN: chips + summary + expandability on the merged row

1. `webapp/views/timeline-changes.ts` → `deriveNodeFileChanges`: replace the two kind guards:

```ts
    for (const node of nodes) {
        if (node.kind === TOOL_CALL_NODE_KIND) {
            continue;
        }
        if (node.snapshots === undefined) {
            // plain commit rows own no snapshots; the merged baseline row does (task 121)
            continue;
        }
        node.fileChanges = deriveMergedFileChanges(node.snapshots, revisionIndex);
    }
```

   Drop the now-unused `COMMIT_NODE_KIND` import if nothing else in the file uses it (it does
   not). Update the function's doc comment to say commit rows are skipped by owning no
   snapshots, except the merged baseline row.

2. `webapp/views/timeline-labels.ts` → `computeRowSummaryText` commit branch:

```ts
    if (node.kind === COMMIT_NODE_KIND) {
        if (node.text !== undefined) {
            return node.text;    // the merged baseline row reads its baseline text (task 121)
        }
        return node.detail ?? "git commit";
    }
```

3. `webapp/views/timeline-labels.ts`: single-source the pill label (used twice after Step 6):

```ts
// The green baseline pill's label — shared by the role-pill path (standalone baseline turn)
// and the merged base-commit row's dress (task 121).
export const GIT_BASELINE_ROLE_PILL_LABEL = "git-derived baseline";
```

   and use it in `computeRolePillLabel`'s `isGitBaseline` branch.

4. `webapp/views/timeline-sessions.ts` → `checkRowIsExpandable`:

```ts
    if (node.kind === COMMIT_NODE_KIND) {
        // task 121: the merged baseline row expands to show its file chips; plain commit rows
        // stay thin one-liners (locked decision 4).
        return node.isGitBaseline === true;
    }
```

## Step 6 — GREEN: the baseline dress on the commit row (`webapp/views/timeline-render-rows.ts`)

DOM-half file (no unit tests by convention; the model half above is the tested half).

1. Import `computeRolePillClass` and `GIT_BASELINE_ROLE_PILL_LABEL` from
   `./timeline-labels.ts`.

2. `appendCommitCells` gains the dress and the expansion triangle (signature grows to
   `(context, line, row, node)`; update its one call site to match — the merged row needs the
   triangle where plain commits keep the blank spacer):

```ts
// The commit row's cells (extracted from buildTimelineRows). A plain commit: spacer, "git
// commit" label, hash pill. The merged git-derived baseline row (task 121): expansion triangle
// (its bubble carries the baseline file chips), green baseline pill instead of the label, hash
// pill kept.
function appendCommitCells(context: TimelineRenderContext, line: HTMLElement, row: HTMLElement, node: TimelineNode): void {
    if (node.isGitBaseline === true) {
        appendExpansionTriangle(context, line, row);
        line.append(el("span", { class: `role-pill ${computeRolePillClass(GIT_BASELINE_ROLE_PILL_LABEL)}`, text: GIT_BASELINE_ROLE_PILL_LABEL }));
    } else {
        line.append(el("span", { class: "tl-tri", text: "" }));   // spacer keeps columns aligned
        line.append(el("span", { class: "commit-label", text: "git commit" }));
    }
    if (node.resultHash !== undefined) {                       // no hash → no pill (a blank "—" reads broken)
        line.append(el("span", { class: "commit-pill", text: node.resultHash }));
    }
}
```

   (`appendExpansionTriangle` is declared below `appendCommitCells` in the file — function
   declarations hoist, no reorder needed.)

3. In the `buildTimelineRows` loop the commit branch stays first, so the merged row takes
   `appendCommitCells` (which now appends its own triangle) and never falls through to the
   generic triangle branch:

```ts
        if (node.kind === COMMIT_NODE_KIND) {
            appendCommitCells(context, line, row, node);
        } else if (checkRowIsExpandable(node)) {
```

4. `appendExpandedBubble` file-chips condition — chips belong to agent turns AND the merged
   baseline row (its bubble shows the baseline text plus the seeded-file chips). Add above
   `appendExpandedBubble`:

```ts
// A bubble carries file chips when its node owns them: every agent turn, plus the merged
// git-derived baseline commit row (task 121).
function checkBubbleShowsFileChips(node: TimelineNode): boolean {
    if (node.kind === AGENT_TURN_NODE_KIND) {
        return true;
    }
    return node.isGitBaseline === true;
}
```

   and in `appendExpandedBubble` replace `if (node.kind === AGENT_TURN_NODE_KIND) {` with
   `if (checkBubbleShowsFileChips(node)) {` (the `node.fileChanges!` inside is safe: both
   branches own snapshots, so `deriveNodeFileChanges` stamped them). The bubble's text line
   (`node.text ?? ""`) already renders the merged row's baseline text.

   Since the merged row enters `appendExpandedBubble`, it lands in `context.expandableRows`
   and the expand-all toggle covers it for free.

## Step 7 — Verify

1. `npx tsc --noEmit` from the jfred root — must be clean (the CommitNode optionals ripple
   through the union; fix any missed narrowing).
2. Do NOT run `npm test` / any suite — the user runs them.
3. Manual check instructions to hand the user (do not execute):
   - Merge path: serve `scenarios/executed/s85-git-commit-csv-and-move-scripts` with a
     `reveng-paths.json` of `{ "repo": "scenarios/executed/s85-git-commit-csv-and-move-scripts",
     "baseCommit": "14e26eced65bfc384a65a533e87a0da11221726c" }` (repo path is jfred-root-relative)
     — the 'baseline' commit row (14e26ec) should be ONE row: green `git-derived baseline` pill,
     orange hash pill, "Files seeded from git base commit 14e26ec…" text, expandable to file
     chips; the separate baseline turn is gone; Git and Files filter modes both show it.
   - Fallback path: `npm run demo:baseline` (demo-baseline's back-dated commit is never
     recorded in-session) — the standalone green baseline turn still renders.

## Out of scope (deliberate)

- `findAdjacentFileTouchedIndex` (header Prev/Next file nav) walks agent turns only, so the
  merged row is skipped by that navigation — matching every other commit row; not part of the
  decided design.
- The details pane's row-selection header for the merged row keeps the plain
  `git commit <hash> — <message>` header; baseline CONTENT rendering is chip-driven
  (`showGitBaselineInDetails` keys on the chip's `gitBase:` changeId) and works unchanged
  from the merged row's chips.
- No CSS changes: `.role-pill.role-pill-git-derived-baseline` (green) and `.commit-pill`
  (orange) already exist.
