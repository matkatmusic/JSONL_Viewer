## 2026-07-09:08:45:00 — Timeline tool-call rows, chip line labels, selection-sync fix
Chat title: tackle-tasks 42/46/53/54 → timeline tool-call rows redesign
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/edd7300d-f9b8-4c4f-ae02-30ce8bbdde47.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/timeline-tool-call-rows.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (items 24, 53, new 55)

### Design decisions

- 2026-07-09 08:45 — The `rtk ls` row is NOT a record-less execution: s39's `ls`
  tool_use (L33) and the rtk-rewrite hook (L39) SHARE toolUseID
  `toolu_015S4Xy7zXKZsjauZticmEj9`. The engine rule became "a PreToolUse hook whose
  `updatedInput.command` differs from the same-id tool_use's command emits an extra
  row"; hook-run attachments (SessionStart/Stop/UserPromptSubmit) are excluded by the
  command guard alone. The plan file was corrected before implementation.
- 2026-07-09 08:45 — Engine tests assert through `buildProjectDocument(...).toolCalls`
  (matching tests/git-operations.test.ts) rather than a raw loadTranscript call, plus a
  unit test for `computeToolCallSummary`; the wire field test collapses into the same
  file.

### Design decisions (continued)

- 2026-07-09 09:00 — `appendSessionEndNodes` now also scans tool-call instants: without
  it, the trailing `git add`/`rtk git add` rows (8:53:29/30) sorted AFTER "end of session"
  (whose time came from the files bubble, 8:53:25). The end node's contract ("closes the
  session after everything in it") decided it.
- 2026-07-09 09:00 — Tool-call raw-line matching is two sub-tiers (own record `"uuid":"…"`
  first, bare toolUseId second) because the `ls` row and its `rtk ls` rewrite row SHARE a
  toolUseId; record-uuid matching keeps each row's own line resolving to itself.
- 2026-07-09 09:00 — The user-turn uuid match tightened from bare substring to the
  `"uuid":"…"` key form — this one change kills the reported Step-3 selection jump
  (snapshot lines carry the prompt uuid only as `snapshot.messageId`).
- 2026-07-09 09:05 — `FileChange` gained a required `when` (the owning snapshot's
  instant); six existing test literals were extended rather than making the field
  optional, since `deriveFileChanges` always knows it.

### Deviations

- 2026-07-09 09:00 — Retired code (git-row attachment/rendering, the old
  `computeToolActivityTag` "tool call" branch, the item-47 chip retarget) was COMMENTED
  OUT with item-55 markers, not deleted, per the standing comment-out-don't-delete
  preference. The old `test_computeToolActivityTag_tags_gitop_only_blank_turns_as_tool_call`
  is likewise commented out and replaced by an `_ignores_` variant.
- 2026-07-09 09:05 — The user's mock omitted the chips' `+/-` and `⤷` buttons; treated as
  shorthand, both kept (removal was never requested).

### Tradeoffs

- Tool-call rows are one view-model node per call. On large real transcripts this can
  mean hundreds of rows; the user explicitly chose "all tool calls", so no cap or
  grouping was added (revisit only if a real transcript demonstrates noise).

### Open questions

- The rtk-rewrite hook rewrote BOTH `ls` and `git add` in s39, so the timeline shows
  `* git add … *` AND `* rtk git add … *` (the mock listed only up through mkdir, so this
  pair never appeared in it). This follows directly from the locked "all tool calls,
  including hook rewrites" rule — confirm the doubled rewrite rows read as signal, not
  noise; collapsing a rewrite into its original row (one row, two line labels) is a small
  follow-up if preferred.
- Test suite intentionally NOT run (user runs it): new
  `tests/reconstruction_tool_calls.test.ts` (5 tests) + 9 new / 2 adjusted tests in
  `tests/timeline-viewmodels.test.ts`. Behavior WAS verified live: view-model probed via
  tsx on s39 and the built webapp verified headlessly (rows, labels, step numbers, rail,
  raw-line 48/49/50 mappings all match the spec).
