# Item 66 — Port the Fork-style design into `webapp/`

Port the approved mockup (`fork-style-mockup.html`, item 65) into the real webapp as the
timeline redesign, replacing the canned dataset with the wire `ReconstructionDocument`,
`/api/diff`, `/api/range-patch`, and raw JSONL records.

**The mockup is the visual spec.** When this plan says "mockup CSS" or "mockup structure",
copy the corresponding rules/DOM shape from `fork-style-mockup.html` (adapting selectors and
colors as instructed), do not redesign.

Follow `plans/coding-requirements.md` and `~/.claude/guides/tdd.md` (strict red-green: every
view-model/engine behavior gets its failing test FIRST). Follow
`~/.claude/guides/coding-standards.md` (4-space indent, verb-named functions, imperative
style). DO NOT run the full test suite — the user runs it. Run ONLY the specific new/changed
test files while iterating red→green (`node --import tsx --test tests/<file>.test.ts` with
`NODE_OPTIONS=` cleared — VS Code auto-attach breaks the runner otherwise).

## Locked decisions (user-approved 2026-07-10)

1. **Details right pane = the existing transcript inspector** (`openTranscriptInspector`),
   restyled — Prev/Next, jump links, blob snapshot drawers, and timeline selection sync all
   survive. The mockup's simple tinted-JSON view is NOT built.
2. **Engine extracts the commit hash** from the commit's tool_result text and ships it on
   the wire (`GitOperation.resultHash`). Commit rows render `GIT COMMIT [hash] message`.
3. **Old sub-routes keep working** (`…/jsonl/<j>`, `…/jsonl/<j>/lines`, `…/file/<t>`,
   `…/file/<t>/vsbase|rev/<n>`) — they mount into the Details pane body.
4. **Session ends render as thin muted rows** (no tri, no checkbox, no `{ }`); view-model
   nodes and their tests unchanged.

## In-plan decisions (rationale in one line each)

- **`L:n (of N)` keeps the raw-JSONL-line meaning** (existing `lineLabels` /
  `chipLineLocations` machinery) — the mockup used timeline position only because it had no
  raw lines; the app's inspector integration depends on real line numbers.
- **Pick semantics keep the current model** (only agent turns with snapshots pickable,
  commits are segment hard-stops, `checkPickIsLegal`) rendered in the mockup's
  checkbox-column style; the mockup's extend-through-anything model was a mockup
  simplification. Export .patch wires to the existing `/api/range-patch` + `downloadText`.
- **No separate script-run row kind**: real script runs already surface as Bash tool-call
  rows (`toolCalls[]` includes them); the mockup's teal "script" rows were fake-data
  artifacts. Keep the `role-script` CSS class in the stylesheet (unused, one line) so the
  mockup mapping stays documented.
