## 2026-07-20:18:21:31 — Task 121: merge the git-derived baseline turn into its base-commit row
Chat title: Task 121 — baseline turn merged into its base-commit row
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/f18c7fb9-3f6f-4550-8253-6b5d556c6184.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-task121-merge-baseline-into-base-commit-row.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-task114-timeline-filter-buttons.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tasks.json (task 121 DECIDED entry, 2026-07-20)

### Design decisions

- Merge condition is a PREFIX match — `fullBaselineHash.startsWith(commitNode.resultHash)` — not
  equality: the gitBase beacon changeId carries the full 40-hex hash while a commit node's
  `resultHash` is the short hash echoed by the tool_result. The new-fixture test uses a full
  40-hex hash so the prefix rule is what the test proves.
- The merge lives in a new `webapp/views/timeline-baseline-host.ts` (findBaseCommitNode /
  claimBaselineHost / recordGitBaselineSnapshot) rather than inside timeline-nodes.ts: the jot
  hook's 250-line cap fired on timeline-nodes.ts (268 lines) — same split precedent as
  timeline-node-derive.ts. Its behavior is covered through buildTurnTimelineViewModel in
  tests/timeline-nodes-git-baseline.test.ts.
- The merged row keeps the COMMIT node's `when`/`sessionId` (the commit instant is its place in
  the timeline); only the flag, baseline text, and snapshots move onto it. `deriveNodeFileChanges`
  now keys on "owns snapshots" instead of node kind, so the merged commit row gets file chips
  while plain commits stay chip-less.
- The row dress reuses the existing `.role-pill.role-pill-git-derived-baseline` green CSS and the
  orange `.commit-pill` — zero CSS changes. The pill label string is single-sourced as
  `GIT_BASELINE_ROLE_PILL_LABEL` in timeline-labels.ts (used by computeRolePillLabel and
  appendCommitCells).
- The merged commit row is the ONE expandable commit row (checkRowIsExpandable returns
  `isGitBaseline === true` for commits); its bubble shows the baseline text + file chips via the
  normal renderFileButtonRow machinery, so chip clicks land in the task-56 baseline details pane
  unchanged (that pane keys on the chip's `gitBase:` changeId, not the node kind).
- `extractGitBaseCommitHash` MOVED from details-model.ts to timeline-changes.ts (the gitBase
  vocabulary's canonical home, next to GIT_BASE_CHANGE_ID_PREFIX/computeGitBaselineText); no
  re-export left behind — details-baseline.ts and the test import from the new home directly.

### Deviations

- Two extra 250-line-cap splits/trims the plan did not anticipate:
  - timeline-changes.ts went 2 lines over → the two already-retired commented-out orphan-proxy
    blocks (checkStepIsOrphaned / checkTurnIsOrphaned) moved to
    jfred/archive/timeline-changes-retired-orphan-proxies.ts (archive-don't-delete convention),
    one-line pointers left in place.
  - timeline-render-rows.ts went to 266 → the per-row cell builders (fork gutter cell, role
    classes, commit cells, triangle, { } button, bubble) split into
    webapp/views/timeline-render-row-cells.ts; buildTimelineRows keeps only the build loop.
- The chip → inspector chain (renderFileButtonRow, showCausingRecordForChip, openTurnInspector,
  openStepInspector) widened its `node` parameter from `TurnNode` to `TurnNode | CommitNode`, and
  checkBubbleShowsFileChips is a type predicate — the plan did not call these out; they fell out
  of the CommitNode union change during typecheck. Behavior for the merged row: no uuid → the
  gitBase changeId probe → the "no transcript line (synthetic change id)" fallback, identical to
  the old standalone baseline turn.
- tests/timeline-nodes-session-ends.test.ts needed one `!` (`synthetic.snapshots!.length`) —
  `snapshots` is optional across the widened TimelineNode union now.

### Tradeoffs

- Conversation filter mode no longer shows the baseline when merged (it is not a turn) — the
  accepted trade recorded in the task decision, pinned by
  test_merged_baseline_commit_row_leaves_conversation_mode.
- Header Prev/Next file navigation (findAdjacentFileTouchedIndex) walks agent turns only, so it
  skips the merged row — matching every other commit row; left as-is (not part of the decision).
- The merged row keeps the plain `git commit <hash> — <message>` details-pane header on row
  selection; only its chips open baseline content. Left as-is — header changes were out of scope.
- The merged row is a commit node, so it stays unpickable and stays a pick-segment hard stop
  (checkNodeIsPickable requires an agent turn) — the standalone fallback turn remains pickable as
  before.

### Open questions

- None blocking. Verification left to you (per instruction, no test suites were run by me):
  - `npm test` in RevEng/jfred — the hook already confirmed the new tests FAILED before the
    implementation (true RED); `npx tsc --noEmit` is clean.
  - Merge path: serve scenarios/executed/s85-git-commit-csv-and-move-scripts with reveng-paths.json
    `{ "repo": "scenarios/executed/s85-git-commit-csv-and-move-scripts", "baseCommit": "14e26eced65bfc384a65a533e87a0da11221726c" }`
    → the 'baseline' (14e26ec) commit row should be ONE merged row (green baseline pill, orange
    hash pill, "Files seeded from git base commit …" text, expandable file chips), and Git +
    Files filter modes should both show it.
  - Fallback path: `npm run demo:baseline` → the standalone green baseline turn still renders.
