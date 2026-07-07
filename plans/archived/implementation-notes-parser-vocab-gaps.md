## 2026-06-25:19:30:00 — Close parser/vocab gaps + de-pin stale-count assertions
Chat title: api-from-scenarios: close parser/vocab gaps
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/d720571d-b702-48bd-8cd7-aaac3899903a.jsonl

### References
/Users/matkatmusicllc/.claude/plans/resilient-conjuring-wreath.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260625-1825.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-scenario-tests-to-coverage-tool.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/coding-requirements.md

### Design decisions
- **Two distinct problems, not "8 parser/vocab gaps".** An empirical read-only
  scan of all 83 JSONL in `scenarios/executed/` showed the s1/s2/s19/s32 fixtures
  have ZERO unmodeled top-level keys — so the loadTranscript/parseRecord/file-
  history count tests were failing on **stale pinned counts** (fixtures shrank on
  re-run: s32 206→153 lines, s19 103→102, s1 80→79, s2 125→120, s1 file-history
  5→6), not vocabulary. Only the two `session-meta` attachment-kind tests were
  genuine vocab gaps. Fixed both classes per the user's "both" decision.
- **Complete vocab modeling (user decision).** Added all 5 unmodeled attachment
  kinds (`command_permissions`, `hook_cancelled`, `selected_lines_in_ide`,
  `file`, `invoked_skills`) and all 5 unmodeled top-level keys
  (`slug`, `logicalParentUuid`, `compactMetadata`, `isVisibleInTranscriptOnly`,
  `isCompactSummary`), not just the 3 kinds the unit tests needed.
- **`slug` modeled at the envelope layer.** It appears on all four envelope record
  types (attachment/user/assistant/system) in compact scenarios, so it went into
  `ENVELOPE_KEYS` (vocabulary.ts) + `EnvelopeBase` (envelope.ts) — one addition
  covers all four allow-sets, matching the existing single-source pattern. The
  other four keys are variant-specific (system/user) and were allow-listed only,
  matching the `requestId`/`sourceToolAssistantUUID` precedent (no domain type, no
  hydration — nothing reads them).
- **De-pin to self-relative invariants.** Count tests now assert
  `records.length === readNonEmptyLines(path).length` (proves one record per line,
  nothing thrown/dropped) instead of a literal; `withAttribution`/`snapshot`
  counts → `> 0` or fixture-derived; file-history asserts `snapshots.length ===`
  (count of file-history-snapshot records in the fixture).

### Deviations
- **The original plan draft was corrected during a verification pass** (user asked
  for >95% accuracy before approval). Three facts the first draft got wrong, all
  caught by empirically reading the current fixtures:
  1. s32 `attributionMcpTool` is no longer always `"ctx_execute"` — the re-run
     carries both `ctx_execute` and `ctx_execute_file`. The value-equality on the
     tool was relaxed to `typeof === "string"`; the server value
     (`plugin:context-mode:context-mode`) is stable and stays pinned.
  2. s32/s19 pin a SECOND run-specific count each (`withAttribution.length === 19`
     / `=== 2`; actual now 4 / 2) — both de-pinned to `> 0`.
  3. The re-run s2 fixture no longer contains `opened_file_in_ide`, so
     `test_attachment_payload_type_covers_s2_kinds` had stale *presence* pins
     (lines 102-104) that the vocab add alone would not fix. Replaced with
     `present.size > 0` + the "every kind is modeled vocabulary" loop (the real
     invariant). Removed the now-unused `AttachmentPayloadType` import there.

### Tradeoffs
- **De-pin vs re-pin to new numbers.** Considered just bumping the literals to the
  current counts (80→79 etc.). Rejected — the whole session's premise is that
  re-run fixtures rotate; re-pinning would just break on the next re-run. Self-
  relative assertions are re-run-stable and still prove the meaningful property.
- **Direct edits vs subagents.** The /jot:implement skill suggests subagents;
  declined because this was ~9 surgical edits across tightly-coupled files
  (vocabulary.ts ↔ vocabulary.test.ts ↔ loadTranscript.ts) where parallel agents
  would risk conflicting edits for no parallelism gain.

### Results (verified)
- `npx tsc --noEmit` — clean.
- Read-only scan over `scenarios/executed/` (83 JSONL): **0** unknown record
  types, **0** unmodeled top-level keys, **0** unmodeled attachment kinds.
- The 5 touched test files: 20/20 green.
- Full `npm test`: **232 tests, 211 pass, 21 fail** (was 198/34). All 8 target
  parser/vocab tests now green. The 21 remaining are all pre-existing/expected:
  18 intentional scenario-coverage engine gaps (rename s29/32/35/37/38; git-
  baseline s40–47; compact s64/67/69/70/72) + 3 deferred tree/graph tests
  (`8faab841` fork uuid family). No new reds.
- **Bonus:** modeling the compact-session vocabulary let 5 compact scenarios
  (s63/65/66/68/71) go fully green — they were only red because their transcripts
  crashed at parse (`UnmodeledFieldError`); they reconstruct cleanly once
  parseable. Compact reds dropped 10→5.

### Files changed
- src/structures/vocabulary.ts (5 enum members + `slug` in ENVELOPE_KEYS)
- src/structures/envelope.ts (`slug?: string` on EnvelopeBase)
- src/parse/loadTranscript.ts (system + user allow-set keys)
- tests/vocabulary.test.ts (both deepEqual snapshots)
- tests/loadTranscript.test.ts (de-pin 4 tests; relax s32 tool value)
- tests/parseRecord.test.ts (de-pin s1 count)
- tests/file-history.test.ts (fixture-derived snapshot count)
- tests/session-meta.test.ts (de-pin s2 presence pins; drop unused import)

### Open questions
- **Nothing is committed** (consistent with the prior session's state; last commit
  `bc0fd42`). The broken-step-states fixture + `tests/scenario_coverage.test.ts`
  are still untracked. Want this vocab/de-pin work committed (and the untracked
  fixtures staged) as part of a commit, or left in the working tree?
- The 3 tree/graph reds (`8faab841`) remain — still your deferred call (de-pin to
  structural, or leave red as a separate module).
