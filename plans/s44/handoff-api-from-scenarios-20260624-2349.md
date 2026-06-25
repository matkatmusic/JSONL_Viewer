# Handoff: Scenario s44 (`s44-git-baseline-then-rename`) IMPLEMENTED (CHAR-LOCK) — next is Scenario s45
MUST READ: plans/script-handling.txt

Conversation name: impl-scenario 44
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/60199014-1ae0-4fb0-8b74-2ffacbb82161.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s44/plan-s44-git-baseline-then-rename.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock `reconstruction_cli`'s already-correct handling of Scenario s44 with a regression test. s44 is the
`git-baseline` family with the script-rename running **mid-stream** (not in the excluded baseline as in
s42/s43). The engine reconstructs every file the transcript touches byte-for-byte already, so this was a
**characterization-lock test only — NO source change**.

## Current State
- **DONE, all green.** Full suite: **552/552** (`npm test`, runner is `node --test`, NOT vitest). s43 left it
  at 546; s44 added 6 cases.
- New file `tests/reconstruction_cli_s44.test.ts` — 6 cases (C1 default DAG, C2 list-branches, C3 graphFile,
  C4 rename_inv.py tip byte-match, C5 inventory.py tip byte-match, C6 no test_inventory.py section). All pass.
- `tests/fixtures.ts` — `S44_JSONL` added after the `S43_JSONL` block, with a comment block.
- `plans/implementation-notes-impl-scenario-44.md` — written (decisions/deviations/live-probe facts).
- **NO `src/` change.** Engine was already correct (confirmed by live `--verbose` probe; both tips byte-match).
- **Nothing committed** (pipeline convention across the s39+ family). The uncommitted tree also still holds the
  earlier s43 artifacts (`tests/reconstruction_cli_s43.test.ts`, `plans/s43/*`) — leave those alone.

## What Remains
1. **Plan Scenario s45** (`/plan-scenario 45`). That is the next pipeline step; this handoff's title naming
   Scenario s44 is what fires the s45 planner's monitor.
2. Nothing else for s44. Do not commit.

## Key Files
- `tests/reconstruction_cli_s44.test.ts` — the new CHAR-LOCK test (clone of the s43 test, helpers reused).
- `tests/reconstruction_cli_s43.test.ts` — the clone source (same helper structure).
- `tests/fixtures.ts` — `S44_JSONL` constant + comment.
- `plans/s44/plan-s44-git-baseline-then-rename.md` — the plan.
- `plans/implementation-notes-impl-scenario-44.md` — this session's notes.
- `scenarios/executed/s44-git-baseline-then-rename/` — JSONL + rendered ground truth (`inventory.py`,
  `rename_inv.py`, `tests/test_inventory.py`).

## Context the Next Agent Won't Have
- **The plan/incoming-handoff claim that rev 0 carries `low_stock` is WRONG for s44.** `low_stock` exists
  NOWHERE in s44 — not on disk, not in any reconstructed revision (verified by grep over both the on-disk
  `inventory.py` and the full `--verbose` output). It was a copy-paste from the s43 notes. The s44 test asserts
  the actual rev-0 function set (`check_quantity, insert_item, remove_item, find_item, tot_value`, 5 funcs) and
  asserts `low_stock` ABSENT. Trust live probe output over plan prose (the s39 lesson repeated).
- **`restock` IS present in s44** (rev 1 onward; on-disk line 160), UNLIKE s43 where it was added after the
  backup point and appears nowhere. s44's mid-stream `inventory.py` ladder is 4 edits: D restock / E reorder /
  F `# reviewed by ops` (user) / G shrink. Revisions 0–4, line counts 175 / 206 / 241 / 242 / 264.
- **`rename_inv.py` IS reconstructed here** (B write + C user-edit; revs 0/1/2, line counts 36/16/38, tip 38).
  This is the s44 distinction vs s43 — `--excludeJSONL` fires before the rename script exists, so the full
  rename machinery is in the mid-stream transcript. The MCP rename itself leaves NO `inventory.py` DAG node;
  its effect surfaces only via the backup-seeded rev 0 (post-rename names). **Reader-DEPENDENT.**
- **C6 gotcha (cost a red first):** the s43 test asserts the bare substring `test_inventory.py` absent from
  `--verbose`. That FAILS in s44 because `rename_inv.py`'s docstring literally reads
  "…renames to inventory.py and tests/test_inventory.py". C6 was rewritten to assert no `### …test_inventory.py`
  SECTION header instead of a whole-output substring check. Any future scenario that reconstructs `rename_inv.py`
  must use the section-header check, not the substring check.
- **Live identifiers** (for assertions): prompt `#9e222129`; surviving branch tip `#974a065f`; rename_inv.py
  nodes B `#01P7yUwh` / C `#37df4213`; inventory.py nodes D `#012m36TL` / E `#01V7qRzW` / F `#7b942a81` /
  G `#01XWh7Ph`.
- CLI invocation: `node --import tsx src/reconstruction_cli.ts <jsonl> [--verbose|--list-branches|--graphFile]`.
  The verbose section header is the **full absolute temp path** (`### /private/var/folders/.../inventory.py`),
  so `--target inventory.py` matches nothing — slice by file section instead (the reused helpers handle this and
  the no-trailing-separator EOF flush).

## How to Verify
```
npm test
```
Expect all green: **552** tests, 0 fail. The 6 s44 cases are in `tests/reconstruction_cli_s44.test.ts`.
