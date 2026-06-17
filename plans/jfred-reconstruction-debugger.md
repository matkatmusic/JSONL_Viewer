# Plan: JFReD — JSONL File Reconstruction Debugger

## Problem

The RevEng JSONL replay engine reconstructs files from Claude Code session transcripts. It currently achieves 572/1067 (54%) pass rate across 333 real-world JSONL files, with 81 true reconstruction failures (MISMATCH) and 414 files deleted after creation (NOT_FOUND).

Diagnosing the 81 real mismatches requires manually reading JSONL lines, mentally tracking edit sequences, and comparing accumulated state — too tedious for systematic debugging.

## Solution: JFReD — A Standalone Debugging Tool

A separate HTML tool (not part of the JSONL tree viewer) that lets you load a JSONL file, pick a target file, and step through its reconstruction one edit at a time.

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Toolbar: [Open JSONL...] [File: ▾ dropdown] Step 3/12 [◀][▶]   │
├──────────────┬───────────────────────────────────────────────────┤
│              │                                                   │
│  Step List   │  JSON Inspector (reusable component)              │
│  (timeline)  │  Shows raw JSONL edit record for selected step    │
│              │  - edit type, oldString/newString, originalFile   │
│  1. create ● │  - source annotation (toolUseResult/cat/read/snap)│
│  2. edit   ● │  - line number in JSONL                           │
│  3. edit   ◉ │  - syntax highlighted, collapsible                │
│  4. user!  ▲ │                                                   │
│  5. edit   ● │                                                   │
│              │                                                   │
├──────────────┴──────────┬───────────────────┬────────────────────┤
│                         │                   │                    │
│  PREVIOUS               │  COMPUTED         │  NEXT              │
│  (expectedState)        │  (contents)       │  (next expected)   │
│                         │                   │                    │
│  File state BEFORE      │  File state AFTER │  What the next     │
│  this edit was applied  │  applying this    │  step expects the  │
│                         │  step's edit      │  file to look like │
│                         │                   │                    │
│  When actualState       │  This is the      │  = next step's     │
│  differs from this,     │  engine's output  │  expectedState,    │
│  the step is flagged    │  for this step    │  or on-disk file   │
│  as a divergence        │                   │  if last step      │
│                         │                   │                    │
└─────────────────────────┴───────────────────┴────────────────────┘
```

### Top Half — Inspector + Timeline

**Left column: Step List (vertical timeline)**
Each step from `buildFileStateHistory` is a row showing:
- Step number
- Type badge: `create` / `edit` / `update`
- Status icon: ● kept, ○ ignored (dimmed), ▲ user-edit
- Source badge: `toolUseResult` / `cat` / `read` / `snapshot` (colored)
- JSONL line number (clickable)
- Divergence flag: red dot when `actualState !== expectedState`

**Right column: JSON Inspector (reusable component)**
The same syntax-highlighted, collapsible JSON inspector used by `JSONL-tree-viewer-v2-dev.html`, extracted into a shared module (`json-inspector.js`). Shows the raw JSONL edit record for the currently selected step, including:
- The full edit object (oldString/newString or content)
- The originalFile value (if present)
- Source metadata
- Jump links for tool_use IDs and UUIDs

### Bottom Half — Three-Pane File State View

Three side-by-side panes showing file content with syntax highlighting and line numbers:

| Pane | Data Source | Purpose |
|---|---|---|
| **Previous** | `step.expectedState` | What the engine thought the file looked like BEFORE this edit. When `step.actualState` exists and differs, shows a yellow divergence banner with a "Show actual" toggle that overlays the actualState. |
| **Computed** | `step.contents` | The engine's computed result AFTER applying this step's edit. This is what the engine produces. |
| **Next** | `steps[i+1].expectedState` or on-disk content | What the NEXT step expects the file to look like. For the last step, this is the on-disk file content (the verification target). Diff highlights between Computed and Next reveal where reconstruction breaks. |

**Diff mode:** Each pane pair supports inline diff highlighting:
- Previous↔Computed: shows what this step's edit changed (green/red)
- Computed↔Next: shows divergence going into the next step (should be empty if reconstruction is correct)

## Reusable Component: json-inspector.js

Extract from `JSONL-tree-viewer-v2-dev.html` (lines 1236–1301) and `viewer-inspect.js` into a standalone module:

```
json-inspector.js (~80 lines)
├── syntaxHighlight(jsonString) → HTML
├── addJumpLinks(html, opts) → HTML with clickable UUIDs/tool IDs
├── renderInspector(jsonObj, container, opts) → void
│   opts: { onJumpLink, highlightKeys: ['originalFile', 'old_string'] }
└── esc(string) → HTML-escaped string
```

Both JFReD and the tree viewer will `<script src="json-inspector.js">` this module. The tree viewer's inline copies of `syntaxHighlight`, `esc`, and `addJumpLinks` get replaced with calls to the shared module.

## Reusable Component: diff-engine.js

Extract from `viewer-diff.js` and `JSONL-tree-viewer-v2-dev.html` (lines 1397–1469):

```
diff-engine.js (~70 lines)
├── lineDiff(aLines, bLines) → ops[]
├── renderInlineDiff(ops) → HTML
└── renderSxsDiff(ops) → HTML
```

Both tools share this. The `esc()` function lives in `json-inspector.js` and is referenced globally.

## Data Flow

```
JSONL file (text)
    │
    ▼
