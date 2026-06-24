# Handoff: IMPLEMENT the m4 (`m4-delete-recreate`) reconstruction plan — a characterization/regression LOCK, NO `src/` change. The engine ALREADY reconstructs the delete-then-recreate scenario byte-for-byte correct (verified live: two files, source history `[write, edit, delete, write]` with the recreate born FRESH — kind write not overwrite, every line genesis — and the sibling test's edit as the standard removal+addition pair). This work adds 9 tests (4 engine + 5 CLI) + 3 doc edits to pin it, exactly like the m1/m2/m3/S20/S21/S22 locks. Plan is COMPLETE and authoritative at `plans/m4/m4-reconstruction-plan.md` — follow it verbatim. Baseline 296 → 305.
Conversation name: api-from-scenarios — m4 planning monitor → plan m4 (delete-recreate)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/6be17877-c461-4a26-b49e-1227b36bbc5f.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m4/m4-reconstruction-plan.md
Planning handoff (gated this plan): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m3/handoff-api-from-scenarios-20260624-0740.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling` (S23 and m1 are committed). Working tree carries uncommitted m2 + m3 work — do NOT revert it. Untracked: `plans/m2/`, `plans/m3/`, `plans/m4/`, `tests/reconstruction_cli_m2.test.ts`, `tests/reconstruction_engine_m2.test.ts`, `tests/reconstruction_cli_m3.test.ts`, `tests/reconstruction_engine_m3.test.ts`. Modified (shared with m2 + m3): `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/roadmap.md`, `tests/fixtures.ts`. `git diff src/` is **EMPTY** — neither m2, m3, nor m4 adds any `src/` change.

## Goal
Lock — with tests only — that `reconstruction_cli` correctly reconstructs `m4-delete-recreate`: TWO files where the source `m4_lifecycle.py` is written (v1 `def v1(): return 1`), edited (appends `v1_helper()`), DELETED via bash `rm`, then RE-CREATED at the same path (v2 `def v2(): return 2`); the sibling `tests/test_m4_lifecycle.py` is written (v1 test) then edited to v2. m4 is the FIRST scenario with a NON-TERMINAL delete and the FIRST write→delete→write recreate — it drives the dormant `fileIsPresent` delete-branch ("locked decision 3") that labels the post-delete Write a fresh create (kind write, not overwrite, every line genesis, carrying NONE of the pre-delete v1/v1_helper lineage). Engine is already correct, so this is a characterization/regression LOCK with no production-code change — exactly like m1/m2/m3/S20/S21/S22.

## Current State
**m4 PLANNED, engine-verified live, NOT yet implemented.** Verified against the engine at HEAD `91ac563` + uncommitted m2 + m3:
- Baseline is **296 pass / 0 fail** (`npm test`), `npx tsc --noEmit` clean, `git diff src/` EMPTY — confirmed this session.
- Live `reconstructAll` (reader-free) over the m4 JSONL returns TWO histories:
  - `m4_lifecycle.py`: 4 revisions `[write, edit, delete, write]`. rev2 = delete (0 lines, empty, stamped at rm time). rev3 = recreate, `kind === EventKind.write` (NOT overwrite), `allGenesis === true`, text `def v2():\n    return 2` — confirmed via a live probe.
  - `tests/test_m4_lifecycle.py`: 3 revisions `[write, edit, edit]`; the two edit halves share the one Edit's changeId; ends at the v2 test.
- Live CLI output captured byte-exact (the conversationDAG/fileDAG, `--list-branches` surviving tip `#3b6a446e`, and `--surviving --verbose` with the `(file absent — 0 lines)` delete block) — all transcribed into the plan §2.5.
- On-disk ground truth confirmed: `m4_lifecycle.py` = 23 bytes `def v2():\n    return 2\n`; `tests/test_m4_lifecycle.py` = 76 bytes (v2 test).
- The full engine reference map (file:line) for why NO `src/` change is needed is in plan §3.

