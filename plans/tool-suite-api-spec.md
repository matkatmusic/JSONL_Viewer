# Tool Suite — api/ specification (stage 2 — reviewed and approved 2026-06-12)

Drafted 2026-06-12 from plans/tool-suite-function-inventory.md. Module names and
boundaries were approved 2026-06-12; this is the contract for stage 3 migration.

Layer rules (from the proposal):
- api/ modules: no console output, no argv parsing, no DOM. Each ≤300 lines with
  its own tests/test-<basename>.js suite.
- tools/ CLIs: parse args → call api → format/write output.
- Viewers: browser pages over the same api modules (script tags / ES imports).
- NO forwarding layers anywhere. Functions move; callers repoint to the one home.

## api/ modules

### api/transcript-parsers.js
Raw JSONL text → parsed records and session facts.
| export | behavior | origin |
|---|---|---|
| parseJSONLLines | JSONL text → records with uuidToIdx, snapshots, fileWrites metadata | common/jsonl-parse.js |
| isUserPrompt / extractUserText / collectUserPrompts | user-prompt detection and text extraction | common/jsonl-parse.js |
| extractSessionMetadata | session uuid, cwd, repo root, refs from transcript text | common/git-file-state.js |

### api/rewind-classification.js  ← module the proposal missed (inventory finding F6)
Which edits survived code-restoration rewinds — every reconstruction consumer
depends on this verdict.
| export | behavior | origin |
|---|---|---|
| detectRewinds / classifyRewindType / findBackwardJump | code-restoration rewind detection | common/jsonl-parse.js |
| findLastSnapBefore / findFirstSnapAfter / hasWriteBetween | snapshot/write neighborhood queries | common/jsonl-parse.js |
| analyzeJSONL | parsing + rewind detection + kept/ignored classification → {edits, rewinds, fileWrites} | common/classify-edits.js |
| classifyEdits | human-readable kept/ignored listing | common/classify-edits.js |

### api/transcript-discovery.js
Which JSONL transcripts exist / which reference a file.
| export | behavior | origin |
|---|---|---|
| discoverProjects / cwdFromFolderName | project folders in the projects folder / folder-name decode | tools/probe-projects.js |
| enumerateJsonlFiles / loadAllJsonlFilesInProjectsFolder | enumerate / load all JSONL files in the projects folder | common/collect-touches.js |
| collectAllJsonls / findReferencingJsonls | load explicit path list / transcripts touching given paths | common/collect-touches.js |
| groupFilesByFolder | loaded transcripts grouped by project folder | tools/probe-v2-report.js |

### api/subagent-transcript-discovery.js
Subagent (agent-*.jsonl) transcript discovery — common/subagent-jsonls.js moves
here unchanged.
| export | behavior | origin |
|---|---|---|
| enumerateSubagentJsonls | flat sorted list of all subagent transcripts under the projects folder | common/subagent-jsonls.js |
| subagentJsonlsReferencing | subagent transcripts that touched the given paths | common/subagent-jsonls.js |
| findReferencingJsonlsIncludingSubagents | main + subagent transcripts that touched the given paths, unified lineage graph | common/subagent-jsonls.js |

### api/file-historical-lineage.js
One file's identity across renames/copies/moves.
| export | behavior | origin |
|---|---|---|
| collectTouches | all touches in one transcript with lineage tracking | common/collect-touches.js |
| buildLineageGraph / resolveAliases / gatherAllOps | rename/copy graph and alias resolution | common/collect-touches.js |
| resolveAgainstCwd | relative bash path → absolute against session cwd | common/collect-touches.js |
| editBelongsToFile | edit↔alias-path membership: the edit's absolute filePath must exactly equal an alias path; snapshot-sourced edits carry repo-relative paths and instead match an alias path ending with '/'+path that is strictly longer than that suffix | tools/probe-v2-assembly.js |

### api/file-path-history.js (moves folders, unchanged)
buildFilePathHistoryIndex, findEarliestFilePath, findCurrentOnDiskPath,
compareTouchOrder — origin common/file-path-history.js.

