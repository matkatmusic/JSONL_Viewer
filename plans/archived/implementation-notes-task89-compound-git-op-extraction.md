## 2026-07-15:08:41:00 — Task 89: per-`&&`-segment git-op extraction
Chat title: Task 89 — compound git-op extraction
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/d8a169b0-9e7d-4302-b555-3aa7da275f7d.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task89-compound-git-op-extraction.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-item66-fork-style-port.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/src/reconstruction_git_evidence.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/git-operations.test.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/reconstruction_git_evidence.test.ts

### Design decisions

- **Task 89's s39 premise is factually wrong.** s39's two JSONLs contain NO `git commit`
  command at all — the scenario's `block-compound.sh` PreToolUse hook rejected compound
  commands during capture, and only `git init` + `git add orders.py tests/` were recorded.
  The existing `test_s39_git_operations_are_init_then_add` assertion `[init, add]` matches
  reality and was left untouched. No extraction change can produce a commit node from a
  command that was never recorded.
- The real compound-command transcript is **s6-git-mv**: `git add s6_git.py
  tests/test_s6_git.py && git commit -m "$(cat <<'EOF'…)"`. That compound failed at capture
  time and the agent reissued add/commit separately, so post-fix s6 yields
  `[init, add, commit, add, commit, other]` (probed pre-fix baseline: `[init, add, add,
  commit, other]` with the add's detail polluted by the compound tail).
- One shared `splitCompoundCommandSegments` helper (split on `&&`, trim) feeds BOTH
  `findGitOperations` (timeline rows) and `findGitCommitEvents` (CommitMarkers + blob
  evidence channel) — the root-cause fix lives where both callers route through.
- Per-segment `GitOperation.command` carries the segment text (its own row's command); the
  shared Bash record `uuid` still resolves the compound's single JSONL line. The compound's
  single tool_result serves every segment; only kind-commit segments read `resultHash` from it.
- The nesting-depth hook (>3 indent units) forced extracting the per-command loops into
  `parseCommitEventsFromCommand` and `parseOperationsFromCommand` — small verb-named helpers,
  not forwarding layers.

### Deviations

- Plan step 1a test 1 dropped a few narrative comment lines and step 1a test 2's kind-array
  was compacted — the jot 250-line cap on tests/git-operations.test.ts (now 249 lines) forced
  the trim; assertions are exactly as planned.
- Skipped subagents (skill suggests them "where possible"): the diff is ~60 lines across 3
  files with strict RED→GREEN ordering; fan-out costs more than it saves.

### Tradeoffs

- `&&` only — no `;` / `||` splitting. The user chose `&&`-chains and a grep over every
  `scenarios/executed/*/*.jsonl` found no git command chained any other way. Ceiling noted in
  a `ponytail:` comment: a literal `&&` inside a quoted argument would split wrongly; move to
  a quote-aware scan if a transcript ever exercises one.
- Non-git-headed compounds (`cd x && git commit`) now also yield their git tail ops —
  intended; grep confirmed no scenario transcript currently has that shape, so no fixture
  output changes beyond s6.

### Open questions

- s6's compound `git add … && git commit` FAILED at runtime (hence the separate retry), yet
  it now contributes add+commit rows — its commit row has `resultHash: undefined` (error
  output carries no `[branch hash]` line). This mirrors how a failed plain `git commit`
  already gets a row today (extraction never checks `is_error`). If failed git commands
  should be suppressed or badged, that's a separate task spanning ALL git ops, not just
  compound ones.
- `findGitCommitEvents` for s6 now returns 2 commit events (compound + retry) where the repo
  only has 1 real commit. `resolveCommitByTimestamp` picks the nearest commit within 60s for
  each, so both resolve to the same commit — harmless for the evidence channel, but CommitMarkers
  (timeline pick hard-stops) now include the failed compound's instant. Flag if a duplicate
  marker ever shows up as a visible artifact in the viewer.
- Pre-existing jot hook complaints on src/reconstruction_git_evidence.ts (568 lines vs the
  250 cap; one deep-nesting site around `placementAfter`) predate this change and were left
  alone.