## What Remains
Execute `plans/m4/m4-reconstruction-plan.md` verbatim, in order. Use `/jot:implement` (maintain the timestamped implementation-notes log as you go). Read `~/.claude/guides/tdd.md` and `plans/coding-requirements.md` first.
1. **Task 1 (plan §4):** Confirm baseline `npm test` = 296 / `tsc` clean. Then add `M4_JSONL` to `tests/fixtures.ts`, appended after `M3_JSONL` (Desktop path, exact string in §4.2).
2. **Task 2 (plan §5):** Create `tests/reconstruction_engine_m4.test.ts` — 4 reader-free tests (verbatim in §5: source `[write, edit, delete, write]`; non-terminal delete is empty; THE CRUX — recreate born-fresh write-not-overwrite + all-genesis + v2-only; test-file edit pair + two-file accounting). Expect all 4 GREEN on first run. Run the two prove-the-lock RED→GREEN flips (recreate.kind→overwrite; delete lines.length→1) and record them in impl-notes.
3. **Task 3 (plan §6):** Create `tests/reconstruction_cli_m4.test.ts` — 5 tests (verbatim in §6: conversationDAG 6 linear events incl. `delete`; fileDAG two-file grouping; list-branches single surviving two files; delete byte-lock `(file absent — 0 lines)`; recreate byte-lock 2-line v2 + no `revision 4`). Expect all 5 GREEN. Run the sentinel prove-the-lock flips (`def v2():`→`def v2_SENTINEL():`; SENTINEL inside the absent literal) and record them.
4. **Task 4 (plan §7):** 3 doc edits — flip roadmap `[ ] M4 ->` (line 28) to `[x]` with the §7.1 entry; PREPEND the impl-notes m4 entry; append the design.md m4 note after the m3 note (NO new spec number).
5. **Task 5 (plan §8):** Verify `npm test` = **305 / 0**, `tsc` clean, `git diff src/` EMPTY. If any `src/` change appears, STOP and escalate (the no-fix premise is broken).
6. **Task 6 (plan §9):** Commit ONLY on user approval — stage EXACTLY the 7 files in §9 (never `git add -A`), message `Implemented m4 handling`. **Then CREATE A COMPLETION HANDOFF** via `/jot:handoff-prompt` (write it into `plans/m4/`) documenting the finished m4 work (305 green, no-src-change, files staged) and naming the NEXT scenario (roadmap line 29 — read it). **This handoff is a required deliverable.**

## Key Files
- `plans/m4/m4-reconstruction-plan.md` — the authoritative plan (verbatim tests, §2.5 exact CLI output, §3 engine file:line map, TDD prove-the-lock steps, commit list, acceptance criteria). Follow it verbatim.
- `plans/m3/handoff-api-from-scenarios-20260624-0740.md` — the m3 completion handoff that gated this planning (m3 IMPLEMENTED, 296 green, named m4 next).
- `tests/fixtures.ts` — add `M4_JSONL` after `M3_JSONL` (Desktop path; the suite reads from the Desktop RevEng tree, not the worktree).
- `tests/reconstruction_engine_m2.test.ts` / `tests/reconstruction_cli_m2.test.ts` — the reader-free m2 templates to mirror (m4 is reader-free like m2; the `finalTextOf` + `historyEndingWith` helpers come from here).
- `tests/reconstruction_engine.test.ts:30-85` — the S1 delete precedent (terminal delete); `:103` — the paired-edit lock. `tests/reconstruction_replay.test.ts:50-71` — the overwrite-vs-create decision (m4 drives its inverse delete-branch).
- READ-ONLY (why m4 is already correct — do NOT edit): `src/structures/vocabulary.ts:103` (EventKind.delete), `src/reconstruction_extract.ts:39-45,91-100,163-164` (parseRmTarget/bashEventFrom), `src/reconstruction_engine.ts:69-74,167-172` (DeleteEvent type, optional reader), `src/reconstruction_replay.ts:43-62,140-147` (writeRevision/deleteRevision/dispatch), `src/reconstruction_replay_edit.ts:30-35` (fileIsPresent — "locked decision 3"), `src/reconstruction_render.ts:36-42` (the `(file absent — 0 lines)` em-dash body).
- Scenario inputs (read-only): `scenarios/m4-delete-recreate.txt`; `scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl`.