- **Commit changed-files and the contributing-row highlight are derived client-side** by
  walking back from the commit node to the previous commit and unioning `fileChanges`
  (exactly the mockup's `findContributingRows` logic) — the wire has no per-commit file
  list and the engine is not the right place for a display heuristic.
- **Diff Columns/Inline reuses `webapp/views/diff-vs-base.ts` row builders**
  (`computeInlineRows` + the split-row builder) and the existing localStorage key/values:
  stored `"split"` renders as Columns, `"inline"` as Inline. Only the toggle labels are new.
- **Old code is archived, not deleted** (user convention): pre-port copies of
  `webapp/views/timeline.ts` and `webapp/styles.css` go to `webapp/archive/`
  (`timeline-pre-item66.ts`, `styles-pre-item66.css`); add `"webapp/archive"` to the
  `exclude` arrays of BOTH `tsconfig.json` and `tsconfig.webapp.json` so nothing compiles it.
- **Load-bearing element IDs keep their names** (`#drawer`, `#view`, `#inspector`,
  `#progress-console`) — `renderRoute` and the xterm survival contract reference them; the
  fork layout restyles and re-parents them instead of renaming.
- The mockup is dark-only; the webapp supports light+dark. New CSS variables get BOTH
  values: dark = the mockup's exact colors, light = analogues derived from the existing
  light palette (same relationships: `--sel` a saturated blue, `--sel-hover` a subtle tint,
  `--add-bg`/`--del-bg`/`--hunk-bg` translucent green/red/blue).

## Current-code map (where everything lives)

- `webapp/app.ts` — hash router. `renderRoute` (`:431`) wipes `#view`, hides+empties
  `#inspector` (`:435-438`), toggles `.layout.timeline-route` (`:460`), dispatches to views;
  `renderSubRouteDrawer` (`:397`); `fetchDocument`/`peekCachedDocument` (`:266-312`,
  cache key `` `${project}|${jsonl ?? "*"}` ``); xterm console `ensureProgressTerminal`
  (`:70-137`) mounted in `#progress-console` (body-level, survives renders);
  `checkNavigationStartsNewProjectLoad` (`:424`); header config `initializeHeader` (`:508`);
  bootstrap behind `typeof window` guard (`:547`).
- `webapp/views/timeline.ts` — view-model half (lines 1-821, DOM-free, tested) + render
  half (823-1688). Node kinds `USER_TURN/AGENT_TURN/TOOL_CALL/COMMIT/SESSION_END_NODE_KIND`;
  `buildTurnTimelineViewModel` (`:639`); `deriveCommitNodes` (`:514`);
  `findTimelineNodeIndexForRawLine` (`:741`); picks (`computePickSegments`,
  `checkPickIsLegal`, `computeRangeSummary`, `splitPatchByFile`);
  `renderFileButtonRow` (`:1259`, per-chip `{ }`/`+/-`/`⤷`); `showRevisionDiff` (`:1225`);
  `lineLabels`/`chipLineLocations` precompute (`:1342-1376`); `openTranscriptInspectorSynced`
  (`:1027`); anchor handling (`:1662-1687`); SVG rail `drawRail` (`:1588`, replaced by CSS
  gutter in this port). Dead item-55 blocks (`attachGitOperationsToAgentTurns`,
  `renderGitOperationRow`, `showGitOperationJson`, `formatGitOperationLabel`) go away with
  the archived copy.
- `webapp/inspector.ts` — `openTranscriptInspector({jsonlName, rawLines, line,
  onJumpToLine})` (`:476`); `openInspectorPane()` (`:338`) is the single entry point that
  reveals `#inspector` and returns the content column ALL views render into.
- `src/reconstruction_git_evidence.ts` — `GitOperation` (`:69-76`), `findGitOperations`,
  commit `detail` = `-m` message (`:130-138`).
- `src/reconstruction_json.ts` — wire document; `gitOperations` passed through directly
  (`:277`), so a new `GitOperation` field flows to the wire automatically.
- `/api/range-patch?project&fromStep&toStep` exists (`src/viewer_api.ts:200-215`);
  `computeRangeSummary` already returns the 1-based `fromStepIndex`/`toStepIndex` for it.
- Tests import webapp `.ts` directly (tsx); webapp modules must not touch the DOM at module
  scope (`typeof window` guards).

---

## Phase 1 — Engine: commit hash on the wire

**Behavior (plain English):** when a `git commit` Bash call succeeds, its tool_result text
contains the short hash (`[master 4fa08d2] fix: …` or `[master (root-commit) ab12cd3] …`).
`findGitOperations` captures that hash on the commit's `GitOperation` so the viewer can
render the mockup's `GIT COMMIT [hash]` pill.

1. RED — in `tests/git-operations.test.ts` add:
   - `test_commit_operations_carry_result_hash` — build minimal records (reuse this file's
     existing fixture-building pattern): one assistant record with a `tool_use` Bash block
     (`git commit -m "fix: x"`, block id `toolu_hash1`) and one user record whose
     `tool_result` (`tool_use_id: "toolu_hash1"`) content contains
     `[master 4fa08d2] fix: x`. Assert the returned commit operation has
     `resultHash === "4fa08d2"`.
   - `test_commit_operations_without_result_output_have_no_hash` — same shape, tool_result
     text without a `[branch hash]` line → `resultHash === undefined`.
2. GREEN — in `src/reconstruction_git_evidence.ts`:
   - Add `resultHash?: string` to `GitOperation` (a short git abbreviation is free-form
     text, stays primitive per coding-requirements rule 1).
   - Add `extractCommitHashFromResultText(resultText: string): string | undefined` matching
     `/\[[^\[\]\n]+? (?:\(root-commit\) )?([0-9a-f]{7,40})\]/`.
   - In `findGitOperations`, index tool_result content by `tool_use_id` across the records
     (follow the existing result-lookup pattern used elsewhere in `src/` — grep
     `tool_use_id` for the accessor; do NOT hand-roll raw JSON walking if a hydrated
     accessor exists), and for `GitOperationKind.commit` operations set `resultHash` from
     the matching result's text.
3. Webapp wire type: add `resultHash?: string` to `WireGitOperation` in
   `webapp/views/timeline.ts` (`:52-59`).

## Phase 2 — Timeline view-model additions (`webapp/views/timeline.ts` top half)

All tests go in `tests/timeline-viewmodels.test.ts`, following its existing wire-shaped
fixture style. RED first for each.

1. `CommitNode` gains `resultHash?: string`; `deriveCommitNodes` copies it from the git
   operation. Test: `test_commit_nodes_carry_result_hash_from_git_operations`.
2. `computeRowSummaryText(node): string` — EXPORTED. One-line row text:
   - user/agent turn → first line of `text` (empty agent text → `"(tool activity)"`);
   - tool-call → `` `${toolName}(${truncateToolCallSummary(node.summary)})` `` (mockup's
     `Bash(npx tsc --noEmit)` form);
   - commit → `detail ?? "git commit"`;
   - session-end → `` `end of session ${computeSessionShortLabel(sessionId)}` ``.
   Tests: `test_computeRowSummaryText_uses_first_text_line`,
   `..._formats_tool_calls_as_name_parens_summary`, `..._labels_session_ends`,
   `..._falls_back_for_blank_agent_turns`.
3. `computeSessionShortLabel(sessionId: string): string` — first 8 chars. Test:
   `test_computeSessionShortLabel_takes_first_eight_chars`.
4. `deriveCommitChangedFiles(nodes: TimelineNode[], commitIndex: number): FileChange[]` —
   EXPORTED. Walk `commitIndex-1` down to (exclusive) the previous commit node or array
   start; collect every `fileChanges` entry of non-orphaned nodes; dedupe by `path` keeping
   the LATEST occurrence (closest to the commit). Tests:
   `test_deriveCommitChangedFiles_unions_files_since_previous_commit`,
   `..._stops_at_previous_commit`, `..._skips_orphaned_nodes`,
   `..._dedupes_paths_keeping_latest`.
5. `findContributingNodeIndexes(nodes, commitIndex): number[]` — EXPORTED. Same walk;
   include a node when any of its `fileChanges` paths is in the commit's changed-path set
   (from `deriveCommitChangedFiles`). Tests:
   `test_findContributingNodeIndexes_marks_nodes_touching_commit_files`,
   `..._returns_empty_for_no_overlap`.
6. `buildFilesSidebarViewModel(document): { target: string; revisionCount: number }[]` —
   EXPORTED; maps `filesTouched`. Test:
   `test_buildFilesSidebarViewModel_lists_targets_with_revision_counts`.
7. `buildSessionsSidebarViewModel(nodes, listing): { sessionId: string; shortLabel:
   string; jsonlFileName: string | undefined; rowCount: number; firstNodeIndex: number }[]`
   — EXPORTED; one entry per distinct node `sessionId` (skip `undefined`) in first-appearance
   order; `jsonlFileName` matched by sessionId prefix against `listing.jsonlFiles` (reuse the
   existing `findJsonlForSession` logic — lift it from the render half into the view-model
   half and export it). Tests:
   `test_buildSessionsSidebarViewModel_groups_rows_per_session`,
   `..._matches_jsonl_by_session_prefix`.
8. `computeGraphLaneRuns(nodes): { startIndex: number; endIndex: number }[]` — EXPORTED;
   contiguous runs of `isOrphaned === true` nodes (drives the fork gutter's lane-2 rail +
   fork curve). Tests: `test_computeGraphLaneRuns_finds_contiguous_orphan_runs`,
   `..._returns_empty_when_nothing_is_orphaned`.
9. `checkRowIsExpandable(node): boolean` — EXPORTED; false for commit and session-end,
   true otherwise. Test: `test_checkRowIsExpandable_excludes_commits_and_session_ends`.

## Phase 3 — Shell: `index.html` + `styles.css` + `app.ts`

No unit tests (DOM/CSS); verified in Phase 9 headlessly. Archive first:
`cp webapp/styles.css webapp/archive/styles-pre-item66.css` (git-add the copy), then edit
in place. Add the tsconfig excludes now.

1. **`webapp/index.html`** — restructure to the mockup skeleton, keeping IDs:
   ```html
   <header class="toolbar">
       <span id="toolbar-title">JFRED</span>            <!-- breadcrumb span stays inside -->
       <button id="projects-btn" class="toolbar-btn">Projects ▾</button>
       <button id="paths-btn" class="toolbar-btn">Paths…</button>
       <div id="projects-menu" class="popover" hidden></div>
       <div id="paths-popover" class="popover" hidden>
           <!-- MOVE the existing labels + #projects-dir-input, #file-history-dir-input,
                #projects-dir-change button here, unchanged ids -->
       </div>
   </header>
   <main class="layout">
       <nav id="drawer" class="sidebar"></nav>
       <div id="rightcol">
           <section id="timeline-pane">
               <div id="timeline-pane-header">
                   <span class="pane-title">Timeline</span>
                   <span id="timeline-summary"></span>
                   <button id="toggle-all">Expand All</button>
               </div>
               <section id="view" class="view-pane"></section>   <!-- rows scroll here -->
               <div id="timeline-selectbar" hidden></div>
           </section>
           <div id="split-td" class="splitter-h"></div>
           <aside id="inspector" class="details-pane hidden">
               <div id="details-header">No selection</div>
               <div id="details-body">
                   <div id="details-left"></div>
                   <div id="split-lr" class="splitter-v"></div>
                   <div id="details-right">
                       <div id="details-right-header">
                           <span id="details-right-label">JSON</span>
                           <span id="diff-mode-toggle" hidden>
                               <button id="dm-columns">Columns</button><button id="dm-inline">Inline</button>
                           </span>
                       </div>
                       <div id="details-right-body"></div>
                   </div>
               </div>
           </aside>
           <div id="split-dc" class="splitter-h"></div>
           <div id="console-row">
               <div id="console-header"><span>Console</span>
                   <span><button id="progress-copy" class="toolbar-btn">copy</button>
                   <button id="console-hide" class="toolbar-btn">Hide console</button></span>
               </div>
               <section id="progress-console" class="progress-console"></section>
           </div>
           <div id="console-bar" hidden>
               <span id="console-last"></span>
               <button id="console-show" class="toolbar-btn">Show console</button>
           </div>
       </div>
   </main>
   ```
   The vendor/script tags at the bottom stay exactly as they are. `#progress-console` moves
   inside `#console-row` — it is still a STATIC skeleton element that `renderRoute` never
   wipes, so the xterm survival contract holds.
2. **`webapp/styles.css`** — keep: the CSS variable blocks (add the new vars below to both
   light and dark), `.toolbar-btn`, `.error-box`, consent-dialog rules, inspector-internal
   rules still used by `inspector.ts` (`.inspector-content`, `.inspector-json`,
   `.snapshot-pane`, `.snapshot-drawer`, `.snapshot-history-btn`, `.anchored`, `.hljs`),
   highlight/code rules, and `.progress-console` sizing (now `flex: 1 1 auto` inside
   `#console-row` instead of a fixed bottom strip). Remove-by-replacement (old copy is
   archived): drawer rules, `.view-pane` padding rules, `.inspector-pane` 45%-split +
   collapsed-rail rules, `.layout.timeline-route` rules, all `.timeline-*` bubble rules,
   `.timeline-rail`/swatch rules. Port from the mockup: new vars
   (`--sel, --sel-hover, --add-bg, --del-bg, --hunk-bg`), `#rightcol` column flex,
   `.sidebar` (240px, `.file-item`, `.session-item`, `.pane-title`), `.splitter-h/.splitter-v`,
   `#timeline-pane` + `.tl-row/.tl-line/.tl-tri/.tl-text.role-*/.tl-ts/.tl-pos/.tl-uuid/
   .tl-json/.tl-bubble/.tl-graph/.g-*/.tl-pick/.commit-label/.commit-pill/.tl-row.contrib/
   .tl-row.orphan/.tl-row.selected/.flash keyframes`, `#selectbar`, `#details-*` panes,
   `.dfile/.dempty/.rev-card/.op-badge/.rev-ts/.rev-actions`, `.diff/.diff-cols` renderers,
   `.popover/.menu-item`, `#console-row/#console-header/#console-bar` +
   `#rightcol.console-collapsed` rules. Map mockup role colors to vars where one exists
   (`--orange`, `--violet` → `--lane-violet`), else hardcode per-theme values.
3. **`webapp/app.ts`**:
   - `renderRoute`: STOP emptying `#inspector` (`:435-438`) — instead add `.hidden` to it
     and clear only `#details-right-body`, `#details-left`, and reset `#details-header`
     text to `"No selection"`. Add a helper `resetDetailsPane()` for this. Replace the
     `.layout.timeline-route` class toggle (`:460`) with a `project-route` class toggled on
     `#rightcol`: when ABSENT (the `#/` projects list), CSS hides `#timeline-pane-header`,
     `#timeline-selectbar`, `#split-td`, `#inspector`, and `#split-lr` so `#view` +
     the console fill the column; when present, the full fork layout shows.
   - `initializeHeader`: rework to the popover model — `#paths-btn` toggles
     `#paths-popover`; the existing input/change-folder wiring is unchanged inside it;
     `#projects-btn` toggles `#projects-menu`, populated from `fetchJson("/api/projects")`
     with one `.menu-item` per project navigating `location.hash = routeToProject(name)`;
     a document-level click hides both popovers (mockup's `hideToolbarPopovers` pattern,
     `stopPropagation` inside).
   - Toolbar title: set `#toolbar-title` to `JFRED — project: <b>name</b>` in `renderRoute`
     when a project route is active, plain `JFRED` otherwise (replaces the breadcrumb).
   - `makeSplitter(splitterId: string, paneId: string, axis: "x" | "y", invert: boolean,
     minPx: number): void` — port verbatim from the mockup (pointer capture, flexBasis).
     Wire `split-td → timeline-pane (y, 80)`, `split-lr → details-left (x, 140)`,
     `split-dc → console-row (y, invert, 60)` inside the `typeof window` bootstrap guard.
   - Console collapse: `collapseProgressConsole()` adds `console-collapsed` to `#rightcol`,
     copies the xterm buffer's last non-empty line (walk
     `progressTerminal.buffer.active` back from the end,
     `getLine(i).translateToString(true).trim()`) into `#console-last`;
     `expandProgressConsole()` removes the class. Wire `#console-hide`/`#console-show`.
     CSS: `#rightcol.console-collapsed #console-row, #rightcol.console-collapsed #split-dc
     { display: none }`, `#rightcol.console-collapsed #console-bar { display: flex }`.
     Auto-collapse: at the end of a successful `fetchDocument` that actually streamed (cache
     miss), `setTimeout(collapseProgressConsole, 400)`; any new project load
     (`checkNavigationStartsNewProjectLoad` true) calls `expandProgressConsole()` before
     streaming.

