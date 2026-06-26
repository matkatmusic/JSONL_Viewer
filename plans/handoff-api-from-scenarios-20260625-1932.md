# Handoff: parser/vocab gaps closed + stale-count assertions de-pinned (committed); 2 follow-ups left
Conversation name: api-from-scenarios: close parser/vocab gaps
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/d720571d-b702-48bd-8cd7-aaac3899903a.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/resilient-conjuring-wreath.md
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-parser-vocab-gaps.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `a76ee14 working through engine gaps causing failing tests` — **this session's entire change set is committed there** (8 source/test files + the implementation-notes file). Working tree is CLEAN; nothing untracked. There is no `-plate` branch.

## Goal
The all-scenario re-run regenerated every fixture under `scenarios/executed/`; newer Claude Code emits wire vocabulary the strict fog-of-war parser rejected, and changed record counts/tool-values that older unit tests hard-coded. This session closed the genuine parser/vocabulary gaps (so every real wire field is modeled) and de-pinned the brittle run-specific assertions, turning the 8 "parser" reds green without weakening the content-based scenario-coverage suite.

## Current State
`npm test`: **232 tests, 211 pass, 21 fail** (was 198/34 at session start). `npx tsc --noEmit` clean. A read-only scan over all 83 JSONL in `scenarios/executed/` reports **0** unknown record types, **0** unmodeled top-level keys, **0** unmodeled attachment kinds.

Done (all in commit `a76ee14`):
- **Modeled the complete wire vocabulary.** `src/structures/vocabulary.ts`: added 5 members to `AttachmentPayloadType` (`command_permissions`, `hook_cancelled`, `selected_lines_in_ide`, `file`, `invoked_skills`) and appended `"slug"` to `ENVELOPE_KEYS`. `src/structures/envelope.ts`: added `slug?: string` to `EnvelopeBase`. `src/parse/loadTranscript.ts`: added `logicalParentUuid`/`compactMetadata` to the system allow-set and `isVisibleInTranscriptOnly`/`isCompactSummary` to the user allow-set.
- **De-pinned stale assertions** in 5 test files (counts → self-relative `readNonEmptyLines(path).length`; `withAttribution`/snapshot counts → `> 0` or fixture-derived; s32 `attributionMcpTool` value-equality → `typeof === "string"`; s2 presence pins → `present.size > 0`). Updated the two pinned snapshots in `tests/vocabulary.test.ts`.
- **Bonus:** modeling the compact-session vocabulary unblocked 5 compact scenarios (s63/65/66/68/71) that were red only because their transcripts crashed at parse — they reconstruct cleanly now. Compact reds dropped 10→5.

The 21 remaining reds are all pre-existing/expected:
- **18 scenario-coverage engine gaps** (content-based `… reproduces every captured step state`): rename `s29/s32/s35/s37/s38`; git-baseline `s40–s47`; compact `s64/s67/s69/s70/s72`.
- **3 tree/graph tests** (`reconstruction_tree`/`reconstruction_graph`): `test_a_file_less_surviving_branch_is_kept_when_a_rewound_branch_exists`, `test_findPromptForkPoints_returns_the_single_S13_fork_8faab841`, `test_findDeepestPromptOrReply_returns_the_last_assistant_not_a_trailing_system_record` — red only from pinned run-specific data (fork uuid `8faab841`).

## What Remains
1. **Decide the 3 tree/graph reds** (deferred by the user). Either de-pin them the same way (replace the pinned fork uuid `8faab841` / "last assistant" structural picks with set-size or structural assertions → green) or leave them red as a separate module. Files: `tests/reconstruction_tree.test.ts`, `tests/reconstruction_graph.test.ts`.
2. **Engine-gap scenarios (the real backlog), in scenario order.** These need ENGINE work, not parser/test work — each fails content reproduction of captured `.step_states/`:
   - Rename family: `s29` (1/4 steps), `s32` (2/4), `s35` (1/7), `s37` (1/10), `s38` (1/7) — function-name disagreement (e.g. `qty_chk` vs `check_quantity`); a rename-tracking bug.
   - Git-baseline family: `s40`–`s47` (several fail all steps) — seeded-reconstruction mismatches.
   - Compact family: `s64/s67/s69/s70/s72` — genuine compact-session reconstruction gaps (the other 5 compacts now pass).
   Use `npx tsx scripts/check_scenario_coverage.ts <scenario-dir>` to see per-step diffs for one scenario (exit 0 OK / 1 gap / 2 unknown).

