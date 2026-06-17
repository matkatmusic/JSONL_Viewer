# Implementation Notes: JSONL Diff Viewer

Spec: `/Users/matkatmusicllc/.claude/plans/this-functionality-is-building-synthetic-dove.md`

## Phase 0 — Already Done (prior session)

All refactoring was completed previously. Verified: all 4 common/ modules exist, alllines decoupled, state fields added, 26/26 tests pass.

## Phases 1-4 — 2026-06-07T19:30

### Design decisions

**Merged Phases 1-4 into one pass.** Each phase was thin wiring once the common modules were in place. Total new code: 492 lines across 4 files.

**Base state resolution order.** Spec says: git -> snapshot -> Read. Implemented: snapshot -> Read -> first-step-expectedState -> empty. Added `first-step` fallback — if the reconstruction engine computed the pre-edit state, use it rather than returning empty.

**Snapshot content.** Snapshot base states return a placeholder `(snapshot ref: <backup>)` because the backup files live in `~/.claude/file-history/` and aren't browser-accessible. Phase 5's server component will resolve this.

**File tree collapse chains.** Single-child directory chains are collapsed (e.g., `src/components/` instead of nested `src` > `components`). Matches how git GUIs show sparse trees.

**Filter mode.** "Show All" highlights file-relevant rows with `.al-file-relevant` CSS class. "File Only" hides non-relevant rows via `display:none`. Toggle button in the alllines pane header.

### Files created

| File | Lines | Purpose |
|---|---|---|
| `diff/jfred-diff.html` | - | 2-section layout scaffold, toolbar, script loading |
| `diff/jfred-diff-main.js` | 231 | Wiring: load, file select, step nav, diff panes, filter toggle |
| `diff/jfred-diff-tree.js` | 120 | Hierarchical file tree with chain collapsing |
| `diff/jfred-diff-base.js` | 72 | Base state cascading resolution |
| `diff/jfred-diff-layout.js` | 69 | Resize handles for all split panes |
| `diff/jfred-diff-styles.css` | - | Layout CSS + tree styles |

### Verification

- All imports resolve (9 in main, 1 in base, 0 in tree/layout)
- All HTML script references valid (13 scripts)
- Existing tests: 26/26 passing (replay-edits + detect-rewinds)
- No stale import paths found

### Open questions

1. **Snapshot content access**: Snapshots reference backup files on disk. Should Phase 5's server also serve `~/.claude/file-history/` backups, or should we extract snapshot content from the JSONL itself?
2. **Git commit picker UX**: Phase 5 needs a local server for `git log`/`git show`. Should this be a standalone `tools/jfred-serve.js` or integrated into an existing dev server?
