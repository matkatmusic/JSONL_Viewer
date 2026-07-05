# Handoff: implement the per-line file-state tracking sidecar

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; the whole RevEng tree
is untracked — `common/`, `tools/`, `tests/`, `plans/` show as `??`). Git history tells you
nothing; the real state is in the files.

## Goal
Build the per-line file-state tracking sidecar specified in
`plans/per-line-state-sidecar-plan.md`: a diagnostic tool that tracks ONE file's state at
per-line granularity across every JSONL event that touched it (main transcripts AND
subagent transcripts), anchored by guaranteed source-of-truth beacons, and emits a
timestamp-keyed tracking object with per-line evidence references. It runs BESIDE the
existing reconstruction pipeline and does not change PASS/MISMATCH verdicts.

## Current State
- The plan is COMPLETE and heavily user-reviewed — the schema in it went through five
  refinement rounds with the user. Treat the schema's inline comments as the authoritative
  documentation (the plan says so explicitly).
- Supporting work already landed this session, all green:
  - `tools/assemble-split-reads.js` + `tests/test-assemble-split-reads.js` (5/5): extracts
    chunked Read events with offset/limit geometry and stitches them; proved two complete
    plate_summary.py copies are recoverable from main transcripts and that EOF confirmation
    is mandatory (every chunk returning exactly its limit can hide a truncated tail).
  - probe-projects-v2 roadmap items 1+2 are done (session-cwd root derivation,
    findings-preserving merge, 3 authored findings): full suite **317 passed / 0 failed**;
    e2e gives list1 415 files (406 PASS / 9 MISMATCH, 97.8%), list2 535.
- Nothing of the sidecar itself is implemented yet — no Phase 1-4 code exists.

## What Remains
Execute the four phases of `plans/per-line-state-sidecar-plan.md`, in order, strict
red-green TDD (failing test first, watch it fail, then implement):
1. **Phase 1 — subagent-aware find-jsonls-for-file:** new `common/subagent-jsonls.js`
   (`enumerateSubagentJsonls`, `subagentJsonlsReferencing`); include matching subagent
   transcripts in `tools/find-jsonls-for-file.js` output; `tests/test-subagent-jsonls.js`.