## Phase 4 — Timeline render rewrite (`webapp/views/timeline.ts` render half)

Archive first: `cp webapp/views/timeline.ts webapp/archive/timeline-pre-item66.ts`
(git-add), then rewrite the render half in place. Delete the already-dead item-55/47
commented blocks in the process (they live on in the archive copy). KEEP unchanged: the
whole view-model half, `renderFileButtonRow`, `showRevisionDiff`, `showFilePreview`,
`lineLabels`/`chipLineLocations` precompute, `openTranscriptInspectorSynced`,
`syncSelectedRowToShownLine`, `openTurnInspector`, `openToolCallLine`,
`openStepInspector`, `fetchRangePatch`, consent gate.

`renderTimelineView(container, project, anchorJsonl?, anchorLine?)` new flow:

1. Fetch document + consent gate + `buildTurnTimelineViewModel` + listing (as today).
   Write the `N sessions · N steps · N files` summary into `#timeline-summary`; rebuild the
   sidebar (Phase 6 function).
2. For each node, build a mockup row into `container` (which is `#view`):
   `.tl-row` > [`.tl-graph` gutter cell | `.tl-main` > `.tl-line` + `.tl-bubble`].
   - **Graph cell**: lane-1 rail always; if the node index falls inside a
     `computeGraphLaneRuns` run, add the lane-2 rail (+ `.g-start`/`.g-fork` on the run's
     first row, `.g-end` on its last) and a lane-2 dot, else a lane-1 dot. Session lane
     COLOR: set the dot/rail `background` to the node's session color from the existing
     `sessionColors` assignment (replaces the SVG rail's color duty). Commit and
     session-end dots get a `.g-hollow` class (border ring, transparent fill — port the
     hollow-dot idea from the old rail).
   - **`.tl-line` cells in order** (mockup order): pick checkbox cell (ONLY when
     `checkNodeIsPickable`; existing legality/revert/flash logic on change); `.tl-tri` `▸`
     when `checkRowIsExpandable` (click toggles `.expanded` on the row, stopPropagation)
     else an empty spacer; for commits instead: `.commit-label` `"git commit"` +
     `.commit-pill` with `node.resultHash ?? "—"`; `.tl-text.role-<role>` =
     `computeRowSummaryText(node)` (role class: user-turn→`role-user`,
     agent-turn→`role-assistant`, tool-call→`role-tool`, commit→`role-commit`,
     session-end→`role-end` muted; add `.system` dim class via `node.isSystem`);
     `.tl-ts` = timestamp (`new Date(node.when).toLocaleString()`, the existing format);
     `.tl-pos` = the node's `L:n (of N)` label from `lineLabels` (blank when absent);
     `.tl-uuid` = `computeSessionShortLabel(node.sessionId)` (blank when unattributed);
     `{ }` button (`.tl-json`, NOT on commits) → `selectTimelineRow(index)` then the
     existing per-kind inspector opener (`openTurnInspector` for turns,
     `openToolCallLine` for tool-calls, last-line transcript open for session-ends).
   - **`.tl-bubble`** (expandable rows only): full `node.text` (or tool-call summary);
     agent turns additionally get the existing chips block
     (`node.fileChanges.map(renderFileButtonRow)`) inside the bubble.
   - Orphan rows: `.orphan` class (mockup dims `.tl-main`).
3. **Selection** — `selectTimelineRow(index)`:
   - swap `.selected` to this row; clear `.contrib` everywhere.
   - commit node → add `.contrib` to every row in
     `findContributingNodeIndexes(nodes, index)`; render Details commit mode (Phase 5).
   - other nodes → render Details message mode (Phase 5).
   Row `.tl-line` click → `selectTimelineRow(index)`; after the Details pane opens,
   `row.scrollIntoView({ block: "center" })` (keep the item-50 after-drawer ordering).
4. **Expand/Collapse All**: `#toggle-all` toggles `.expanded` on all expandable rows;
   label flips per the mockup's `updateToggleLabel`.
5. **Selectbar**: reuse the existing pick machinery verbatim, rendered into
   `#timeline-selectbar` (`N steps picked — files…`, `Export .patch` → existing
   `fetchRangePatch` + `downloadText`, `Clear`).
6. **Anchors**: `anchorJsonl` → scroll+`.flash` the session's first row (mockup
   `jumpToTimelineRow` flash animation; replaces the old session-header anchor);
   `anchorLine` → `findTimelineNodeIndexForRawLine`, `selectTimelineRow` it, open the
   inspector at that line via `openTranscriptInspectorSynced`, THEN center-scroll (item 37
   ordering). `syncSelectedRowToShownLine` keeps working (it swaps `.selected` by node
   index — point it at the new rows map).
