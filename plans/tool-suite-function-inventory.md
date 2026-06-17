# Tool Suite — function-level inventory (stage 1 artifact)

Produced 2026-06-12 per plans/tool-suite-api-proposal.md. Every exported function
in common/ and tools/, plus the viewer code, with callers. Caller lists come from
require()/import/script-tag searches — lazy require() calls can hide a caller, so
"required by nothing" means "no static reference found", not proven-dead.

## Findings that shape the API spec

### F1. Forwarding layers already in the codebase (all slated for removal)
- `common/replay-edits.js` re-exports 4 functions that live in
  `common/extract-file-state.js`: stripCatLineNumbers, extractBashCatEdits,
  extractReadEdits, extractSnapshotEdits.
- `tools/probe-projects-v2.js` re-exports 6 functions from probe-v2-assembly.js
  (orderTranscriptsByFirstTouch, assembleKeptEdits, dropTrailingObservationEdits),
  probe-reference-sources.js (chooseReferenceSource, gatherReferenceSources), and
  probe-v2-report.js (isInProject, groupRecordsIntoLists).
- `unified/jfred-adapter.js`, `unified/jfred-unified-filter.js`,
  `unified/jfred-unified-panes.js` are pure re-export bridges over common/jfred-*
  modules; the HTML should import the real homes directly.

### F2. Duplicate capability implementations (one survivor each, rest archived)
- Read-event extraction exists 3 times: extract-file-state.extractReadEdits,
  assemble-split-reads.extractReadEvents (+assembleSplitReads chunk joining),
  extract-file-events readFull/readChunk extraction.
- Cat-output extraction exists 2 times: extract-file-state.extractBashCatEdits
  and extract-file-events' cat event kind.
- LCS line diff exists 2 times: common/diff-engine.lineDiff (Node+browser) and
  viewer/viewer-diff.js (browser-only, no exports).
- Per-file result records exist 2 times: probe-projects.buildFileRecord
  (marked deprecated) and probe-v2-report.buildFileRecord.
- summarizeList exists in both probe-projects-v2.js and probe-v2-report.js.

### F3. Two reconstruction engines
`common/replay-edits.js` (the production engine; probe default) and
`common/unified-reconstruct*.js` (3 files; selectable via probe-projects
`--engine unified`, used by the unified/ and diff/ viewers). The spec must state
whether both survive in api/ or the unified engine remains viewer-only.

### F4. Files over the 300-line cap that must split when their code moves
replay-edits.js (553), probe-projects.js (667), extract-file-state.js (395),
jsonl-parse.js (334), collect-touches.js (301). Moving code out of them into
api/ modules is also the split.

### F5. No static caller found (verify before archiving)
tools/branch-summary.js (library, no CLI guard found), common/diff-engine.js
(tests only — but loaded via script tag in all three viewer HTML pages),
common/extract-bash-file-ops.js (tests only — but lazily required by
replay-edits.mergeExternalEdits), tools/diagnose-mismatch.js (CLI, no exports).

### F6. Capability the proposal missed: rewind detection / edit classification
common/jsonl-parse.js (detectRewinds, classifyRewindType, …) and
common/classify-edits.js (analyzeJSONL — the kept/ignored verdict every
reconstruction consumer depends on) form their own capability between parsing
and event extraction. The spec adds a module for it.

---

## common/ (19 files, 3,697 lines)

### common/classify-edits.js (96 lines) — has CLI behavior
Required by: tools/reconstruct.js, tools/probe-projects-v2.js
| export | what it does |
|---|---|
| classifyEdits | parses a JSONL transcript and returns a formatted string listing each file-modifying event and whether code-restoration rewinds kept or ignored it |
| analyzeJSONL | orchestrates parsing, rewind detection, and edit classification; returns {edits, rewinds, fileWrites} |

### common/collect-touches.js (301 lines, frozen)
Required by: tests, tools/find-jsonls-at-commit.js, tools/probe-projects-v2.js, tools/probe-v2-assembly.js
| export | what it does |
|---|---|
| resolveAgainstCwd | resolves a possibly-relative bash path to absolute against session cwd, expanding leading tilde |
| collectTouches | extracts all file touches (reads, writes, edits, renames, deletes) from one JSONL file with lineage tracking |
| buildLineageGraph | builds a directed graph of renames/copies across sessions to resolve file aliases |
| resolveAliases | resolves file paths through the lineage graph to all known aliases of the same file |
| enumerateJsonlFiles | enumerates all JSONL files in the projects folder (lazy require avoids a cycle with probe-projects) |
| loadAllJsonlFilesInProjectsFolder | loads every JSONL file in the projects folder into a cache structure |
| findReferencingJsonls | returns the JSONL files that touched any of the given paths, using the cache |
| collectAllJsonls | loads JSONL contents from an explicit path list into a cache structure |
| gatherAllOps | indexes all operations from loaded JSONL files into maps by file path |

