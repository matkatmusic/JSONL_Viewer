## 2026-07-20:09:45:00 — Task 123: Files pane Fork-style nesting + indent guides
Chat title: jfred file-nav visual task (task 123)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/773cfb4e-40b6-4524-87ca-26b01a4e6882.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task123-files-pane-indent-guides.md
/private/tmp/claude-501/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/773cfb4e-40b6-4524-87ca-26b01a4e6882/scratchpad/indent-guides-mockup.html (user-approved mockup)

### Design decisions
- Vertical guide = `border-left` on one `.file-folder-kids` wrapper div per folder (new, sidebar.ts), not per-child borders — a per-child border would break into visible segments on `.deleted` rows (opacity 0.55).
- Native `<details>` marker hidden (`list-style: none` + `::-webkit-details-marker`); chevron+icon drawn as one fixed 34px `::before` column ("▸ 📁" / "▾ 📁") so column width is deterministic across browsers.
- Indent math: summary text at 10+34=44px; child text at 16(kids margin)+10+13+21=60px for files and 16+10+34=60px for folders — every child name exactly one 16px step right of its parent's name.
- Kids wrapper hoisted to a `const kids` local in `renderFileTreeNode` — the jot deep-nesting hook flagged the inline form at 4 indent units.

### Deviations
- None from the plan. Old CSS block commented out (not deleted) per standing comment-out-don't-delete rule.

### Tradeoffs
- Hover/selection background now starts at each row's indented box, not the pane edge (same as the approved mockup). Full-bleed Fork-style selection would need depth-variable padding instead of margins — skipped as over-engineering.
- No new test file: change is DOM grouping + CSS only; sidebar.ts registers a module-level `document` listener so it cannot import under `node --test` (the pre-existing task-122 convention gap — the jot hook's "no test file for sidebar.ts" warning is that same gap, not new debt).

### Open questions
- Pixel tuning: emoji metrics vary by platform. If 📄/📁 columns look off in the real app, tune only the two `::before` widths (21px/34px) and the 16px step, keeping child-name = parent-name + one step. Verify visually with jfred's `npm run app` against s87 (both the FILES sidebar and the details "Files touched" tree share these classes).
