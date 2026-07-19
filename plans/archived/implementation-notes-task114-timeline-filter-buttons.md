## 2026-07-17:00:50:00 — Task 114: Timeline event-type filter buttons
Chat title: task114-timeline-filter-buttons
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/dcd50248-af8f-4f9f-a6ad-b388ced9e804.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task114-timeline-filter-buttons-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- Single-select mode buttons (All | Conversation | Tools | Scripts | Files | Git), not
  multi-select checkboxes — matches the prior art (archive/diff/jfred-diff.html's 3-mode
  select). All six modes and the full predicate truth table are in the plan file.
- Filtering toggles `.tl-filtered-out` on the already-built `.tl-row` elements via
  `context.nodeRows` — no rebuild, no virtualization. A row's expansion pane is a child of
  its `.tl-row`, so hiding the row hides the expansion.
- Session-end nodes match EVERY mode (structural terminators anchoring each session's extent).
- Session-start markers are not nodes and stay visible in every mode — intentional, not a gap.
- Filter state is per-render (module-local): navigating resets to All; app-router re-hides the
  bar on every route change next to the existing #toggle-all skeleton-restore.
- Active-button CSS copies the existing `#diff-mode-toggle button.active` treatment
  (`--sel` background, `--accent` border) instead of inventing a new style.

### Deviations

- Plan step 5's conditional ("only if the stale-bar case actually exists") fired: other routes
  render into #view without touching the bar, so app-router.ts got the one-line re-hide.
- The spec's "use subagents where possible": implementation was done inline — five small,
  tightly-coupled files; per-file subagents would only have added handoff overhead. One Explore
  subagent was used earlier, during planning, to map the timeline modules.
- `npm test` was NOT run by instruction (tackle-tasks: user runs tests). However the repo's
  post-edit hook auto-ran the new test file: it failed while only the test existed (RED,
  module-not-found) and went silent after timeline-filter-model.ts landed (GREEN) — so the
  red-green cycle was observed anyway, just hook-driven. Both tsconfigs typecheck clean
  (`npx tsc --noEmit`, `npx tsc -p tsconfig.webapp.json`).

### Tradeoffs

- Hidden rows can include picked (selectbar) rows and files-prev/next jump targets; both are
  accepted non-goals per the plan — the filter is a view aid, not a selection model.
- No per-mode row counts on the buttons (the old JSONL-tree-viewer chips had counts); add only
  if asked.

### Open questions

- The post-edit hook flags pre-existing deep nesting in timeline.ts (149-171, 195) and
  app-router.ts (101) on every touch — untouched by design (surgical-changes rule); task 105
  already tracks that restructuring pass.
- Should the git-baseline synthetic turn (role pill "git-derived baseline") match the Git mode
  as well? Today it matches Conversation (it is a TurnNode) and usually Files (it carries
  baseline file changes), but not Git — Git shows only commit hard-stop rows. Flag if you want
  it in Git too.
