# Task 112 — Update engine-pipeline-diagrams.html to the JFRED engine and copy it into the JFRED repo

## Goal
`engine-pipeline-diagrams.html` (RevEng root) still describes the pre-cutover RevEng engine. Update it to
match the JFRED engine as it exists today at submodule pin `082468f` (`jfred/src/…`), then place a
byte-identical copy at `jfred/engine-pipeline-diagrams.html` so the public repo documents its own pipeline.
Stage in both repos; commit nothing; run no test suites.

## Verified facts this plan is built on (all checked against jfred @ 082468f on 2026-07-16)
- RevEng root has **no `src/`** anymore; the engine lives only in the `jfred/` submodule. Inside the JFRED
  repo the diagram's `src/...` paths are correct as written, so the updated file is JFRED-branded and the
  RevEng root copy is a byte-identical mirror.
- Every **function name** the diagrams cite still exists in jfred (233-identifier sweep: only mermaid node
  aliases and DOM API names failed the grep). What drifted is **module homes** (the 30-file split, task 92 /
  commit 52ec0e2 era) and **one new pipeline stage**.
- The real per-file chain (`jfred/src/reconstruction_branches.ts::computeFileRevisionsOver`, lines 96–114):
  1. `extractFileEvents`
  2. lineage filter (`buildRenameChain` + `resolveFinalPath` + `eventBelongsToLineage` — all in `reconstruction_lineage.ts`)
  3. **`seedBaseCommitBeacon`** (`reconstruction_base_commit.ts`) — NEW, missing from the diagram. NOT
     reader-gated; fires only when the user configures `repoDir` + `baseCommit` overrides
     (`reconstruction_overrides.ts`, item 46); splices the named commit's bytes as a Tier-1 WriteEvent at
     the committer timestamp, before any reader-gated stage.
  4. `seedCopyEvents` (stays in `reconstruction_branches.ts`)
  5. `fillRedirectContent` ⛁ → 6. `seedEditBaseFromBackup` ⛁ → 7. `injectScriptExecutions` ⛁ (now takes a
     `getLineageContentBefore` seeder) → 8. `placeGitCommitEvidence` ⛁ → 9. `completeElidedBeacons` ⛁ →
     10. `seedStaleEditBases` ⛁ → 11. `completeTruncatedBeacon` ⛁ → 12. `replayEvents`
- Per-records memoization moved out of WeakMaps in `reconstruction_branches.ts` into
  `reconstruction_corpus.ts::getDerivedCaches` (two validity groups: pure branch selections never
  invalidate; derived caches keyed on reader identity + exec-gate flag).
- `reconstruction_exec_gate.ts`: process-wide consent gate for the two impure stages (script re-execution,
  git shell-outs). Defaults ON for CLI/tests/coverage; the viewer server boots it OFF and enables it only
  for a consented build.