### common/diff-engine.js (89 lines)
Required by: tests; script-tag loaded by jfred/unified/diff viewer pages
| export | what it does |
|---|---|
| lineDiff | LCS comparison of two line arrays; returns ops with action (add/del/ctx) and text |
| renderInlineDiff | renders LCS ops as inline HTML |
| renderSxsDiff | renders LCS ops as side-by-side HTML |

### common/edit-splice.js (136 lines)
Required by: tests, tools/track-line-states.js
| export | what it does |
|---|---|
| applyEditToBelief | applies a single edit operation to a line-belief object |

### common/extract-bash-file-ops.js (124 lines)
Required by: tests; lazily required by common/replay-edits.js
| export | what it does |
|---|---|
| unquotePath | removes surrounding quotes from a bash-quoted path |
| parseBashCpCommand / parseBashMvCommand / parseBashGitMvCommand | parse cp/mv/git-mv commands into source and destination paths |
| parseBashRmCommand | parses an rm command into the list of deleted paths |
| parseBashRedirectCommand | parses a redirect (>) command into the destination path |
| extractBashFileOps | extracts all bash file operations (cp/mv/git-mv/rm/redirect) from JSONL tool output |

### common/extract-file-state.js (395 lines, frozen)
Required by: tests, tools/probe-reference-sources.js, common/replay-edits.js (re-exports); script-tag loaded by viewer pages
| export | what it does |
|---|---|
| stripCatLineNumbers | removes "N: " prefixes from cat -n output |
| extractBashCatEdits | extracts file-content observations from bare bash cat commands |
| extractReadEdits | extracts all Read-tool file reads from JSONL, unfiltered |
| extractSnapshotEdits | extracts file snapshots from snapshot blocks |
| findLastSnapshotContent / findLastSnapshotBlob | search backwards through edits for the last snapshot content/blob for a path |

### common/file-path-history.js (147 lines)
Required by: tests, tools/probe-v2-assembly.js, tools/probe-projects-v2.js
| export | what it does |
|---|---|
| buildFilePathHistoryIndex | maps each unique path to the ordered list of all touches of that path |
| findEarliestFilePath / findCurrentOnDiskPath | walk lineage aliases to the earliest-seen name / the current on-disk name |
| compareTouchOrder | chronological comparator for two touches |

### common/file-state-history.js (94 lines)
Required by: tests; script-tag loaded by viewer pages
| export | what it does |
|---|---|
| buildFileStateHistory | builds a step timeline of how a file evolved through edits, detecting user modifications between agent edits |

### common/final-line-verdict.js (67 lines)
Required by: tools/track-line-states.js, tests
| export | what it does |
|---|---|
| buildFinalVerdict | per-line final determination: authored, verified, or presumed |

### common/git-file-state.js (134 lines)
Required by: tools/find-jsonls-at-commit.js, tools/probe-reference-sources.js, tools/probe-projects-v2.js; script-tag loaded by viewer pages
| export | what it does |
|---|---|
| extractSessionMetadata | extracts session uuid, cwd, repo root, refs from a JSONL transcript |
| computeRepoRelativePath | absolute path → repo-relative path |
| gitShowFile | file content at a specific commit, or null |
| buildFilePathMap / buildMultiRefs | map paths/refs across commits where a file exists |
| resolveGitContent / resolveGitContentMultiRef | resolve content at one ref / first of several refs |
| resolveRepoRootWalkingUp | find the git repo root by walking up the directory tree |

### common/json-inspector.js (70 lines)
Required by: tests; script-tag loaded by viewer pages
| export | what it does |
|---|---|
| esc | HTML-escape a string |
| syntaxHighlight | wrap JSON text in color-class spans |
| addJumpLinks | turn tool IDs / UUIDs in JSON HTML into jump links |
| renderInspector | render a JSON object with highlighting into a DOM container |

