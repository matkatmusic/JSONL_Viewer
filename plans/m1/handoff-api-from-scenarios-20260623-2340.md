# Handoff: IMPLEMENT the m1 (`m1-cp-fork`) reconstruction plan — a characterization/regression LOCK, NO `src/` change. The engine ALREADY reconstructs the copy-fork scenario byte-for-byte correct (verified live); this work adds 9 tests (4 engine + 5 CLI) + 3 doc edits to pin it, exactly like the S20/S21/S22 locks. Plan is COMPLETE and authoritative at `plans/m1/m1-reconstruction-plan.md` — follow it verbatim.
Conversation name: api-from-scenarios — m1 planning monitor → plan m1 (cp-fork)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/44d7621b-34c4-4310-b743-82bcf52a0b43.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m1/m1-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `ce18413 implemented S22 handling`. The working tree holds **uncommitted S23 work** (engine fix `src/reconstruction_branches.ts` +28/-5, plus present-but-untracked `tests/reconstruction_{engine,cli}_s23.test.ts`, plus S23 doc edits) — that is the 269-test baseline. Do NOT revert or commit the S23 work; m1 layers on top of it.

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs `m1-cp-fork`, the **copy-fork** scenario: a `cp` (event E) creates `m1_fork.py` from `m1_base.py`, then BOTH files are edited independently (G adds `disable_all` to the base; F adds `enable_verbose` to the fork). The two novel properties to pin: (1) **copy-time snapshot** — the fork is born as `m1_base.py` *as of the cp moment* (`init + enable_debug`, 7 lines), NOT base-final (which later gains `disable_all`); (2) **per-file independence** — base's `disable_all` never leaks into the fork and the fork's `enable_verbose` never leaks into the base. m1 is LINEAR (no rewind → one surviving branch, tip `#3740a519`, no rewound branch). It is the FIRST *file-level* fork (all of S7–S23 forked the conversation).

## Current State
**Planning COMPLETE; implementation NOT started.** The authoritative plan `plans/m1/m1-reconstruction-plan.md` was written after VERIFYING live that the engine already reconstructs all three m1 files byte-for-byte correct (`diff` vs on-disk ground truth passed for `m1_base.py` 11 lines, `m1_fork.py` 10 lines incl. the 7-line copy-born revision, `test_m1_base.py` 5 lines). A 3-subagent code sweep confirmed NO `src/` gap exists. The plan contains the full verbatim test code, the exact captured CLI output (byte source-of-truth), changeIds, and the file:line engine map. Nothing for m1 has been committed or created beyond the plan + this handoff (`plans/m1/`).

