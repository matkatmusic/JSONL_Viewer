# Tasks 86 + 87 — "git-derived baseline" timeline rows, first-commit trailing-bubble absorb

Two independent timeline view-model changes, one shared constant. Implement in the step order
below. **Do not run the test suite (`npm test`) — the user runs it after the work is staged.**
Verify with `npx tsc --noEmit` only. Write each step's RED test(s) before its implementation code.

## User decisions (fixed — do not re-litigate)

- **Task 86**: steps whose only changeIds are `gitBase:<hash>:<target>` base-commit beacons must
  render as a **regular timeline message** whose role pill reads **"git-derived baseline"**
  (instead of User/Agent/Tool/Script). Not hidden, not a pseudo-lane.
- **Task 87**: the first commit of a session must stop showing "No files changed" —
  `deriveCommitChangedFiles` also absorbs the trailing files bubble that sorts after the commit.

## Files touched

| File | Change |
|---|---|
| `webapp/views/timeline.ts` | all view-model changes + 1 render-line change |
| `webapp/styles.css` | 1 new role-pill color rule |
| `tests/timeline-viewmodels.test.ts` | new tests (append near the existing related tests) |
| `tasks.json` / `completedTasks.json` | close tasks 86 and 87 after implementation |

## Background facts the implementing agent needs (verified against current code)

- A gitBase-only step reaches the webapp with `sessionId: undefined` (the engine's
  `indexChangeIdsToSessionIds` resolves `gitBase:` ids to nothing — `src/reconstruction_json.ts:114`).
- `attachSnapshotsToAgentTurns` (`webapp/views/timeline.ts:468`) finds no owner for such a step
  (owners must match sessionId) and today funnels it into ONE shared synthetic blank agent-turn
  per sessionId — so gitBase steps currently mingle with blob-ref/git-evidence leftovers.
- The beacon changeId format is `gitBase:<hash>:<target>` (`BASE_COMMIT_CHANGE_ID_PREFIX`,
  `src/reconstruction_base_commit.ts:26`); the beacon revision's event kind is `write`, so its
  chips already resolve through `indexRevisionsByChangeId`.
- The webapp cannot import src TS enums; the convention (timeline.ts header comment) is a local
  wire-string mirror constant plus a test asserting equivalence against the real src constant.
- `FileChange.when` is the step snapshot's instant. A snapshot always attaches to a node with
  `node.when >= snapshot.when`, therefore every chip on a row BEFORE a commit has
  `when <= commit.when`, and a chip belonging to the commit but attached to the trailing reply
  bubble (sorted after the commit) ALSO has `when <= commit.when`. Chips for work done after the
  commit have `when > commit.when`. This is the forward-absorb discriminator for task 87.
- Timestamps are ISO strings compared lexicographically throughout this file
  (`checkNodeCanOwnSnapshot` does `node.when >= snapshot.when`) — follow that convention.
- The four existing `test_deriveCommitChangedFiles_*` tests stay green under the forward-absorb
  rule: in `commitWalkDocument`, the only post-commit-1 chip is `change-alpha-2` with
  `when 00:00:45 > commit-1's 00:00:35`, so commit 1 absorbs nothing; commit 2 (00:00:55) has no
  qualifying rows after it.

---

## Step 1 — shared wire-mirror constant (task 86 + 87 both use it)

**RED test** (append to `tests/timeline-viewmodels.test.ts`; add
`GIT_BASE_CHANGE_ID_PREFIX` to the timeline.ts import block and add a new import line
`import { BASE_COMMIT_CHANGE_ID_PREFIX } from "../src/reconstruction_base_commit.ts";`):

```ts
test("test_gitBaseChangeIdPrefix_mirrors_engine_constant", () => {
    // Scenario: the webapp's local gitBase: wire-string mirror must equal the engine's
    // BASE_COMMIT_CHANGE_ID_PREFIX (single-source vocabulary, asserted like the enum mirrors).
    // Steps:
    // assert the two constants are the same string.
    assert.equal(GIT_BASE_CHANGE_ID_PREFIX, BASE_COMMIT_CHANGE_ID_PREFIX);
});
```

**GREEN implementation** — in `webapp/views/timeline.ts`, next to the existing
`SCRIPT_EXECUTION_EVENT_KIND` mirror (line 826):