### common/jsonl-parse.js (334 lines)
Required by: tools/detect-rewinds.js, tools/turn-analyzer.js; script-tag loaded by viewer pages
| export | what it does |
|---|---|
| parseJSONLLines | parses JSONL text into objects with metadata (uuidToIdx, snapshots, fileWrites) |
| isUserPrompt / extractUserText / collectUserPrompts | user-prompt detection and text extraction |
| findLastSnapBefore / findFirstSnapAfter / hasWriteBetween | snapshot/write neighborhood queries by line number |
| findBackwardJump / classifyRewindType / detectRewinds | code-restoration rewind detection and classification |

### common/line-belief.js (219 lines)
Required by: tests (edit-splice, final-line-verdict, line-belief)
| export | what it does |
|---|---|
| createBelief / makeUnknownEntry / makeClaimEntry / ensureImpliedLines | belief construction primitives |
| knownRuns | contiguous runs of known lines |
| overlayLine / applyOverlayLines / finishChunk / finishWholeOverlay | observation overlay application |
| applyWrite / applySnapshotVerify / applyFileAbsent | authored-change and snapshot-verify application |
| degradeUntouchedToPresumed | degrade unconfirmed claims to presumed after each instant |
| summarizeBelief / cloneEntriesForTimeline | summary stats and timeline deep-copy |

### common/line-state-evidence.js (300 lines, at cap)
Required by: tools/track-line-states.js, tests
| export | what it does |
|---|---|
| splitContentLines / contentLineSpans | content-string line splitting and span mapping |
| numberedLineEntries / catLineEntries | line entries from line-numbered tool output |
| buildTextPropertyRef / buildStructuredPatchRef / buildBlobFileRef / refForAuthoredEditLine | evidence reference constructors |
| loadParsedRecord / findStructuredPatchLine / materializeEvent / makeExcerpt | evidence dereferencing and excerpting |

### common/replay-edits.js (553 lines) — has CLI behavior
Required by: tests, tools/probe-projects-v2.js, tools/branch-summary.js, tools/reconstruct.js; script-tag loaded by viewer pages
| export | what it does |
|---|---|
| extractEditsFromJSONL | extracts the full ordered edit stream (Write/Edit + cat/read/snapshot/bash-op observations) from JSONL |
| replayEdits / applySingleEdit | apply an edit sequence / one edit to content |
| replayAndVerify / batchVerify / formatResults / replayAndVerifyCumulative | verification drivers and reporting |
| collectSessionsForFile | all sessions that touched a file |
| stripCatLineNumbers / extractBashCatEdits / extractReadEdits / extractSnapshotEdits | RE-EXPORTS from extract-file-state.js (finding F1) |

### common/subagent-jsonls.js (89 lines)
Required by: tools/track-line-states.js, tools/find-jsonls-for-file.js, tests
| export | what it does |
|---|---|
| enumerateSubagentJsonls | flat sorted list of all subagent (agent-*.jsonl) transcripts under the projects folder |
| subagentJsonlsReferencing | subagent transcripts that touched the given paths |
| findReferencingJsonlsIncludingSubagents | main + subagent transcripts that touched the given paths, unified lineage graph |

### common/unified-reconstruct-patch.js (82 lines)
Required by: common/unified-reconstruct.js; script-tag loaded by unified/diff pages
| export | what it does |
|---|---|
| extractOldLines / extractNewLines | removed/added lines from a unified-diff hunk |
| regionMatches / findHunkOffset | locate where a hunk applies in content |
| diffAgainstPatch / applyPatchToState | compare content to a patch / apply a patch to state |

### common/unified-reconstruct-steps.js (286 lines)
Required by: common/unified-reconstruct.js; script-tag loaded by unified/diff pages
| export | what it does |
|---|---|
| makeStep / buildEditObject / buildEditStep | step-object construction |
| tryParseUnified / matchesTargetFile | structured-patch parsing and file matching |
| getMessageContentArray / isValidReadOutput / getSnapshotContentForFile | record-shape accessors |
| extractStepsFromSingleJSONL / extractStepsFromJSONLs | step extraction from one/many transcripts |

### common/unified-reconstruct.js (200 lines) — has CLI behavior
Required by: tests; script-tag loaded by unified/diff pages
| export | what it does |
|---|---|
| detectFullContentDrift / detectDrift | content-drift detection |
| applySourceToState / classifySourceType / recordPatch / applyAndAccountForDrift | source application with drift accounting |
| isLineIgnoredByRewind / makeObservationOnly / hasObservation | rewind-awareness and observation steps |
| reconstructFromJSONLTexts / reconstructFromFolder | reconstruct a file from transcript texts / a whole projects folder |

---

