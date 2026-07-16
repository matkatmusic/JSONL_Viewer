## 2026-07-15:15:30:00 — Tasks 103 / 91 / 94 (FAILED badge, rename-badge disambiguation, snapshot-jump tightening) + task 95 closure
Chat title: tackle-tasks 103, 91, 94, 95
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/98a0a711-43f7-4573-bfad-5d9c474f7526.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-103-91-94.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-task89-compound-git-op-extraction.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-item77-files-tree-view.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-item84-unify-bottom-pane.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-timeline-tool-call-rows.md

### Design decisions

- **Task 95 closed with no code change**: the recorded decision was "keep the doubled rows", which
  is exactly today's behavior — moved to completedTasks.json with a closure note, no commits listed.
- **Task 94 "snapshot-backed" definition**: a revision is snapshot-backed iff its changeId is a
  backup blob name (`<hex>@vN`). The gate lives INSIDE `computeSnapshotJumpRoute` (the button's
  presence test), via a new exported `checkChangeIdIsBackupBlobName` in file-history-model.ts —
  that file already owned the blob regex, now hoisted to a shared `BACKUP_BLOB_CHANGE_ID` constant.
- **Task 94 positive test uses a synthetic wire-literal history**: a scratch inspection showed NONE
  of the shared fixture documents (s84 / s39-seed / s2) carry a blob changeId (they are all
  tool-evidenced or scriptRun ids). The plan's fixture-search step therefore could not anchor the
  positive case; instead the route test builds a hand-rolled history with changeId `3fa9c2d1@v4`
  (the same wire-literal style the file's other tests use), and the real s84 document proves the
  NEGATIVE case (resolvable `toolu_` changeId → undefined, the exact over-fire being fixed).
- **Task 91 labels computed in the view model, not the renderer**: `applyRenameBadgeLabels`
  (timeline-file-tree.ts) stamps a new `FileSidebarEntry.renameBadgeLabel`; the sidebar renderer
  just prints it (with a basename fallback for unstamped entries). Growth algorithm: every badge
  starts at the old path's basename; same-label groups holding ≥2 distinct old paths deepen by one
  segment per pass until stable. Two IDENTICAL old paths keep their shared full-path label (growth
  is capped at segment count, so the loop terminates).
- **Task 91 details-pane labels are pane-local and computed on COPIES**: buildTouchedFileEntries
  (details.ts) shallow-copies entries before relabeling, because the `known` entries are the same
  objects the Files sidebar holds — in-place relabeling would rewrite the sidebar's badges as a
  side effect of opening a node.
- **Task 103 failure signal**: `GitOperation.isError` (optional, stamped only true — the
  resultHash convention), read from the Bash call's own tool_result `is_error`. A compound's single
  result serves every `&&` segment, so ALL its git segments carry the stamp — the transcript cannot
  attribute failure per segment (verified against the s6 fixture: only the compound add+commit has
  `is_error: true`; the retries and `git mv` do not).
- **Task 103 tool-call rows badge by uuid join, in the viewer**: `deriveToolCallNodes` builds a
  set of errored gitOperations' record uuids and stamps matching tool-call nodes. Scope stays
  "failed GIT commands" (the task's decision), not every failed tool call; hook-rewrite rows carry
  the attachment record's uuid and correctly never match.
- **One shared render site**: the FAILED badge appends right after the row's `tl-text` span in
  timeline-render-rows.ts, covering both commit nodes and tool-call rows with one `isError` check.
  CSS `.failed-badge` mirrors `.commit-pill` in red (`var(--red)`).
- **CommitMarkers untouched** (decision: badge, never suppress) — the marker fallback path for old
  cached documents carries no error facts.

### Deviations

- **250-line cap forced two module splits the plan did not call for**:
  `src/reconstruction_git_commit_events.ts` (GitCommitEvent + findGitCommitEvents moved out of
  reconstruction_git_operations.ts, which keeps and exports the shared `splitCompoundCommandSegments`;
  importers reconstruction_json/corpus/git_placement + the evidence test updated — no re-export shims)
  and `webapp/views/timeline-node-derive.ts` (deriveCommitNodes + deriveToolCallNodes moved out of
  timeline-nodes.ts). Likewise `tests/git-operations-results.test.ts` took the synthetic-record
  tests (record builders + resultHash trio + compound split) out of git-operations.test.ts.
- **Tests were not run by me** (user constraint). The project's post-edit hook auto-ran affected
  test files on each edit: the RED failures appeared exactly where expected, and no failure log
  followed the GREEN edits for Phases A and B. Phase C's two new tests (s6 isError vector, node
  badge join) have NOT had a post-GREEN hook run — the full suite run is the user's.
- Both typechecks pass: `npx tsc --noEmit` and `npx tsc -p tsconfig.webapp.json --noEmit` exit 0.

### Tradeoffs

- Blob-shaped changeId as the snapshot-backed signal (task 94) reuses the wire's existing
  vocabulary instead of adding an engine-stamped `hasSnapshot` flag — zero wire growth, but it
  means the 📷 button vanishes entirely on documents with no backup-seeded revisions (that is the
  decided behavior: the button over-fired before).
- Collision-only badge growth (task 91) keeps the common case short (`← old.py`) at the cost of
  labels that can change when the file set changes; "always show a suffix" was the rejected
  alternative (noisier for the majority of renames).
- Compound failure stamps every git segment (task 103) rather than guessing which segment failed —
  s6's `git add` likely succeeded before its chained commit was hook-blocked, but the transcript
  records one result for the whole call; over-badging the call's segments is honest, per-segment
  attribution would be fiction.

### Open questions

- Task 103: should a failed git command's operations still feed CommitMarkers / commit hard-stops?
  Today the failed compound still produces a (badged) commit node resolving to the same instant as
  the retry — the decision said badge-don't-suppress, so both rows stand; flag if the duplicate
  marker ever shows up as a visible artifact in the viewer (the original task text asked to watch
  for this).
- Tasks 103/91/94 are left OPEN in tasks.json pending the user's suite run; close them (and pick
  up this notes file for archiving) once tests are green and the staged work is committed.