```ts
// Wire-string mirror of BASE_COMMIT_CHANGE_ID_PREFIX (src/reconstruction_base_commit.ts) — a
// changeId with this prefix is a base-commit baseline beacon, evidenced by no session's record.
export const GIT_BASE_CHANGE_ID_PREFIX = "gitBase:";
```

## Step 2 (task 86) — route gitBase-only steps to a dedicated baseline turn node

**Behavior in plain English:** a step snapshot whose changeIds are non-empty and ALL start with
`gitBase:` is the repo's pre-session state. All such snapshots collect into ONE dedicated
synthetic agent-turn node (separate from the generic unattributed synthetic turn), flagged
`isGitBaseline: true`, whose message text names the base commit's hash.

**RED tests** (append; fixture style mirrors the existing minimal-document tests — include
`rewoundFilesTouched: []`, `commitMarkers: []`, `gitOperations: []`):

```ts
// Minimal git-baseline document: one real turn pair, one gitBase-only step (no session), and one
// generic unattributed step (blob-ref style changeId resolving nowhere, changedPaths fallback).
const gitBaselineDocument = {
    messages: [{
        uuid: "prompt-1",
        role: RecordType.user,
        sessionId: "session-a",
        timestamp: "2026-01-01T00:10:00.000Z",
        text: "start working",
    }, {
        uuid: "reply-1",
        role: RecordType.assistant,
        sessionId: "session-a",
        timestamp: "2026-01-01T00:10:10.000Z",
        text: "working",
    }],
    steps: [
        { index: 1, when: "2026-01-01T00:00:00.000Z", sessionId: undefined, changeIds: ["gitBase:abc1234:orders.py"], changedPaths: [], files: {} },
        { index: 2, when: "2026-01-01T00:20:00.000Z", sessionId: undefined, changeIds: ["deadbeef00000000@v1"], changedPaths: ["notes.txt"], files: {} },
    ],
    filesTouched: [{
        target: "orders.py",
        revisions: [{ kind: EventKind.write, changeId: "gitBase:abc1234:orders.py", timestamp: "2026-01-01T00:00:00.000Z" }],
    }],
    rewoundFilesTouched: [],
    commitMarkers: [],
    gitOperations: [],
};

test("test_buildTurnTimelineViewModel_routes_gitBase_only_step_to_baseline_node", () => {
    // Scenario: a step whose every changeId is a gitBase: beacon becomes its own agent-turn node
    // flagged isGitBaseline, carrying the baseline file chips (task 86).
    // Steps:
    // build the timeline from the git-baseline document.
    const { nodes } = buildTurnTimelineViewModel(gitBaselineDocument);
    // find the baseline node and assert it exists exactly once.
    const baselineNodes = nodes.filter((node) => node.isGitBaseline === true);
    assert.equal(baselineNodes.length, 1);
    // assert it is an agent turn (a regular message row) carrying the baseline file chip.
    assert.equal(baselineNodes[0]!.kind, "agent-turn");
    assert.deepEqual(baselineNodes[0]!.fileChanges!.map((change) => change.path), ["orders.py"]);
});

test("test_buildTurnTimelineViewModel_names_base_commit_in_baseline_node_text", () => {
    // Scenario: the baseline node's message text names the base commit hash extracted from the
    // gitBase:<hash>:<target> changeId, so the row summary reads meaningfully.
    // Steps:
    // build the timeline and find the baseline node.
    const { nodes } = buildTurnTimelineViewModel(gitBaselineDocument);
    const baselineNode = nodes.find((node) => node.isGitBaseline === true);
    // assert its text mentions the hash.
    assert.ok(baselineNode!.text!.includes("abc1234"));
});

test("test_buildTurnTimelineViewModel_keeps_generic_unattributed_step_out_of_baseline_node", () => {
    // Scenario: a generic unattributed step (non-gitBase changeIds) still collects into the plain
    // synthetic turn — it must NOT merge into the baseline node.
    // Steps:
    // build the timeline from the git-baseline document.
    const { nodes } = buildTurnTimelineViewModel(gitBaselineDocument);
    // find the plain synthetic turn by its notes.txt fallback chip.
    const genericNode = nodes.find((node) => (node.fileChanges ?? []).some((change) => change.path === "notes.txt"));
    // assert it exists and is not flagged as baseline.
    assert.ok(genericNode !== undefined);
    assert.notEqual(genericNode!.isGitBaseline, true);
});
```

