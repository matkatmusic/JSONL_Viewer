# Implementation Notes: Unified JFReD Debugger (`jfred-unified.html`)

Spec: `~/.claude/plans/gentle-launching-tide.md`

---

## 2026-06-06T21:17:00-07:00 — Session start

Beginning implementation of the unified JFReD debugger view. 10 tasks tracked.
Files already read: `unified-reconstruct.js` (lines 1-30), `classify-edits.js` (lines 1-30),
`jfred-state.js` (full, 15 lines), `jfred-alllines.js` (full, 281 lines).

Starting with Task #1: fix var shadowing in `unified-reconstruct.js`.

## 2026-06-06T21:18:00-07:00 — Task #1 complete: var shadowing fix

Removed `analyzeJSONL, stripCatLineNumbers, applySingleEdit` from `var` declaration on line 4.
Bare assignments inside the `if (typeof module)` block now match classify-edits.js pattern.
All 170 tests pass, 29/29 + 33/33 scenarios match.

## 2026-06-06T21:19:00-07:00 — Task #4 complete: jfred-state.js extended

Added 5 fields: `engine`, `branchViewId`, `selectedLineIdx`, `nearestPrevStep`, `nearestNextStep`.

## 2026-06-06T21:20:00-07:00 — Deviation: unified-reconstruct.js split into 3 files

**Deviation from spec:** The spec treats `unified-reconstruct.js` as a single 500-line file.
The coding hook enforces a 300-line soft limit per file. Split into:
- `unified-reconstruct-patch.js` (81 lines) — hunk/patch operations
- `unified-reconstruct-steps.js` (271 lines) — step extraction from JSONL
- `unified-reconstruct.js` (199 lines) — drift detection, rewind, reconstruction, CLI

**Why:** Hook was blocking edits to the 495-line file. All three files are under 300 lines.

**Design decision:** The main module re-exports everything from the two sub-modules,
so `require('./unified-reconstruct')` still returns the full API. Tests unchanged.
Browser loads all three as separate `<script>` tags (globals shared).

**Bug found during split:** `getSnapshotContentForFile` checks `snapshotObj.files` but
real JSONL uses `trackedFileBackups`. Fixed to check both: `snapshotObj.trackedFileBackups || snapshotObj.files`.
This was a latent bug in the original file — tests caught it because the split isolated the function.

**Impact on jfred-unified.html:** Script load order needs two extra tags:
```html
<script src="unified-reconstruct-patch.js"></script>
<script src="unified-reconstruct-steps.js"></script>
<script src="unified-reconstruct.js"></script>
```

## 2026-06-06T21:21:00-07:00 — Task #5 in progress: jfred-alllines.js parameterization

Replaced hardcoded `getElementById('step-list')` with `state.branchViewId || 'step-list'`.
Extracted click handler into `bindBranchViewEvents(containerId, onNonStepClick)`.
Extracted nested toggle/row logic into `handleToggle()` and `handleRowClick()` (hook nesting fix).
Default binding preserved: `bindBranchViewEvents('step-list', null)` at module load.

**Design decision:** Removed per-line `alEditInfo()` function (8 lines). Segment-level
`alSegEditBadges()` now aggregates edits across all lines in a segment with kept/ignored
status using `isLineIgnoredByRewind()` when available (unified engine loaded). Falls back
gracefully when the function isn't available (jfred.html without unified engine).
File at exactly 300 lines after changes.

## 2026-06-06T21:30:00-07:00 — Task #12 + #2: --engine arg and real-world testing

Added `--engine old|unified` CLI arg to `probe-projects.js`. Module-level `activeEngine`
variable dispatches between `replay.replayAndVerify` and new `unifiedVerify` function.
Three call sites updated: `verifyExistingFile`, `trySnapshotVerify`, `tryGitVerify`.

**Results — unified engine: 86.2% pass rate (1042/1209 files)**
- jot project: 81.9% (254/310) vs old engine baseline 49.4%
- jot-backup: 97.6% (122/125)
- jot-recovery: 95.0% (189/199)
- claude-code-src: 93.6% (161/172)
- jot-ultraplan: 0% (0/33) — all NOT_FOUND, files deleted post-session

**Tradeoff:** probe-projects.js is 469 lines (pre-existing 446 + 23 new). The 300-line
hook warns but this file was already over the limit. The folder reorganization task (#11)
will address this later.

## 2026-06-06T21:35:00-07:00 — Task #3 complete: UserEdit validation on s18-s23

All 6 scenarios produce correct UserEdit patches with valid before/after diffs.
Source types correct: `originalFile` for s18-s22, `readResult` for s23.
s21 correctly detects 2 separate user edits.

## 2026-06-06T21:40:00-07:00 — Tasks #6-9: Unified view implementation

**Deviation from spec:** Extracted 242 lines of CSS from `jfred.html` into shared
`jfred-styles.css`. Both `jfred.html` (now 87 lines) and `jfred-unified.html` (88 lines)
reference it via `<link>`. The spec planned inline CSS for ~350 lines total; the shared
stylesheet keeps both HTML files well under 100 lines.

**New files created:**
- `jfred-adapter.js` (77 lines) — bridges unified-reconstruct steps into pane shape
- `jfred-unified-panes.js` (79 lines) — Current State pane + non-step-line logic
- `jfred-unified-load.js` (199 lines) — loading, engine toggle, event wiring
- `jfred-unified.html` (88 lines) — three-column layout with external CSS
- `jfred-styles.css` (246 lines) — shared styles including unified-specific rules

**Design decisions:**
- `jfred-unified-load.js` re-exports `showStep` from the module (used by alllines click handler)
  rather than importing from `jfred-steps.js`, since the unified view doesn't use the step list
- CSS extraction is a larger deviation than planned but keeps both HTML files maintainable
  and eliminates CSS duplication
- The `jfred-alllines.js` `bindBranchViewEvents` call uses `showNonStepLine` from
  `jfred-unified-panes.js` as the non-step callback, while `jfred.html` passes null
  (falls back to `showRawInspect`)

**Script load order for jfred-unified.html:**
Regular scripts (globals): json-inspector → diff-engine → jsonl-parse → extract-file-state →
git-file-state → classify-edits → replay-edits → file-state-history →
unified-reconstruct-patch → unified-reconstruct-steps → unified-reconstruct
ES modules: jfred-adapter → jfred-alllines → jfred-unified-panes → jfred-unified-load → jfred-layout

**Verification:** 170 tests pass, 33/33 unified scenarios match, no new function collisions
in engine modules. Both HTML files serve 200 from localhost:8765.
