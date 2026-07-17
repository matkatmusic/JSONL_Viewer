# Implementation Notes: Split jsonl-tree-viewer.html

Spec: `/Users/matkatmusicllc/.claude/plans/new-ability-viewer-select-partitioned-engelbart.md`

## 2026-06-02T10:37 — Starting implementation

**Baseline state:** `jsonl-tree-viewer.html` is 1189 lines, fully monolithic.
The `js/` subdirectory exists but is empty. No `.css` files present.
A prior session's module split was attempted but reverted/removed — starting clean.

### Design decisions

- **Comment style**: Each extracted JS file gets a single one-line header comment naming its purpose per spec. No other comments added or removed.
- **Exact code preservation**: All function bodies extracted verbatim — no logic changes, no reformatting, no variable renames.
- **Blank line handling**: Preserved original blank lines between functions for readability. Section-separator comments (e.g. `// -- Event handlers --`) dropped since the file split itself serves that purpose.
- **Forward references OK**: `viewer-load.js` references `decorateCompareCheckboxes` and `showInspect` (defined in `viewer-inspect.js`, loaded later). This is safe because those calls are inside `loadJSONL`/`jumpToField`, which only execute on user action after all scripts are loaded.

### Deviations

- **None** — the spec was detailed enough to follow exactly.

### Tradeoffs

- **Flat file layout vs. `js/` subdirectory**: The spec says all files go in the RevEng root alongside the HTML. The empty `js/` dir exists but the spec doesn't reference it. Following spec: files go in RevEng root. This keeps `<script src="viewer-globals.js">` paths simple (no subdirectory prefix).

### Open questions

- **None remaining.**

## 2026-06-02T10:40 — Verification complete

### Automated checks (all passed)

| Check | Result |
|-------|--------|
| All 7 JS files pass `node --check` | PASS |
| All JS files <= 250 lines | PASS (max: 213, `viewer-tree-build.js`) |
| HTML shell is 74 lines | PASS |
| All 9 files served via HTTP 200 | PASS |
| Script load order matches spec | PASS |
| All 23 top-level functions defined in correct dependency order | PASS |
| Total line count: 1174 (vs original 1189) | 15 lines saved from removing `<style>`/`<script>` wrappers |

### Line counts

| File | Lines |
|------|-------|
| viewer-globals.js | 53 |
| viewer-inspect.js | 98 |
| viewer-styles.css | 124 |
| viewer-diff.js | 127 |
| viewer-load.js | 150 |
| viewer-events.js | 162 |
| viewer-tree-render.js | 173 |
| viewer-tree-build.js | 213 |
| jsonl-tree-viewer.html | 74 |

### Browser test

- Page opens at `http://localhost:8765/jsonl-tree-viewer.html` via the existing `python3 -m http.server 8765`
- Manual visual verification required (gstack browse binary not built in this env)
- Full feature checklist from spec section "Verification" steps 3-6 should be confirmed by user
