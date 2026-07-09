## 2026-07-09:00:55:00 — TASKS.md items 47, 48, 49, 50, 51, 52 (webapp/viewer fixes)
Chat title: tackle-tasks items 47-52
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/69cd834e-de12-40df-952b-351876d7005b.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/items47-52-webapp-viewer-fixes.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md

### Design decisions

- (pre-implementation, user-answered via AskUserQuestion) 47b: chip `{ }` retargeted to the
  bubble's own message line; 49: vendor highlight.js; 51: shell out to real `git diff
  --no-index`; 52: distinct bubble/border color PLUS "tool call"/"tool result" tag.
- 52 tag semantics: file chips present → "tool result" (chips show results); git rows only →
  "tool call" (git rows are the Bash calls). A step with both gets "tool result".
- 51: block bodies come from git; the revision-KIND block headers (`@@ changed @ ts @@`)
  stay engine-produced so `splitDiffBlocks`/`startsRevisionBlock` keep working unchanged.
- 52: `computeToolActivityTag` takes a narrow structural parameter (kind/text/fileChanges/
  gitOperations) instead of the full `TurnNode` so tests hand-build lean literals; the call
  site passes the real node unchanged.
- 50: `block: "center"` (not `"nearest"`) — the task asks for the selected message to stay
  centered; applied to USER_TURN, AGENT_TURN, and SESSION_END click handlers (the two turn
  handlers share one body via replace-all, so both got the identical tail).
- 49: theme CSS files are media-gated (`prefers-color-scheme`) `<link>` tags — the app styles
  both palettes and has no JS theme toggle, so the native attribute is the whole solution.

### Deviations

- 51 (subagent): `tests/reconstruction_render.test.ts` was edited although not in the plan's
  file list — plan section 51.4's grep clause covers it (it asserts directly on
  `renderDiffWithContext` output). Two assertions updated after verifying the new shapes
  against real `git diff --no-index` output: creation header `@@ -0,0 +1,1 @@` →
  `@@ -0,0 +1 @@` (git shortens count-1 sides) and a `!includes("line 1\n")` check that now
  collides with legitimate function context in the header.
- 51: tsc raised no unused-symbol errors after the call-site swap, so the old pure-TS hunk
  helpers (`computeAlignedDiffLines`/`computeHunkRanges`/`renderHunk`) remain in place
  uncommented (plan allowed either outcome); only the call lines carry the `(item 51)`
  comment-out.

### Tradeoffs

- 51: one `git diff` spawn per revision per /api/diff request (no memo) — ponytail comment
  in `src/render_git_diff.ts` names the upgrade path (content-hash memo) if latency matters.
- 51: git merges/compacts context windows differently from the old renderer (s84
  `core_inventory.py` block 4: 52 → 25 lines) — accepted; the content is git-canonical.
- 47b: with `{ }` retargeted to the bubble's line, the chip `{ }` now duplicates the
  row-click target; kept as an explicit affordance rather than removed (removal is a user
  call). `showRevisionJson`/`findRevisionResultLine` are commented out, not deleted.

### Open questions

- None blocking. Verified end-to-end headlessly: s84 `renderRevisionDiff` emits 5 blocks for
  5 revisions with function-context headers (`@@ -7,6 +7,11 @@ def add_item(items, name, qty):`).
  The test suite was intentionally NOT run (user's standing instruction) — new/changed tests:
  `tests/render_git_diff.test.ts` (new), `tests/highlight.test.ts` (new),
  `tests/timeline-viewmodels.test.ts` (+6), `tests/viewer-viewmodels.test.ts` (+2),
  `tests/reconstruction_render.test.ts` (2 reconciled). Restart any long-running viewer
  server to see the changes (`webapp/dist/` is rebuilt).