- Module-home moves the diagrams must reflect (verified by definition grep):
  - `parseArgs` / `resolveGraphFlags` → `reconstruction_cli_args.ts`
  - `buildBackupTimeline` → `reconstruction_backup_timeline.ts`; `getFileHistorySnapshot` → `structures/file-history.ts`
  - `collectAbandonedHeads` / `collectSurvivingTrunkUuids` / `collectPredecessorFinalHeads` → `reconstruction_trunk.ts`;
    `findPromptForkPoints` → `reconstruction_prompts.ts`
  - `bashEventsFrom` → `reconstruction_bash_events.ts`; `extractScriptRenameEvents` → `reconstruction_script_renames.ts`;
    `getContentBlocks` → `structures/content-blocks.ts`
  - script subsystem split: `scriptExecutionForBeacon` / `beaconlessScriptExecutions` stay in
    `reconstruction_script_stage.ts`; `executeRunOnce` / `discoverScriptCreatedPaths` →
    `reconstruction_script_runs.ts`; `getPreExecutionState` + `scriptCodeMayWriteFiles` (item-68 read-only
    gate: read-only runs skip the sandbox) → `reconstruction_script_prestate.ts`; `runScriptAgainstState` /
    `spawnSandboxRun` → `reconstruction_script_sandbox.ts` (memo mirrored to disk, 256 cap)
  - git subsystem split: `findGitCommitEvents` → `reconstruction_git_commit_events.ts`; `placeOneCommitDiff`
    / `pureAdditionsFrom` / `placementAfter` / `placeGitCommitEvidence` → `reconstruction_git_placement.ts`;
    `readCommittedFileContent` → `reconstruction_git_evidence.ts`; `findGitOperations` / `parseGitOperation`
    → `reconstruction_git_operations.ts`
  - renderers: `renderHistoryList` / `renderBranchSummary` → `reconstruction_render_list.ts`; unified/patch
    diffs → `reconstruction_render_unified.ts`; real-git context diff → `render_git_diff.ts` (item 51, viewer
    `/api/diff` only); JSON step rows → `reconstruction_json_steps.ts` (task 92)
  - viewer split (task 92): build-heavy route handlers (`/api/document`, `/api/diff`, `/api/range-patch`,
    `/api/step-files`, `resolveJsonlPaths`) → `viewer_server_routes.ts`; projects/static/blob trust boundary
    (`scanProjects`, `setProjectsDir`, `resolveProjectFile`, `readBlobSnapshot`) → `viewer_api_projects.ts`;
    `loadProjectRecords` + `parsedRecordsCache` + `ARTIFACT_CACHE_CAPACITY = 8` → `viewer_api_records.ts`;
    diff/patch renderers (`renderRangePatch`, `handle*` params) → `viewer_api_diffs.ts`;
    `builtDocumentCache` stays in `viewer_api.ts` but is now disk-backed via
    `reconstruction_document_cache.ts` (item 79: survives server respawn, sub-second reload of a ~468 s build)
  - checker split: `listCoveredScenarios` / `buildUuidLineIndex` / `findUncovered` → `scripts/coverage_scenarios.ts`;
    `selectBestEngineStep` / `firstDifferingFile` → `scripts/coverage_compare.ts`
- Viewer routes today (`viewer_server.ts::handleRequest`, lines 149–176): POST+GET `/api/config`,
  `/api/pick-folder` (NEW), `/api/projects`, `/api/document`, `/api/raw`, `/api/blob`, `/api/diff`,
  `/api/range-patch`, `/api/step-files` (NEW), static `/` + `/app/*`.
- Document build additions worth one node each, no more: `reconstruction_tool_calls.ts` (item 55 toolCalls[])
  and `reconstruction_orphans.ts` (orphaned-record detection for the branch model). Skip
  `reconstruction_labels.ts` / `reconstruction_progress.ts` in the diagrams — display/plumbing helpers, not
  pipeline structure.

## Non-goals
- No TDD cycle: the deliverable is a static documentation HTML file with no importable logic; the project
  test suite does not cover it and the user said not to run tests. The one runnable check is the browser
  smoke check in step 4.
- No content rewrite of prose that is still accurate (tab 1 is structurally unchanged; keep it apart from
  branding and the base-commit-beacon mention below).
- No new diagrams, no new tabs.

## Steps

### 1. Edit `engine-pipeline-diagrams.html` (RevEng root) — the single source
All edits in the one existing file, using Edit. Keep mermaid node **ids** stable wherever the node survives
(the DRILL map keys on them); only labels and new nodes change, plus renumbering described below.

1a. **Branding.** `<title>` and `<h1>`: "RevEng Reconstruction Engine" → "JFRED Reconstruction Engine".
    Header `<p>` keeps the entry point `src/reconstruction_cli.ts :: runCli(argv)` (correct inside JFRED).

1b. **Tab 1 (5 steps).** One label edit only: S4's text gains the base-commit beacon in its repair list —
    "(backups, scripts, git, beacons)" → "(base-commit, backups, scripts, git, beacons)". Everything else
    in tab 1 is still true.