extractEditsFromJSONL(text)     ← replay-edits.js
    │
    ▼
edits[] (all files, all sources)
    │
    ├─► Group by filePath → file picker dropdown
    │
    ▼ (for selected file)
buildFileStateHistory(fileEdits) ← file-state-history.js
    │
    ▼
steps[] (the timeline)
    │
    ├─► Step List (left column)
    ├─► JSON Inspector (right column, shows step.edit + raw JSONL line)
    ├─► Previous pane (step.expectedState)
    ├─► Computed pane (step.contents)
    └─► Next pane (steps[i+1].expectedState or on-disk)
```

## Features

### 1. JSONL Loading
- File picker button (same pattern as tree viewer)
- `?file=<path>` URL parameter with path rewriting
- Path bar for direct path entry

### 2. File Picker Dropdown
After loading a JSONL file, a dropdown lists every file modified in that session. Each entry shows:
- Filename (basename)
- Full path (tooltip)
- Edit count
- Quick status if on-disk comparison is available

### 3. Step-Through Navigation
- Forward/back buttons
- Keyboard arrows (← →)
- Jump to first divergence (where actualState !== expectedState)
- Jump to next user-edit step (isUserEdit: true)
- Jump to next ignored step

### 4. Divergence Detection
When `step.actualState` exists and differs from `step.expectedState`:
- Step list row gets a red divergence indicator
- Previous pane shows a yellow banner: "Actual state differs from expected"
- Toggle button switches Previous pane between expectedState and actualState
- The diff between expected and actual is available inline

### 5. Rewind Overlay
Steps classified as `ignored` by `classify-edits.js`:
- Dimmed in the step list with strikethrough
- Still navigable
- Annotated with "ignored — code-restoration rewind"

### 6. On-Disk Comparison (Last Step)
For the final step, the Next pane shows the on-disk file content. This requires either:
- A local HTTP server (same `python3 -m http.server` + symlink pattern used by the tree viewer)
- Or a "Paste on-disk content" textarea fallback

The diff between Computed (final) and Next (on-disk) = the verification result.

## File Structure

```
RevEng/
├── json-inspector.js        (NEW — reusable, ~80 lines)
├── diff-engine.js           (NEW — reusable, ~70 lines)
├── jfred.html               (NEW — the debugger tool, ≤500 lines)
├── jfred-layout.js          (NEW — pane layout + resize, ≤200 lines)
├── jfred-steps.js           (NEW — step list + navigation, ≤200 lines)
├── jfred-panes.js           (NEW — 3-pane file state rendering, ≤200 lines)
├── jfred-load.js            (NEW — JSONL loading + file picker, ≤200 lines)
│
├── file-state-history.js    (existing — buildFileStateHistory)
├── replay-edits.js          (existing — extractEditsFromJSONL)
├── classify-edits.js        (existing — analyzeJSONL for rewind classification)
│
├── viewer-diff.js           (existing — refactor to import diff-engine.js)
├── viewer-inspect.js        (existing — refactor to import json-inspector.js)
└── JSONL-tree-viewer-v2-dev.html  (existing — refactor to use shared modules)
```

## Browser Module Strategy

All modules use browser globals (no `require()`, no build tools). Each `<script>` tag exposes functions on `window`:

```html
<!-- Shared reusable components -->
<script src="json-inspector.js"></script>   <!-- window.syntaxHighlight, window.esc, ... -->
<script src="diff-engine.js"></script>      <!-- window.lineDiff, window.renderInlineDiff, ... -->