## Context the Next Agent Won't Have
- **This is a LOCK, not a fix** — exactly like m1/m2/m3/S20/S21/S22. The engine is already correct (verified live this session: a `reconstructAll` probe confirmed the recreate revision is `kind=write`, `allGenesis=true`, text `def v2():\n    return 2`; the delete revision is `lines.length=0`). Expect all 9 tests GREEN on first run. If a test cannot go green without touching `src/`, STOP — the premise is wrong, revise the plan, not the engine.
- **m4 is READER-FREE (like m2, unlike m3).** Pass NO `BackupReader`: every m4 event carries content inline (Writes), as an Edit base (Edits), or is a content-less delete (`rm`). NONE is a bash `>>`/`>` redirect, so nothing needs file-history sidecar recovery. Engine tests call `reconstructAll(loadRecords(M4_JSONL))`; CLI tests call `runCli([M4_JSONL, ...])`.
- **THE CRUX is the recreate being born FRESH.** The post-delete Write is a create (`EventKind.write`, NOT `overwrite`) because `fileIsPresent` (`src/reconstruction_replay_edit.ts:30-35`) treats a trailing delete revision as absent — "locked decision 3". `writeRevision` always builds an all-genesis full-content revision and never diffs against history, so v1/v1_helper are NOT carried forward. m4 is the FIRST fixture to drive this delete-branch (the existing `test_second_write_to_a_present_file_is_an_overwrite` covers only the no-delete inverse). The `toolUseResult.type` (`create`/`update`) is parsed but NEVER consumed — do not assert on it.
- **`historyEndingWith` needs a leading-slash suffix.** Both files end with `m4_lifecycle.py`; use `endsWith("/m4_lifecycle.py")` for the source and `endsWith("/test_m4_lifecycle.py")` for the test (the source path ends `/m4_lifecycle.py`, the test path ends `/test_m4_lifecycle.py`, so the slash disambiguates). This is in the plan's helper.
- **CLI whitespace authority:** kind column padded to width 6 (`prompt`/`delete`), target column to width 20 (`test_m4_lifecycle.py`), two-space gaps, five leading spaces before the `N | ` line-number column. The `(file absent — 0 lines)` dash is an em-dash (U+2014), one space each side. If a multi-line `includes` fails, re-capture with the `--surviving --verbose` command in §6 and reconcile — §2.5 is the authority.
- **Prove-the-lock sentinels must be unique:** do NOT reuse `(2 lines)`/`(0 lines)` (they recur across revision blocks). Use `def v2_SENTINEL():` and a SENTINEL inside the absent literal (per the m2/m3 lesson). The Stop hook runs the suite after every test-file edit and BLOCKS on RED — expect (and ignore) its failure notifications during deliberate flips; it passes once restored.
- **Never `git add -A` and never `git checkout`/`restore` the shared docs.** `tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md` carry uncommitted m2 AND m3 edits as well as the m4 edits. Revert specific lines by hand if a temp edit needs undoing (the worktree-git-checkout hazard documented since S18). Three commits may be outstanding (m2, m3, m4) — independent, each its own 7-file scope; do not bundle.
- **Baseline arithmetic:** 296 = 278 committed (HEAD, incl. S23 + m1) + 9 (m2, uncommitted) + 9 (m3, uncommitted). m4 adds 9 → 305.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # before: 296 pass / 0 fail; after m4: 305 pass / 0 fail
npx tsc --noEmit    # expect clean
git diff --stat src/   # expect EMPTY (m4 adds zero src/ change)
# end-to-end byte spot-check (worktree JSONL):
P="scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
#   -> m4_lifecycle.py: 4 revisions — v1, v1+v1_helper, (file absent — 0 lines), then 2-line v2;
#      test_m4_lifecycle.py: 3 revisions ending at the v2 test.
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
#   -> "surviving  tip #3b6a446e    m4_lifecycle.py, test_m4_lifecycle.py"  (no rewound)
```
