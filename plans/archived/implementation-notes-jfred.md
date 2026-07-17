# Implementation Notes: JFReD (JSONL File Reconstruction Debugger)

Spec: `/Users/matkatmusicllc/.claude/plans/show-me-the-plan-mighty-sonnet.md`

---

## 2026-06-05T18:05 — Phase 1 Start

### Design Decision: json-inspector.js `addJumpLinks` signature

The spec says `addJumpLinks(html, opts)`. The existing tree viewer v2-dev has `addJumpLinks(html, excludeLineIdx)` with hardcoded globals (`UUID_TO_LINE`, `TOOL_ID_TO_LINES`). The v1 viewer-inspect.js embeds jump logic directly in `showInspect`.

**Decision:** The reusable version accepts an opts object with lookup maps:
```
addJumpLinks(html, opts)
  opts.uuidMap   — object keyed by UUID (value = target line index)
  opts.toolIdMap — object keyed by tool_use ID (value = [line indices])
  opts.selfIdx   — line index to exclude from self-links
```
Consumers pass their own maps. JFReD won't have these maps initially (it works with step objects, not raw JSONL lines), so it can skip `addJumpLinks` or pass empty maps.

### Design Decision: diff-engine.js truncation cap

The v1 `viewer-diff.js` has a `CAP = 2500` line truncation with a `showToast` call (a UI function). The v2-dev inline version has no cap.

**Decision:** `diff-engine.js` includes the cap but returns a `{ ops, truncated }` object instead of calling UI functions directly. Consumers can check `truncated` and show their own toast/warning. Default cap = 2500.

**Update:** Simpler approach — keep the function signature as `lineDiff(a, b)` returning ops[] directly, with internal cap. No toast dependency. The cap silently truncates, matching v2-dev behavior. If truncation notification is needed later, it can be added.

### Design Decision: diff-engine.js private `_esc()`

diff-engine.js has its own private `_esc()` function instead of depending on json-inspector.js. This avoids the cross-module dependency dance in Node vs browser (require paths, load order issues). It's 3 lines of identical logic — a private implementation detail, not a public API duplication.

## 2026-06-05T20:20 — Phase 1 Complete, Phase 2 Complete

Phase 1: Created `json-inspector.js` (69 lines, 17 tests) and `diff-engine.js` (88 lines, 14 tests). Updated tree viewer to use shared modules via `<script src>`. Added `viewerJumpLinks()` wrapper in tree viewer that passes viewer globals to the generic `addJumpLinks()`.

Phase 2: Added `typeof module !== 'undefined'` guards to all 6 engine modules (jsonl-parse, extract-file-state, git-file-state, classify-edits, replay-edits, file-state-history). All 103 unit tests pass, 29/29 scenarios match.

### Pre-existing hook warnings (not introduced by this work)
- `jsonl-parse.js` 333 lines (limit 300), deep nesting at line 12
- `extract-file-state.js` 377 lines (limit 300), deep nesting at line 327
- `replay-edits.js` 505 lines (limit 300)
- `classify-edits.js` deep nesting at lines 29-31

## 2026-06-05T20:25 — Phases 3-5 Complete

### Design Decision: 2-half layout (not 4-quadrant)

User requested "build it as 2 halves, not 4 quadrants." Changed from CSS grid with 4 quadrants to flexbox with:
- Top half: step list (fixed 220px width) + inspector area (flex 1), side by side
- Bottom half: three equal panes (Previous | Computed | Next)
- Single horizontal resize handle between halves

### Design Decision: Combined Phases 3-5

Since the JFReD modules are all browser-only and the step/pane logic is tightly coupled to the layout, I implemented Phases 3, 4, and 5 together rather than as separate passes. The modules are small enough (77-165 lines each) that this was cleaner than building placeholders.

### Files Created
- `jfred.html` (265 lines) — layout, CSS, script tags
- `jfred-load.js` (129 lines) — JSONL loading, file picker, file dropdown
- `jfred-steps.js` (165 lines) — step timeline, tab switching, keyboard nav
- `jfred-panes.js` (77 lines) — three-pane rendering, divergence highlighting
- `jfred-layout.js` (33 lines) — resize handle

### Deviation: diff-engine.js private `_esc`

diff-engine.js uses a private `_esc()` instead of importing from json-inspector.js. This avoids cross-module dependency complexity for a 3-line function.

### Open Questions

1. **Browser testing:** The gstack browse tool was not set up, so JFReD was tested with `node -c` syntax checks and opened manually via `open` command. Manual browser testing is recommended.

2. **On-disk comparison for last step:** The Next pane shows "(last step — on-disk comparison not yet loaded)" for the final step. This requires either a local server fetch or a paste fallback. Not yet implemented (Phase 6 scope).

3. **Rewind overlay:** Steps classified as "ignored" are not yet visually dimmed in the step list (Phase 6 scope).

## 2026-06-06T00:10 — Fix: MISMATCH badge moved to Previous pane

### Deviation from Plan

The plan specified MISMATCH highlighting on the **Computed** pane, comparing `step.contents` (post-edit) against `step.actualState` (pre-edit ground truth). This was comparing apples to oranges — they'd naturally differ after any edit.

**Fix:** The MISMATCH badge and diff highlighting now appear on the **Previous** pane, comparing `step.expectedState` (what the engine thinks the file was before the edit) against `step.actualState` (what `originalFile` says the file actually was). This is the meaningful divergence check: when the engine's model of the file disagrees with ground truth, all subsequent edits are applied to the wrong base.

The Computed pane now shows plain content (the engine's output after applying the edit) with no badge — its correctness follows from the Previous pane's comparison.

## 2026-06-06T00:05 — Converted JFReD to ES Modules

User requested modern JS (ES6+) instead of ES5. Converted JFReD-specific files to ES Modules with `const`/`let`, template literals, `import`/`export`. Imperative style (no arrow functions) per user preference. Engine/shared modules stay as CommonJS regular scripts for Node test compatibility.

Also fixed: function name collision (`parseJSONLLines` in both replay-edits.js and jsonl-parse.js), unguarded `require.main === module` checks, and unguarded `require('os')` calls in extract-file-state.js.
