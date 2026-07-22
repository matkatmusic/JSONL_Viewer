## 2026-07-21:18:30:00 — Tasks 153 + 133 (paths-popover prefill; missing Edit chip)
Chat title: tackle-tasks 153 133
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/402701a3-e82e-4593-8f71-5d6c680f9abf.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-tasks-153-133.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-tackle-tasks-131-135-136-137.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/demo-baseline/README.md

### Design decisions
- Task 153: the prefill lives in ONE exported helper in `webapp/app-header.ts`
  (`prefillFileHistoryOverrideField`) because the task-136 field and its
  `reportedFileHistoryDir`/POST semantics are app-header state; the popover section
  (`refreshProjectPathsSection`) just calls it with `entry.fileHistory`.
- The no-override branch restores the derived state ONLY when a prefill is active —
  it never clobbers a user's manual toggle-open + typed value, and it never disarms
  an in-effect explicit GLOBAL override.
- `computeFileHistoryDirToPost` treats an unedited prefilled value exactly like an
  unedited derived value (posts "" = re-derive), so opening the popover on a project
  with a stored override can never silently convert it into a GLOBAL override via the
  "Change folder" button.
- `reportedFileHistoryDir` was hoisted from the `initializeHeader` closure to module
  scope — the restore branch needs it; `applyConfig` still owns writing it.
- Task 133: the fix widens the MERGE-pass dedupe key (path → path+changeId) in
  `mergeSnapshotFileChanges` only. `deriveFileChanges`' within-step path dedupe is
  untouched (rename-pair collapse and changedPaths fallback semantics live there).
  Fallback chips (no changeId) still collapse per path across snapshots.

### Deviations
- Task 133's description named the pre-baseline trim (`seedBaseCommitBeacon`) as the
  mechanism. Verified against baseline-demo and REFUTED: the `least_valuable` Edit
  (JSONL line 75, 23:44:09.283Z) is 4s AFTER the baseline instant (23:44:05Z), its
  WriteEvent survives the trim, and its revision exists in both consent modes. The
  real cause of the missing timeline entry was the merged-chip path dedupe on the
  owning agent turn (the turn owns an earlier external user-edit snapshot of the
  same file, whose chip won first). Declining pre-baseline actually SHOWED the Edit
  chip, because the trim removed the competing user-edit snapshot.
- The task's proposed fix direction ("keep trimmed turns navigable") was therefore
  not implemented: the turn was already present and navigable in both modes; only
  its Edit chip was missing. Dropping pre-baseline rows on decline remains task-56's
  documented, deliberate behavior (demo-baseline/README.md).
- Added a 4th app-header test beyond the plan's three
  (`test_apply_posts_empty_file_history_when_value_is_unedited_prefill`): the
  compute-guard is behavior and TDD requires its own RED test.

### Tradeoffs
- A turn can now show two chips naming the same file (distinct revisions). Accepted:
  they are distinct changes, each resolving to its own revision; hiding one was the
  bug. Note `toolu_…` chips carry no 📷 jump button by design (task 94) — the chip
  itself is the timeline evidence.
- The prefill guard compares the CURRENT field value to the last prefilled value; a
  user who edits the field and then edits it back to the override string posts ""
  (derive) rather than a global override. Judged harmless — that value was on screen
  as a per-project override the whole time.

### Open questions
- None blocking. Tests were written red-green but NOT run by the agent (per the
  task instructions the user runs the suite); the Stop hook's auto-run reported the
  expected RED failures and no failures after the GREEN edits.
