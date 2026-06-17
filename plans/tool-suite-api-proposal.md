# Tool Suite API — structure proposal

Goal: reorganize the codebase into a base API layer with definitive functionality,
plus thin user-facing tools (CLIs and browser viewers) that only call the API.

## Recorded corrections (from the user, 2026-06-11)
- probe-projects-v2 gap: enumeration only probes write/edit-touched paths; files
  witnessed only through reads are never probed even though replay can reconstruct
  them from read observations. This stays a separate roadmap item — the
  restructuring moves probe code but does not change enumeration behavior.
- `toolUseResult.originalFile` is sometimes empty — never rely on it alone. The
  pipeline already accounts for this; any new extraction of it must too.

## Process (decided 2026-06-12)
The work proceeds in three stages; each later stage is grounded in the artifact
of the stage before it:
1. **Inventory pass** — a function-level inventory of common/, tools/, and the
   viewer code: every exported function, what it does, who requires it, and which
   capability group it belongs to. Artifact: plans/tool-suite-function-inventory.md.
   DONE 2026-06-12.
2. **API spec** — the full api/ surface (signatures + annotated schemas, JS
   literals with intent comments, no example values) authored FROM the inventory
   so no real behavior is missed. The user reviews names and shapes before any
   code moves. Artifact: plans/tool-suite-api-spec.md — DRAFTED 2026-06-12,
   reviewed and approved by the user (the migration in stage 3 executed against it).
3. **Migration** — capability by capability in the dependency order below,
   following the per-capability process below. The roadmap items
   (handoff-develop-20260611-1727.md — 17 as of 2026-06-13, §D added by the
   migration) wait until the restructuring completes.
   **DONE 2026-06-15** — all 8 phases complete (see the checklist in
   plans/tool-suite-migration-plan.md). The codebase now has a base api/ layer
   (one canonical home per capability) with thin tools/ CLIs and web-shared/
   browser UI that only call the api; common/ is fully emptied of source. The
   deferred roadmap items can now proceed.

## Current state: capabilities and overlaps

| Capability | Current implementations (overlapping) |
|---|---|
| Transcript discovery | tools/find-jsonls-for-file.js, tools/find-jsonls-at-commit.js, common/collect-touches.js (findReferencingJsonls), common/subagent-jsonls.js |
| JSONL parsing / inspection | common/jsonl-parse.js, common/json-inspector.js, jsonl-tree-viewer.ts |
| File identity / lineage | common/file-path-history.js, common/collect-touches.js (lineage graph), common/extract-bash-file-ops.js |
| Event extraction | tools/extract-file-events.js, common/extract-file-state.js (frozen), common/replay-edits.js (extractors), tools/assemble-split-reads.js |
| Reconstruction / replay | common/replay-edits.js, tools/reconstruct.js, tools/snapshot-reconstruction.js, common/unified-reconstruct*.js |
| Reference sources / verdicts | tools/probe-reference-sources.js, common/git-file-state.js, common/diff-engine.js |
| Per-line belief | common/line-belief.js, edit-splice.js, line-state-evidence.js, final-line-verdict.js, tools/track-line-states.js |
| Viewers | jfred/ + common/jfred-*.js, viewer/, unified/, diff/ |
| Probe orchestration | tools/probe-projects.js (v1), probe-projects-v2.js, probe-v2-assembly.js, probe-v2-report.js |

## Proposed layers

```
api/        — base layer; definitive, one home per capability; every module has
              its own test suite; no console output, no argv parsing
tools/      — CLIs: parse args → call api → format/write output; nothing else
viewer/     — browsers: api result → JSON file → static HTML/JS (reuse jfred panes)
```

### api/ modules (draft — finalized during stage 2 spec review)

- `api/transcript-discovery.js` — discovery
  - allJsonlFilesInProjectsFolder(projectsDir)
  - subagentTranscriptsFor(transcriptPath)
  - transcriptsReferencingFile(absolutePath, projectsDir)   ← wish-list item 1
