## 2026-07-15:01:25:00 — Tasks 86 + 87: "git-derived baseline" timeline rows, first-commit trailing-bubble absorb
Chat title: tackle-tasks 86, 87 (git-baseline tag + first-commit files)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/58599216-cecc-4878-81b5-bad7850efe79.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task86-87-git-baseline-tag-and-first-commit-files.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-item46-custom-data-source-paths.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-item66-fork-style-port.md

### Design decisions

- **Task 86 rows are agent-turn nodes, not a new node kind.** The user asked for "a regular
  message in the timeline" with a different tag; reusing `AGENT_TURN_NODE_KIND` with an
  `isGitBaseline` flag inherits sorting, numbering, expansion, chips, and pick behavior with zero
  changes to those systems. Only the role pill differs.
- **One baseline node per document, not one per file.** Every `gitBase:` beacon shares the single
  configured base commit and its committer timestamp, so per-file steps are fragments of one
  event; one row with N chips matches how the generic unattributed synthetic turn already
  aggregates.
- **Baseline node text** is `Files seeded from git base commit <hash>` — the hash is parsed from
  the `gitBase:<hash>:<target>` changeId (second colon field; hashes never contain colons).
- **Pill CSS class** for the two-word label goes through a new tested helper
  `computeRolePillClass` (`role-pill-git-derived-baseline`); the old inline
  `rolePillLabel.toLowerCase()` would have splintered the class attribute on the space.
  Single-word labels produce byte-identical class names to before.
- **Task 87 forward-absorb discriminator is `change.when <= commit.when`.** A chip's `when` is
  the change's snapshot instant, and snapshots attach to nodes at-or-after them — so any chip on
  a row sorted after the commit whose instant is at-or-before the commit is pre-commit work whose
  bubble merely sorts late (the exact first-commit quirk). Work done after the commit
  (`when > commit.when`) is never absorbed. The forward walk stops at the next commit node.
- **gitBase chips are excluded from commit changed-file lists in both directions** — baseline
  seeds are pre-session repo state, not a commit's delta. Without this, task 86's newly visible
  baseline node (sorted at the base-commit timestamp, before the first transcript commit) would
  have made every first commit list all baseline files.
- **Backward walk keeps first-hit-wins dedup** (occurrence closest to the commit), and forward
  absorb only adds paths the backward walk missed — every existing
  `test_deriveCommitChangedFiles_*` expectation is preserved (verified against the
  `commitWalkDocument` fixture timings before implementing).

### Deviations

- None from the plan file. The plan's optional note about moving `GIT_BASE_CHANGE_ID_PREFIX` up
  was unnecessary — module-scope constants initialize before any view-model function is called,
  so it sits beside the existing `SCRIPT_EXECUTION_EVENT_KIND` wire mirror (timeline.ts:826 area)
  per convention.

### Tradeoffs

- The baseline node is pickable and file-nav-reachable (task 85's Prev/Next lands on it) because
  it is a regular agent turn with snapshots. Treated as a feature (its chips are real revisions);
  excluding it would have meant touching `checkNodeIsPickable`/`findAdjacentFileTouchedIndex` for
  no user-visible gain.
- `findContributingNodeIndexes` shares one direction-agnostic `checkChangeContributes` predicate
  (baseline-excluded, `when <= commit.when`); for backward rows the time guard is provably always
  true, accepted for symmetry over two separate predicates.
- Per the tackle-tasks instruction the test suite was NOT run by the agent; the RED phase was
  confirmed by the project's PostToolBatch hook (import of the then-missing
  `GIT_BASE_CHANGE_ID_PREFIX` export failed), GREEN is verified by `npx tsc --noEmit` (clean) and
  awaits the user's `npm test` run.

### Open questions

- The baseline row's pill color is `var(--green)` — change the variable in styles.css
  (`.role-pill.role-pill-git-derived-baseline`) if a different hue reads better.
- `deriveCommitChangedFiles`' forward absorb assigns a pre-commit chip stranded beyond an
  intervening commit to that LATER commit (the nearest commit before its bubble), matching the
  walk's window semantics — flagged in case a real multi-commit-per-turn transcript ever surfaces
  and looks odd.
