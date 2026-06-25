# Handoff: s32 (`s32-script-rename-mcp-exec`) IMPLEMENTED — one-line parser fix for MCP attribution keys; suite 436→451 green, NOTHING committed
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S32 impl (/impl-scenario 32)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/46c9f2e9-d231-4caf-b98d-930f93f1d948.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s32/s32-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (unchanged — NOTHING committed this session).

## Goal
Make the reconstruction engine handle a script rename whose rename script is executed through the
**context-mode MCP sandbox** (`mcp__plugin_context-mode_context-mode__ctx_execute`, shell
`python3 rename_config.py`) rather than the Bash tool used by every prior rename (s25–s31). The ONLY engine
gap was a PARSER crash on two novel assistant top-level keys; after a one-line fix the whole scenario
reconstructs byte-perfectly (HAS-BEACON / reader-INDEPENDENT, the s24/s31 mechanism).

## Current State — COMPLETE
- **Suite: 451/451 green** (`npm test`), `npx tsc --noEmit` clean. Baseline was 436; +15 (1 parser-gate + 8
  engine + 6 CLI).
- **The fix (1 line, the FIRST `src/parse/loadTranscript.ts` change in the s25–s32 series):** added
  `"attributionMcpServer"`, `"attributionMcpTool"` to the assistant entry of `ALLOWED_TOP_LEVEL_KEYS`.
  Assistant-only (NOT added to `ENVELOPE_KEYS`); bare varargs into `keys(...)`, no new constant/indirection.
  `git diff -- src/parse/loadTranscript.ts` = exactly ONE hunk (+3/−1).
- **RED→GREEN proven.** At HEAD the 19 MCP-invoking assistant records carry `attributionMcpServer`
  (`plugin:context-mode:context-mode`) + `attributionMcpTool` (`ctx_execute`); `assertOnlyKnownTopLevelKeys`
  threw `UnmodeledFieldError` at parse time, gating EVERY file. After the fix: 206 records parse, 19 carry
  both keys.
- **Mutation proof.** Reverting the fix (`git checkout -- src/parse/loadTranscript.ts` — SAFE, it was NOT in
  the uncommitted S28/29/30 set) sends **7 tests RED** with `UnmodeledFieldError`: the parser-gate test + all
  6 CLI tests (these load through the GATED `loadTranscript` via `runCli:188`). The **8 engine tests stay
  GREEN** — they build via the UNGATED `loadRecords` (`tests/utilities.ts` → `parseRecord`, no field gate),
  so they lock reconstruction OUTPUT but don't exercise the gate. Re-apply → all green. (This CORRECTS the
  plan's Task-6 prediction that Tasks 4–5 would all go red.)
- **Reconstruction (live-verified, NO BackupReader):** `config_utils.py` 11 revs → 260 L (byte-exact),
  `tests/test_config_utils.py` 2 revs → 87 L (byte-exact), `rename_config.py` 1 rev → 62 L. Linear; one
  surviving branch (tip #1be0133f), three files, `rewound.length === 0`. `extractFileEvents`: writes=3,
  edits=6 (all on config_utils.py), userEdits=2 (`c7922fde` test / `d9cbc214` config), overwrites=0. All
  rescue stages INERT; clean poison matrix.
- **Docs updated:** roadmap.md (S32 line, 451), reconstruction-engine-design.md (S32 note after S31),
  implementation-notes-api-from-scenarios.md (prepended S32 entry).

## What Remains
1. **(USER) Approve the commit and split it.** NOTHING is committed. See "Commit hygiene" below — this is the
   only open action for S32 itself.
2. **(Downstream) S33 planning.** The S33 planning monitor (`bgr4ktge6`, per memory) fires on
   `./monitor-handoff.sh s32 impl`, whose predicate matches THIS handoff's title (first token `s32` + word
   `IMPLEMENTED`). No action needed here — it auto-fires.

## Key Files
- `src/parse/loadTranscript.ts` — THE fix (assistant entry of `ALLOWED_TOP_LEVEL_KEYS`, +3/−1).
- `tests/fixtures.ts` — added `S32_JSONL` constant.
- `tests/loadTranscript.test.ts` — added `test_s32_jsonl_parses_with_mcp_attribution_keys` (the parser-gate /
  RED proof).
- `tests/reconstruction_engine_s32.test.ts` — 8 engine tests (byte-locks, revision ladders, whole-word
  rename, kept-name control, edit-ordering crux, HAS-BEACON multiset, reader-independence). NEW.
- `tests/reconstruction_cli_s32.test.ts` — 6 CLI tests (DAGs, list-branches, graphFile ladders, verbose
  final-revision byte-locks). NEW.
- `plans/s32/s32-reconstruction-plan.md` — the authoritative plan.
- `plans/script-handling.txt` — MUST READ; HAS-BEACON vs NO-BEACON premise (line 4-6 names the MCP sandbox).

## Context the Next Agent Won't Have
- **The engine tests do NOT exercise the field gate.** `tests/utilities.ts:loadRecords` uses `parseRecord`
  directly (no `assertOnlyKnownTopLevelKeys`), so engine reconstruction never needed the parser fix — only
  the gated `loadTranscript` path (CLI + the parser-gate test) does. The plan predicted otherwise; reality is
  in the impl-notes Deviations. The fix's necessity rests on the 7 gated RED tests.
- **CLI tests use plain `--verbose` sliced by `### …/<suffix>` header + `finalRevisionSlice`, NOT `--target`.**
  `--target` filters on the absolute reconstructed path and returns EMPTY output for a basename — wasted 10
  min before switching to the s31 pattern. Early revisions carry OLD names, so absence checks MUST be scoped
  to the final-revision slice.
- **Whole-word hazard (carried from s31):** the test file keeps `_`-bounded def names
  `test_get_val_flat_key` / `test_set_val_overwrites_existing` — NOT missed renames. Every absence assertion
  uses `\bget_val\b` etc., never bare `includes()`.
- **Reconstructed paths live under** `/private/var/folders/.../run-scenario.dhujr06t/…`;
  `historyEndingWith(histories, "/config_utils.py")` (leading slash) disambiguates from
  `/tests/test_config_utils.py`.
- **COORDINATION HAZARD (same as S28–S31):** the worktree carries uncommitted S28/S29/S30 engine work
  (`reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`), S28–S31 test + plan + doc
  files, and unrelated `src/Plan_template.md` / `src/Impl_template.md` edits by other agents. `git diff
  --stat -- src/` shows the S32 hunk (loadTranscript.ts) ALONGSIDE all of that. Do not assume the diff is
  S32-only.

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY these S32 paths — never `git add -A`, never any other `src/*`:
`src/parse/loadTranscript.ts`, `tests/fixtures.ts`, `tests/loadTranscript.test.ts`,
`tests/reconstruction_engine_s32.test.ts`, `tests/reconstruction_cli_s32.test.ts`, `plans/roadmap.md`,
`plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s32/`.
The three doc files + `src/` also carry uncommitted prior-scenario (S28/S29/S30) work — confirm the
commit-split with the user; do not assume.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 451 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/loadTranscript.test.ts tests/reconstruction_engine_s32.test.ts tests/reconstruction_cli_s32.test.ts   # 18/18
git diff -- src/parse/loadTranscript.ts   # exactly ONE S32 hunk (+3/-1)
# Mutation proof: git checkout -- src/parse/loadTranscript.ts → 7 RED (parser-gate + 6 CLI); re-apply → green.
```
