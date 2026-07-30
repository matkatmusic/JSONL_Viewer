## 2026-07-29:02:55:00 — Tasks 319 + 320 (split-diff markers, drawer full-content toggle)
Chat title: tackle-tasks [319,320,323,324]
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/13072f49-55f1-4b9e-a388-503560e954a9.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-319-split-diff-markers.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-320-drawer-full-content-toggle.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/layer1-mockup.html

### Design decisions
- 319: sign derived in the renderer (`appendSplitCellPair`) from the cell class, rendered through the existing `appendMarkedCode`, so the marker stays plain text outside the hljs span. The model (`computeSplitRows`) keeps emitting stripped text — its tests pin that shape and other consumers rely on it.
- 319: marker is the bare unified char (`+x`), matching the shipped inline view, not the mockup's `+ x` (sign + extra space). The parity audit only faulted the missing marker.
- 320: full context rides the existing `/api/layer1-diff` route as `context=full`, reusing `FULL_FILE_CONTEXT_LINES` — same mechanism as the Revision Viewer's item-75 toggle. Toggling re-fetches (context width is a server-side git flag), then re-renders in the active side/inline layout.
- 320: the toggle's state persists across pairs for the session (module scope), like the Revision Viewer's stored preference; it is not reset per pair.
- 320: `renderTargetContent` + `buildSideFileParams` deleted — the "target bytes" view is exactly what a plain node click already shows.

### Deviations
- None from the plans. `webapp/views/diff-vs-base.ts` (its own split renderer) deliberately untouched — different view, not named by task 319.

### Tradeoffs
- 319 in the shared renderer vs the model: renderer chosen to avoid rewriting the model's pinned tests and the second consumer in diff-vs-base.ts.

### Open questions
- Should `webapp/views/diff-vs-base.ts` (the vs-base view's independent split grid) also gain markers? It was outside task 319's scope but now renders differently from the shared renderer.
- 320: with full content on, "export as patch" exports the full-context diff (still git-apply-able). Acceptable?
