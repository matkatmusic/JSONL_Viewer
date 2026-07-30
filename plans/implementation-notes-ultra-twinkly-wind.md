## 2026-07-30:07:50:00 — Task 328/329 tweaks (8 Detail-view/File-Nav fixes)
Chat title: ultra-twinkly-wind
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/1d754979-d0fb-4960-846f-6d553bb068bc.jsonl

### References
/Users/matkatmusicllc/.claude/plans/ultra-twinkly-wind.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/328-multi-file-drawer-mockup.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-task-328.md

### Design decisions
- Item 1: the tools row (mode buttons, full-content, export) is NOT appended to the DOM for a lone
  selection, instead of `hidden = true` — the user's screenshot showed the checkbox visible despite
  the existing `fullLabel.hidden = true`, matching the known "CSS display overrides [hidden]" trap.
- Item 3 (user picked): the drawer header keeps the filename; the lone section's name plate is
  removed; section meta drops the path; the shift-pair path's #dmeta shows "N revisions" instead of
  the bare path (screenshot 2 showed the name 4×, not 3×).
- Item 6 (user picked): image sections render the target revision as a plain picture via the
  existing renderImageInto — no image-vs-image diff. DiffStep gained `buildParams` so the image
  branch can reuse each revision source's existing URL closure.
- Item 7: equal sides always fetch context=full (known behavior: identical sides + full context
  returns a synthesized full-content hunk); the full-content checkbox is forced checked + disabled
  while sides are equal.

### Deviations
- No subagents: 10 small interlocking edits across 7 files (a shared type change threads through
  4 of them); parallel agents would collide on layer1-diff-view.ts. (Also the known ~40% agent-spawn
  classifier denial rate.)
- tests/layer1-drawer.test.ts updated to the new lone-pane contract: `.dfile-path` asserted ABSENT
  (was: present with data-target), full-content toggle and mode buttons asserted out of the DOM
  (was: toggle hidden-but-present).
- The comment-reflow hook required shortening 1-2 pre-existing long comments per CSS file touched:
  layer1-styles.css `.sources` comment and styles.css item-66 vars comment were condensed
  (wording only, no rule changes).

### Tradeoffs
- Lone section keeps its (now name-less) summary row so <details> collapse still works, rather than
  restructuring the section for the single case — uniform DiffView(file) per the user's 2026-07-30
  architecture feedback.

### Open questions
- 5 PRE-EXISTING test failures (present before this work, in the staged 330/331 batch's files,
  none import anything touched here): tests/layer1-source-paths.test.ts ×3 (undefined .jsonl /
  .fileHistory), tests/list_capture_free_tests.test.ts (EISDIR on a directory import),
  tests/viewer_api_layer1_fixture.test.ts (axis offsets "node 5 descends"). Should these be fixed
  before the 328-331 batch commits?

### Follow-up (2026-07-30:09:05) — feedback round 2 (328.3/328.7 residue + fold triangle)
- 328.3: node-click #dmeta strings dropped the path entirely — now "git show <hash>",
  "working tree", or "file-history @vN of <session>" (the header names the file once; full path
  stays in the header tooltip).
- 328.7: with equal sides the section's "base X → target Y" meta is now empty (the pair label
  already names the revision); `.dbody .dmeta:empty { display: none; }` collapses the row.
- Fold affordance: multi-file sections get a ▸/▾ triangle via CSS
  (`details.dfile:not(:only-child) > .dfile-head::before`); a lone section shows no triangle,
  gets `cursor: default`, and its summary click is preventDefault-ed so it can never fold.
- Verified: typecheck clean, npm test green except the same 5 pre-existing failures, dist rebuilt.

### Follow-up (2026-07-30:08:45) — tools row keyed to CONTENT equality
User feedback with screenshot: multi-select sections still showed the mode/full buttons while
displaying one revision. Reworked per the user's direction: the DiffView pane now compares the two
loaded strings — `identicalSides = base === target` (set in loadDiffText) — and hides the whole
tools row, locks the full-content toggle, and forces context=full whenever the strings match
(covers both same-revision-twice AND no-change-between-revisions). The row is born hidden and only
revealed when a loaded pair actually differs, so it never flashes in before the fetch decides.
The user's pseudocode read `showDiffButtons = (baseString === targetString)`; the prose ("hidden
when the same") is the intent, so the flag is inverted in code. Export-as-patch sits in the same
row and is equally useless on an empty diff, so it hides with it.
Verified: typecheck clean, npm test green except the same 5 pre-existing failures, build:webapp done.

### Verification (2026-07-30 ~08:00)
- typecheck: clean. npm test: only the 5 pre-existing failures above remain; the drawer suite is
  green. build:webapp: done (dist rebuilt). npm run visual: 6 states, 958 bubbles, 0 violations.