### api/extract-bash-file-ops.js (moves folders, unchanged)
unquotePath, parseBash{Cp,Mv,GitMv,Rm,Redirect}Command, extractBashFileOps —
origin common/extract-bash-file-ops.js. Consumed by lineage, edit-stream
extraction, and (roadmap item 2, later) file-events extraction.

### api/file-events-extractors.js (+ cap-driven siblings)
The single authoritative timestamped-event extractor (sidecar representation).
| export | behavior | origin |
|---|---|---|
| extractFileEvents / extractFileEventsFromText | all timestamped events (7 kinds) for a target file | tools/extract-file-events.js |
| authoredEventsFromKeptEdits | kept classification records → authored edit events | tools/extract-file-events.js |
| readProvedEof | EOF-proving lines for file extent | tools/extract-file-events.js |
| readsForFile / editsForFile | wish-list items 2 and 3: extractFileEventsFromText filtered to read kinds / edit kind | new (thin filters, same module) |
| stripCatLineNumbers / extractBashCatEdits / extractReadEdits / extractSnapshotEdits | the four raw observation extractors | extract-file-state.js |
| assembleSplitReads | join multi-chunk Read events into complete per-file content | tools/assemble-split-reads.js |
The four extract-file-state extractors are EXPORTED, not internal (decision
2026-06-13): replay-edits, unified-reconstruct-steps, and file-historical-lineage
consume them, and after phase 5 api/edit-stream-extraction imports them too — so
file-events-extractors is their permanent home, not their sole consumer.
extract-file-state.js is emptied of them but keeps findLastSnapshot* and the
snapshot-IO trio (defaultBaseHistoryDir / resolveHistoryDir / readBackupFile)
until phase 5, so it is not archived in phase 4. assemble-split-reads.extractReadEvents
moves in as an INTERNAL (unexported) helper. It was filed under F2 as a duplicate
of extractReadEdits; revised 2026-06-13 — it is NOT a true duplicate: it preserves
per-chunk metadata (offset/limit, parsed line numbers) that assembleSplitReads and
the read-event kinds need, whereas extractReadEdits returns whole-content records
that replay/lineage need. Neither serves the other's callers; unifying the two
read-scanners is roadmap item 17 (handoff-develop-20260611-1727.md §D), deferred
per the two-representations decision. fileModifyingEventsInTranscript
(originally listed here) is NOT in this module — the diff viewer already provides
it via extractEditsFromJSONL + groupEditsByFile (edit representation), so it lands
in api/edit-stream-extraction.js in phase 5 (below). Physical split across
api/file-events-extractors.js + api/file-event-observations.js expected (cap).

### api/edit-stream-extraction.js
The replay representation: the ordered edit stream the production probe replays.
| export | behavior | origin |
|---|---|---|
| extractEditsFromJSONL | full ordered edit stream (Write/Edit + cat/read/snapshot/bash-op observations) | common/replay-edits.js |
| extractKeptEditsForFile | classify + extract kept edits for one target file | tools/reconstruct.js |
| fileModifyingEventsInTranscript | every file modified in one transcript, grouped by file (the diff viewer's file tree; feeds viewers 4, 5) | common/replay-edits.js extractEditsFromJSONL + common/jfred-load-helpers.js groupEditsByFile (decision 2026-06-13) |
The 4 forwarding re-exports in replay-edits (finding F1) die here: this module
owns the merge and imports the observation extractors from
api/file-events-extractors directly. fileModifyingEventsInTranscript is the
canonical home for the diff viewer's groupEditsByFile logic (moved here 2026-06-13
from file-events-extractors — it is edit-representation, not event-representation);
the diff viewer repoints onto it in phase 7.
Decided 2026-06-12: edits (replay stream) and events (sidecar, 7 kinds) remain
two representations with two extractors through the restructuring; unification
is revisited only after the roadmap items (handoff-develop-20260611-1727.md).

### api/edit-replay.js
| export | behavior | origin |
|---|---|---|
| replayEdits / applySingleEdit | apply an edit sequence / one edit to content | common/replay-edits.js |

