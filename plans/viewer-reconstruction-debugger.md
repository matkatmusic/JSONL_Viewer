# Plan: File Reconstruction Debugger for JSONL Viewer

## Problem

The RevEng JSONL replay engine reconstructs files from Claude Code session transcripts. It currently achieves 572/1067 (54%) pass rate across 333 real-world JSONL files, with 81 true reconstruction failures (MISMATCH) and 414 files that were deleted after creation (NOT_FOUND).

To debug the 81 real mismatches and improve the engine, we need to see **exactly what happens at each step** of reconstruction: what the engine expected the file to look like, what it actually looked like, which data source (toolUseResult, originalFile, file-history-snapshot, cat, Read) was used, and where reconstruction diverges from reality.

Currently, diagnosing a mismatch requires manually reading JSONL lines, mentally tracking edit sequences, and comparing accumulated state — a process too tedious for 81+ cases. The existing `JSONL-tree-viewer-v2-dev.html` shows raw JSONL lines with rewind/branch visualization but has no concept of per-file edit replay.

## Solution: Augment the Viewer with a "File Reconstruction" Mode

Add a new mode to `JSONL-tree-viewer-v2-dev.html` (or a sibling page) that lets you pick a JSONL folder, see all files modified across sessions, pick a file, and step through its reconstruction one edit at a time — seeing before/after state and data source provenance at each step.

## Data Sources Available

The engine already has all the building blocks:

| Module | Function | What It Provides |
|---|---|---|
| `replay-edits.js` | `extractEditsFromJSONL(text)` | Ordered array of all edits (toolUseResult + cat + read + snapshot sources), each with `.line`, `.file`, `.filePath`, `.type`, `.content`, `.oldString`, `.newString`, `.originalFile`, `.source` |
| `classify-edits.js` | `analyzeJSONL(text)` | Rewind detection + per-edit kept/ignored classification |
| `file-state-history.js` | `buildFileStateHistory(edits)` | Per-step objects with `contents` (after), `expectedState` (before), `actualState` (from independent source), `isUserEdit`, `edit` sub-object, `jsonl.line` |
| `extract-file-state.js` | `findLastSnapshotContent(text, file)` | File-history-snapshot lookup |
| `git-file-state.js` | `extractSessionMetadata(text)` | Session git branch + cwd |

The `buildFileStateHistory` step objects are the core data model for the debugger. Each step captures:

```js
{
  type: 'create'|'update'|'edit',
  filename: 'app.py',
  contents: '<full file content AFTER this edit>',
  expectedState: '<what the engine expected BEFORE this edit>',
  actualState: '<what the file actually was, from originalFile/snapshot>',
  isUserEdit: true|false,
  edit: { oldString, newString } | { content },
  jsonl: { line: 42 },
  timestamp: null
}
```

## Features

### 1. Folder Mode — Load a JSONL Project Directory

**Input:** Path to a Claude projects directory (e.g., `~/.claude/projects/-Users-...`)

**Behavior:**
- Scan all `.jsonl` files in the directory (and optionally subdirectories for subagent sessions)
- For each JSONL file, run `extractEditsFromJSONL` to discover which files it edits
- Build a unified file index: `{ basename → [{ jsonlFile, filePath, editCount, sessionId, gitBranch }] }`

**UI:** File picker or path input, like the existing "Open JSONL" button but for directories.

### 2. File List Panel — All Modified Files

**Displays:**
- Every file touched by any JSONL session in the directory
- Per file: basename, full path, number of sessions that edit it, total edit count
- Color-coded status: PASS (green), MISMATCH (red), NOT_FOUND (gray), UNTESTED (white)
- Sortable by name, edit count, status
- Filter by status, file extension, or search

**Data flow:** For each file, optionally run `replayAndVerify` against on-disk content to populate status. This could be lazy (verify on selection) to keep initial load fast.

### 3. Step-Through Debugger — The Core Feature

When a file is selected, shows the full edit timeline from `buildFileStateHistory`:

**Layout:** Split view —
- **Left pane:** Step list (vertical timeline). Each step shows: step number, type (create/edit/update), kept/ignored badge, source annotation, isUserEdit flag, JSONL line number (clickable → jumps to that line in the main viewer)
- **Right pane:** Content view for the selected step

**Content view shows (for each step):**