**GREEN implementation** in `webapp/views/timeline.ts`:

1. Type change — `TurnNode` (line 140 block) gains `isGitBaseline?: boolean;`. Following the
   union's exhaustive-optional-field pattern, add `isGitBaseline?: undefined;` to
   `SessionEndNode`, `CommitNode`, and `ToolCallNode`.

2. Two helpers, placed directly above `attachSnapshotsToAgentTurns` (line 468):

```ts
// True when every changeId on the step is a base-commit beacon (task 86): the step carries the
// repo's pre-session state, evidenced by no session's record.
function checkSnapshotIsGitBaseline(snapshot: WireStepSnapshot): boolean {
    if (snapshot.changeIds.length === 0) {
        return false;
    }
    return snapshot.changeIds.every((changeId) => changeId.startsWith(GIT_BASE_CHANGE_ID_PREFIX));
}

// The baseline node's message text: the beacon changeId is gitBase:<hash>:<target>, so the
// commit hash is the second colon-separated field (hashes never contain colons).
function computeGitBaselineText(snapshot: WireStepSnapshot): string {
    const commitHash = snapshot.changeIds[0]!.split(":")[1] ?? "";
    return `Files seeded from git base commit ${commitHash}`;
}
```

   (Move the `GIT_BASE_CHANGE_ID_PREFIX` declaration up beside these helpers if declaration
   order requires it — `const` declarations are hoisted per-module in TS output order, so placing
   the constant above `attachSnapshotsToAgentTurns` is the safe layout.)

3. Route baseline snapshots inside `attachSnapshotsToAgentTurns`, BEFORE the owner search (the
   generic synthetic-turn path below it stays byte-identical):

```ts
function attachSnapshotsToAgentTurns(turnNodes: TurnNode[], steps: WireStepSnapshot[]): void {
    const syntheticTurns = new Map<string | undefined, TurnNode>();
    let baselineTurn: TurnNode | undefined;
    for (const snapshot of steps) {
        // (task 86) gitBase-only steps get their own baseline node — they must not mingle with
        // the generic unattributed synthetic turn below.
        if (checkSnapshotIsGitBaseline(snapshot)) {
            if (baselineTurn === undefined) {
                baselineTurn = {
                    kind: AGENT_TURN_NODE_KIND,
                    when: snapshot.when,
                    sessionId: snapshot.sessionId,
                    text: computeGitBaselineText(snapshot),
                    isGitBaseline: true,
                    snapshots: [],
                    gitOperations: [],
                };
                turnNodes.push(baselineTurn);
            }
            baselineTurn.snapshots.push(snapshot);
            continue;
        }
        // ... existing owner-search + synthetic-turn body, unchanged ...
    }
}
```

