# Plan: Timeline tool-call rows, per-chip line labels, and raw-line selection-sync fix

Covers TASKS.md items 53 + 24 (both close via this work) and the newly reported
selection-sync bug. User decisions are LOCKED (AskUserQuestion, 2026-07-09):

1. ALL tool calls get un-bubbled rows (Bash, Read, MCP, …), including executions that
   exist only as hook attachments (s39's `rtk ls`). Row text is a single line truncated
   to 50 chars so the `[{ }] <TS> L:n (of N)` parts stay visible. Write/Edit tool calls
   stay represented as file chips, never rows.
2. The files bubble KEEPS its own step number (item 24 closes as: commands move out of
   the bubble into rows; the snapshot-owning synthetic step keeps its number).
3. Each file chip's `{ }` opens that file's OWN causing line (e.g. the Write tool_use at
   L:51 for s39 `orders.py`), reverting item 47b; chip rows gain `<TS>` and `L:n (of N)`
   labels. This closes item 53.

Reference scenario s39 (`tests/fixtures.ts` already exports `S39_JSONL` /
`S39_JSONL_PATHS`). Verified facts (0-based raw lines, matching the webapp's L numbers):

- L31 reply record uuid `e796046a-…` (Step 4 bubble, "Setting up the repo, files, and branch.")
- L32 Bash `git init` (toolUseID `toolu_014juYsQ4Gw3ji6E4m6uh38X`, record uuid
  `f26c31eb-…`), L33 Bash `ls /private/var/…` (toolUseID
  `toolu_015S4Xy7zXKZsjauZticmEj9`, record uuid `40c7cbd5-…`), L44 Bash `mkdir -p …`,
  L64 Bash `git add orders.py tests/`
- L39 attachment `hook_success`, hookName `PreToolUse:Bash`, toolUseID
  `toolu_015S4Xy7zXKZsjauZticmEj9` — the SAME id as L33's `ls` tool_use: the
  `rtk-rewrite.sh` PreToolUse hook REWROTE the command before execution. Its `stdout`
  JSON-parses to `{ hookSpecificOutput: { updatedInput: { command:
  "rtk ls /private/var/…" } } }`; attachment record uuid
  `26897912-0823-44cb-9be0-c9872027131e`. BOTH rows render (user mock lists L33 `ls`
  AND L39 `rtk ls`). Hook-run attachments (SessionStart/UserPromptSubmit/Stop) carry
  toolUseIDs too but never an `updatedInput.command` — the command guard excludes them.
- s39's OTHER session (`81e41fb9-….jsonl`) has a Read tool_use (gets a row) and an
  Edit tool_use (chip-covered, NO row).
- L51/L55 Write tool_uses (`orders.py` / `tests/test_orders.py`); the files-bubble
  node's snapshot changeIds are the Write toolu ids
  (`toolu_01TXzRmSw6NPb8H2HC9WhxD7`, `toolu_01MbuZ8HyCSqGAuVYGwD2vRQ`), and those ids
  appear verbatim in lines 51/55 — so `findTimelineNodeIndexForRawLine` already maps
  51/55 to the files bubble.
- L49/L50 are file-history-snapshot records whose INNER `snapshot.messageId` is the
  Step-3 PROMPT uuid `78ab0da4-…`. `checkUserTurnOwnsRawLine`
  (`webapp/views/timeline.ts:609`) matches the BARE uuid substring, so stepping the
  inspector onto these lines wrongly selects Step 3. THIS is the reported bug's root
  cause (empirically confirmed by running `buildTurnTimelineViewModel` +
  `findTimelineNodeIndexForRawLine` on the real s39 document: lines 49/50 are the only
  lines matching Step 3).

Constraints: follow `plans/coding-requirements.md` (domain types: toolu ids are `Uuid`s;
verb-named functions; single-source wire vocabulary), 4-space indent, strict red-green
TDD (write each test BEFORE its code), single-condition branching
(`~/.claude/guides/single-condition-branching.md`). DO NOT run `npm test` — the user
runs the suite. `npm run typecheck` and `npm run build:webapp` ARE allowed and required
at the end. When replacing existing code, comment the old code out with an item marker
(user preference), don't delete.

## Phase 1 — Engine: `findToolCalls` extraction (new module `src/reconstruction_tool_calls.ts`)

New module mirroring `findGitOperations` (`src/reconstruction_git_evidence.ts`), kept
under 250 lines.

### 1a. Tests FIRST — new `tests/reconstruction_tool_calls.test.ts`

Load records once: `const s39Records = loadTranscript(new Path(S39_JSONL))` (mirror how
`tests/git-operations.test.ts` loads records — read that file first and copy its exact
load call and imports). Tests (each with plain-English step comments per the TDD guide):

1. `test_s39_bash_tool_calls_are_extracted` — `findToolCalls(s39Records)` contains
   calls whose `summary` values are `"git init"`, one starting `"ls /private/"`, one
   starting `"mkdir -p"`; each has `toolName === ToolName.Bash`, a `Date` timestamp,
   and `uuid`/`toolUseId` instanceof `Uuid`.
2. `test_s39_rtk_rewrite_hook_adds_a_row_for_the_rewritten_command` — exactly one call
   whose `summary` starts `"rtk ls "`; its `toolUseId.toString() ===
   "toolu_015S4Xy7zXKZsjauZticmEj9"` (SHARED with the `ls` row) and
   `uuid.toString() === "26897912-0823-44cb-9be0-c9872027131e"` (the attachment
   record); its `toolName === ToolName.Bash` (hookName suffix after `":"`). The plain
   `ls` row for the same toolUseId ALSO exists.
3. `test_write_tool_uses_are_excluded_from_tool_calls` — no extracted call has
   `toolName === ToolName.Write`, and no call's `toolUseId` equals either Write toolu id
   above (proves Write hooks don't synthesize rows either).
4. `test_compute_tool_call_summary_prefers_command_then_file_path` — unit-level: call
   the exported `computeToolCallSummary` with three hand-made block-shaped objects:
   `{ input: { command: "git init", file_path: "x" } }` → `"git init"`;
   `{ input: { file_path: "/a/b.py" } }` → `"/a/b.py"`;
   `{ input: { pattern: "foo" } }` → `"foo"`.

### 1b. Implementation

```ts
// Every non-file-edit tool call in a transcript, for the timeline's un-bubbled tool rows:
// tool_use blocks from assistant records, plus hook-evidenced executions that have no
// tool_use record (a PreToolUse rewrite hook ran the command instead — s39's `rtk ls`).
export type ToolCall = {
    toolName: string;
    summary: string;
    timestamp: Date;
    sessionId: Uuid | undefined;
    uuid: Uuid;
    toolUseId: Uuid;
};
```

- `FILE_EDIT_TOOL_NAMES = new Set<string>([ToolName.Write, ToolName.Edit])` — these
  render as file chips, never rows.
- `export function computeToolCallSummary(block: { input: unknown }): string` — from
  `block.input` (cast to `Record<string, unknown>`): return `input.command` when it is
  a string; else `input.file_path` when a string; else `input.pattern` when a string;
  else the first string-valued property; else `""`. One condition per guard clause.
- `export function findToolCalls(records: TranscriptRecord[]): ToolCall[]` — two passes:
  - Pass 1: for each record with `timestamp instanceof Date`, each
    `getContentBlocks(record)` block of `BlockType.tool_use`: record the block's id in a
    `seenToolUseIds: Set<string>` ALWAYS (including Write/Edit — this is what stops
    pass 2 from synthesizing hook rows for chip-covered Writes); skip emitting when
    `FILE_EDIT_TOOL_NAMES.has(block.name)`; otherwise emit
    `{ toolName: block.name, summary: computeToolCallSummary(block), timestamp,
    sessionId: record.sessionId, uuid: record.uuid, toolUseId: new Uuid(block.id) }`.
    (Copy `findGitOperations`' exact record/block iteration idiom.)
  - Pass 1 also builds `summaryByToolUseId: Map<string, string>` over ALL tool_use
    blocks (including Write/Edit).
  - Pass 2 (hook rewrites): for each record where `getAttachmentEntry(record)` resolves
    (`src/structures/session-meta.ts:104`): read `attachment.toolUseID` (string via
    passthrough payload) — skip when absent. Extract the rewritten command:
    `JSON.parse(attachment.stdout as string)` inside try/catch →
    `hookSpecificOutput.updatedInput.command` (string). Skip when unparseable/absent
    (this alone excludes SessionStart/Stop/UserPromptSubmit hook attachments). Skip
    when the rewritten command EQUALS `summaryByToolUseId.get(toolUseID)` (a no-op
    rewrite would duplicate the tool_use row). Skip when a rewrite row was already
    emitted for this toolUseID (Pre+Post hooks share the id; first wins). Otherwise
    emit with `toolName` = the text after the last `":"` in `attachment.hookName`
    (e.g. `"PreToolUse:Bash"` → `"Bash"`), `summary` = the rewritten command,
    `timestamp`/`sessionId`/`uuid` from the attachment record, `toolUseId` = the shared
    id. `// ponytail: only command rewrites get extra rows; input rewrites of
    // non-command tools stay invisible until a scenario needs them.`

### 1c. Wire the field into the document

`src/reconstruction_json.ts`: the document type (the one holding
`gitOperations: GitOperation[]` at ~:241) gains `toolCalls: ToolCall[]`; the assembly
site that computes `const gitOperations = findGitOperations(records)` (~:275) gains
`const toolCalls = findToolCalls(records)` and ships it in the returned object.
Test FIRST (append to `tests/timeline-viewmodels.test.ts`, which already builds wire
documents): build `const s39Document = JSON.parse(JSON.stringify(
buildProjectDocument(S39_JSONL_PATHS, undefined)))` alongside the existing fixture
consts, and add `test_document_ships_tool_calls_on_the_wire` — `s39Document.toolCalls`
has ≥ 5 entries; each has string `uuid`, `toolUseId`, `timestamp`, `summary`.

## Phase 2 — View model: tool-call nodes (`webapp/views/timeline.ts`)

### 2a. Tests FIRST (append to `tests/timeline-viewmodels.test.ts`, using `s39Document`)

Helper for raw lines in these tests: replicate `fetchRawRecords`' split — READ
`webapp/app.ts:238-243` first and mirror its exact text→lines transformation over
`readFileSync(S39_JSONL, "utf8")`.

5. `test_tool_call_nodes_sort_between_reply_and_files_bubble` — in
   `buildTurnTimelineViewModel(s39Document).nodes`: the index of the agent turn whose
   text starts `"Setting up the repo"` < the indexes of the 4 tool-call nodes whose
   summaries start `"git init"`, `"ls "`, `"rtk ls"`, `"mkdir -p"` < the index of the
   blank-text agent turn carrying 2 fileChanges; the `"git add"` tool-call node sits
   AFTER that files bubble and BEFORE the session-end node.
6. `test_tool_call_nodes_are_never_numbered` — every `TOOL_CALL_NODE_KIND` node has
   `stepNumber === undefined`, and the session-end node's stepNumber is unchanged by
   their presence (assert its concrete value from the current 6-node timeline: 6).
7. `test_find_node_for_raw_line_maps_hook_attachment_to_its_tool_call` —
   `findTimelineNodeIndexForRawLine(nodes, rawLines[48])` returns the `mkdir` tool-call
   node's index (line 48's attachment carries the mkdir toolUseID).
8. `test_find_node_for_raw_line_keeps_selection_on_snapshot_lines` — lines 49 and 50
   both return `-1` (THE bug fix: today they return Step 3's index).
9. `test_find_node_for_raw_line_matches_agent_turns_own_message_line` — line 31 returns
   the Step-4 agent turn's index (today: -1).
10. `test_user_turn_uuid_match_requires_uuid_key_form` — hand-built nodes array with one
    user turn of uuid U: a line containing `"messageId":"U"` returns -1; a line
    containing `"uuid":"U"` returns the user node's index.
11. `test_file_changes_carry_snapshot_timestamp` — the files bubble's
    `fileChanges[0].when` equals its owning snapshot's `when` string.
12. `test_truncate_tool_call_summary_caps_at_50_chars` — a 120-char string returns 50
    chars + `"…"`; a 20-char string returns unchanged.
13. UPDATE the item-52 `computeToolActivityTag` tests: the `"tool call"` branch
    (gitOperations-only turns) is retired — delete/adjust the test asserting it (keep
    the file's conventions; comment out the old assertions with an item-55 marker); the
    blank-text + fileChanges → `"tool result"` case must still pass.

Existing tests at `tests/timeline-viewmodels.test.ts:304-351` must stay green: they
build lines in `"uuid":"…"` / changeId form, compatible with the tightened matching.
Verify by reading them; adjust ONLY if a constructed line relies on bare-uuid matching.

### 2b. Implementation

- `type WireToolCall = { toolName: string; summary: string; timestamp: string;
  sessionId?: string; uuid: string; toolUseId: string }`; `WireTimelineDocument` gains
  `toolCalls?: WireToolCall[]` (optional — an older cached document lacks it).
- `export const TOOL_CALL_NODE_KIND = "tool-call"`; new `ToolCallNode` type following
  `CommitNode`'s pattern (stub `undefined` fields for union-narrowing): carries `kind`,
  `when`, `sessionId`, `uuid` (the record uuid — the lineLabels block keys off it),
  `summary`, `toolName`, `toolUseId`; `stepNumber?: undefined`,
  `snapshots?: undefined`, `fileChanges?: undefined`, `text?: undefined`, etc.
  `TimelineNode` union (`:146`) gains it.
- `deriveToolCallNodes(document)`: `(document.toolCalls ?? []).map(...)`.
- `buildTurnTimelineViewModel` (`:572`): merge
  `[...turnNodes, ...commitNodes, ...deriveToolCallNodes(document)]` before the sort.
  Check `computeNodeKindRank` (used by `compareTimelineNodes`, `:255`) and give
  tool-call nodes a rank AFTER agent turns at equal timestamps.
- `assignStepNumbers` (`:505`): second guard clause `if (node.kind ===
  TOOL_CALL_NODE_KIND) { continue; }`.
- `deriveNodeFileChanges` (`:516` area): same guard — tool-call nodes have no
  snapshots; without the guard `node.snapshots` dereference breaks.
- `checkNodeIsPickable` (`:267`): verify it narrows by snapshots/kind so tool-call
  nodes are excluded; add a kind guard if not.
- Retire git rows: comment out (item-55 marker) the `attachGitOperationsToAgentTurns`
  CALL at `:585` and the `node.gitOperations.length > 0` render block at `:1336-1338`
  (`renderGitOperationRow` itself gets commented out too); `deriveCommitNodes`
  (`:462`) is UNTOUCHED — commit hard-stops still come from `document.gitOperations`.
  `TurnNode.gitOperations` stays as an always-empty field so unrelated code keeps
  compiling (note it in the item-55 comment).
- `computeToolActivityTag` (`:669`): comment out the now-unreachable gitOperations
  branch; blank-text + fileChanges → `"tool result"` stays.
- `export function truncateToolCallSummary(summary: string): string` — first line only
  (`split("\n")[0]`), then cap at 50 chars appending `"…"` when truncated.

### 2c. `findTimelineNodeIndexForRawLine` (`:616`) — three-tier matching

- `checkAgentTurnOwnsRawLine` (`:596`): keep the changeId match; ADD own-message-line
  match — when `node.uuid !== undefined` and
  `rawLineText.includes(`"uuid":"${node.uuid}"`)` the agent turn owns the line.
- NEW tool-call matching, TWO sub-tiers (the `ls` and `rtk ls` rows SHARE a toolUseId,
  so the record-uuid form must win first): (a) tool-call node whose
  `"uuid":"${node.uuid}"` appears in the line — the row's own record line; (b)
  tool-call node whose `toolUseId` appears bare in the line — hook attachments and
  tool_results carry the toolu id verbatim.
- `checkUserTurnOwnsRawLine` (`:605`): tighten `includes(node.uuid!)` →
  `includes(`"uuid":"${node.uuid!}"`)`. This alone kills the Step-3 jump: snapshot
  lines carry the prompt uuid only as `"messageId":"…"`.
- Search order in `findTimelineNodeIndexForRawLine`: agent tier → tool-call uuid
  sub-tier → tool-call toolUseId sub-tier → user tier. Update the function's doc
  comment to describe the tiers.

## Phase 3 — Rendering (DOM + CSS; no unit tests — verified by typecheck + build + the user's visual pass)

In `renderTimelineView`'s node loop (`:1200+`), new branch
`if (node.kind === TOOL_CALL_NODE_KIND)` modeled on the commit-node branch (`:1237`):

- Row content: `el("span", { class: "timeline-gitop", text:
  `* ${truncateToolCallSummary(node.summary)} *`, title: node.summary })`, then a
  `{ }` action chip (same classes as `:1156-1165`) whose onclick mirrors
  `showGitOperationJson` (`:1055` area): `fetchRawRecords` for the node's session,
  `findLineForChangeId(rawLines, `"uuid":"${node.uuid}"`)`, then
  `openTranscriptInspectorSynced({ jsonlName, rawLines, line })`; then
  `renderRowMeta(node, index)` — the existing `lineLabels` block (`:1169-1185`)
  already resolves `L:n (of N)` for ANY node with a `uuid` and `sessionId`, so
  tool-call rows get their label with no changes there.
- The row keeps `data-node-kind="tool-call"`; CSS (`webapp/styles.css`): a
  `.timeline-row[data-node-kind="tool-call"]` rule removing the bubble look
  (no border/background/padding-heavy chrome — inspect how `.timeline-row` bubbles are
  styled and neutralize those properties), keeping a compact single-line layout.
- `drawRail` (`:1370+`): skip tool-call rows when drawing dots (guard on
  `data-node-kind` / node kind, same way commit rows are special-cased — read the loop
  and match its idiom). No dot for tool-call rows.

## Phase 4 — File chips: per-chip `{ }` retarget + `<TS> L:n` labels

- `FileChange` (`:81` area) gains `when: string`; `deriveFileChanges` (`:177`) copies
  `step.when` into each chip; `deriveMergedFileChanges` passes it through unchanged.
  (Test 11 covers this.)
- Before the node render loop, precompute `chipLineLabels: Map<string, { label: string;
  location: TranscriptLocation }>` keyed `` `${nodeIndex}:${change.path}` ``: for each
  node's `fileChanges` with a defined `changeId`, `await
  findTranscriptLineForChangeId(change.changeId)` (`:854` — already caches raw fetches);
  store `label = `L:${location.line} (of ${location.rawLines.length - 1})`` plus the
  location. Synthetic changeIds that resolve to no line simply get no entry.
- `renderFileButtonRow` (`:1103`): the `{ }` onclick — comment out (item-55 marker) the
  item-47 `openTurnInspector(node, previewPane)` call and instead open the chip's own
  causing line via the precomputed location:
  `openTranscriptInspectorSynced({ jsonlName, rawLines, line })`; when no entry exists
  (synthetic changeId), keep `openTurnInspector(node, previewPane)` as the fallback so
  the button never dead-ends. Append to the chip row: a `timeline-time` span with
  `new Date(change.when).toLocaleTimeString()` and, when a label exists, a second
  `timeline-time` span with it. The `+/-` and `⤷` buttons are UNTOUCHED (the user's
  mock omitted them as shorthand, not a removal request).
- Note: for s39 the chip changeIds are the Write toolu ids and their first raw-line hit
  is the Write tool_use line (51/55) — exactly the user-specified targets; record-uuid
  changeIds hit the causing record line the same way.

## Phase 5 — Close-out

1. `TASKS.md`: mark 24 closed (decision: tool calls become un-bubbled rows; the
   files bubble keeps its step number) and 53 closed (chip `{ }` reverted to per-chip
   causing line with L:n labels; the duplicate affordance question is moot); add a new
   item **55. Timeline tool-call rows redesign** documenting scope + this plan file,
   marked closed-when-shipped with the summary of what landed (row scope, hook-only
   synthesis, three-tier raw-line matching, chip labels).
2. `npm run typecheck` && `npm run build:webapp` — both must exit clean. Do NOT run
   `npm test`.
3. `git add` all touched files (stage only, NO commit).

## Risks / notes for the implementer

- The engine walks EVERY scenario through `findToolCalls` once it ships on the wire —
  it is read-only over records (no replay interaction), so scenario coverage is
  unaffected; do not touch reconstruction stages.
- `attachment.stdout` / `attachment.toolUseID` / `attachment.hookName` come through the
  passthrough `AttachmentPayload` (`src/structures/session-meta.ts:49`) as `unknown` —
  narrow with `typeof x === "string"` guards, never casts.
- Multiple attachments share one toolUseID (Pre + Post hooks); the seen-set makes the
  FIRST updatedInput-carrying one win. s39's rtk attachment (L39) is the first for its
  id.
- `fetchRawRecords` caches per-file; the chip-label precompute adds no new fetches for
  s39 (same session file as the lineLabels block).
- Do not rename or move existing exports; `webapp/dist/` is build output only.
- READ `checkPickIsLegal` and `computePickSegments` before adding the node kind: if
  either treats "nodes between two picked steps" in a kind-sensitive way, tool-call
  nodes must be ignored there exactly like commit nodes (match the existing
  commit-node handling); if they only ever look at pickable agent turns, no change.
- `compareTimelineNodes` ties (`computeNodeKindRank`): the `git add` row (8:53:29)
  may share its timestamp with the session-end node — rank tool-call BEFORE
  session-end and AFTER agent-turn so equal-timestamp rows land between the reply
  bubble and the terminator.