- `api/transcript-parsers.js` — parsing
  - parseTranscriptLines(jsonlText)
  - sessionMetadata(jsonlText)
  - formatLineAsJson(rawLine)                               ← wish-list item 6
- `api/file-historical-lineage.js` — lineage
  - aliasPathsForFile(absolutePath, scan)
  - lineageGraphForProjectsFolder(projectsDir)
- `api/file-events-extractors.js` — the single authoritative event extractor
  - eventsForFile(absolutePath, transcriptPaths, kindsFilter)
  - readsForFile(...)                                       ← wish-list item 2
  - editsForFile(...)                                       ← wish-list item 3
  - (fileModifyingEventsInTranscript moved 2026-06-13 to the edit-stream module —
    the diff viewer already implements it edit-side via groupEditsByFile; see spec)
- `api/reconstruction-pipeline.js` — replay + reference + verdict
  - replayEventsToContent(events)
  - referenceSourcesForFile(absolutePath, options)
  - reconstructionVerdict(replayedContent, sources)
- per-line belief sidecar — already has its definitive home (common/line-belief.js,
  common/edit-splice.js, common/line-state-evidence.js, common/final-line-verdict.js,
  tools/track-line-states.js). No new module and no forwarding layer: per decision 2
  (new api/ folder), these files move into api/ unchanged — file move + import
  repoints only.

### Wish-list mapping
1. JSONLs referencing a file → api/transcript-discovery.transcriptsReferencingFile (exists in collect-touches; needs read-touch coverage, not just authored touches)
2. Read events for a file → api/file-events-extractors.readsForFile (extract-file-events already extracts readFull/readChunk/cat)
3. Edit events for a file → api/file-events-extractors.editsForFile
4. Viewer: file-modifying events in one JSONL → thin page over fileModifyingEventsInTranscript (edit representation; home is api/edit-stream-extraction per the spec — the diff viewer already does this via extractEditsFromJSONL + groupEditsByFile)
5. Viewer: same for a folder → same API, looped over allJsonlFilesInProjectsFolder
6. Formatted JSON line view → api/transcript-parsers.formatLineAsJson (json-inspector exists)

## Migration process (per capability, strict red-green)
1. Write the api module's test suite first (red).
2. Move the code to its canonical home (green): extract the functions out of the
   old module into the api module;  comment out extracted functions. the old module's active code shrinks.  once all code in old module is commented out, the old module is moved to an 'archive' subfolder of whatever directory the old module was in. NO forwarding layers — a capability has exactly one home and every
   caller imports it directly. Frozen files (extract-file-state.js 394 lines,
   collect-touches.js 300 lines) lose code to extraction but never gain any.
3. Repoint every CLI/viewer that used the old path; their tests stay green.
4. comment out the superseded code path. Run the full suite (385+ must stay green).
5. One capability per session; update this doc's checklist; handoff between sessions.

## Migration order (dependency order)
1. transcript-parsers (parsing — everything depends on it)
2. transcript-discovery
3. file-historical-lineage
4. file-events-extractors  ← largest consolidation; roadmap items 1–8 land here
   only after the restructuring completes
5. reconstruction-pipeline
6. line-states (file moves into api/ + import repoints only — no new code)
7. viewers (thin pages over 1–6)
8. probe-projects-v2 repointed onto the API (enumeration gap stays a separate
   roadmap item; behavior unchanged)

## Constraints carried forward
- 300-line file cap (hook rejects); one condition per if; tests/test-<basename>.js
  naming. Flat api/ filenames avoid basename collisions with common/ during the
  transition — no two files may share a basename while both exist.
- Vocabulary: "all JSONL files in the projects folder", never "corpus"; "create",
  never "mint". Names say what things are.
- Schemas: annotated JS literals, intent comments, no example values; the non-null
  sub-object IS the kind.
- No forwarding/wrapper layers (user directive 2026-06-12): never re-export or
  delegate to existing code through a new interface. One canonical home per
  capability; code MOVES there; callers import it directly.

