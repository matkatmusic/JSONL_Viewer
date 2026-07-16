## 2026-07-15:17:00:00 — Task 67: Script-run details — script + before/after diff panels
Chat title: tackle-tasks 67 — script-run details
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/ebf509e5-092f-4333-8b70-fa9817d59d80.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task67-script-run-details.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/src/reconstruction_script_runs.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/views/details-script-run.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/views/details-script-run-model.ts

### Design decisions

- The task's "blocked on detection" premise was resolved by the user's direction: the engine's
  own sandbox replay (`executeRunOnce`, memoized) already computes each run's pre/post file
  states. `summarizeScriptRunFileChanges` diffs the UNION of pre/post keys (covers created,
  deleted, and modified in one content comparison), excludes `__pycache__`/`.pyc` junk keys,
  and resolves keys against the run's cwd — the exact `discoverScriptCreatedPaths` pattern.
- The gate check (`isImpureExecutionAllowed`) runs BEFORE `executeRunOnce`, so a declined build
  never executes a script; every run still rides the wire (code + empty changedPaths) because
  the consent dialog and future UI can use the code without execution.
- Wire: `ReconstructionDocument.scriptRuns` carries paths only, never file contents — the diff
  panel reuses the existing `/api/diff` revision blocks, keeping the 67 MB document from growing.
- Webapp join is by `toolUseId` (`deriveToolCallNodes`), stamped ONLY when `changedPaths` is
  non-empty, so read-only runs and non-script tool calls behave exactly as before.
- Timeline carry-forward is a `modified N file(s)` badge next to the task-103 FAILED badge —
  not file chips. Chips carry per-change actions (inspector jump, snapshot route) that need a
  resolved FileChange; the Details mode is the interaction surface here.
- Details right pane stacks each affected file's revision diff using the exported
  `appendColumnsDiff` (side-by-side, per the task's wording); the columns/inline toggle is
  hidden because it re-renders a single pane-wide diff and cannot drive a stack.
- Revision resolution per changed path (`details-script-run-model.ts`): (1) the revision whose
  changeId starts `scriptRun:<toolUseId>:`, (2) the first revision at/after the run instant
  (beacon-evidenced effects, e.g. s25), (3) the last revision. ISO wire timestamps compare
  lexicographically.
- `SCHEMA_VERSION` in reconstruction_document_cache.ts bumped 1→2 (module's own contract:
  bump on any persisted-shape change) so a respawned server can't serve a cached document
  missing `scriptRuns`. Hydration itself is generic (tag/revive walks the whole tree) — no
  per-field work needed.

### Deviations

- Plan step 6 placed the view model inside `details-script-run.ts`; it landed in a separate
  `details-script-run-model.ts` because tests import the view-model half only (the
  details-model.ts precedent) and `details-model.ts` itself is at 213/250 lines.
- The plan's "changed or created" wording became changed/created/DELETED (union of pre/post
  keys) — a deleted file is a run effect the panel should list.

### Tradeoffs

- Left panel renders the script as plain `<pre>` text, no syntax highlight (`renderCodeInto`
  is one import away when wanted).
- The path→history join is exact-or-trailing-segment string matching, mirroring the engine's
  `refForTarget`; a cwd-relative sandbox key that matches no history renders an explanatory
  note rather than guessing.

### Open questions

- Runs with no `toolUseId` (synthetic, none observed in real transcripts) can never join a
  tool-call row, so their file changes surface only through the existing revision machinery —
  acceptable?
- The hook's deep-nesting flags on `timeline-render-rows.ts` (121-198), `timeline-changes.ts`
  (53-62, 156, 179), and `details-diff.ts` (128-137) are pre-existing structure this task did
  not create; left untouched to keep the diff reviewable. Restructure separately if wanted.
- Tests were AUTHORED red-green but per the tackle-tasks instruction no suite was run manually;
  the post-edit hook's automatic runs reported the new tests passing after each green step.