## tools/ (16 files, 3,572 lines)

### tools/assemble-split-reads.js (227 lines)
CLI: `--jsonl <transcript> [--write-dir <dir>]` → assembly summaries; optionally writes assembled files
Required by: tests
| export | what it does |
|---|---|
| extractReadEvents | extracts all Read-tool events from JSONL text |
| assembleSplitReads | joins multi-chunk Read events into complete per-file content |

### tools/branch-summary.js (128 lines)
CLI: none. Required by: nothing found (F5)
| export | what it does |
|---|---|
| buildBranches | organizes JSONL lines into conversation branches by parent-child links |
| formatSummary | renders the branch structure as an indented tree string |

### tools/detect-rewinds.js (166 lines)
CLI: `<jsonl>` → conversation flow tree + rewind summary. Required by: nothing (CLI only)
| export | what it does |
|---|---|
| analyzeRewinds | identifies all rewind events, their classifications, and adjacent snapshots in a transcript |

### tools/diagnose-mismatch.js (95 lines)
CLI: `[--limit N]` → MISMATCH summary from probe-results.json. No exports.

### tools/extract-file-events.js (269 lines)
CLI: none. Required by: tools/track-line-states.js, tests
| export | what it does |
|---|---|
| extractFileEvents / extractFileEventsFromText | extract all timestamped state-change events (7 kinds) for a target file from a JSONL file / text |
| authoredEventsFromKeptEdits | converts kept classification records into authored edit events |
| readProvedEof | extracts EOF-proving lines to determine file extent |

### tools/find-jsonls-at-commit.js (199 lines)
CLI: `--repo --commit --path [--projects-dir]` → JSON lineage (current path, referencing transcripts)
Required by: nothing (CLI only)
| export | what it does |
|---|---|
| parseRenameHistory / gitFollowHistory | historical path names for a file from git log --follow |
| pickCurrentPath / computeOnDisk | resolve the current name / whether it exists on disk |

### tools/find-jsonls-for-file.js (70 lines)
CLI: `--path <abs> [--projects-dir]` → JSON list of referencing JSONL files (incl. subagents)
Required by: nothing (CLI only)
| export | what it does |
|---|---|
| parseArgs | parses --path and --projects-dir |

### tools/probe-projects.js (667 lines) — v1
CLI: `--projects-dir [--snapshots] [--engine old|unified] [--baseline] [--actionable-only] [--skip-files] [--json]` → probe-results.json
Required by: common/subagent-jsonls.js, common/collect-touches.js, tests
| export | what it does |
|---|---|
| probeProject | replay every file in one project, return pass/fail results |
| discoverProjects / cwdFromFolderName | find project folders / decode folder name to filesystem path |
| parseProbeArgs / resolveSnapshotDir | CLI parsing / snapshot dir resolution |
| isTempFilePath | temp-dir path test |
| buildNotTestable / buildProbeResult / buildFileRecord (deprecated) | result-record construction |
| computeActionablePassRate / countByStatus | summary stats |

### tools/probe-projects-v2.js (297 lines)
CLI: `--projects-dir [--snapshots]` → probe-results-v2.json + probe-mismatches-v2.json
Required by: 6 test suites
| export | what it does |
|---|---|
| scanProjectsFolderOnce | the single scan: loads all JSONL files in the projects folder, builds lineage graph, path-history index, project roots |
| enumerateFileIdentities | distinct file identities from authored (write/edit) touches |
| buildPerTranscriptEdits | per-transcript edit list + kept/ignored status lookup |
| probeOneFileIdentity | full replay of one identity vs all reference sources |
| summarizeList / readExistingMismatches / runProbeV2 | stats / prior findings / whole-pipeline driver |
| (6 re-exports) | from probe-v2-assembly, probe-reference-sources, probe-v2-report (finding F1) |

### tools/probe-reference-sources.js (192 lines)
Required by: tools/probe-projects-v2.js
| export | what it does |
|---|---|
| chooseReferenceSource | pick on-disk / snapshot / git reference and return the match decision |
| gatherReferenceSources | probe all three sources and record availability |
| distinctBasenames | unique basenames + repo-relative suffixes from alias paths |

### tools/probe-v2-assembly.js (139 lines)
Required by: tools/probe-projects-v2.js, tests
| export | what it does |
|---|---|
| orderTranscriptsByFirstTouch | order transcripts by first touch of the file |
| assembleKeptEdits | merge kept edits across transcripts for one file |
| dropTrailingObservationEdits / isObservationEdit | trailing-observation retry support |
| editBelongsToFile | alias-path membership test (exact absolute; suffix for snapshot keys) |

