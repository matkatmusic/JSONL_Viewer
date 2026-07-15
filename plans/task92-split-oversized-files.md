# Task 92 + codebase-wide oversize audit & split

## Goal

1. **Audit**: append one trailing blank line to every tracked TypeScript file (via the
   Edit tool, so the jot PostToolUse:Edit hook fires) and record which files the hook
   flags as oversized, plus every deep-nesting site it reports.
2. **Split**: refactor every flagged file into modules of ≤250 lines each, as pure
   code moves — no behavior change, no re-export shims, callers import directly from
   the new canonical homes.

## Facts the implementer must not rediscover

- The hook is the jot PostToolUse:Edit hook. It fires **only on Edit/Write tool
  calls** (not on Bash file writes). It reports, as non-blocking feedback:
  `File size: <path> is N lines (limit: 250)` and
  `Deep nesting (>3x indent unit) at lines: …`.
  The edit itself still lands; the feedback is informational. Intermediate edits to a
  still-oversized file will keep producing this feedback — ignore it until the split
  is finished, then use it as the pass/fail oracle (no flag on the final edit of each
  new file = under the cap).
- File inventory: `git ls-files '*.ts'` minus `webapp/archive/**` and
  `webapp/vendor/**` = 153 files. Do NOT touch archive or vendor files, and do NOT
  touch untracked TS files (`jsonl-tree-viewer.ts`, `api/`, `jfred/`, `diff/`).
- `webapp/app.ts` already received its audit blank line (probe edit, done). Its hook
  report: 1220 lines; deep nesting at 119-120, 123-135, 306, 509-520, 713-715,
  725-726, 817-820, 1016.
- Expected flagged set (from `wc -l`, >250 lines, will be confirmed by Phase 1):

  | file | lines |
  |---|---|
  | tests/timeline-viewmodels.test.ts | 2364 |
  | webapp/views/timeline.ts | 2266 |
  | webapp/app.ts | 1219 |
  | tests/viewer-viewmodels.test.ts | 746 |
  | webapp/views/details.ts | 685 |
  | webapp/inspector.ts | 614 |
  | src/reconstruction_script_execution.ts | 564 |
  | src/reconstruction_git_evidence.ts | 558 |
  | src/viewer_api.ts | 552 |
  | tests/reconstruction_script_execution.test.ts | 545 |
  | tests/viewer-api.test.ts | 497 |
  | src/reconstruction_branch.ts | 473 |
  | src/viewer_server.ts | 415 |
  | src/reconstruction_script_stage.ts | 399 |
  | src/reconstruction_extract.ts | 359 |
  | src/reconstruction_branches.ts | 347 |
  | src/reconstruction_cli.ts | 342 |
  | tests/reconstruction_render.test.ts | 341 |
  | src/reconstruction_render.ts | 327 |
  | webapp/views/diff-vs-base.ts | 319 |
  | src/reconstruction_json.ts | 308 |
  | tests/reconstruction_cli.test.ts | 275 |
  | src/regex_expressions.ts | 272 |
  | tests/viewer-progress.test.ts | 270 |
  | src/reconstruction_sidecar.ts | 268 |
  | tests/reconstruction_branch.test.ts | 267 |
  | webapp/views/file-history.ts | 264 |
  | tests/reconstruction_overrides.test.ts | 259 |
  | tests/reconstruction_extract.test.ts | 259 |
  | src/reconstruction_tree.ts | 252 |

## Hard constraints (apply to every split)

- **Pure move refactor.** Function bodies, signatures, exported names, and logic are
  copied verbatim into their new module. No renames, no logic edits, no new
  abstractions, no fixing of deep-nesting sites (record them; a follow-up task will
  own nesting).
- **No re-export shims** (plans/coding-requirements.md §2). A moved symbol gets ONE
  canonical home; every importer is updated to import from that home directly. Never
  leave `export { x } from "./new-home.ts"` behind in the old file.
- Follow all of `plans/coding-requirements.md` for any glue code (verb-named
  functions, enum-member comparisons, domain types, 4-space indent).