## What Remains
Execute the plan `plans/m1/m1-reconstruction-plan.md` end-to-end, in order:
1. **Baseline:** `npm test` (expect 269/0) + `npx tsc --noEmit` (clean). If not, STOP — tree drifted.
2. **Fixture:** add `M1_JSONL` to `tests/fixtures.ts` (Desktop path: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl`) — append after `S23_JSONL`.
3. **Engine tests:** create `tests/reconstruction_engine_m1.test.ts` (4 tests, reader-free) verbatim from plan §5. Run; expect 4 GREEN. Do the prove-the-lock RED step (flip `BASE_AT_COPY`→`BASE_FINAL`, confirm the crux test goes RED, restore).
4. **CLI tests:** create `tests/reconstruction_cli_m1.test.ts` (5 tests) verbatim from plan §6. Run; expect 5 GREEN. (If a multi-line `fileDAG` `includes` mismatches on whitespace, re-capture from the live CLI and reconcile — §2.4 strings are authority.)
5. **Docs (3 edits):** flip `plans/roadmap.md` line 25 `[ ] M1 ->` to `[x]` with the description in plan §7.1; PREPEND an m1 entry to `plans/implementation-notes-api-from-scenarios.md` (§7.2); append an m1 note to `plans/reconstruction-engine-design.md` after the S23 note (~line 219, §7.3, NO new spec number).
6. **Verify:** `npm test` = **278/0**, `npx tsc --noEmit` clean. `git diff --stat src/` must show **ONLY** the pre-existing S23 `src/reconstruction_branches.ts` change and NO new src change (if S23 was committed meanwhile, it's empty). Optional end-to-end byte eyeball per §8.
7. **Commit on USER APPROVAL ONLY** (project rule: one commit per scenario). Stage EXACTLY these 7 paths — NEVER `git add -A` (shared files carry S23 edits): `tests/fixtures.ts`, `tests/reconstruction_engine_m1.test.ts`, `tests/reconstruction_cli_m1.test.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/m1/m1-reconstruction-plan.md`. Message: `Implemented m1 handling`.
8. **CREATE A HANDOFF** via the `/jot:handoff-prompt` skill documenting the completed m1 implementation (test count, no-src-change confirmation, files staged, next scenario). **This is a required deliverable — do not skip it.**

## Key Files
- `plans/m1/m1-reconstruction-plan.md` — THE authoritative plan: verbatim test code, exact CLI byte-output (§2.4), changeIds, engine file:line map (§3), TDD steps, commit list, acceptance criteria.
- `tests/fixtures.ts` — add `M1_JSONL` (Desktop path). Already carries the uncommitted `S23_JSONL`.
- `tests/reconstruction_engine_s23.test.ts` / `tests/reconstruction_cli_s23.test.ts` — the structural templates the m1 test files mirror (helpers `finalTextOf`/`historyEndingWith`, `runCli` usage, assertion style).
- `src/reconstruction_branches.ts:139-156` (`seedOneCopy` → `lastRevisionAtOrBefore`) — why copy-time snapshot is correct. `src/reconstruction_lineage.ts:9-15,33-52` + `src/reconstruction_graph.ts:76-81` — why source/copy stay independent. (READ-ONLY — do not edit.)
- m1 inputs: worktree JSONL `scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl`; ground-truth files `scenarios/executed/m1-cp-fork/{m1_base.py,m1_fork.py,tests/test_m1_base.py}`.

## Context the Next Agent Won't Have
- **This IS a lock, not a fix** (like S20/S21/S22, unlike S19/S23). If ANY test cannot be made GREEN without touching `src/`, STOP and escalate — that means the live verification was wrong; revise the plan, NOT the engine.
- **The 269 baseline already includes uncommitted S23 work.** `git diff src/` is NOT empty when you start — it shows S23's `reconstruction_branches.ts`. m1 must add nothing new to `src/`. The shared doc files (`fixtures.ts`, `roadmap.md`, `implementation-notes…`, `reconstruction-engine-design.md`) already hold S23 edits → NEVER `git add -A`, NEVER `git checkout`/`restore` them (revert temp edits by hand).
- **The crux is temporal:** the engine seeds the fork from the source reconstructed *at the cp timestamp* (`lastRevisionAtOrBefore`), so the fork is born as base@D (7 lines) and base's later `disable_all` cannot leak in. The CLI verbose copy block is `(7 lines)`, the fork final is `(10 lines)`, base final is `(11 lines)` — these line-counts ARE the regression signal; if a future regression used base-final the copy block would be 11 lines.
- **No BackupReader needed.** m1 copy seeding reconstructs the source inline; engine tests pass NO reader (reader-free, like S22). The CLI builds its own reader internally and is unaffected.
- **m1 is LINEAR** — assert NO `branch`/`rewound` in CLI output (mirrors the s3-copy precedent). It is the FIRST scenario to edit BOTH source and copy after a `cp` (s3 only edited the copy).
- **fixtures use the Desktop path, not the worktree path** — every `S*_JSONL` points at `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/…`; the m1 JSONL is confirmed present there.
- **Roadmap placeholder** `[ ] M1 ->` is at line 25 (after `[x] S23` line 24); `[ ] M2`, `[ ] M3` follow.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 278 pass / 0 fail after implementation (269 baseline + 9)
npx tsc --noEmit         # clean
git diff --stat src/     # ONLY the pre-existing S23 reconstruction_branches.ts (no NEW src change)
# Targeted m1 test run:
node --import tsx --test tests/reconstruction_engine_m1.test.ts tests/reconstruction_cli_m1.test.ts
# End-to-end byte eyeball (worktree JSONL; stderr is just the debugger banner):
P="scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null     # surviving tip #3740a519, NO rewound
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null  # base 11 lines (disable_all); fork copy rev 7 lines, final 10 lines (enable_verbose)
```