<!-- Engine modules (browser-compatible wrappers needed) -->
<script src="replay-edits-browser.js"></script>  <!-- window.extractEditsFromJSONL -->
<script src="file-state-history-browser.js"></script>  <!-- window.buildFileStateHistory -->
<script src="classify-edits-browser.js"></script>  <!-- window.analyzeJSONL -->

<!-- JFReD-specific modules -->
<script src="jfred-load.js"></script>
<script src="jfred-steps.js"></script>
<script src="jfred-panes.js"></script>
<script src="jfred-layout.js"></script>
```

The engine modules (`replay-edits.js`, etc.) use `require()` for Node.js. Browser wrappers are thin shims that make the same functions available as globals. Alternatively, the engine functions can detect `typeof module !== 'undefined'` and conditionally export.

## Constraints

- All functions ≤15 lines
- ES5 `var` style
- Each file ≤500 lines
- No npm dependencies — vanilla JS only
- Self-contained HTML (loads sibling .js files via `<script src>`)

## Implementation Phases

### Phase 1: Extract Reusable Components
1. Create `json-inspector.js` from viewer's `syntaxHighlight`, `esc`, `addJumpLinks`
2. Create `diff-engine.js` from viewer's `lineDiff`, `renderInlineDiff`, `renderSxsDiff`
3. Update `JSONL-tree-viewer-v2-dev.html` to use the shared modules
4. Verify tree viewer still works identically

### Phase 2: Browser Wrappers for Engine Modules
1. Add `typeof module !== 'undefined'` guards to `replay-edits.js`, `file-state-history.js`, `classify-edits.js`
2. Test that Node.js `require()` still works (run existing test suite)
3. Test that browser `<script src>` loading works

### Phase 3: JFReD Shell
1. Create `jfred.html` with the 4-quadrant layout (CSS grid)
2. Create `jfred-layout.js` for resize handles between quadrants
3. Wire up JSONL loading (`jfred-load.js`) with file picker and URL params
4. Wire up file dropdown population from `extractEditsFromJSONL`

### Phase 4: Step Timeline + Inspector
1. Create `jfred-steps.js` — render step list from `buildFileStateHistory`
2. Wire JSON inspector to show raw edit data for selected step
3. Implement keyboard navigation and jump-to-divergence

### Phase 5: Three-Pane File State View
1. Create `jfred-panes.js` — render Previous/Computed/Next content
2. Add diff highlighting between pane pairs
3. Add divergence banner and actual/expected toggle on Previous pane
4. Add on-disk comparison for final step

### Phase 6: Polish
1. Rewind overlay (dimmed ignored steps)
2. Step filtering (by type, by status)
3. URL deep-linking (`?file=...&target=...&step=3`)
