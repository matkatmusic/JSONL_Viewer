# Handoff: IMPLEMENT Scenario s36 (`s36-script-rename-csv-user-edit-mcp`) — PLANNED, CHAR-LOCK, suite 487→499
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S36 planning (/plan-scenario 36) → produce the s36 reconstruction plan + this handoff
JSONL (this planning session): /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/b6bca870-1b1f-47f1-9e30-340fa2fb5a6d.jsonl
Plan file (authoritative — READ IT FIRST): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s36/s36-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (UNCHANGED — nothing committed; the worktree
carries uncommitted S28–S35 work).

## Goal
Lock Scenario s36 (`s36-script-rename-csv-user-edit-mcp`) with a characterization/regression suite. s36
is the **MCP-sandbox twin of S33**: the same CSV-user-edit whole-word rename, but the rename script runs
through the **context-mode MCP sandbox** (`ctx_execute`) instead of the Bash tool. The engine **already
reconstructs all four touched files byte-perfectly** (verified live this session, default real reader),
so this is a **CHAR-LOCK — NO `src/` change**. Add a fixture + 12 tests (6 engine + 6 CLI) + 3 doc
entries. The one fact distinguishing s36 from s33: loading the JSONL depends on S32's already-shipped
parser fix (the MCP-run records carry `attributionMcpServer`/`attributionMcpTool` keys).

## Current State
- **Plan COMPLETE**: `plans/s36/s36-reconstruction-plan.md` (full TDD spec: 6 engine T1–T6, 6 CLI C1–C6,
  exact DAG ids, revision ladders, hazards, commit hygiene).
- **Engine gap analysis DONE — there is NO gap.** `reconstruction_cli` on the s36 JSONL ran clean (exit
  0, no parser crash). A subagent byte-compared every reconstructed final revision against the on-disk
  render: **all 4 PASS, byte-exact** (`disk === reconstructed.join("\n")+"\n"`), zero whitespace/newline
  diffs. Reader-INDEPENDENT (no rescue stage fires; matches under poison reader).
- **Nothing implemented yet** — no fixture, no test files, no doc entries written. Suite is at the S35
  baseline **487/487**.

## What Remains
Execute the plan's "Tasks (TDD order)" section, in order:
1. Confirm baseline `npm test` → **487/0**, `npx tsc --noEmit` clean. If not 487, reconcile with
   `plans/s35/handoff-api-from-scenarios-20260624-2045.md` before proceeding.
2. Add `S36_JSONL` to `tests/fixtures.ts` after `S35_JSONL` (sibling-store path — see plan §Tasks step 2).
3. Write `tests/reconstruction_engine_s36.test.ts` (T1–T6; copy helpers verbatim from the S35 engine test).
4. Write `tests/reconstruction_cli_s36.test.ts` (C1–C6; copy `fileVerboseBlock`/`finalRevisionSlice` from
   the S35 CLI test). **First capture live `runCli([S36_JSONL,"--verbose"])` strings via a throwaway
   scratchpad probe (deleted after), per the S33/S34/S35 lesson — the `revision N  @<id>` strings are
   content hashes that must match exactly.**
5. Update the 3 docs (S36 entries, suite 499): `plans/roadmap.md`,
   `plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`.
6. Verify `npm test` → **499/0**, `tsc` clean, `git diff --stat -- src/` shows **zero S36 hunks**. Then
   **create the completion handoff** (use `/jot:handoff-prompt`) with a title parsing as
   `s36 … IMPLEMENTED` so it fires `monitor-handoff.sh s36 impl` and unblocks the s37 planner.
7. Commit — **USER APPROVAL ONLY** (see Coordination Hazard).