7. Background click-to-close, the SVG rail, session header rows, and the orphan divider
   are all GONE (rail → CSS gutter; sessions → sidebar + uuid column; details pane closes
   only via navigation).

## Phase 5 — Details pane (three modes)

New module `webapp/views/details.ts` (the pane logic is view-scoped, not inspector-scoped;
`timeline.ts` is already the largest file). Exports below; DOM helpers use `el` from
`../app.ts`.

1. **View-model (TDD, `tests/details-viewmodels.test.ts` — new file):**
   - `computeDetailsHeaderText(node, position: {index, total}): string` —
     message mode `"Step <n> of <N> — <kind label> — <ts>"`; commit mode
     `"git commit <hash ?? '—'> — <detail> — <ts>"`. Tests:
     `test_computeDetailsHeaderText_formats_message_nodes`,
     `..._formats_commit_nodes_with_hash`, `..._uses_dash_for_missing_hash`.
   - `buildRevisionCards(history: WireFileHistory): { revisionNumber: number; opLabel:
     string; timestamp: string; changeId: string }[]` — 1-based cards from `revisions`;
     `opLabel` = revision `kind` (wire event kinds: write/edit/user-edit/overwrite…).
     Test: `test_buildRevisionCards_numbers_revisions_and_carries_kinds`.
   - `mapStoredDiffModeToToggle(stored: string): "columns" | "inline"` — `"split"` →
     `"columns"`, else `"inline"`. Test:
     `test_mapStoredDiffModeToToggle_maps_split_to_columns`.
