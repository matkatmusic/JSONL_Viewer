# Handoff: IMPLEMENT Scenario s37 (`s37-script-rename-driver-back-and-forth-mcp`) — CHAR-LOCK PLANNED

MUST READ: plans/script-handling.txt

Conversation name: plan-scenario 37
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4538a085-8ba5-463d-8914-84c38fdd96f4.jsonl
Plan file: plans/s37/s37-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Make the `reconstruction_cli` engine's correct handling of Scenario s37
(`s37-script-rename-driver-back-and-forth-mcp`) permanent via a **characterization / regression LOCK**.
The engine ALREADY reconstructs s37 byte-perfectly with the real file-history reader and no exception
(verified live this session) — s37 is the **MCP-sandbox twin of S34** and every fix it relies on (S32
parser, S27/S28 beacon completion, S34 out-of-window reseed) is already in the worktree. So this is a
**no-`src/`-change** task: add a fixture + 12 tests (6 engine + 6 CLI) + 3 doc updates that pin the current
output, then commit with user approval and write a completion handoff.

## Current State
- Suite **499/499 green** at HEAD (`cededae` + uncommitted S28–S36 work — NOTHING committed); `tsc` clean.
- The s37 plan is written and **live-verified**: `plans/s37/s37-reconstruction-plan.md` (authoritative).
- No s37 fixture/tests/docs exist yet. `plans/s37/` contains only this handoff + the plan.
- Engine probed live in all four `runCli` modes + no-reader + poison-reader runs (numbers in the plan's
  "Verification already performed").

## What Remains
Execute the plan `plans/s37/s37-reconstruction-plan.md` in order (it is the source of truth — follow its
exact captured strings, line counts, and node ids):
1. Confirm baseline `npm test` → 499/0, `npx tsc --noEmit` clean. If not 499, STOP and reconcile with
   `plans/s36/handoff-api-from-scenarios-20260624-2105.md`.
2. Add `S37_JSONL` to `tests/fixtures.ts` after `S36_JSONL` (path in the plan, task 2).
3. Write `tests/reconstruction_engine_s37.test.ts` (T1–T6) — copy helpers verbatim from
   `tests/reconstruction_engine_s34.test.ts`; only change `S37_GT`. **Heed the poison caveat in T6: do NOT
   assert poison-rejection on `ledger.py`** (it accepts poison / leaks `POISONED` / collapses to 19 — a
   latent, out-of-scope guard gap); assert poison-cleanliness only on test_ledger.py/renames.csv/apply_renames.py.
4. Write `tests/reconstruction_cli_s37.test.ts` (C1–C6) — copy helpers verbatim from
   `tests/reconstruction_cli_s34.test.ts`. **Capture exact `revision N @<id>` strings from a live
   `runCli([S37_JSONL,"--verbose"])` probe BEFORE writing C4–C6.**
5. Update docs (mirror the S36 entries, do not rewrite prior ones): `plans/roadmap.md` (suite 511),
   `plans/reconstruction-engine-design.md` (after the S36 block),
   `plans/implementation-notes-api-from-scenarios.md` (prepend).
6. Verify: `npm test` → **511/0**, `tsc` clean, `git diff --stat -- src/` shows **zero s37 hunks**.
7. Commit with USER APPROVAL ONLY — stage exactly the s37 paths (see plan "Commit hygiene"); never
   `git add -A`, never any `src/*`. The worktree carries unrelated uncommitted work.
8. **Create handoff:** write a completion handoff to `plans/s37/handoff-…-<timestamp>.md` whose `# Handoff:`
   TITLE contains `s37` as the first token AND the whole word `IMPLEMENTED` (e.g.
   `# Handoff: s37 … IMPLEMENTED — CHAR-LOCK`). This fires the downstream `monitor-handoff.sh s37 impl`
   gate that unblocks the s38 planner. Put `MUST READ:` of the relevant file near the top.

## Key Files
- `plans/s37/s37-reconstruction-plan.md` — the authoritative plan (read first; it has every literal).
- `plans/script-handling.txt` — MUST READ: the script-rename family conventions.
- `tests/reconstruction_engine_s34.test.ts` — copy the helper block + FILES/RENAMES/poison verbatim.
- `tests/reconstruction_cli_s34.test.ts` — copy `fileVerboseBlock`/`finalRevisionSlice` verbatim.
- `tests/fixtures.ts` — add `S37_JSONL` after `S36_JSONL`.
- `src/reconstruction_cli.ts` (`runCli`), `src/reconstruction_engine.ts` (`reconstructBranches`),
  `src/reconstruction_sidecar.ts` (`createSidecarReader`/`findSessionId`/`getDefaultFileHistoryRoot`) —
  read-only references; DO NOT edit.

## Context the Next Agent Won't Have
- **s37 = S34 ⊕ S32.** Same `ledger.py` driver-back-and-forth shape as S34, but the rename runs through the
  context-mode MCP sandbox (`ctx_execute`), so loading depends on S32's parser allow-set in
  `src/parse/loadTranscript.ts`. The s37-distinct crux is the parser gate (T6a).
- **MIXED reader-dependence (like S25/S35), NOT uniform like S34:** `ledger.py` (151) and `apply_renames.py`
  (66) are reader-INDEPENDENT (same with or without a reader); `test_ledger.py` (real 69 / no-reader 68) and
  `renames.csv` (real 5 / no-reader 4, drops the `tot_credits,total_credits` row) are reader-DEPENDENT. This
  is why s37's reader test (T2) differs from S34's — capture both directions.
- **POISON CAVEAT (the single biggest trap):** s34's T6 asserts poison-rejection on ALL four files and a
  ledger fallback. For s37 that is WRONG and would be RED: `ledger.py` ACCEPTS the poison backup (its
  forward-validation guard does not reject it here), collapsing to 19 lines and leaking `POISONED`. This is a
  latent robustness gap, NOT a correctness gap (real-reader and no-reader both give the correct 151), and is
  OUT OF SCOPE for this char-lock. Assert poison-cleanliness only on the three guarded files; document the
  ledger.py exclusion in a comment.
- **apply_renames.py uses the PRECOMPILED two-line substitution form**, not s34's inline form:
  `pattern = r"\b" + re.escape(old) + r"\b"` then `text = re.sub(pattern, new, text)`. Assert both lines.
- **No rename-pair substring hazard** (unlike S36's `apply_disc`/`apply_discount`): none of the four new
  names contains an old name as a `\bold\b` match. Still use `\bold\b` regex for old-name absence.
- The captured node ids / tips / `revision @<id>` strings are session-specific (in the plan). The
  `@`-suffixed verbose ids are content hashes — re-capture them from a live probe before writing C4–C6;
  don't transcribe blindly.
- Nothing is committed; `git diff` is NOT s37-only. Confirm the commit split with the user.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 511 / 0 after the lock (499 before)
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s37.test.ts tests/reconstruction_cli_s37.test.ts   # 12/12
git diff --stat -- src/    # NO s37-attributable change (pure characterization lock)
```
