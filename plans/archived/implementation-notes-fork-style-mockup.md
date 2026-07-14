## 2026-07-10:00:00:00 — Fork-style JFRED timeline viewer mockup
Chat title: fork-style-mockup
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/9c30c8bc-6435-4dc7-be24-4763e8f119b3.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/fork-style-mockup.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/styles.css (dark palette cues only; nothing linked)
/private/tmp/claude-501/-Users-matkatmusicllc-Desktop-claude-code-src/9c30c8bc-6435-4dc7-be24-4763e8f119b3/scratchpad/verify-mockup.js (headless verification script)

### Design decisions

- Console collapse is a `console-collapsed` class on `#rightcol`; CSS hides the console row and its splitter and shows the one-line status bar. No layout recomputation in JS.
- Splitters share one `makeSplitter(splitter, pane, axis, invert, minPx)` helper using pointer capture; the console splitter uses `invert` so dragging up grows the console.
- JSON syntax tint is a single regex over `JSON.stringify` output (marked with a `ponytail:` comment) — safe because input is always stringify-produced.
- Diff renderer parses hunk headers (`@@ -a,b +c,d @@`) to derive line numbers: new-file numbers for context/add lines, old-file numbers for removed lines.
- Tool-call messages serialize in the JSON view as `role: assistant` with a `tool_use` content block, approximating real Claude Code JSONL records.
- `L: n (of N)` uses 1-based timeline position over the fixed 17-row dataset.

### Deviations

None from the agreed spec.

### Tradeoffs

- Revision-card action buttons ("Show content", "Export this version", "Copy patch", "Export .patch", "Jump to timeline step") are decorative per spec; clicking one bubbles to the card and selects it, which reads naturally in a mockup.
- Some revisions reuse the same canned diff (e.g. two watcher.js revisions share `watcherDebounce`) to keep the hardcoded dataset small; visually indistinguishable from unique diffs.
- Timestamps are hardcoded display strings, not Date objects — no formatting logic needed in a mockup.

### Open questions

- None blocking. If this graduates from mockup to implementation, the splitter min-sizes (80px panes, 60px console, 140px details-left) were picked by eye and may want tuning.

## 2026-07-10:13:30:00 — Feedback rounds 1-3: diff modes, toolbar, sessions, script-runs, commits, picks, branch graph
Chat title: fork-style-mockup
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/9c30c8bc-6435-4dc7-be24-4763e8f119b3.jsonl

### Design decisions

- Timeline grew to 23 rows: 17 original + 3 script-runs (role "script", teal accent) + 3 commits (role "commit" reusing the message entry shape with a `hash` field). Rows 8-11 are the abandoned lane-2 branch (ORPHAN_START/ORPHAN_END constants).
- Columns diff view is a CSS grid (40px/1fr/40px/1fr); del/add runs are paired row-by-row, context appears on both sides, hunk headers span the full width. Mode persists to localStorage key `diffDisplayMode`.
- Contiguous picks: clicking a distant checkbox extends the range through everything between (the simpler of the two allowed options); commits have no checkbox and are skipped by the step count.
- Contributing-node highlight is computed dynamically (`findContributingRows`): walk back from the commit to the previous commit, intersect touched-file paths with the commit's changed files. Orange inset-border tint, distinct from blue selection; cleared on any non-commit selection and in File Revisions mode.
- Branch graph is pure CSS (absolutely positioned 2px rails + dots + one border-radius fork curve in a 30px gutter) — no SVG needed at this fidelity.
- Round 3 reversed round 2: commit rows have NO { } button and no JSON view; selecting one shows Fork-style commit details (changed files left, first file's diff right, `hash — message — timestamp` header).

### Deviations

- None from the round 1-3 specs as corrected (round 3 supersedes round 2's "keep { } on commits").

### Tradeoffs

- Commit 9e12f4a's second changed file is a fake `webapp/styles.css.map` reusing an existing canned diff, to satisfy "2-3 files per commit" without minting new diff data.
- Unchecking an interior picked row does nothing (extend-only model); a single picked row can be un-picked by clicking it again. Clear is the escape hatch, matching the decorative selectbar spec.

### Open questions

- None blocking.

## 2026-07-10:13:35:00 — Rounds 4-5: "git commit" label; Bash/ctx_execute tool-call rows
Chat title: fork-style-mockup
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/9c30c8bc-6435-4dc7-be24-4763e8f119b3.jsonl

### Design decisions

- Round 4: commit rows render `GIT COMMIT [hash] message` via a muted uppercase `.commit-label` span before the pill; commit details header now reads `git commit <hash> — <message> — <timestamp>`.
- Round 5: 3 new ordinary tool-call rows (no new row kind): `ctx_execute(parse timeline.js exports)` after the initial Read (row 3), `Bash(npx tsc --noEmit)` right before commit b3c7d0c (row 8), `Bash(git status --short)` right before commit 4fa08d2 (row 20). Timeline is now 26 rows (sessions 14/12); ORPHAN range shifted to rows 10-13.
- Tool-call JSON records now build structured `tool_use` input via `buildToolUse`: Bash -> `{command}`, ctx_execute -> `{query}`, file tools -> `{file_path}`.

### Deviations

- None. (Note: one Bash row, `Bash(npm run build:webapp)`, already existed from the original dataset; the round 5 request assumed none. Added the 3 requested rows regardless.)

### Tradeoffs

- `buildToolUse` keys the input field off the tool name with a 3-way branch; enough for the 5 tool names in the fake data.

### Open questions

- None blocking.