2. **Message mode** — `renderDetailsMessageMode(node, context)`:
   `#details-header` via `computeDetailsHeaderText`; `#details-left` = "Files touched"
   pane-title + one `.dfile` per `node.fileChanges` (or `.dempty` "No files touched");
   right default = the transcript inspector: call the timeline's
   `openTranscriptInspectorSynced` opener for the node's own line —
   `openInspectorPane()` in `inspector.ts` is REWORKED (see step 5) to return
   `#details-right-body`. Clicking a `.dfile` swaps the right pane to that file's revision
   diff: reuse the timeline's `showRevisionDiff` data path (`/api/diff` + `splitDiffBlocks`
   + `computeRevisionDiffFallbackText`) but render through the shared diff renderer
   (step 4) with `#details-right-label` = the path and the toggle visible.
3. **Commit mode** — `renderDetailsCommitMode(node, nodes, context)`:
   header per view-model; `#details-left` = "Changed files" +
   `deriveCommitChangedFiles(nodes, index)` as `.dfile`s; auto-click the first file
   (mockup behavior) so the right pane shows its diff immediately.
4. **Shared diff renderer** — `renderDiffIntoDetails(diffText: string, label: string)`:
   parse the block's raw lines and render Columns/Inline using the row view-models from
   `diff-vs-base.ts` (import `computeInlineRows` and the split-row builder directly — no
   re-export shim), with the mockup's `.diff`/`.diff-cols` markup. `#dm-columns`/`#dm-inline`
   set the mode, persist via the EXISTING diff-vs-base localStorage key/value vocabulary
   (`"split"`/`"inline"`), and re-render the current diff. Toggle hidden whenever the right
   pane shows the inspector.