- **Do not run tests or suites.** The user runs tests afterward. Allowed
  verification: `npm run typecheck` and (for webapp files) `npm run build:webapp`.
- New module naming follows the directory's existing convention:
  `src/reconstruction_<topic>.ts`, `webapp/views/<kebab-topic>.ts`,
  `tests/<topic>.test.ts`.
- Every new/edited file ends with the audit's trailing blank line convention intact
  (one trailing newline is fine; do not add a second blank line to new files — they
  are born audited).
- Find importers with `grep -rn "<symbol>" src webapp tests` before moving a symbol;
  update every import site in the same subtask.

## Phase 1 — audit sweep (blank lines)

1. Build the file list:
   `git ls-files '*.ts' | grep -vE '^(webapp/archive/|webapp/vendor/)'`, minus
   `webapp/app.ts` (already done).
2. Fan out subagents in batches of ~20 files each (parallel). Each subagent:
   - For each assigned file: Read the last ~10 lines, then Edit to append one blank
     line at end of file (old_string = the file's final line(s) with trailing
     newline, new_string = same + `\n`).
   - Record the hook feedback verbatim per file (size flag, nesting lines, or "no
     flag").
   - Return a compact table: `path | flagged-lines-or-ok | nesting-sites`.
3. Aggregate all reports into `plans/implementation-notes-task92-oversize-audit.md`:
   one table for flagged files, one list of nesting sites per file (including
   unflagged files that still showed nesting feedback, if any).
4. Sanity-check the flagged set against the expected table above; investigate any
   mismatch before Phase 2.

## Phase 2 — split every flagged file

### Scheduling (avoids concurrent edits to the same file)

- **Stage A — source files.** Two parallel lanes, each lane strictly sequential:
  - Lane `src/`: reconstruction_git_evidence → reconstruction_json →
    reconstruction_script_execution → reconstruction_script_stage →
    reconstruction_branch → reconstruction_branches → reconstruction_extract →
    reconstruction_render → reconstruction_cli → reconstruction_sidecar →
    reconstruction_tree → regex_expressions → viewer_api → viewer_server.
    (git_evidence before json because json imports from git_evidence and is itself
    flagged; otherwise order is by size, largest first.)
  - Lane `webapp/`: views/timeline → views/details → inspector → app →
    views/diff-vs-base → views/file-history.
  - The two lanes may run concurrently ONLY if a grep confirms no webapp file imports
    from `src/` and vice versa; if any cross-import exists, run the lanes serially.
- **Stage B — test files.** After Stage A completes, split all flagged test files in
  parallel (one subagent per file). Test files import only source modules (whose
  paths are now final) and never each other.
- One subagent per file (user preference: many small subagents). Each subagent gets
  this plan's constraints plus the per-file design below (or the generic procedure).

### Per-file designs (the four task-92 files, pre-surveyed)

#### src/reconstruction_git_evidence.ts (558) → 3 modules

| new module | contents (current line ranges) |
|---|---|
| `src/reconstruction_git_operations.ts` | `GitCommitEvent`, `splitCompoundCommandSegments`, `parseCommitEventsFromCommand`, `findGitCommitEvents`, `GitOperation`, `GIT_FLAGS_WITH_ARGUMENT`, `findSubcommandIndex`, `parseGitOperationKind`, `stripSurroundingQuotes`, `findFirstNonFlagArgument`, `parseGitOperationDetail`, `parseOperationsFromCommand`, `parseGitOperation`, `extractCommitHashFromResultText`, `indexToolResultTextByToolUseId`, `findGitOperations` (lines 40–278) |
| `src/reconstruction_git_placement.ts` | `FullContentEvent`, `isFullContentEvent`, `LineAddition`, `pureAdditionsFrom`, `applyAdditions`, `runAtInstant`, `replayRunsOver`, `midpointAfter`, `placementAfter`, `placeOneCommitDiff`, `placeGitCommitEvidence` (lines 364–end) |
| `src/reconstruction_git_evidence.ts` (keeps) | `COMMIT_MATCH_TOLERANCE_MS`, `resolveCommitByTimestamp`, `readCommittedFileContent`, `findPreservedRepoDir`, `findFallbackRepoDirs` (lines 280–362) |

Importer updates: `src/reconstruction_json.ts` (`findGitCommitEvents`,
`findGitOperations`, `GitOperation` → git_operations), `src/reconstruction_corpus.ts`
(`GitCommitEvent` → git_operations), `src/reconstruction_branches.ts`
(`placeGitCommitEvidence` → git_placement), `tests/git-operations.test.ts`,
`tests/reconstruction_git_evidence.test.ts`, `tests/exec-gate.test.ts` (whichever
symbols each uses). Cross-module needs (e.g. placement code calling
`resolveCommitByTimestamp`/`readCommittedFileContent`) are plain imports from the
canonical home.

#### webapp/views/timeline.ts (2266) → view-model modules + render modules

Lines 33–1437 are pure view-model code (types, constants, exported pure functions);
lines 1438–end are `renderTimelineView`, an ~830-line function made of ~45 closures
sharing mutable maps. Split:

View-model modules (pure moves, straightforward):

| new module | contents |
|---|---|
| `webapp/views/timeline-types.ts` | node-kind constants (`COMMIT_NODE_KIND` … `RENAME_EVENT_KIND`), all `Wire*` types, `RevisionIndex(Entry)`, `FileChange`, `SnapshotInstant`, `TranscriptLocation`, node types, `TimelineNode` (lines 33–232) |
| `webapp/views/timeline-nodes.ts` | node assembly: `indexRevisionsByChangeId`, `computeNodeKindRank`, `compareTimelineNodes`, `checkNodeCanOwnSnapshot`, `checkSnapshotIsGitBaseline`, `computeGitBaselineText`, `attachSnapshotsToAgentTurns`, `deriveCommitNodes`, `appendSessionEndNodes`, `assignStepNumbers`, `checkMessageTextIsSystem`, `buildTurnTimelineViewModel`, `deriveToolCallNodes` |
| `webapp/views/timeline-changes.ts` | file-change derivation: `deriveFileChanges`, `computeSnapshotJumpRoute`, `splitPatchByFile`, `deriveMergedFileChanges`, `deriveNodeFileChanges`, `checkChangeIsGitBaseline`, `deriveCommitChangedFiles`, `findContributingNodeIndexes`, `GIT_BASE_CHANGE_ID_PREFIX` |
| `webapp/views/timeline-picks.ts` | pick logic: `checkNodeIsPickable`, `computePickSegments`, `checkPickIsLegal`, `computeRangeSummary`, `checkSelectionBlocksBackgroundClose` |
| `webapp/views/timeline-labels.ts` | labels/ownership: `truncateToolCallSummary` (+`TOOL_CALL_SUMMARY_MAX_CHARS`), `checkAgentTurnOwnsRawLine`, `checkToolCallOwnsRawLineByRecord`, `checkToolCallOwnsRawLineByToolUseId`, `checkUserTurnOwnsRawLine`, `findTimelineNodeIndexForRawLine`, `computeUnattributedStepTag`, `computeRevisionDiffFallbackText`, `computeToolActivityTag`, `computeSessionShortLabel`, `SCRIPT_EXECUTION_EVENT_KIND`, `computeSessionStartLabel`, `findSessionStartIndexes`, `computeRolePillLabel`, `computeRolePillClass`, `computeRowSummaryText` |
| `webapp/views/timeline-file-tree.ts` | files sidebar + tree: `FileSidebarEntry`, `buildFilesSidebarViewModel`, `findLastRevisionKind`, `findOriginalPath`, `FOLDER_NODE_KIND`, `FILE_NODE_KIND`, `FileTreeNode`, `findCommonDirectoryPrefix`, `splitDirectorySegments`, `intersectLeadingSegments`, `buildFileTree`, `makeFolderNode`, `insertFileIntoTree`, `stripPrefixSegments`, `findOrAddFolder`, `sortTreeNodes`, `compareTreeNodes`, `collapseSingleChildFolderChains`, `nodeHoldsExactlyOneFolderChild` |
| `webapp/views/timeline-sessions.ts` | sessions/lanes/progress: `findJsonlForSession`, `SessionSidebarEntry`, `buildSessionsSidebarViewModel`, `computeGraphLaneRuns`, `checkRowIsExpandable`, `findAdjacentFileTouchedIndex`, `SESSION_LANE_VARIABLES`, `ORPHAN_LANE_COLOR`, `LARGE_TIMELINE_ROW_COUNT`, `TIMELINE_BUILD_BATCH_SIZE`, `checkTimelineNeedsProgressOverlay`, `computeTimelineBuildProgressLabel`, `computeTimelineProgressFraction`, `waitForNextAnimationFrame` |

Render decomposition (the risky part — do it mechanically):

1. Define `type TimelineRenderContext` in a new `webapp/views/timeline-render-context.ts`
   holding exactly the shared state the closures capture today: `nodes`, `project`,
   `listing`, `reconstructionDocument`, `sessionColors`, `pickBoxes`, `nodeRows`,
   `previewPanes`, `expandableRows`, `lineLabels`, `chipLineLocations`,
   `detailsContext`, `laneRuns`, plus the few DOM anchors used across groups
   (`selectbar`, `barText`, `ruleHint`). Include function-valued members for the
   cross-group calls (`selectTimelineRow`, `jumpToTimelineRow`, `openNodeInspector`,
   `clearActiveChip`, `markChipActive`, `updateSelectbar`) so extracted groups can
   call each other without import cycles — `renderTimelineView` assigns these after
   construction.
2. Move closure groups to modules as top-level functions taking
   `context: TimelineRenderContext` as the first parameter, bodies otherwise
   verbatim:
   - `webapp/views/timeline-render-inspectors.ts`: `findTranscriptLineForChangeId`,
     `syncSelectedRowToShownLine`, `openTranscriptInspectorSynced`,
     `openStepInspector`, `openTurnInspector`, `openToolCallLine`,
     `openSessionEndTranscript`.
   - `webapp/views/timeline-render-selectbar.ts`: `buildConsentParams`,
     `fetchRangePatch`, `flashRule`, `updateSelectbar` body, pick-checkbox wiring.
   - `webapp/views/timeline-render-rows.ts`: `computeOpLetter`, `computeBaseName`,
     `renderFileChip`, `computeRoleClass`, `checkDotIsHollow`, `buildGraphCell`,
     `renderFileButtonRow`, row-construction loop helpers, `flashRowElement`,
     `jumpToTimelineRow`, `selectTimelineRow`, `jumpToAdjacentFileTouchedRow`,
     toggle-all wiring.
   - `webapp/views/timeline.ts` keeps `renderTimelineView` as the orchestrator:
     builds the context, calls the module functions, stays ≤250 lines.
3. If a group boundary would split two closures that mutually recurse in a way the
   context functions above don't cover, keep both in the same module — module
   membership may flex; the ≤250 cap and verbatim bodies may not.

Importer updates: `webapp/views/details.ts` imports ~20 view-model symbols from
`./timeline.ts` (its import block at lines 11–31) — repoint each to the new module.
`webapp/app.ts` imports only `renderTimelineView` — unchanged.
`tests/timeline-viewmodels.test.ts` and `tests/details-*.test.ts` repoint per symbol
(Stage B rewrites the timeline test file anyway; fix its imports as part of its own
split).

#### webapp/views/details.ts (685) → 3 modules

| new module | contents |
|---|---|
| `webapp/views/details-model.ts` | pure/tested half: `DetailsContext`, `RevisionCard`, `RevisionViewMode`, `RevisionFocus`, `DiffToggleLabel`, `humanizeNodeKind`, `computeDetailsHeaderText`, `buildRevisionCards`, `computeFocusedCardIndex`, `checkCardRunIsContiguous`, `computeOwningNodeIndexes`, `mapStoredDiffModeToToggle`, `resolveInitialFullContentsChoice`, storage helpers (`readStoredDiffMode`, `writeStoredDiffMode`, `FULL_CONTENTS_STORAGE_KEY`, `readStoredFullContents`, `writeStoredFullContents`, `fullContentsIsOn`) |
| `webapp/views/details-diff.ts` | diff rendering: `appendInlineDiff`, `mapSplitCellClass`, `appendColumnsDiff`, `showDiffInDetails`, `fetchRevisionDiffBlocks`, `showRevisionDiffInDetails` |
| `webapp/views/details.ts` (keeps) | DOM glue + modes: `WireFileHistory` (local type), `setDetailsHeader`, `setRightPaneLabel`, `hideDiffModeToggle`, `clearRightPaneBody`, `showTextInDetails`, `showContentInDetails`, `buildTouchedFileEntries`, `appendFileList`, `renderDetailsMessageMode`, `renderDetailsCommitMode`, `renderDetailsFileMode` |

Importer updates: `tests/details-viewmodels.test.ts`, `tests/details-revision-view.test.ts`,
plus any webapp file importing the moved symbols (grep).

#### tests/timeline-viewmodels.test.ts (2364, 116 top-level `test(...)` calls)

Split by target module, mirroring the new source modules: `tests/timeline-nodes.test.ts`,
`tests/timeline-changes.test.ts`, `tests/timeline-picks.test.ts`,
`tests/timeline-labels.test.ts`, `tests/timeline-file-tree.test.ts`,
`tests/timeline-sessions.test.ts` — each ≤250 lines; if one topic's tests exceed 250
lines, split that topic numerically (`…-file-tree-2.test.ts` is NOT allowed — instead
split by sub-topic, e.g. `timeline-file-tree.test.ts` + `timeline-file-tree-collapse.test.ts`).
Move each `test(...)` verbatim. Helper functions/fixture builders used by tests in
more than one new file move to a non-test helper module
`tests/timeline-test-helpers.ts` (no `.test.ts` suffix, so the runner ignores it);
helpers used by only one file stay local. The runner is `node --test tests/*.test.ts`
— new files are picked up automatically; delete the original file when empty.

### Generic procedure (all other flagged files)

1. Read the whole file. List top-level declarations; group them into cohesive topics
   (types/parsing/rendering/IO — whatever the file's real seams are).
2. Pick module names per directory convention; target 2–4 new modules for files
   ≤600 lines, more only if needed to reach ≤250 each.
3. Move each group verbatim. Shared internal helpers get one canonical home; the
   other modules import them.
4. `grep -rn` every moved exported symbol; update every importer (src, webapp,
   tests) to the new home. No shims.
5. Verify: the final Edit to each file produces no hook size flag;
   `npm run typecheck` passes; for webapp files `npm run build:webapp` passes.
6. For test files: same, but split by tested-symbol topic; shared helpers per the
   timeline-test-helpers pattern (`tests/<family>-test-helpers.ts`) ONLY when shared
   across the new files; never append to `tests/utilities.ts`/`tests/fixtures.ts`
   during parallel Stage B (conflict risk).

## Phase 3 — closeout

1. Full `npm run typecheck` and `npm run build:webapp` (must both pass).
2. Confirm zero non-archive tracked TS files >250 lines:
   `git ls-files '*.ts' | grep -vE '^(webapp/archive/|webapp/vendor/)' | xargs wc -l | awk '$1>250'`
   (only the `total` row may remain).
3. Move task 92's object from `tasks.json` to `completedTasks.json` with
   `completionDate` 2026-07-15 and a short `closureNote`; do NOT invent
   `commitHashes` (nothing is committed yet).
4. Stage (`git add`) exactly: every audited/edited tracked `.ts` file, every new
   module file, `tasks.json`, `completedTasks.json`, the implementation-notes files,
   and this plan file. Do not stage the user's unrelated pending changes
   (`package.json`, `.claude/skills/*`, `.vscode-parent/*`, `scenarios`, `logs*.txt`,
   untracked dirs). Do NOT commit.
5. Record deep-nesting sites (from Phase 1 reports) in the implementation notes as
   the input for a follow-up nesting task.
