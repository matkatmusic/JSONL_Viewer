---
spec: unified-reconstruction-plan.md
started: 2026-06-06T12:36:00-07:00
---

# Implementation Notes: Unified Reconstruction Algorithm

## Design Decisions

### 1. Function naming to avoid browser-scope collisions (2026-06-06)
- `diff` (from spec) → `detectDrift` — avoids shadowing potential future diff utilities
- `record` (from spec) → `recordPatch` — more descriptive and avoids generic name collision
- Helper extracted: `detectFullContentDrift` deduplicates the comparison logic across 4 source types
- Helper extracted: `classifySourceType` deduplicates the source-type ternary chain from `record`
- `isValidReadContent` → `isValidReadOutput` (collides with extract-file-state.js)
- `parseAllLines` → `parseJsonlLines` (collides with turn-analyzer.js)
- Verified no new collisions via `grep -oh "^function [a-zA-Z_]*" *.js | sort | uniq -d`

### 2. Edit-only cascade fallback — deviation from spec (2026-06-06)
The spec's `applySourceToState` cascade covers 5 sources (snapshot, originalFile, readResult, bashReadResult, structuredPatch). Added a 6th fallback: `if (step.edit)` — handles create/update edits that have no originalFile or structuredPatch. Without this, newly created files would never get their content applied.

### 3. Observation-only sources produce duplicate patches (2026-06-06)
When a snapshot/read/cat reveals drift, both a UserEdit and an AgentEdit are recorded with effectively the same diff. This is by-design per the spec: every change to state.content gets an entry. JFReD consumers can filter or deduplicate.

### 4. Empty originalFile treated as null (2026-06-06)
`originalFile === ''` is treated as null (no ground truth). Rationale: an empty string is falsy in the cascade's `if (step.originalFile)` check and provides no useful content for drift detection. Edge case: if a file was genuinely empty before an edit, drift detection relies on structuredPatch instead.

### 5. Rewind handling is per-source-file (2026-06-06)
For multi-JSONL reconstruction, rewinds are computed separately per JSONL source and applied only to steps from that source. Line numbers are indices into the filtered parsed array (matching `parseJSONLLines` convention).

### 6. Dependencies imported, not duplicated (2026-06-06)
Reuses `applySingleEdit` from replay-edits.js, `stripCatLineNumbers` from extract-file-state.js, and `analyzeJSONL` from classify-edits.js. Read/cat step extraction reimplements tool_use/tool_result pairing inline (different output shape from existing extractors).

### 7. `algorithm` function merged into `reconstructFromJSONLTexts` (2026-06-06)
The plan defines both `reconstructFile` (filesystem) and `algorithm` (pure logic) as separate functions. The `algorithm` function's if/else if chain is redundant with the internal cascade in `detectDrift`/`applySourceToState`. Merged into `reconstructFromJSONLTexts` which handles step extraction, rewind filtering, and the apply loop directly.

## Deviations

1. Added edit-only fallback in `applySourceToState` (see Design Decision #2)
2. Merged `algorithm` into `reconstructFromJSONLTexts` (see Design Decision #7)

### 8. Snapshot backup file reading added (2026-06-06)
Snapshots may store content via `backupFileName` (pointing to `~/.claude/file-history/<sessionId>/`) rather than inline `content`. Added `readSnapshotBackup` to read these from disk (Node-only, guarded). Fixed s8 scenario (0→1 match).

### 9. Snapshot timestamp extraction fix (2026-06-06)
`file-history-snapshot` records lack a top-level `timestamp` — it's nested at `snapshot.timestamp`. Added `getSnapshotTimestamp` helper to extract it. Without this, snapshots sorted before edits in `extractStepsFromJSONLs`, breaking chronological reconstruction. Fixed s15 and s21 scenarios.

## Open Questions

None currently — all spec ambiguities resolved in the design decisions above.