## Key Files
- `src/structures/vocabulary.ts` — single-source wire vocabulary (enums + `ENVELOPE_KEYS`); where new attachment kinds / shared envelope keys go.
- `src/parse/loadTranscript.ts` — `ALLOWED_TOP_LEVEL_KEYS` fog-of-war allow-set per record type; where new variant-specific top-level keys go.
- `src/structures/envelope.ts` — `EnvelopeBase`, the type-level mirror of `ENVELOPE_KEYS`.
- `tests/scenario_coverage.test.ts` — the data-driven content suite (one test per covered scenario); the 18 engine-gap reds live here. Do NOT weaken it.
- `scripts/check_scenario_coverage.ts` — the coverage tool; `checkScenarioResilient`, single-scenario `main()` filter.
- `tests/{vocabulary,loadTranscript,parseRecord,session-meta,file-history}.test.ts` — the parser-layer unit tests touched this session.
- `plans/implementation-notes-parser-vocab-gaps.md` — full per-decision notes for this session.

## Context the Next Agent Won't Have
- **The 8 "parser/vocab" reds were two different problems.** Only 2 (`session-meta` attachment-kind tests) were genuine vocab gaps; the other 6 (loadTranscript ×4, parseRecord ×1, file-history ×1) were STALE PINNED COUNTS — the re-run fixtures shrank (s32 206→153 lines, s19 103→102, s1 80→79, s2 125→120, s1 file-history 5→6). The parser was already loading them fine. Verify empirically (read the fixture) before assuming a count failure is a parser gap.
- **The plan's first draft was wrong on 3 points, caught by reading the current fixtures** (keep this verification habit): (a) s32 `attributionMcpTool` is no longer always `"ctx_execute"` — the re-run has both `ctx_execute` and `ctx_execute_file`; only the server `plugin:context-mode:context-mode` is stable. (b) s32/s19 each pin a SECOND run-specific count (`withAttribution.length === 19`/`=== 2`; actual 4/2). (c) the re-run s2 fixture dropped `opened_file_in_ide`, so `test_attachment_payload_type_covers_s2_kinds` had stale presence pins the vocab add alone would not fix.
- **`slug` is envelope-level** (appears on attachment/user/assistant/system in compact scenarios) → it goes in `ENVELOPE_KEYS` + `EnvelopeBase` once, covering all four allow-sets. The other 4 compact keys are variant-specific → allow-listed strings only, no domain type, no hydration (matches the `requestId`/`sourceToolAssistantUUID` precedent; nothing reads them).
- **`loadTranscript` validates only TOP-LEVEL keys, not attachment kinds.** So the 5 new top-level keys are what stop compact transcripts crashing at parse; the 5 new enum kinds only satisfy the `session-meta` enum checks and keep `AttachmentPayload` honest.
- **Modeling vocab does NOT fix the engine-gap scenario reds** — it lets transcripts parse, then reconstruction runs and may still mismatch (a legitimate engine red). That is why only 5 of 10 compacts went green.
- **Env gotchas:** test runner is `node --import tsx --test tests/*.test.ts` (NOT vitest), glob-discovered. `rtk` aliases hijack bare `grep` — use `/usr/bin/grep`. A PostToolBatch Stop hook re-runs the full (still-red) suite after every edit and prints "Tests FAILED" — that is pre-existing drift, not your change; the explicit `npm test` is authoritative. Keep files <250 lines. 8 multi-jsonl concurrent dirs (s53–62 subset) are auto-skipped (`expected exactly one .jsonl`) — expected skip lines, not errors.

## How to Verify
From `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios`:
- `npx tsc --noEmit` — must be clean.
- `npm test` — 232 tests, 211 pass, 21 fail; the 21 are the 18 scenario-coverage engine gaps + 3 tree/graph listed above. No other reds.
- `node --import tsx --test tests/vocabulary.test.ts tests/loadTranscript.test.ts tests/parseRecord.test.ts tests/session-meta.test.ts tests/file-history.test.ts` — 20 pass / 0 fail.
- One scenario's per-step diff: `npx tsx scripts/check_scenario_coverage.ts s32-script-rename-mcp-exec` (exit 1 + per-step mismatch report for an engine gap; exit 0 for a passing scenario like `s19-user-edit-conv-rewind`).
