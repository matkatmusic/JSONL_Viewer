## 2026-07-21:08:55:00 — Tasks 142/143/144/145 (inspector stepper disable, rename-pair collapse, per-file script-run diffs, s85 rename-badge investigation)
Chat title: tackle-tasks 142 143 144 145
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/85ce26a5-ce44-41da-ab9d-90d817434cc7.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-142-143-144-145-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tasks.json (tasks 142–145, all still OPEN — closure after the user's test run)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/scenarios/executed/s85-git-commit-csv-and-move-scripts/ (task-145 evidence scenario)

### Design decisions

- **Task 145 root cause (the headline finding).** The missing rename badge was the visible tip
  of a wholesale gap: s85's parallel tool-call turn (`Write one.py` + `Write two.py`, one API
  response split into sibling JSONL records sharing `message.id`) forks the parentUuid chain,
  and the surviving-trunk ancestor walk dropped the `Write two.py` record and its tool_result.
  With `two.py` missing from the branch-selected records, the script sandbox's pre-state was
  incomplete, `move_files.py` crashed in the sandbox (`post=undefined`), and neither
  `beaconlessScriptExecutions` nor `discoverScriptCreatedPaths` produced anything — the
  document had NO `core_*.py` histories at all. The tmpdir-regression hypothesis from the task
  description was ruled out first: `check_scenario_coverage.ts s85…` passes 10/10 with the
  recorded tmpdir (`/var/folders/.../run-scenario.o1fs4eqs`) gone, because the checker runs
  over the FULL record set with no branch selection.
- **Fix shape for 145:** `absorbParallelToolCallSiblings` (new
  `src/reconstruction_trunk_absorb.ts`, called from `collectSurvivingTrunkUuids`) absorbs
  (1) assistant records sharing a trunk assistant record's `message.id`, then (2) to a fixed
  point, tool_result-only user records and attachment records parented on absorbed records. A
  real rewound branch cannot match either rule (different message.id; prompt-first diverging
  record) — guarded by `test_absorb_does_not_swallow_a_real_rewound_branch` and the existing
  branch/fork/tree suites (21/21 pass).
- **Task 143 collapse lives in the engine** (`computeRunFileOutcome` +
  `matchRenamePairs`), not the webapp: only the sandbox pre/post states can prove a delete
  whose content reappears at a created path is one move. The wire's `changedPaths` now hold
  destinations only (s85 pill: "modified 3 file(s)"), and the pairs ride alongside as the new
  `renamedPaths` field (`ScriptRenamePair` engine-side, optional `WireRename[]` webapp-side).
- **Task 145 badge via the wire pairs, not lineage surgery:** `buildFilesSidebarViewModel`
  falls back to `findScriptRenameSource` (scan `scriptRuns[].renamedPaths`) when a history has
  no rename revision. This reuses 143's proof and avoids re-keying histories in
  reconstruction_lineage — see Open questions for the residue.
- **Task 144:** the script-run pane now has a "Files changed" button list on the left (rev-card
  pattern); clicking shows just that file's diff via the existing `appendChangedFileDiff` /
  `fetchRevisionDiffBlocks` machinery. First file auto-selected; `.row-btn.selected` styled
  like the rev-card selection.
- **Task 142:** only the inspector stepper needed work — the timeline header's four nav
  buttons already disable correctly (task-131 work in `wireFileNavButtons`). Exported
  `computeInspectorNavDisabledStates` (the `formatInspectorLineCounter` testability precedent);
  disabled set by property assignment because `setAttribute("disabled", "false")` still disables.

### Deviations

- The plan's Phase B put `matchRenamePairs` in `reconstruction_script_runs.ts`; the 250-line
  hook forced the split — it lives in `reconstruction_script_renames.ts` (the rename-evidence
  home), with `isJunkStateKey` moved to `reconstruction_script_sandbox.ts` so no import cycle
  forms. Same forced split for `absorbParallelToolCallSiblings`
  (`reconstruction_trunk_absorb.ts`), the badge machinery
  (`webapp/views/timeline-file-badges.ts` — `applyRenameBadgeLabels` import sites in
  `details.ts` and `tests/timeline-file-tree.test.ts` updated), and
  `WireJsonlFile`/`WireProjectListing` (moved from timeline-types.ts to their consumer
  `timeline-sessions.ts`; imports in timeline.ts / timeline-render-context.ts updated).
- `tests/webapp-dom-test-helpers.ts` gained a `CSS: { highlights: new Map() }` global — the
  task-127 find widget's CSS Custom Highlight API is absent from happy-dom and
  `clearRightPaneBody` crashes without it. Harness gap, fixed for all future DOM tests.
- Per the user's instruction the FULL suite was not run. Per-file red-green runs (the Stop hook
  runs edited test files automatically, plus targeted single-file runs) all pass: inspector 2,
  script-run-changes 7, reconstruction_trunk 3 (new), branch/fork/tree 21,
  timeline-file-tree(+sidebar) 25, details-script-run 3 (new). `tsc --noEmit` and
  `npm run build:webapp` exit 0.

### Tradeoffs

- Greedy content-matched pairing in `matchRenamePairs` (first unclaimed deleted key wins). Two
  deleted files with identical bytes and one created copy pick an arbitrary source — accepted;
  content equality is the only evidence the sandbox diff offers.
- The badge fallback's suffix match mirrors `resolveChangedFileEntry`'s cwd-relative join
  rather than exact equality — consistent with how the pane already resolves the same paths.
- s85 empirical verification: wire document now has 9 filesTouched (was 5) — `two.py` plus
  `core_one/two/three.py` (script-execution revisions) — the move run's changedPaths is the 3
  destinations, and the checker still reports `OK s85 10/10`.

### Follow-up fix (2026-07-21:09:10) — user's test run caught one over-fire

`test_collect_orphaned_uuids_keeps_rewound_branch_with_content` failed: the absorb's rule (2)
pulled TR1 — a dead-end tool_result whose child is a real assistant TEXT reply (the rtk
hook-rewrite fork the orphans suite dims) — onto the trunk. Fix: rule (2) now absorbs a
plumbing record only when its ENTIRE parentUuid subtree is plumbing (attachments /
tool_result-only user records) — `checkSubtreeIsPlumbingOnly` + `indexChildrenByParent` in
`reconstruction_trunk_absorb.ts`, guarded by the new
`test_absorb_does_not_swallow_a_tool_result_leading_to_real_content`. After the fix: trunk 4/4,
orphans + branch + fork + tree 27/27 combined, s85 still 9 histories and checker 10/10.

### Open questions

- **Residue (worth a follow-up task):** the moved-away SOURCE files (`one.py`, `two.py`,
  `three.py`) still show as alive 1-revision histories in the Files nav — the engine's script
  channels record no delete/rename revision for them, so the tree shows both `one.py` and
  `core_one.py` (the latter now badged "← one.py"). Representing script moves as true rename
  revisions (merging source history into the destination via reconstruction_lineage) is the
  real fix and needs its own planned change against the full 87-scenario sweep.
- The trunk absorb also un-orphans the absorbed records in every OTHER parallel-tool-call
  transcript (any newer-CC capture), which may shift timelines that previously dimmed those
  rows as rewound. The scenario suite will say; nothing in the 21 branch tests regressed.
