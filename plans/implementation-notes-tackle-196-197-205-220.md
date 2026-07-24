## 2026-07-24:13:30:00 — Tasks 197 + 196 + 205 implementation, task 220 verification, task 221 re-block
Chat title: tackle-tasks 220 221 197 196 205
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/0c801889-391a-44d0-bb3e-df4be14a204f.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-196-197-205-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/220-lineage-horizon-memo.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-target.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/mvp-app-mockup.html

### Design decisions

- Content-order tiebreak (task 197): the spec/hpp say only "same-second ties broken by
  content order". Encoded rule: the tiebreak fires when both instants share an epoch
  second AND exactly one side was widened from committer seconds; equal contents place
  the widened (git) node AFTER the ms node (the blob corroborates the JSONL-produced
  state), differing contents place it BEFORE (a later commit would have captured the
  change); a byteless side degrades to plain ms order. Marked with a `ponytail:`
  ceiling comment (single-change-per-second assumption).
- S1 node mapping (task 196): only `write` and `user-edit` events carry full content at
  extraction time (append/overwrite content is filled later during reconstruction), so
  only those become BeaconNodes; every other file-touching event becomes a
  PreAnchorStubNode. S2 (tasks 198/199) owns real layer-1 semantics and replaces this.
- Rename/copy events carry from/to instead of a single target — they are skipped as
  nodes here because they become typed edges in S6 (task 203).
- Task 220: ran the task-182 attempt-4 rerun myself (same invocation as attempt 3,
  10-min budget) — it COMPLETED in ~11 min with a 34-revision plate_cli.py ladder,
  so 220 is closed on measured evidence rather than left open for a user rerun.

### Deviations

- The plan said loadLayeredProject should call resolveEvidenceRoots on every load "so
  override validation runs"; a pure call with a discarded result validates nothing, so
  the loader does NOT call it. The function is exported + unit-tested and layers 2-3
  (tasks 200-202) will consume it.
- Subagents were not used for parallel implementation: the three tasks share files
  (test helpers, the 197→196 import) and the spawn classifier denies ~40% of Agent
  spawns in this environment; sequential inline TDD was faster.
- New unit tests were run individually as the red-green vehicle (and by the project's
  Stop hook, which auto-runs tests after every test-file edit); the full `npm test`
  suite was NOT run, per the session instruction that the user runs it.

### Tradeoffs

- setupLayeredDom lives in tests/webapp-dom-test-helpers.ts (136 lines, well under the
  250 cap) instead of a new helper file — one shared home for DOM setup.
- The drawer's placeholder widgets are ids `layered-file-widget-<index>`; task 207
  replaces them with real per-file widgets, so no path/slug scheme was invented.

### Open questions

- Task 221 was re-blocked on task 207 (per-file widgets): its "no snapshots available"
  bubble has nothing to render into until widgets exist. Confirm that reading of "the
  currently selected layer's view" — if it was meant for the OLD webapp timeline, say
  so and 221 can be unblocked and implemented there instead.
- Task 205 flips `/` to the layered index.html. The old page stays at
  /webapp_old.html (S7), but anyone opening the app root now lands on the skeleton —
  acceptable during the MVP build-out?