## Key Files
- `plans/s36/s36-reconstruction-plan.md` — the authoritative spec (read first).
- `plans/script-handling.txt` — the HAS-BEACON vs NO-BEACON premise (MUST READ).
- `tests/reconstruction_engine_s35.test.ts` / `tests/reconstruction_cli_s35.test.ts` — copy helpers verbatim.
- `tests/reconstruction_engine_s33.test.ts` / `tests/reconstruction_cli_s33.test.ts` — s36 is s33's twin;
  the s33 tests are the closest structural template (same CSV-user-edit shape).
- `tests/fixtures.ts` — add `S36_JSONL`.
- `src/reconstruction_cli.ts` (`runCli`), `src/parse/loadTranscript.ts` (carries the S32 fix s36 depends on).

## Context the Next Agent Won't Have
- **CHAR-LOCK, not a fix.** Do NOT change any `src/` file. The engine is already correct for s36; these
  tests pin the current behavior. `git diff --stat -- src/` must show zero S36 hunks.
- **The s36-distinct crux is the MCP dependency.** Everything else is identical in shape to s33. T6 must
  assert (a) `loadRecords(S36_JSONL)` does not throw AND the records carry the MCP-run attribution
  (`attributionMcpTool === "ctx_execute"`, 7 such assistant records in the JSONL) — this is the single
  fact that makes the s36 lock not a duplicate of s33; and (b) reader-independence under the poison
  reader. If the loaded record type doesn't surface `attributionMcpTool`, fall back to asserting the
  load-not-throwing half (always available) + a raw-JSONL/CLI provenance check (see plan T6 note).
- **WHOLE-WORD HAZARD — `apply_disc`:** the renamed `apply_discount` contains `apply_disc` as a prefix
  substring **5×** in final `billing.py`. `includes("apply_disc")` would WRONGLY report the old name
  present. Assert old-name absence with `/\bapply_disc\b/` (count 0). Use `String.raw` for the regexes.
- **`apply_renames.py` uses the STRING-CONCAT `re.sub` form** `re.sub(r"\b" + re.escape(old) + r"\b",
  new, text)` — NOT the s33 f-string form (`rf"\b{re.escape(old)}\b"`). Verified live this session; the
  C6/T3 literal assertion must use the concat form (with `String.raw`).
- **Line counts differ from s33** (genuinely different file contents, both reconstruct exactly): billing.py
  final **219** (ladder 156→184→184→219), test_billing.py **50→50** (s33 was 51), renames.csv **4→5**,
  apply_renames.py **51**. Surviving tip **#a7ed17a3**. userEdit ids sorted
  `["96b40a66","aecbb827","de1f5023"]` (`96b40a66`=renames.csv manual edit; `aecbb827`=test MCP beacon;
  `de1f5023`=billing MCP beacon). `extractFileEvents` = `{write:4, edit:2, userEdit:3, overwrite:0}`.
- **No kept-name hazard here** (unlike S31/S32): the test method names embed no terse rename substring.
  Do not import the kept-name control — it has no subject in s36.
- **250-line cap on test files** is enforced by a `jot:post_tool_use` hook; the S35 engine test was
  trimmed to fit. Condense comments / collapse short `deepEqual` arrays rather than drop assertions.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 499 / 0   (487 baseline + 12 new)
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s36.test.ts tests/reconstruction_cli_s36.test.ts   # 12/12
git diff --stat -- src/    # NO s36-attributable change (pure characterization lock)
```

## Coordination Hazard (same as S28–S35)
The worktree carries uncommitted prior-scenario work — `src/parse/loadTranscript.ts` (the S32 fix s36
DEPENDS on), `src/reconstruction_reseed.ts`, `src/reconstruction_beacons.ts`,
`src/reconstruction_branches.ts`, `_sidecar.ts`, `_user_edit.ts`, the S28–S35 test/plan/doc files, and
unrelated `src/Plan_template.md` / `src/Impl_template.md` edits by other agents. The three doc files in
the S36 commit also carry S28–S35 edits. `git diff --stat` is NOT S36-only — confirm the commit-split
with the user; never `git add -A`, never stage any `src/*` for S36.
