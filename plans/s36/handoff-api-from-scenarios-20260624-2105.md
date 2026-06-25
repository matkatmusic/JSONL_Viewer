# Handoff: s36 (`s36-script-rename-csv-user-edit-mcp`) IMPLEMENTED — CHAR-LOCK, suite 487→499, NO `src/` change
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S36 impl (/impl-scenario 36) → implement S36 (script-rename-csv-user-edit-mcp)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/49ad0ef5-fa61-48fe-bda6-887dd6990fbb.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s36/s36-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (UNCHANGED — nothing committed; the worktree carries
uncommitted S28–S36 work).

## Goal
Lock Scenario s36 (`s36-script-rename-csv-user-edit-mcp`) with a characterization/regression suite. s36 is the
**MCP-sandbox twin of S33**: the same CSV-user-edit whole-word rename, but the rename driver runs through the
context-mode MCP sandbox (`ctx_execute`) instead of Bash. The engine already reconstructs all four touched files
byte-perfectly (HAS-BEACON, reader-INDEPENDENT), so this was a **CHAR-LOCK — NO `src/` change**.

## Current State — COMPLETE
- **Implemented in full.** `npm test` → **499/0** (487 baseline + 12 new); `npx tsc --noEmit` → clean.
- `git diff --stat -- src/` shows **zero S36-attributable hunks** — no source file was touched by S36. (The src
  diff that IS present is the pre-existing uncommitted S28–S35 work — the coordination hazard, not S36.)
- New files written:
  - `tests/reconstruction_engine_s36.test.ts` — 6 engine tests T1–T6, all green.
  - `tests/reconstruction_cli_s36.test.ts` — 6 CLI tests C1–C6, all green.
  - `plans/s36/` — plan + this handoff.
- Modified files (S36's share):
  - `tests/fixtures.ts` — added `S36_JSONL` after `S35_JSONL`.
  - `plans/roadmap.md` — appended the S36 line (suite 499).
  - `plans/reconstruction-engine-design.md` — S36 note inserted immediately after the S35 block.
  - `plans/implementation-notes-api-from-scenarios.md` — prepended the S36 entry.
- The throwaway CLI probe (`_probe_s36.ts` / `_probe_s36b.ts`) was deleted — no trace.

## What Remains
1. **Commit — USER APPROVAL ONLY** (see Coordination Hazard). Stage EXACTLY these S36 paths, never `git add -A`,
   never any `src/*`: `tests/fixtures.ts`, `tests/reconstruction_engine_s36.test.ts`,
   `tests/reconstruction_cli_s36.test.ts`, `plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
   `plans/implementation-notes-api-from-scenarios.md`, `plans/s36/`.
2. **s37 planner is now unblocked** — this completion handoff (title parses as `s36 … IMPLEMENTED`) fires
   `monitor-handoff.sh s36 impl`. s37 = `s37-script-rename-driver-back-and-forth-mcp` (MCP-driven twin of S34).

## Key Files
- `plans/s36/s36-reconstruction-plan.md` — the authoritative spec (CHAR-LOCK, T1–T6 + C1–C6).
- `plans/script-handling.txt` — the HAS-BEACON vs NO-BEACON premise (MUST READ).
- `tests/reconstruction_engine_s36.test.ts` / `tests/reconstruction_cli_s36.test.ts` — the new locks.
- `tests/reconstruction_engine_s35.test.ts` / `tests/reconstruction_cli_s35.test.ts` — the helper-block source
  (copied verbatim).
- `src/parse/loadTranscript.ts` — carries S32's MCP-attribution allow-set fix that s36 DEPENDS on (uncommitted).

## Context the Next Agent Won't Have
- **CHAR-LOCK, not a fix.** No `src/` file was changed; the engine is already correct for s36. The tests pin the
  current behavior.
- **The s36-distinct crux is the MCP dependency.** 7 assistant records carry
  `attributionMcpServer:"plugin:context-mode:context-mode"` / `attributionMcpTool:"ctx_execute"`. The loaded
  record type does NOT surface `attributionMcpTool` (it is allowed-but-not-typed in `loadTranscript.ts`), so T6
  asserts the MCP provenance via a **raw-JSONL read** of the fixture (counts the 7 records) + the
  load-not-throwing half — the TS-clean, always-available approach the plan recommended.
- **WHOLE-WORD HAZARD — `apply_disc`:** the renamed `apply_discount` contains `apply_disc` as a prefix substring
  **5×** in final `billing.py`. A bare `includes("apply_disc")` WRONGLY reports the old name present; all absence
  assertions use `/\bold\b/` (count 0) with `String.raw`.
- **`apply_renames.py` uses the STRING-CONCAT `re.sub` form** `re.sub(r"\b" + re.escape(old) + r"\b", new, text)`
  (NOT the s33 f-string form) — verified live; pinned in T3 + C6 with `String.raw`.
- **Live-verified facts the tests pin:** `reconstructBranches` → rewound=0, surviving=4; `extractFileEvents` =
  `{write:4, edit:2, userEdit:3, overwrite:0}` with ids sorted `["96b40a66","aecbb827","de1f5023"]`; ladders
  billing 156→184→184→219, test 50→50, renames.csv 4→5, apply_renames 51; A prompt `#fdce1bb9`; surviving tip
  `#a7ed17a3`. The CLI `@`-id strings were captured from a live `runCli` run before writing C3–C6 (S33/S34/S35
  lesson).
- **No kept-name hazard** here (unlike S31/S32) — `tests/test_billing.py` method names embed no terse rename
  substring; the kept-name control was NOT imported.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 499 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s36.test.ts tests/reconstruction_cli_s36.test.ts   # 12/12
git diff --stat -- src/    # NO s36-attributable change (pure characterization lock)
```

## Coordination Hazard (same as S28–S35)
The worktree carries uncommitted prior-scenario work — `src/parse/loadTranscript.ts` (the S32 fix s36 DEPENDS
on), `src/reconstruction_reseed.ts`, `src/reconstruction_beacons.ts`, `src/reconstruction_branches.ts`,
`_sidecar.ts`, `_user_edit.ts`, the S28–S35 test/plan/doc files, and unrelated `src/Plan_template.md` /
`src/Impl_template.md` edits by other agents. The three doc files in the S36 commit also carry S28–S35 edits.
`git diff --stat` is NOT S36-only — confirm the commit-split with the user; never `git add -A`, never stage any
`src/*` for S36.