### tools/probe-v2-report.js (184 lines)
Required by: tools/probe-projects-v2.js
| export | what it does |
|---|---|
| buildFileRecord | per-file result record with identity, history, stats, decision, provenance |
| isInProject / groupRecordsIntoLists | project-boundary test / split into the two output lists |
| summarizeList / buildResultsPayload / buildMismatchesSkeleton / mergeExistingFindings | stats, results payload, mismatch skeleton, findings carry-over |
| groupFilesByFolder / buildStatusLookup | transcripts by folder / line→kept-or-ignored lookup |

### tools/reconstruct.js (191 lines)
CLI: `--jsonl <f> [...] --file <name> [--output] [--verify] [--json]` → replayed content
Required by: nothing (CLI only)
| export | what it does |
|---|---|
| extractKeptEditsForFile | load JSONL, classify, return kept edits for one target file |

### tools/snapshot-reconstruction.js (171 lines)
CLI: `[--scenarios <path>]` → snapshot-timeline reconstruction check. Required by: nothing
| export | what it does |
|---|---|
| reconstructFile / reconstructAndVerify | replay from snapshots + kept edits in timeline order, optionally verify |

### tools/track-line-states.js (287 lines)
CLI: `--path <file> [--jsonls] [--projects-dir] [--snapshots] [--out]` → line-state report JSON
Required by: nothing (CLI only)
| export | what it does |
|---|---|
| trackLineStates | apply extracted file events to a line belief, emitting timeline + conflicts |
| parseArgs | CLI parsing |

### tools/turn-analyzer.js (187 lines)
CLI: `<jsonl> [--turn N]` → turn summary or one turn's lines. Required by: nothing
| export | what it does |
|---|---|
| analyzeTurns / extractTurn | classify each turn by file modifications / extract one turn's JSONL lines |

---

## Viewer code

### common/jfred-*.js (9 files, ~1,038 lines)
| file | exports | required by |
|---|---|---|
| jfred-state.js (22) | state (shared mutable object) | every other jfred module |
| jfred-adapter.js (77) | adaptUnifiedSteps | unified/, diff/ pages |
| jfred-alllines.js (300) | renderAllLines, bindBranchViewEvents | jfred/, unified/, diff/ pages |
| jfred-filter.js (153) | configureFilter, activateFilter, nextMatch, prevMatch, getActiveFilter, onJsonlLoaded, bindFilterEvents | unified/, diff/ pages |
| jfred-layout.js (106) | DOM layout setup | jfred/, unified/ pages |
| jfred-load-helpers.js (73) | rewritePath, parseAllLines, groupEditsByFile, buildStepLineMap, openFilePicker, loadFromPath | jfred/, unified/, diff/ loaders |
| jfred-panes.js (84) | renderFileContent, clearPanes, updatePanes | jfred/, unified/, diff/ pages |
| jfred-steps.js (144) | renderSteps, showStep | jfred/ page |
| jfred-viewer-panes.js (79) | updateCurrentState, clearCurrentState, updateStepInspector, updateRawInspector, findNearestPrevStep, findNearestNextStep, showNonStepLine | unified/, diff/ pages |

### Viewer pages (data flow: every page loads a JSONL via browser file picker and
runs the Node engine modules in-browser via script tags; no server)
- **jfred/** — jfred.html + jfred-load.js: step-by-step file reconstruction
  debugger (3-pane: actual state, JSON inspector, prev/computed/next diffs).
- **unified/** — jfred-unified.html + jfred-unified-load.js + 3 re-export bridge
  shims (finding F1): branch view + unified-reconstruct engine.
- **diff/** — jfred-diff.html + 5 modules (main, tree, base, filter-mode, layout)
  + css: multi-pane diff viewer with patch export.
- **viewer/** — jsonl-tree-viewer.html + 7 no-export browser scripts
  (globals, load, tree-build, tree-render, events, inspect, diff): conversation
  tree inspector. viewer-diff.js duplicates diff-engine's LCS (finding F2).
  Generated pages (JSONL-tree-viewer-v2*.html, -monolith.html) are output of the
  root-level generator.
- **jsonl-tree-viewer.ts** (root, 1,105 lines) — Node generator: JSONL → static
  pre-rendered tree HTML + sidecar -data.js; run via
  `npx tsx jsonl-tree-viewer.ts <input.jsonl> [output.html]`.