1c. **Tab 2 (15 → 16 steps).** Insert a new node `P9b` after P9 (lineage filter), before the copy-seed step:
    ```
    P9b["10 · seedBaseCommitBeacon()
    repoDir+baseCommit overrides set? splice the
    commit's bytes as a Tier-1 Write at the
    committer timestamp (NOT reader-gated)"]
    ```
    Renumber the visible "N ·" prefixes of the old P10–P15 to 11–16 (node ids stay P10–P15 — only label
    text renumbers, so the DRILL map keys survive). Update the flow line to
    `P9 --> P9b --> P10`. Update nav button text "2 · Pipeline in 15 steps" → "… 16 steps" and the caption's
    "Steps 8–14" → "Steps 8–15". P12's label gains the lineage seeder: append
    "(pre-state seeded via getLineageContentBefore)" after the memoization parenthetical. P12/P13 labels
    each gain "consent-gated (exec_gate)" — one short line, matching reconstruction_exec_gate.ts.
    Add `style P9b fill:#ecfdf5,stroke:#059669`? **No** — green means reader-gated; P9b is not. Give P9b no
    style (default), and extend the tab-2 legend: "seedBaseCommitBeacon is override-gated, not reader-gated".

1d. **Tab 3 (call graph).**
    - CLI subgraph: parseArgs node label → `"parseArgs → resolveGraphFlags\n(reconstruction_cli_args.ts;\nbare CLI ⇒ both DAGs on)"`.
    - SIDE subgraph title → `sidecar (reconstruction_sidecar / _sidecar_reader / _backup_timeline / structures/file-history.ts)`.
    - BRANCH subgraph title → `branch discovery (reconstruction_branch / _tree / _trunk / _fork / _prompts / _worktree / _orphans)`.
    - CORE subgraph: insert node `baseCommit["②b seedBaseCommitBeacon\n(reconstruction_base_commit.ts —\noverride-gated, Tier-1 commit bytes)"]`
      into the chain: `lineage --> baseCommit --> seedCopy` (replace `lineage --> seedCopy` in the long
      chain line). Keep the circled numbers on the other nodes as they are (②b avoids renumbering ③–⑪).
    - CORE subgraph title gains the memo note: append ` — memoized per records identity via getDerivedCaches (reconstruction_corpus.ts)`.
    - EXTRACT subgraph title → `extraction (reconstruction_extract / _bash_events / _user_edit / _script_renames / regex_expressions)`.
    - SCRIPT subgraph title → `script execution (reconstruction_script_stage / _execution / _runs / _prestate / _sandbox)`.
      `execOnce` label → `"executeRunOnce →\ngetPreExecutionState\n(scriptCodeMayWriteFiles:\nread-only runs skip the sandbox)"`.
      `runPy` label: append `\ndisk-mirrored memo` inside the existing parenthetical block.
    - GIT subgraph title → `git evidence (reconstruction_git_commit_events / _git_placement / _git_evidence / _git_operations)`.
    - Add an exec-gate node in the SCRIPT subgraph:
      `execGate["reconstruction_exec_gate.ts\nconsent gate: CLI/tests default ON,\nviewer boots OFF until consented"]`
      with dashed edges `execGate -.-> injectScripts` and `execGate -.-> gitEvidence`.
    - CACHE subgraph title → `cache_lru.ts / reconstruction_corpus.ts / viewer_api_records.ts`; inside the
      `lru` node label, replace "also backs the viewer's records + document artifact caches." with
      "backs the corpus's derived caches +\nthe viewer's records/document caches" and keep the
      loadProjectRecords sentence (it now names viewer_api_records.ts implicitly via the subgraph title).
    - VIEWS subgraph: `renderList` label → `"renderHistoryList\n(reconstruction_render_list.ts)"`;
      `json` node label: append `\n+ toolCalls[] (reconstruction_tool_calls)\n+ step rows (reconstruction_json_steps)`.
    - Legend line: unchanged except append `· ②b = override-gated (repoDir+baseCommit)`.
    - DRILL map t2→t3: add `P9b: ["baseCommit"]`, add `"execGate"` to the P12 array, and `"baseCommit"` does
      NOT join any other entry. t1→t2: add `"P9b"` to the S4 array.