1. **Before state** (`expectedState`) — what the engine thought the file looked like before this edit
2. **After state** (`contents`) — the file content after applying this edit
3. **Diff** — inline or side-by-side diff of before→after, using the existing `lineDiff` / `renderSxsDiff` / `renderInlineDiff` code from the viewer
4. **Edit details** — the raw `oldString`/`newString` for edit-type, or `content` for create/update
5. **Actual state** (`actualState`) — what the file actually contained according to independent sources (originalFile, snapshot). Highlighted when it differs from `expectedState` (= user edit detected)
6. **Source annotation** — which data source produced this edit: `toolUseResult` (Write/Edit tool), `cat` (Bash cat), `read` (Read tool), `snapshot` (file-history-snapshot). Displayed as a colored badge.

**Navigation:**
- Step forward / back buttons
- Jump to first mismatch (where `expectedState !== actualState`)
- Jump to user-edit steps (`isUserEdit: true`)
- Keyboard arrows

### 4. Divergence Highlighting

When `actualState` is available and differs from `expectedState`, highlight the step in red and show a three-way view:
- **Expected** (what the engine computed from prior steps)
- **Actual** (what `originalFile` or snapshot says the file really contained)
- **Diff** between expected and actual (= what the user changed)

This is the key debugging view: it shows exactly where and why reconstruction goes wrong.

### 5. Rewind Overlay

Steps that are classified as `ignored` (due to code-restoration rewinds) should be:
- Visually dimmed or struck through in the step list
- Still navigable (for debugging rewind classification)
- Annotated with which rewind caused them to be ignored

### 6. Multi-Session View

When a file is edited across multiple JSONL sessions, show all sessions in chronological order with session boundaries marked. Each session's steps are a distinct group. The "latest session wins" pattern becomes visible — you can see which session's reconstruction matches on-disk and which are stale.

### 7. On-Disk Comparison

At any step, a "Compare to on-disk" button shows a diff between the step's `contents` and the actual on-disk file. The final step's diff is the reconstruction result — MATCH or MISMATCH.

## Architecture Notes

### Browser-Side vs Server-Side

The existing viewer is a single HTML file with no server — it reads JSONL via `fetch` or file picker. For the debugger:

- **File listing and JSONL parsing** can run in the browser (already proven with 1800-line JSONL files in the viewer)
- **On-disk file reading** requires either: (a) a tiny Node.js HTTP server that serves file content from local paths, or (b) the user manually provides on-disk content via file picker. Option (a) is more practical since the existing viewer already uses `fetch` with path rewriting.
- **`buildFileStateHistory` and `extractEditsFromJSONL`** are pure JS functions that work in browser if bundled. No Node.js dependencies (no `fs`, `path`, `child_process`). `git-file-state.js` uses `child_process` but is only needed for git fallback — optional in the browser.

### Reuse from Existing Viewer

| Component | Reuse |
|---|---|
| CSS theme (dark, syntax colors) | 100% — same stylesheet |
| `lineDiff`, `renderSxsDiff`, `renderInlineDiff` | 100% — copy from viewer-diff.js |
| `syntaxHighlight`, `esc` | 100% — copy from viewer |
| Inspector panel resize/dock | 100% — same resize handle code |
| Filter bar + chip UI | Adapt for file list filtering |
| Rewind detection | Use `classify-edits.js` / `analyzeJSONL` instead of viewer's inline version |

### Module Bundling

The engine modules (`replay-edits.js`, `classify-edits.js`, `extract-file-state.js`, `file-state-history.js`) use `require()`. For browser use, either:
- Concatenate with a simple module wrapper (no build tool needed)
- Or use a `<script>` per module with a global namespace

The modules are small (88–500 lines each) and have no external dependencies.

## Existing Files to Reference

| File | Lines | Role |
|---|---|---|
| `JSONL-tree-viewer-v2-dev.html` | 1870 | Existing viewer — theme, layout, diff, inspector panel, rewind visualization |
| `replay-edits.js` | 500 | Core replay engine — edit extraction, replay, verify |
| `file-state-history.js` | 88 | `buildFileStateHistory` — the step-through data model |
| `classify-edits.js` | 90 | Rewind classification (kept/ignored) |
| `extract-file-state.js` | 372 | Cat/Read/Snapshot edit extraction |
| `detect-rewinds.js` | 165 | Rewind detection (also duplicated in the viewer) |
| `probe-projects.js` | 332 | Diagnostic probe — shows what full-path verification looks like |
| `test-helpers.js` | 185 | JSONL line builders for testing |

## Constraints

- All functions ≤15 lines, ES5 `var` style, files under 500 lines (see existing codebase conventions)
- The viewer is a single HTML file; if the debugger is separate, it should also be self-contained (or use a small number of `<script src>` includes for the engine modules)
- No npm dependencies — vanilla JS only