Why one node, not one per snapshot: every beacon of one project shares the single configured
base commit and its committer timestamp, so per-file steps are fragments of one event ("the
baseline"); one row with N chips matches how the generic synthetic turn already aggregates.

## Step 3 (task 86) — role pill reads "git-derived baseline"

**RED test:**

```ts
test("test_computeRolePillLabel_labels_git_baseline_turn", () => {
    // Scenario: the baseline node's role pill reads "git-derived baseline" instead of Agent
    // (task 86 — the user-chosen tag).
    // Steps:
    // build the timeline and find the baseline node.
    const { nodes } = buildTurnTimelineViewModel(gitBaselineDocument);
    const baselineNode = nodes.find((node) => node.isGitBaseline === true);
    // assert the pill label.
    assert.equal(computeRolePillLabel(baselineNode!), "git-derived baseline");
});
```

**GREEN implementation** — in `computeRolePillLabel` (line 857), insert the baseline check after
the agent-turn kind guard and before the `ranScript` computation, matching the function's
existing single-line-return style:

```ts
    if (node.kind !== AGENT_TURN_NODE_KIND) return undefined;
    if (node.isGitBaseline === true) return "git-derived baseline";
    const ranScript = ...
```

Update the function's doc comment to mention the new label.

## Step 4 (task 86) — pill CSS class must survive the two-word label

The render line (`webapp/views/timeline.ts:1995`) builds
`` class: `role-pill role-pill-${rolePillLabel.toLowerCase()}` `` — a label containing a space
would splinter into two class tokens. Fix by deriving the class token in the tested view-model
half.

**RED test:**

```ts
test("test_computeRolePillClass_hyphenates_multiword_labels", () => {
    // Scenario: the pill's CSS class token hyphenates label spaces so "git-derived baseline"
    // stays one class; single-word labels keep their existing class names.
    // Steps:
    // assert the multi-word label hyphenates.
    assert.equal(computeRolePillClass("git-derived baseline"), "role-pill-git-derived-baseline");
    // assert a single-word label is unchanged from the old inline lowercasing.
    assert.equal(computeRolePillClass("User"), "role-pill-user");
});
```

**GREEN implementation** — exported helper next to `computeRolePillLabel`:

```ts
// The pill's per-label CSS class token — multi-word labels ("git-derived baseline") hyphenate so
// the class stays a single token.
export function computeRolePillClass(label: string): string {
    return `role-pill-${label.toLowerCase().replaceAll(" ", "-")}`;
}
```

Render-half edit (line 1995), the only DOM change:

```ts
            line.append(el("span", { class: `role-pill ${computeRolePillClass(rolePillLabel)}`, text: rolePillLabel }));
```

`webapp/styles.css` — append after the existing `.role-pill.role-pill-script` rule (line 407):

```css
.role-pill.role-pill-git-derived-baseline { color: var(--green); }
```

(`--green` is an existing theme variable — it is one of the `SESSION_LANE_VARIABLES`.)

## Step 5 (task 87) — deriveCommitChangedFiles absorbs the trailing files bubble

**Behavior in plain English:** a commit's changed-file list keeps its backward walk exactly as
today, then ALSO walks forward from the commit to the next commit (exclusive), absorbing only
chips whose change instant is at-or-before the commit's instant — those are pre-commit changes
whose owning bubble merely sorts after the commit. Baseline (gitBase) chips never count as a
commit's delta in either direction.

**RED tests** (append beside the existing `test_deriveCommitChangedFiles_*` tests):

```ts
// First-commit document (task 87): the only work happens mid-turn before the commit, so the
// chips' owning reply bubble (00:40) sorts AFTER the commit row (00:30); a second change (00:50)
// happens after the commit. A gitBase baseline step seeds orders.py before everything.
const firstCommitDocument = {
    messages: [{
        uuid: "prompt-1",
        role: RecordType.user,
        sessionId: "session-a",
        timestamp: "2026-01-01T00:00:00.000Z",
        text: "write alpha and commit it",
    }, {
        uuid: "reply-1",
        role: RecordType.assistant,
        sessionId: "session-a",
        timestamp: "2026-01-01T00:00:40.000Z",
        text: "wrote alpha and committed",
    }],
    steps: [
        { index: 1, when: "2025-12-31T00:00:00.000Z", sessionId: undefined, changeIds: ["gitBase:abc1234:orders.py"], changedPaths: [], files: {} },
        { index: 2, when: "2026-01-01T00:00:25.000Z", sessionId: "session-a", changeIds: ["change-alpha-1"], changedPaths: [], files: {} },
        { index: 3, when: "2026-01-01T00:00:50.000Z", sessionId: "session-a", changeIds: ["change-beta-1"], changedPaths: [], files: {} },
    ],
    filesTouched: [{
        target: "orders.py",
        revisions: [{ kind: EventKind.write, changeId: "gitBase:abc1234:orders.py", timestamp: "2025-12-31T00:00:00.000Z" }],
    }, {
        target: "alpha.py",
        revisions: [{ kind: EventKind.write, changeId: "change-alpha-1", timestamp: "2026-01-01T00:00:25.000Z" }],
    }, {
        target: "beta.py",
        revisions: [{ kind: EventKind.write, changeId: "change-beta-1", timestamp: "2026-01-01T00:00:50.000Z" }],
    }],
    rewoundFilesTouched: [],
    commitMarkers: [],
    gitOperations: [{
        kind: GitOperationKind.commit,
        detail: "first",
        command: 'git commit -m "first"',
        timestamp: "2026-01-01T00:00:30.000Z",
        sessionId: "session-a",
    }],
};

test("test_deriveCommitChangedFiles_absorbs_trailing_bubble_for_first_commit", () => {
    // Scenario: the FIRST commit's chips live on the reply bubble sorted after it (snapshot
    // attribution); the forward absorb lists them instead of "No files changed" (task 87).
    // Steps:
    // build the timeline and take the first (only) commit.
    const { nodes } = buildTurnTimelineViewModel(firstCommitDocument);
    const [commitIndex] = findCommitNodeIndexes(nodes);
    // assert the pre-commit change (00:25 <= 00:30) is absorbed from the trailing bubble.
    const paths = deriveCommitChangedFiles(nodes, commitIndex!).map((change) => change.path);
    assert.ok(paths.includes("alpha.py"));
});

test("test_deriveCommitChangedFiles_excludes_changes_made_after_the_commit", () => {
    // Scenario: the forward absorb takes ONLY chips whose change instant is at-or-before the
    // commit — work done after the commit (00:50 > 00:30) stays out.
    // Steps:
    // build the timeline and take the commit.
    const { nodes } = buildTurnTimelineViewModel(firstCommitDocument);
    const [commitIndex] = findCommitNodeIndexes(nodes);
    // assert the post-commit change is not listed.
    const paths = deriveCommitChangedFiles(nodes, commitIndex!).map((change) => change.path);
    assert.ok(!paths.includes("beta.py"));
});

test("test_deriveCommitChangedFiles_never_lists_git_baseline_chips", () => {
    // Scenario: baseline seeds are pre-session repo state, never part of a commit's delta —
    // the baseline node sorts before the first commit but its chips must not be listed.
    // Steps:
    // build the timeline and take the commit.
    const { nodes } = buildTurnTimelineViewModel(firstCommitDocument);
    const [commitIndex] = findCommitNodeIndexes(nodes);
    // assert the gitBase-seeded path is not listed.
    const paths = deriveCommitChangedFiles(nodes, commitIndex!).map((change) => change.path);
    assert.ok(!paths.includes("orders.py"));
});

test("test_deriveCommitChangedFiles_forward_walk_stops_at_next_commit", () => {
    // Scenario: the forward absorb never crosses the NEXT commit row — a qualifying chip sitting
    // beyond it belongs to that later commit's window.
    // Steps:
    // add a second commit between the first commit and the trailing bubble.
    const document = {
        ...firstCommitDocument,
        gitOperations: [...firstCommitDocument.gitOperations, {
            kind: GitOperationKind.commit,
            detail: "second",
            command: 'git commit -m "second"',
            timestamp: "2026-01-01T00:00:35.000Z",
            sessionId: "session-a",
        }],
    };
    const { nodes } = buildTurnTimelineViewModel(document);
    const [firstCommitIndex, secondCommitIndex] = findCommitNodeIndexes(nodes);
    // assert the first commit's forward walk stopped at the second commit (no absorb).
    assert.deepEqual(deriveCommitChangedFiles(nodes, firstCommitIndex!), []);
    // assert the second commit absorbed the trailing bubble's pre-commit chip instead.
    const secondPaths = deriveCommitChangedFiles(nodes, secondCommitIndex!).map((change) => change.path);
    assert.ok(secondPaths.includes("alpha.py"));
});
```

**GREEN implementation** — replace `deriveCommitChangedFiles` (line 889) with:

```ts
// True when the chip is a base-commit baseline seed (tasks 86/87): baseline state is
// pre-session, never part of a commit's delta.
function checkChangeIsGitBaseline(change: FileChange): boolean {
    if (change.changeId === undefined) {
        return false;
    }
    return change.changeId.startsWith(GIT_BASE_CHANGE_ID_PREFIX);
}

// A commit's changed-file list (item 66, mockup logic): walk back from the commit to the
// previous commit EXCLUSIVE (or the timeline start), collecting every surviving row's file
// changes; each path is listed once, keeping the occurrence CLOSEST to the commit (its latest
// revision). Then walk FORWARD to the next commit EXCLUSIVE, absorbing only chips whose change
// instant is at-or-before the commit — pre-commit work whose owning reply bubble sorts after the
// commit row (task 87: the first commit otherwise shows "No files changed"). Baseline (gitBase)
// chips are never a commit's delta and are skipped in both directions.
export function deriveCommitChangedFiles(nodes: TimelineNode[], commitIndex: number): FileChange[] {
    const commitWhen = nodes[commitIndex]!.when;
    const changes: FileChange[] = [];
    const seenPaths = new Set<string>();
    const collectChange = (change: FileChange): void => {
        if (checkChangeIsGitBaseline(change)) {
            return;
        }
        if (seenPaths.has(change.path)) {
            return;
        }
        seenPaths.add(change.path);
        changes.push(change);
    };
    for (let index = commitIndex - 1; index >= 0; index -= 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        for (const change of node.fileChanges ?? []) {
            collectChange(change);
        }
    }
    for (let index = commitIndex + 1; index < nodes.length; index += 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        for (const change of node.fileChanges ?? []) {
            if (change.when > commitWhen) {
                continue;
            }
            collectChange(change);
        }
    }
    return changes;
}
```

Why backward-first dedup order: the backward walk's first hit is the occurrence closest to the
commit (the existing "keeping latest" convention its test locks); forward absorb only ADDS paths
the backward walk missed, so every existing test's expectation is preserved.

## Step 6 (task 87) — findContributingNodeIndexes mirrors the forward absorb

**RED test:**

```ts
test("test_findContributingNodeIndexes_includes_trailing_bubble", () => {
    // Scenario: the commit's contributing-row highlight includes the trailing bubble the forward
    // absorb took chips from (task 87 — the walk and the highlight must agree).
    // Steps:
    // build the timeline, take the commit, and locate the trailing reply bubble.
    const { nodes } = buildTurnTimelineViewModel(firstCommitDocument);
    const [commitIndex] = findCommitNodeIndexes(nodes);
    const replyIndex = nodes.findIndex((node) => node.uuid === "reply-1");
    // assert the reply row is listed as contributing.
    assert.ok(findContributingNodeIndexes(nodes, commitIndex!).includes(replyIndex));
});
```

**GREEN implementation** — replace `findContributingNodeIndexes` (line 913) with:

```ts
// The rows a selected commit highlights (`.contrib`, item 66): the same two-direction walk as
// deriveCommitChangedFiles, including every surviving row whose qualifying file changes overlap
// the commit's changed paths. Indexes return ascending.
export function findContributingNodeIndexes(nodes: TimelineNode[], commitIndex: number): number[] {
    const commitWhen = nodes[commitIndex]!.when;
    const changedPaths = new Set(deriveCommitChangedFiles(nodes, commitIndex).map((change) => change.path));
    const checkChangeContributes = (change: FileChange): boolean => {
        if (checkChangeIsGitBaseline(change)) {
            return false;
        }
        if (change.when > commitWhen) {
            return false;
        }
        return changedPaths.has(change.path);
    };
    const indexes: number[] = [];
    for (let index = commitIndex - 1; index >= 0; index -= 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        if ((node.fileChanges ?? []).some(checkChangeContributes)) {
            indexes.push(index);
        }
    }
    indexes.reverse();
    for (let index = commitIndex + 1; index < nodes.length; index += 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        if ((node.fileChanges ?? []).some(checkChangeContributes)) {
            indexes.push(index);
        }
    }
    return indexes;
}
```

Why the `when > commitWhen` guard is safe for the backward half: every chip on a row before the
commit has `when <= node.when <= commitWhen` (owners sit at-or-after their snapshots), so the
guard never excludes a backward row — it only keeps the shared predicate direction-agnostic.

## Step 7 — verification + closure

1. `npx tsc --noEmit` must exit 0. **Do not run `npm test`.**
2. Move tasks 86 and 87 from `tasks.json` to `completedTasks.json` (python one-off with
   `json.dump(..., indent=2, ensure_ascii=False)` — the files use 2-space indent; keep the diff
   minimal). Each gets `"completionDate": "2026-07-15"` and a short `closureNote`; omit
   `commitHashes` (work is staged, not committed).
3. `git add` every touched file (timeline.ts, styles.css, the test file, tasks.json,
   completedTasks.json, this plan, implementation notes). **Do not commit.**
