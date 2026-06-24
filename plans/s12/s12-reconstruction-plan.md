# Plan: S12 — conversation-only rewind + post-rewind EDIT, reconstructed as two DAGs

> Scope: two coupled deliverables in ONE slice.
> **(1) Crash fix.** The current engine THROWS on the S12 transcript
> (`TypeError: Cannot read properties of undefined (reading 'values')` at
> `src/reconstruction_replay_edit.ts:112`) because the surviving branch EDITs a file it never
> Wrote — the creating Write lives on the abandoned conversation branch, and a conversation-only
> rewind left that file on disk. Fix = seed the surviving Edit's base from the file-history backup.
> **(2) Two-DAG CLI render.** Add `--graphConvo` (conversationDAG) and `--graphFile` (fileDAG);
> **no flags = `--graphConvo --graphFile`** (convo first, then file). This REPLACES the bare-default
> output for EVERY scenario (a global default change; S1–S11 default-view CLI tests are rewritten).

JSONL (clean-room input, read-only): `scenarios/executed/s12-write-conv-only-rewrite/e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl`
Predecessor: S11 — IMPLEMENTED, **129 tests green** at `HEAD = 6a47c39 Implemented S11 handling`.

---

## Locked design decisions (confirmed with the user — drive every output below)

1. **Two DAGs, two flags.** `--graphConvo` = conversationDAG only; `--graphFile` = fileDAG only.
2. **No flags = both graphs**, conversationDAG rendered FIRST, then fileDAG.
3. **Both DAGs render OLDEST-AT-TOP** (root/earliest at the top, tips/latest at the bottom).
4. **conversationDAG node granularity = one node per file-changing turn** (each Write/Edit/etc.
   event is a node), plus a single root node (letter `A`) for the conversation root / rewind point.
5. **No-fork scenarios render a LINEAR conversationDAG** — no `branch (...)` wrappers, just the root
   then the turns. `branch` wrappers appear ONLY when there is a real fork (a rewound branch with
   file changes): S7, S8, S11, S12. Everything else (S1–S6, S9, S10) is linear.
6. **fileDAG renders VERTICAL per file**, each file's turns listed one per line in version order.
7. **Shared letters.** A turn's letter is assigned ONCE and reused in BOTH graphs, so the fileDAG's
   `B` is the same turn as the conversationDAG's `B` — the cross-link between "which file change" and
   "which conversational turn".
8. **Graph nodes show TOPOLOGY ONLY** — `<letter>  <kind>  <target>  #<shortChangeId>`. File CONTENT
   is NOT shown inline in a graph; it stays in the content views (`--surviving`/`--branch` with
   optional `--verbose`/`--diff`).
9. **fileDAG attributes a file version to the REAL turn that produced it across ALL branches.**
   scenario12.py's base node is turn `B` — Branch A's actual Write `#015zSRxJ` — NOT the synthetic
   backup-seed used internally to reconstruct surviving CONTENT. (The seed is a content-recovery
   device for `--surviving`; the fileDAG reflects true disk lineage.)
10. **Existing flags unchanged.** `--surviving`, `--list-branches`, `--branch <id>` (introduced in
    S7) still select the content views; `--verbose`/`--diff` still modify them.
11. **Global default change accepted.** The bare CLI now prints both graphs for every scenario, so
    every S1–S11 *default-view* CLI test is rewritten to the new graph output in THIS slice. The
    content views and their tests are untouched.

> Decision 3 from the prior plan draft (whether Branch A is a `## rewound` section in the default
> text view) is SUPERSEDED: branch structure now lives in `--graphConvo`, not the bare default.

---

## The S12 ground truth (verified; do not re-derive)

**File operations (tool_use id = changeId):**

| turn | branch | op | path | changeId | time |
|------|--------|----|------|----------|------|
| B | A (rewound)   | Write | `scenario12.py` (`add`)               | `toolu_015zSRxJ93FV3tpqoy4kZ3AR` | 16:09:32.899Z |
| C | A (rewound)   | Write | `test_scenario12.py` (imports `add`)  | `toolu_018wtDuedtHLmqtYGy71vVdC` | 16:09:33.441Z |
| D | B (surviving) | Edit  | `scenario12.py` (append `multiply`)   | `toolu_01NjGUyNRPyhZYw4Ws1HtjYE` | 16:10:31.700Z |
| E | B (surviving) | Edit  | `test_scenario12.py` (test `multiply`)| `toolu_0161dgZLqA2Z6m5bkhabofUx` | 16:10:32.822Z |