### api/replay-verification.js
| export | behavior | origin |
|---|---|---|
| replayAndVerify / replayAndVerifyCumulative | replay and compare against expected content | common/replay-edits.js |
| batchVerify / formatResults | multi-file verification + report text | common/replay-edits.js |
| collectSessionsForFile | sessions that touched a file | common/replay-edits.js |
(replay-edits' CLI behavior moves to a tools/ CLI; 553 lines split across these
three api modules.)

### api/reconstruction-reference-sources.js
What to compare a reconstruction against, and the verdict.
| export | behavior | origin |
|---|---|---|
| gatherReferenceSources / chooseReferenceSource | probe on-disk/snapshot/git and pick the reference; return match decision | tools/probe-reference-sources.js |
| distinctBasenames | basenames + repo-relative suffixes from alias paths | tools/probe-reference-sources.js |
| findLastSnapshotContent / findLastSnapshotBlob | last snapshot content/blob for a path in an edit stream | common/extract-file-state.js |

### api/git-file-state.js
Git as an evidence/reference source.
| export | behavior | origin |
|---|---|---|
| computeRepoRelativePath / resolveRepoRootWalkingUp | path↔repo-root resolution | common/git-file-state.js |
| gitShowFile / resolveGitContent / resolveGitContentMultiRef / buildFilePathMap / buildMultiRefs | content at refs / ref maps | common/git-file-state.js |
| parseRenameHistory / gitFollowHistory / pickCurrentPath / computeOnDisk | git-rename lineage for a path at a commit | tools/find-jsonls-at-commit.js |

### api/line-diff.js
| export | behavior | origin |
|---|---|---|
| lineDiff / renderInlineDiff / renderSxsDiff | LCS line diff + HTML renderings | common/diff-engine.js |
viewer/viewer-diff.js's duplicate LCS is replaced by this module (finding F2).

### api/file-state-history.js (moves folders, unchanged)
buildFileStateHistory — origin common/file-state-history.js.

### Per-line sidecar (move folders, unchanged, names kept)
api/line-belief.js, api/edit-splice.js, api/line-state-evidence.js,
api/final-line-verdict.js — plus trackLineStates moves from
tools/track-line-states.js into api/track-line-states.js (the CLI stays in
tools/). Schema comments in these files remain the authoritative documentation.

### Unified reconstruction engine (moves folders, unchanged)
api/unified-reconstruct.js, api/unified-reconstruct-steps.js,
api/unified-reconstruct-patch.js. Second engine, kept: the unified/ and diff/
viewers and probe `--engine unified` depend on it. Unifying the two engines is
explicitly OUT of scope for the restructuring.

## tools/ after migration (all thin CLIs; no library exports except probe internals)
- find-jsonls-for-file, find-jsonls-at-commit, reconstruct, detect-rewinds,
  turn-analyzer, assemble-split-reads, track-line-states, diagnose-mismatch,
  snapshot-reconstruction → repointed to api/, logic removed.
- probe-projects-v2.js + probe-v2-assembly.js + probe-v2-report.js stay in
  tools/ as the probe orchestration (probe-specific, single consumer), with the
  6 re-exports removed — tests import the real homes.
- turn-analyzer's analyzeTurns/extractTurn stay tool-local (no other consumer).

## Viewer layer after migration
- common/jfred-*.js (9 files) move to web-shared/ (browser UI, not base API;
  folder name decided 2026-06-12).
- unified/'s 3 re-export shims deleted; HTML imports the real homes.
- All pages' script tags repoint `common/*` → `api/*`.
- jsonl-tree-viewer.ts stays at root (standalone generator).

## Archive (candidates confirmed 2026-06-12 — verify no hidden callers, then move to <currentFolder>/archive/)
- tools/probe-projects.js v1 — after its shared helpers move to api/ and v2
  parity is confirmed against the baseline.
- tools/branch-summary.js — no caller found (finding F5).
- tools/snapshot-reconstruction.js — overlaps replay verification; absorb or archive.
- viewer/viewer-diff.js LCS half — replaced by api/line-diff.js.
- The absorbed extractors in extract-file-state.js (file archived once empty of
  live callers; it is frozen, so functions leave but never change in place).