2. **Phase 2 — per-file event extraction with timestamps:** new
   `tools/extract-file-events.js` producing events in the schema's shape (`{jsonl,
   jsonlLine, unixMs, timestamp}` + exactly one non-null kind sub-object: `snapshot` |
   `fileAbsent` | `write` | `edit` | `readFull` | `readChunk` | `cat`);
   `tests/test-extract-file-events.js`.
3. **Phase 3 — the tracker:** new `tools/track-line-states.js` (`trackLineStates(events)`
   + CLI with `--path`/`--jsonls`/`--projects-dir`/`--snapshots`/`--out`);
   `tests/test-track-line-states.js`. Event semantics and the full test list are in the
   plan.
4. **Phase 4 — run on real residuals:** plate_summary.py first (acceptance: the report
   must localize the known one-blank-line divergence after the import block and the
   May 16→17 docstring rewrite), then the other 8 list1 MISMATCHes from
   `tools/probe-results-v2.json`; summarize findings in the implementation notes.

## Key Files
- `plans/per-line-state-sidecar-plan.md` — THE spec. Read it in full before any code.
- `plans/implementation-notes-make-a-plan-for-recursive-clarke.md` — this session's notes:
  the split-read experiment (EOF lesson), probe items 1+2 decisions, open questions.
- `tools/assemble-split-reads.js` — chunk extraction to reuse in Phase 2.
- `common/extract-file-state.js` (394 lines, pre-existing size exception — do NOT grow it)
  — snapshot detection/blob reading to reuse; note it currently DISCARDS
  `backupFileName: null` (the fileAbsent beacon) and ignores `isSnapshotUpdate`.
- `common/collect-touches.js` — `findReferencingJsonls` touch test to reuse from the new
  subagent module. EXACTLY 300 lines (hook limit) — do not grow it.
- `common/replay-edits.js` + `common/classify-edits.js` — edit extraction + kept/ignored
  statusByLine.
- `tools/probe-v2-assembly.js` — `editBelongsToFile` full-path-suffix matching for
  shortened snapshot keys.
- `tools/probe-results-v2.json` — the 9 list1 MISMATCH targets for Phase 4.

## Plan File
`plans/per-line-state-sidecar-plan.md`

## Context the Next Agent Won't Have
- **VOCABULARY (user directives, enforced):** never use the word "corpus" (say "all JSONL
  files in the projects folder"); say "create", never "mint", for producing
  objects/records — in code, docs, AND conversation. Name things for what they ARE with
  specific names (`timestampOfContradictingRecord`, not `atMs`; `perLineStats`, not
  `perLine`). Group feature-specific properties into nullable sub-objects — no placeholder
  fields for features that don't apply (this shaped the events and evidenceRef schemas).
- **Schema documentation style:** the plan's schema is an annotated JS literal with
  intent-explaining comments and NO example values — the user explicitly rejected example
  values ("they force me to infer the intent"). Keep any schema changes in that style.
- **Coding style (user guides, enforced by a lint hook on every edit):** strict red-green
  TDD; ONE condition per `if` (nest, never `&&`/`||`; ternaries only for value selection);
  >300 lines/file rejected; >3-deep nesting rejected (even object literals in tests —
  build nested literals in flat steps). The hook runs `tests/test-<basename>.js` on every
  edit, so name test files accordingly and expect RED feedback through the hook.
- **Beacon facts were verified against the Claude Code source** (utils/fileHistory.ts,
  utils/handlePromptSubmit.ts, QueryEngine.ts, tools/File*Tool) — the plan's Beacons
  section records the receipts. Key ones: turn-start snapshots are unconditional (not
  edit-gated); the pre-edit backup happens at edit time via `fileHistoryTrackEdit`
  (`isSnapshotUpdate: true`); reused backups are still valid content at the snapshot's
  timestamp; resume-copied snapshots carry the PREVIOUS session's embedded timestamp
  (dedup by messageId + snapshot.timestamp); snapshots appear ONLY in main transcripts;
  SDK/headless sessions may have none.
- **The EOF lesson (proved empirically):** contiguity from line 1 is NOT completeness —
  every chunk in both real plate_summary assemblies returned exactly its requested limit,
  so a gap-free assembly can still be a truncated prefix. `readFull` means EOF-proved by
  classification; anything weaker extracts as `readChunk`.
- **Failed/rejected approaches:** storing text in per-line entries (rejected — evidence
  references only, text dereferenced from JSONLs/blobs on demand); a `kind` discriminant
  string on events (rejected — the non-null sub-object IS the kind); `lineWithinEvent` as
  a content locator (rejected as ambiguous — evidenceRef now carries the parsed-record
  property path + value-shape-specific locators: `textProperty` char spans,
  `structuredPatch` hunk/line indices, `blobFile` resolved path + span).
- **Open question (user never resolved):** an unlocatable Edit over a FULLY-known region
  (no gaps to hide in) is currently filed as `floating`, but it proves belief is wrong
  somewhere and arguably deserves its own conflict-like record. Flag it if it shows up in
  Phase 4 rather than silently choosing.
- **E2E data lives in the recovery set:** probe runs need BOTH flags
  `--projects-dir ~/Programming/jot-recovery/claude-data/projects` and
  `--snapshots ~/Programming/jot-recovery/claude-data/file-history`. Snapshot blob reads
  default to `~/.claude/file-history` (works on this machine, breaks elsewhere) — the
  sidecar must thread `--snapshots` everywhere (plan's build-list item 6).
- The python pipeline in `~/Programming/jot-recovery` already handles subagent records
  (`src/models.py:347`, `tests/test_v2_discovery.py`) — reference for semantics, but the
  JS implementation here is from scratch.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Baseline before starting (expect 317 passed, 0 failed across all suites):
for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) echo "$t: $(node "$t" 2>/dev/null | grep -E 'passed, [0-9]+ failed')";; esac; done
# Per-phase: the new suites must go red first, then green:
node tests/test-subagent-jsonls.js
node tests/test-extract-file-events.js
node tests/test-track-line-states.js
# Phase 1 check — output now includes subagent jsonls:
node tools/find-jsonls-for-file.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects
# Phase 4 acceptance — the report localizes the known one-blank-line divergence and the
# May 16→17 docstring rewrite:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history
```