Letter `A` = root prompt / rewind point uuid `94000895-217c-4fc7-93f1-d24afe2f46f6` (the shared
parent of both branches). Branch A tip (rewound) = `cba30c9f-daca-460d-afbe-e02844093467`. Branch B
tip (surviving) = read off the engine in Task 5 (do NOT guess).

**Snapshots** (`{path: backupFileName@version @ time}`): `7dde40ca` Branch-A head
`43c1313ce6fd5f24@v2 / 06083fd98836d88e@v2 @16:09:52`; `50ab7ab9` Branch-B start (SAME backups —
disk untouched by the conv-only rewind); `2c74b52a` Branch-B end `@v3` (the Edit's result).
The Edit's base = the `@v2` backup (snapshotted BEFORE the edit), recovered content:
- `43c1313ce6fd5f24@v2` → `"def add(a, b):\n    return a + b\n"`
- `06083fd98836d88e@v2` → `"from scenario12 import add\n\n\ndef test_add():\n    assert add(1, 2) == 3\n"`

---

## Part 1 — The crash fix (seed the Edit base from the backup)

Root cause: `reconstructAll` selects the surviving branch's records; Branch A's Write is off Branch
B's ancestor chain, so the lineage is `[EditEvent]`; `applyEdit` runs on an empty base and
`insertHunkAdditions` indexes past the empty working array → crash at line 112.

### Source change 1 — `src/reconstruction_sidecar.ts`

Add a private `findBackupAtOrBefore` (the latest non-null backup of `target` taken at or before a
time — the opposite of the existing `findBackupAfter`) and an exported `seedEditBaseFromBackup`.
Place both after `findBackupAfter`.

```ts
function findBackupAtOrBefore(
    timeline: Map<string, BackupPoint[]>,
    cwd: Path | undefined,
    target: Path,
    when: Date,
): BackupPoint | undefined {
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    let chosen: BackupPoint | undefined;
    for (const point of points) {
        if (point.backupFileName !== null && point.backupTime.getTime() <= when.getTime()) {
            chosen = point;
        }
    }
    return chosen;
}

// When a file's first event on this branch is an Edit (its creating Write lives on an abandoned
// conversation branch and a conversation-only rewind left the file on disk — spec 39), recover the
// pre-edit on-disk content from the file-history backup taken at or before the edit and prepend a
// synthetic Write so the edit splices onto real lines. A file whose first event already creates it
// (write/overwrite/copy/append) is returned unchanged.
export function seedEditBaseFromBackup(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const first = events[0];
    if (first === undefined || first.kind !== EventKind.edit) {
        return events;
    }
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    const base = findBackupAtOrBefore(timeline, cwd, first.target, first.timestamp);
    if (base === undefined || base.backupFileName === null) {
        return events;
    }
    const seed: WriteEvent = {
        kind: EventKind.write,
        changeId: new Uuid(base.backupFileName.toString()),
        target: first.target,
        content: reader(base.backupFileName),
        timestamp: base.backupTime,
    };
    return [seed, ...events];
}
```
Imports to extend: `Uuid` from `./structures/domain.ts`; `WriteEvent` from the existing type-only
`./reconstruction_engine.ts` import. `EventKind`/`resolveAgainstCwd`/`findCwd`/`buildBackupTimeline`
are already present.

### Source change 2 — `src/reconstruction_branches.ts`

One new pipeline step in `reconstructFileOver`, after `fillRedirectContent`, guarded on `reader`:
```ts
    const filled = reader ? fillRedirectContent(records, seeded, reader) : seeded;
    const based = reader ? seedEditBaseFromBackup(records, filled, reader) : filled;
    return replayEvents(based);
```
Extend the import: `import { fillRedirectContent, seedEditBaseFromBackup } from "./reconstruction_sidecar.ts";`

### Source change 3 — `src/reconstruction_replay_edit.ts`

Make the context-line branch of `insertHunkAdditions` total (single condition `carried === undefined`):
```ts
        } else {
            const carried = workingLines[workingIndex];
            if (carried === undefined) {
                result.push({ oldLineNum: DOES_NOT_EXIST_YET, values: [{ line: line.slice(1), timestamp }] });
                added = true;
            } else {
                result.push({ oldLineNum: workingIndex, values: carried.values });
            }
            workingIndex += 1;
        }
```
For every S1–S11 file the base is non-empty, so `carried` is always defined and this is the
original path verbatim — zero behavior change. `DOES_NOT_EXIST_YET` is already imported.

---

## Part 2 — The two-DAG feature

### New module `src/reconstruction_graph.ts` — data model + builders

```ts
// A node in either DAG: a single file-changing turn. `letter` is shared across both graphs.
export type GraphTurn = {
    letter: string;          // "B", "C", … (the root prompt is "A", not a GraphTurn)
    kind: EventKind;
    target: Path;
    changeId: Uuid;
    timestamp: Date;
};

// One conversation branch in the conversationDAG.
export type ConvoBranch = {
    role: BranchRole;        // surviving | rewound  (vocabulary enum, see below)
    tip: Uuid;
    rewindPoint: Uuid | undefined;
    turns: GraphTurn[];      // this branch's post-fork turns, oldest first
};

export type ConversationDag = {
    rootLetter: string;      // "A"
    rootUuid: Uuid | undefined;   // conversation root / fork point
    trunk: GraphTurn[];      // turns shared by all branches (ancestors of the fork), oldest first
    branches: ConvoBranch[]; // empty when linear (no fork)
};

export type FileDagEntry = { target: Path; turns: GraphTurn[] };  // version order, oldest first
export type FileDag = { files: FileDagEntry[] };
```

Builders (verb-named, pure over `records` + the existing reconstruction outputs):

- `assignTurnLetters(records): Map<string, string>` — collect every file-changing event via
  `extractFileEvents(records)` over ALL records (not branch-filtered), sort by `timestamp` (stable),
  and map `changeId.toString() → letter` starting at `"B"` (`"A"` is reserved for the root). This is
  the single source of letters used by BOTH graphs. (For >25 turns, continue `Z → AA, AB, …`.)
- `buildConversationDag(records): ConversationDag` — uses `findConversationBranches(records)`.
  - `rootUuid` = the conversation root (the record whose `parentUuid` is null/undefined; if several,
    the earliest). `rootLetter = "A"`.
  - `trunk` = turns whose changeId is on EVERY branch's ancestor chain (shared pre-fork turns),
    oldest first. For S12 this is empty.
  - For each branch from `findConversationBranches`, `turns` = its file-changing events that are NOT
    in the trunk, oldest first, each mapped to its letter. A branch with zero such turns is dropped
    (mirrors `buildRewoundBranchHistory` returning undefined for a no-file tangent) — this is what
    keeps S9/S10 linear (their abandoned side has no file turns) and S1–S6 single-branch.
  - If exactly one branch survives the drop, set `branches = []` and put that branch's turns in
    `trunk` after the shared trunk → the LINEAR shape (decision 5).
- `buildFileDag(records): FileDag` — group `extractFileEvents(records)` (ALL records) by
  `target.toString()`, sort each group by `timestamp`, map each to its letter. This yields the true
  cross-branch disk lineage (decision 9): scenario12.py → `[B(write), D(edit)]`. Files ordered by
  first-touch time.

> Why ALL records (not branch-filtered) for letters + fileDAG: a turn's letter must be stable
> regardless of which branch you view, and the fileDAG is disk lineage, which spans branches
> (Branch A's Write is the on-disk base Branch B edited). `buildConversationDag` is the only builder
> that partitions by branch.

Add a `BranchRole` enum to `src/structures/vocabulary.ts` (`surviving`, `rewound`) — one canonical
home for these display tokens (coding-requirements §4: compare/emit enum members, never string
literals). The CLI's existing `formatBranchHeader` strings (`"surviving"`/`"rewound"`) are migrated
to it (small, mechanical; keeps one vocabulary).

### New module `src/reconstruction_graph_render.ts` — renderers

All renders OLDEST-AT-TOP. `shortUuid` (from `reconstruction_branch.ts`) for tips/root; a
`shortChangeId` helper (trim a `toolu_` prefix to 8 chars — reuse the renderer's existing one in
`reconstruction_render.ts`; move it to a shared home if needed, no re-export shim).

- `renderTurnLine(turn): string` → `"  <letter>  <kind>  <target>  #<shortChangeId>"` with aligned
  columns. `kind` is the EventKind token (`write`/`edit`/`delete`/`rename`/`copy`/`append`/`overwrite`).
- `renderConversationDag(dag): string`:
  - Header line `══ conversationDAG ══`.
  - `A  prompt  #<shortUuid(rootUuid)>` (append `   (rewind point)` when any branch is rewound).
  - Trunk turns (each via `renderTurnLine`).
  - If `branches` non-empty: for each branch, a connector then a wrapper line
    `├─ branch <role> (<role>; tip #<shortUuid(tip)>)` (last branch uses `└─`), then its turns
    indented under it. Rewound branches: include `rewind @ #<shortUuid(rewindPoint)>` if it differs
    from the root. Branch order = by the branch's first-turn timestamp (oldest first).
- `renderFileDag(dag): string`:
  - Header `══ fileDAG ══`.
  - For each file: a `<target>` line, then its turns one per line (`renderTurnLine`), version order.
- `renderGraphs(records, which): string` where `which` selects convo / file / both; when both,
  convo first then a blank line then file.

### CLI wiring — `src/reconstruction_cli.ts`

- `CliOptions` gains `graphConvo: boolean; graphFile: boolean`.
- `parseArgs`: read `--graphConvo`/`--graphFile`. After parsing, if NONE of
  `{surviving, listBranches, branch, graphConvo, graphFile}` is set, default
  `graphConvo = true; graphFile = true` (decision 2 — bare CLI = both graphs).
- `runCli` dispatch order:
  1. `graphConvo || graphFile` → `renderGraphs(records, …)` (topology only; ignores verbose/diff).
  2. `listBranches` → `renderBranchSummary` (unchanged).
  3. `branch !== undefined` → `renderOneBranch` (unchanged).
  4. `surviving` → surviving content (unchanged).
  5. `verbose || diff` with no selector → surviving content in that mode (back-compat content path).
- `USAGE` string updated to list `--graphConvo`/`--graphFile`.
- `renderAllBranches` is no longer the default path; KEEP the function only if a content view still
  needs it, else remove (it is replaced by the graph default). The `## surviving`/`## rewound` text
  view is retired from the bare default.

### Concrete S12 expected output (no flags)

```
══ conversationDAG ══
A  prompt  #94000895   (rewind point)
│
├─ branch surviving (surviving; tip #<BranchB>)
│  D  edit   scenario12.py       #01NjGUyN
│  E  edit   test_scenario12.py  #0161dgZL
│
└─ branch rewound (rewound; tip #cba30c9f; rewind @ #94000895)
   B  write  scenario12.py       #015zSRxJ
   C  write  test_scenario12.py  #018wtDue

══ fileDAG ══
scenario12.py
  B  write  #015zSRxJ
  D  edit   #01NjGUyN
test_scenario12.py
  C  write  #018wtDue
  E  edit   #0161dgZL
```
> Branch render order is by first-turn time: Branch A's writes (16:09) precede Branch B's edits
> (16:10), so **rewound renders above surviving** here. (The earlier hand mockup put surviving first;
> oldest-at-top, decision 3, dictates rewound-first because its turns are older. Confirm acceptable;
> if the user prefers surviving-always-first, order branches with surviving pinned to the bottom and
> note it.) fileDAG letters cross-link to the convoDAG.

---

## Tasks (strict RED → GREEN; full suite green after each)

### Task 1 — Crash fix (RED→GREEN)
- 1a. Add 3 unit tests to `tests/reconstruction_sidecar.test.ts` for `seedEditBaseFromBackup`
  (seed prepends a Write from the at-or-before backup; pass-through when first event creates the
  file; pass-through when no backup precedes the edit). RED, then Source change 1.
- 1b. Source change 2 (wire into `reconstructFileOver`). Covered by Task 5 end-to-end.
- 1c. Add a guard test to a NEW `tests/reconstruction_replay_edit.test.ts` (applyEdit on an empty
  base materialises context as genesis without throwing). RED, then Source change 3.
- Verify gate.

### Task 2 — Graph data model + builders (RED→GREEN)
- New `tests/reconstruction_graph.test.ts`. One behavior per test:
  - `assignTurnLetters` assigns B,C,D,… by timestamp; same changeId → same letter.
  - `buildFileDag` groups by file in version order with shared letters (synthetic 1-file + 1-edit
    fixture; assert `scenario.py → [write@B, edit@D]` style).
  - `buildConversationDag` on a synthetic FORKED fixture → trunk empty, two branches (surviving +
    rewound) each with its turns; on a synthetic LINEAR fixture → `branches == []`, all turns in
    `trunk`. (Reuse the synthetic record builders in `tests/reconstruction_branch.test.ts`.)
- Implement `src/reconstruction_graph.ts` + the `BranchRole` enum. Verify gate (watch the 250-line
  cap; split builders/types if needed).

### Task 3 — Graph renderers (RED→GREEN)
- New `tests/reconstruction_graph_render.test.ts`: `renderConversationDag` linear vs forked shapes
  (assert header, root line, wrapper lines, oldest-at-top order); `renderFileDag` vertical per-file;
  `renderGraphs` convo-before-file. Implement `src/reconstruction_graph_render.ts`. Verify gate.

### Task 4 — CLI wiring + GLOBAL default change (RED→GREEN + rewrite prior tests)
- Add `--graphConvo`/`--graphFile`, the new default, dispatch, USAGE. Add CLI tests for the flags.
- **Rewrite every existing default-view CLI assertion** to the new graph output. Grep first:
  `rg -n "## surviving|## rewound|no-op|plain list|renderAllBranches|default" tests/`. Known files:
  `tests/reconstruction_cli.test.ts` (S1–S7 default cases), `tests/reconstruction_cli_s10.test.ts`,
  `tests/reconstruction_cli_s11.test.ts`, plus any S8 default case. For each, replace the bare-default
  expectation with the scenario's graph output (linear for S1–S6/S9/S10; forked for S7/S8/S11).
  Tests that exercise `--surviving`/`--list-branches`/`--branch`/`--verbose`/`--diff` stay as-is.
- Verify gate (full suite green incl. all content-view tests).

### Task 5 — S12 real-transcript lock (RED before Task 1, GREEN after)
- Add `S12_JSONL` to `tests/fixtures.ts` (absolute-Desktop path:
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s12-write-conv-only-rewrite/e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl`).
- `tests/reconstruction_engine_s12.test.ts` (in-memory `S12_BACKUPS` reader, S5 pattern):
  surviving scenario12.py = 2 revisions (seeded `add` base + `multiply` edit, last changeId
  `toolu_01NjGUyN…`, final text has both `def add` and `def multiply`); surviving test file imports
  `multiply`; `reconstructBranches` keeps Branch A as one rewound branch (rewindPoint `94000895`,
  base changeId `toolu_015zSRxJ…`).
- `tests/reconstruction_cli_s12.test.ts` (new file; `runCli` real on-disk reader): default = both
  graphs matching the spec above (assert convoDAG header, the four turn lines with letters B–E and
  the right kinds/targets, `rewind @ #94000895`; fileDAG per-file with shared letters); `--graphConvo`
  = convo only; `--graphFile` = file only; `--surviving` = the edited content. **Read Branch B's tip
  short id off `runCli` output and transcribe it; do NOT guess.**
- Verify gate.

### Task 6 — Docs
- `plans/reconstruction-engine-design.md`: spec **39 (conversation-only-rewind-then-edit)** — the
  seed-from-backup fix + the at-or-before backup rule + the total `insertHunkAdditions` guard; spec
  **40 (two-DAG render)** — conversationDAG (per-turn, branch-aware, linear when no fork) +
  fileDAG (vertical per-file, cross-branch disk lineage) + shared letters + the new global default.
  Update the code-layout section (new `reconstruction_graph.ts` / `reconstruction_graph_render.ts`,
  the sidecar/branches/replay_edit changes, `BranchRole` in vocabulary).
- `plans/implementation-notes-api-from-scenarios.md`: prepend the S12 entry (the crash + fix, the
  two-DAG decisions, the global default change + which tests were rewritten, deviations, tradeoffs,
  open questions incl. branch render-order).
- `plans/roadmap.md`: `[ ] S12 ->` → `[x] S12 -> [x]` with a one-line summary.

---

## Verify gate (run after every task; all must pass before the next)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 129 baseline + new tests; ZERO failures incl. all content-view S1–S11 tests
npx tsc --noEmit         # No errors found (tsx does NOT type-check — this is the real type gate)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```

## End-to-end check (after Task 6)
```
P="scenarios/executed/s12-write-conv-only-rewrite/e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null              # both graphs per the spec (was a CRASH)
npx tsx src/reconstruction_cli.ts "$P" --graphConvo 2>/dev/null # conversationDAG only
npx tsx src/reconstruction_cli.ts "$P" --graphFile 2>/dev/null  # fileDAG only
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null  # edited (add+multiply) content
# Sanity: S1 default = linear convoDAG + fileDAG (no branch wrappers); S11 default = forked convoDAG.
```

## Risks / out-of-scope
- **Branch render order** (rewound-above-surviving via oldest-at-top) — flagged in the spec; confirm
  at approval. If surviving-pinned is wanted, sort branches with surviving last.
- **Multi-fork transcripts (S8, 3 rewinds)** render each rewound branch as its own wrapper under the
  root; deep nesting is rendered flat (one wrapper per branch), not as a nested tree. Acceptable for
  this slice; note if a nested tree is wanted later.
- **The seed selects the backup at-or-before the edit by TIMESTAMP** — clock-skew edge case noted,
  not present in S12.
- **`parseRedirect` `2>&1`/`>/dev/null` regression** — carried-forward, separate slice.
