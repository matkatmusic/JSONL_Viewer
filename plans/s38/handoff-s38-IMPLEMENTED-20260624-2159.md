# Handoff: s38 IMPLEMENTED (`s38-script-rename-script-user-edit-mcp`) — CHAR-LOCK, no engine change
MUST READ: plans/script-handling.txt

Conversation JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/608d7dbc-d816-4bb5-86ce-d76a135bb516.jsonl

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock in the engine's existing correct handling of Scenario s38
(`script-rename-script-user-edit-mcp`, the MCP twin of S35). Achieved as a
characterization/regression lock — NO `src/` change.

## Current State — DONE
- Full suite GREEN: `npm test` → **517 tests, 517 pass, 0 fail** (511 baseline + 6 new s38).
- `npm run typecheck` clean (tsc --noEmit, no errors).
- 6 new s38 CLI tests all pass on the FIRST run — no `src/` change required.
- Verified s38 is a CHAR-LOCK: the S27/S28 incomplete-beacon rescue and the S32
  MCP `ctx_execute` parser fix are already in the worktree, so the engine clears
  s38 end-to-end with no new code.

## What Was Done
1. `tests/fixtures.ts` — added `S38_JSONL` (desktop RevEng path, matching the
   project convention for prior `S*_JSONL` constants).
2. `tests/reconstruction_cli_s38.test.ts` — NEW, 6 CLI tests (C1–C6), mirroring
   `tests/reconstruction_cli_s37.test.ts`, adapted to s38's 3-file linear shape.
   All expected strings were captured from live `runCli` output, not hand-written.
3. `plans/roadmap.md` — appended the S38 entry (after S37).
4. `plans/reconstruction-engine-design.md` — appended the S38 block (after S37,
   before the `src/structures/path-resolve.ts` bullet).

## What Remains
1. (Optional) `git add` + commit the s38 artifacts — NOTHING is committed yet.
   Changed/added: `tests/fixtures.ts`, `tests/reconstruction_cli_s38.test.ts`,
   `plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
   `plans/s38/*` (plan + this handoff).
2. Proceed to the next scenario (s39+) when its planning handoff lands.

## Key Files
- `tests/reconstruction_cli_s38.test.ts` — the 6-test char-lock suite.
- `tests/fixtures.ts` — `S38_JSONL` constant.
- `scenarios/executed/s38-script-rename-script-user-edit-mcp/fa5ad942-4316-406b-95a5-65995b112970.jsonl` — input JSONL (also on desktop RevEng path).
- `plans/s38/s38-reconstruction-plan.md` — the plan.
- `src/reconstruction_cli.ts` — exports `runCli(argv)`.

## Context the Next Agent Won't Have
- **Runner is `node --test`, NOT vitest.** Run the suite with `npm test`
  (`node --import tsx --test tests/*.test.ts`). The s38 planning handoff said
  "npx vitest run" — that is WRONG; vitest is not even a dependency and reports
  "PASS (0) FAIL (0)" (it finds zero `node:test` tests). Use `npm test`.
- **Capture-script path gotcha:** a `runCli` capture script with a RELATIVE
  import (`./src/reconstruction_cli.ts`) fails from the scratchpad/`/tmp`. Write
  it in the repo ROOT (then `rm` it) so the relative import resolves.
- **s38 = S35 ⊕ S32:** the rename SCRIPT itself (`rename_inv.py`) is user-edited
  (incomplete beacon → S27/S28 rescue) AND the run is driven via MCP
  `ctx_execute` (S32 parser path). Both already handled — that's WHY it's a
  char-lock.
- **Structure differs from s37** (do NOT transcribe s37's literals): s38 has 3
  files (no separate `renames.csv`): `inventory.py` (4 revs → 229 L),
  `tests/test_inventory.py` (3 revs → 74 L), `rename_inv.py` (3 revs → 47 L).
  Rename map `qty_chk→check_quantity`/`add_item→insert_item`/`rm_item→remove_item`.
  INLINE `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` form (NOT s37's
  precompiled two-line form). Linear, surviving tip #ef548232, prompt #20f20b89.
- **KEPT-NAME hazard:** `find_item`/`tot_value` survive (not in RENAMES). All
  absence assertions use `\bold\b`, never bare `includes()`.

## How to Verify
`npm test` — all green, including the 6 new s38 tests. `npm run typecheck`
clean. No diff under `src/`.
