# Handoff: IMPLEMENT Scenario s32 (`s32-script-rename-mcp-exec`) — PLANNED. ONE-LINE REAL engine fix (FIRST `loadTranscript`/parser change in the script-rename series): model assistant MCP-attribution keys `attributionMcpServer`/`attributionMcpTool` so the transcript parses. After the fix the scenario reconstructs byte-perfectly with NO other change — both renamed files HAS-BEACON / reader-INDEPENDENT. Baseline 436→436+N. Commit pending USER APPROVAL.
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S32 planning (/plan-scenario 32)
JSONL (this planning session): see the active session.
Plan file: **plans/s32/s32-reconstruction-plan.md** (AUTHORITATIVE — every literal re-verified LIVE this session: parser fix prototyped → 436/0 → reverted byte-clean).

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae`. The tree is NOT clean: S28+S29+S30 engine
work is implemented but UNCOMMITTED (modified `src/reconstruction_branches.ts`, `_reseed.ts`,
`_sidecar.ts`, `_user_edit.ts`), plus uncommitted S28/S29/S30/S31 test + plan + doc files, plus
unrelated `src/Plan_template.md`/`src/Impl_template.md` edits by other agents. **S31 is IMPLEMENTED**
(424→436). `src/parse/loadTranscript.ts` is currently CLEAN (NOT in the uncommitted set) — S32's one
src change lands there.

## Goal
Make the engine handle a script rename whose rename script is executed through the **context-mode MCP
sandbox** (`mcp__plugin_context-mode_context-mode__ctx_execute`, shell `python3 rename_config.py`) —
NOT the Bash tool used by every prior rename (s25–s31). Whole-word rename
`get_val→get_value`, `set_val→set_value`, `del_val→delete_value` across `config_utils.py` and
`tests/test_config_utils.py` (`has_val`/`merge_val` kept).

## The ENTIRE engine gap (one thing)
At HEAD the parser CRASHES before any reconstruction:
```
UnmodeledFieldError: Unmodeled top-level key "attributionMcpServer" on assistant record
  (src/parse/loadTranscript.ts:66, assertOnlyKnownTopLevelKeys)
```
The 19 MCP-invoking assistant records each carry two novel top-level keys —
`attributionMcpServer`="plugin:context-mode:context-mode" and `attributionMcpTool`="ctx_execute".
(`entrypoint`, which also appears here, is ALREADY in `ENVELOPE_KEYS` → not novel.)

**Fix = one line** in `src/parse/loadTranscript.ts`, the assistant entry of `ALLOWED_TOP_LEVEL_KEYS`:
add `"attributionMcpServer", "attributionMcpTool"` to its `keys(ENVELOPE_KEYS, "message",
"requestId", …)` call. Keep them assistant-only (do NOT add to `ENVELOPE_KEYS`; only MCP-calling
assistant records carry them). No new constant/indirection — varargs into `keys(...)` exactly like
the existing entries.

## After the fix — already verified byte-perfect (NO further engine change)
With the parser fixed, `reconstruction_cli --verbose` reconstructs everything with no FLAG/MISMATCH:
- `config_utils.py`: 11 revisions, final 260L, **byte-exact** vs rendered (get_value/set_value/
  delete_value + get_or_default + apply_overrides).
- `tests/test_config_utils.py`: 2 revisions, final 87L, **byte-exact** vs rendered.
- `rename_config.py`: 1 revision, 62L.
Both renamed files are **HAS-BEACON / reader-INDEPENDENT**: the harness injects 2 `edited_text_file`
disk-snapshot echoes after the MCP run (the s24/s15 mechanism), so they adopt the renamed state for
free — NO BackupReader, NO script-replay; rescue stages S27/S28/S19 all INERT. `script-handling.txt`
line 4-6 already names the MCP sandbox as a HAS-BEACON-governed invisible-mutation source.

## What the implementer does (full detail in the plan — TDD order)
1. `tests/fixtures.ts`: add `S32_JSONL` (Desktop sibling path; 206 records).
2. RED proof: extend `tests/loadTranscript.test.ts` with `test_s32_jsonl_parses_with_mcp_attribution_keys`
   (record count 206, 19 records carry both keys with the exact values). Confirm RED at HEAD
   (`UnmodeledFieldError`) BEFORE the fix.
3. GREEN: apply the one-line `loadTranscript.ts` fix.
4. `tests/reconstruction_engine_s32.test.ts`: byte-lock both files (build with NO BackupReader),
   revision counts (11/2/1), whole-word rename assertions (`\bget_val\b` etc. — see hazard), kept
   function-name control (`def test_get_val_flat_key(`), edit-ordering crux via `defBlock`. Re-probe
   the live `extractFileEvents` multiset before asserting it (S28/S31 lesson).
5. `tests/reconstruction_cli_s32.test.ts`: byte-lock `--verbose` for both `--target`s.
6. Mutation proof: `git checkout -- src/parse/loadTranscript.ts` (SAFE — not in the S28/29/30 set) →
   all s32 tests RED; re-apply → green. Log in implementation-notes.
7. Docs: roadmap (436→new), implementation-notes (prepend S32), reconstruction-engine-design (S32
   note after S31).

## Whole-word hazard (carry the s31 lesson — DO NOT regress)
Test function names `test_get_val_flat_key` / `test_set_val_overwrites_existing` legitimately KEEP
the terse substrings (`_`-bounded, not whole-word matches) — they are NOT missed renames. Every
absence assertion MUST use `/\bget_val\b/` word-boundary regexes, never bare `includes()`.

## Context the next agent won't have
- Reconstructed paths live under the absolute temp dir `/private/var/folders/.../run-scenario.dhujr06t/…`
  — `historyEndingWith(histories, "/config_utils.py")` (leading slash) is the safe selector; the
  leading slash keeps `/config_utils.py` from also matching nothing else, and `/tests/test_config_utils.py`
  is distinct.
- An earlier preliminary recon GUESSED s32 was reader-DEPENDENT (backup recovery). That was WRONG —
  it only inspected the MCP `tool_result` (stdout-only) and missed the `edited_text_file` echoes on
  the following user turn. The corrected, live-verified truth: HAS-BEACON, reader-INDEPENDENT.
- This is the FIRST scenario in the series to touch the PARSER (`loadTranscript.ts`) rather than the
  reconstruction/replay layer. `git diff -- src/` after S32 must show exactly ONE S32 hunk
  (loadTranscript.ts) on top of the pre-existing S28/29/30 hunks.

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY: `src/parse/loadTranscript.ts`, `tests/fixtures.ts`, `tests/loadTranscript.test.ts`,
`tests/reconstruction_engine_s32.test.ts`, `tests/reconstruction_cli_s32.test.ts`,
`plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/reconstruction-engine-design.md`, `plans/s32/`. Never `git add -A`, never any other `src/*`.
COORDINATION HAZARD: the three doc files + `src/` also carry uncommitted S28/S29/S30 work — confirm
the commit-split with the user; do not assume.

## How to verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 436 + N / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/loadTranscript.test.ts
node --import tsx --test tests/reconstruction_engine_s32.test.ts
node --import tsx --test tests/reconstruction_cli_s32.test.ts
git diff --stat -- src/   # exactly ONE S32 hunk: src/parse/loadTranscript.ts
```