5. **File Revisions mode** — `renderDetailsFileMode(target, document, context)` (entered
   from the sidebar): header `"File Revisions — <target>"`; `#details-left` = `.rev-card`s
   from `buildRevisionCards` (op badge classes `op-write/op-edit/op-user-edit/op-overwrite`,
   mockup CSS); selecting a card shows that revision's diff block on the right. Card action
   buttons — wire ONLY what exists today, in this order: `Show content` → the revision's
   content via the existing file-history revision-content path rendered with
   `renderCodeInto`; `Export this version` → `downloadText` of that content;
   `Copy patch` → `navigator.clipboard.writeText(diffBlock)`; `Export .patch` →
   `downloadText(diffBlock)`; `Jump to timeline step` → find the node whose
   `fileChanges` contains the card's `changeId` and `selectTimelineRow` + flash it (no-op
   button when no node matches).
6. **`inspector.ts` rework** — `openInspectorPane()` now: un-hide `#inspector`, clear and
   return `#details-right-body`; set `#details-right-label` to `"JSON"` and hide the diff
   toggle. The collapse-rail button/`.collapsed` logic is retired (the `split-td` splitter
   replaces it) — comment out `toggleInspectorCollapsed` with an item-66 marker. The
   snapshot drawer and everything else inside `openTranscriptInspector` is untouched (it
   builds into the returned column). Sub-route views (`renderSubRouteDrawer` in `app.ts`)
   keep calling `openInspectorPane()` and therefore land in `#details-right-body`
   automatically — set `#details-header` to the sub-route name (`"Conversation — <jsonl>"`,
   `"File history — <target>"`, etc.) in `renderSubRouteDrawer`.