1e. **Tab 4 (coverage checker).** Subgraph title → `scripts/ — the checker (check_scenario_coverage / coverage_scenarios / coverage_compare / coverage_sidecar)`.
    `listCov` label gains `(coverage_scenarios.ts)`; `mismatch` label gains `(selectBestEngineStep / firstDifferingFile: coverage_compare.ts)` — fold into the existing arrow text, keep it short. Everything else verified still true.
1f. **Tab 5 (viewer).**
    - Caption: append one sentence: "Build-heavy route handlers live in <code>viewer_server_routes.ts</code>;
      the consent gate is <code>reconstruction_exec_gate.ts</code> (the server boots impure stages OFF and
      enables them only for a consented build); the document cache persists to disk
      (<code>reconstruction_document_cache.ts</code>) so a respawned server reloads a finished build in
      sub-seconds."
    - ROUTES subgraph: add two route nodes, matching the existing label style:
      `pick["GET /api/pick-folder"]` after cfgGet and `stepFiles["GET /api/step-files\n(viewer_server_routes)"]` after rangeR;
      add `app --> pick` and `app --> stepFiles`; `stepFiles -->|"same build chain"| resolvePaths`.
      `doc`/`diffR`/`rangeR` labels each gain `(viewer_server_routes)` on their existing handler line.
    - API subgraph title → `src/viewer_api*.ts — document build chain (viewer_api / _projects / _records / _diffs)`.
    - CACHES subgraph title → `caches — cache_lru.ts primitives; ARTIFACT_CACHE_CAPACITY = 8 in viewer_api_records.ts`;
      `parsedCache` label gains `(viewer_api_records.ts)`; `docCache` label gains
      `\ndisk-backed (reconstruction_document_cache)`; `sandboxMemo` keeps its existing disk-backed line but
      correct the path if it says `.cache/sandbox-memo.json` — verify against
      `jfred/src/reconstruction_script_sandbox.ts` during implementation and use whatever literal path that
      file writes (grep for the memo file name before editing; do not guess).
    - Legend: unchanged.

### 2. Copy into JFRED
`cp engine-pipeline-diagrams.html jfred/engine-pipeline-diagrams.html` — repo root, byte-identical. The
`src/...` references resolve correctly there; the RevEng root copy is the mirror.

### 3. Stage (no commits)
- In `jfred/`: `git -C jfred add engine-pipeline-diagrams.html`. The submodule is on `develop` at 082468f;
  staging a new file does not move the gitlink, so RevEng shows `jfred (modified content)` — expected, leave it.
- In RevEng root: `git add engine-pipeline-diagrams.html plans/task112-engine-pipeline-diagrams-plan.md`.
- Do not touch `logs*.txt` / `test-transcript.jsonl` (pre-existing noise, deliberately unstaged).

### 4. Smoke check (not a test suite)
Open the updated file headlessly (browse skill or `open`) and confirm: 5 tabs render, no mermaid syntax
error banner on any tab (click through all 5 — mermaid renders lazily per tab), and the two DRILL jumps
still highlight (click tab-1 S4 → lands on tab 2 with P9b among the highlighted nodes). Mermaid loads from
the jsdelivr CDN, so the check needs network. If headless clicking is unavailable, minimum bar: each
`<pre class="mermaid">` block parses — render all five via a temporary page that calls `mermaid.parse` on
each block's text — then delete the temporary page.

### 5. Task bookkeeping + summary
Move task 112's object from `tasks.json` to `completedTasks.json` with `completionDate: "2026-07-16"`,
`commitHashes: []` (work is staged, not committed — note that in the closureNote), and a one-line
`closureNote`. Then have a Sonnet 5 subagent write a ≤40-word single-sentence commit-message summary and
show it to the user.