## Phase 6 — Sidebar

Replace the body of `renderProjectDrawer` usage for project routes with
`renderForkSidebar(drawer, project, document, listing, callbacks)` in a new
`webapp/views/sidebar.ts`:
- "Sessions" pane-title + one `.session-item` per `buildSessionsSidebarViewModel` entry
  (`<short8>….jsonl` + `<short8> · N rows` meta); click → the timeline's flash-scroll of
  `firstNodeIndex` (callback provided by `renderTimelineView`).
- "Files" pane-title + one `.file-item` per `buildFilesSidebarViewModel` entry
  (path + `(revCount)`); click → `renderDetailsFileMode(target, …)` + `.selected` mark
  (cleared when a timeline row is selected).
- On the projects-list route (`#/`) the sidebar stays empty; `renderProjectsView` is
  unchanged in `#view`.
- The drawer-collapse (`.collapsed` 24px rail) feature is retired with the old CSS.

## Phase 7 — Route compatibility check

No new code expected; verify while implementing: bare `#/project/<p>` still rewrites to
`/timeline`; `…/timeline/session/<j>` flashes the session's first row; `…/timeline/…/at/<n>`
selects + opens the inspector; `…/jsonl/<j>`, `…/jsonl/<j>/lines`, `…/file/<t>`,
`…/file/<t>/rev/<n>`, `…/file/<t>/vsbase/<n>` all render into the Details pane. Fix
whatever breaks within the phase-5/6 structures.

## Phase 8 — Build + headless verification

1. `npm run build:webapp` and `npm run typecheck` must both pass clean.
2. Serve (`npm run app`), then verify headlessly (browse daemon) against BOTH
   `s39-git-baseline-seed` and `s84-multiagent-scripts-git-baseline`:
   - rows render one-line with graph gutter, ts, `L:n (of N)`, session uuid, `{ }`;
   - tri expansion shows the bubble + chips; Expand All/Collapse All flips;
   - clicking a commit row shows commit mode (hash pill, changed files, first diff,
     `.contrib` highlights);
   - sidebar file click enters File Revisions mode; revision card click swaps the diff;
     Columns/Inline toggle re-renders and persists;
   - pick two agent turns → selectbar count; Export .patch downloads;
   - `…/timeline/…/at/49` (s84) selects the right row and opens the inspector at line 49;
   - console auto-collapses to the status bar after load; Show console restores it;
   - all three splitters drag.
   Screenshot the timeline + commit mode + file mode for the implementation notes.
3. DO NOT run the node test suite (user runs it). Stage everything; do not commit.

## Post-implementation

- Update `TASKS.md` item 66 with what shipped (suite NOT run — user runs it).
- Implementation notes via the `/jot:implement` log as usual.
