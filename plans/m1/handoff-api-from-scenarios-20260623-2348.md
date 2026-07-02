# Handoff: m1 (`m1-cp-fork`) reconstruction IMPLEMENTED — characterization/regression LOCK, NO `src/` change; 278 tests green, nothing committed (awaiting user approval)
Conversation name: api-from-scenarios — m1 impl monitor → implement m1 (cp-fork)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/cbeb9820-ab83-4daa-9a4a-dfa04711cfbf.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m1/m1-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `ce18413 implemented S22 handling`. The working tree carries uncommitted S23 work (engine fix `src/reconstruction_branches.ts`, `src/Plan_Impl_template.md`, S23 doc edits, untracked `tests/reconstruction_{engine,cli}_s23.test.ts`) PLUS the m1 work below. Also pre-existing: a worktree reorg that deleted the top-level `plans/handoff-*.md` and re-created them under `plans/sN/` (not m1's doing — leave it).

## Goal
Lock — with tests — that `reconstruction_cli` reconstructs `m1-cp-fork` correctly: a `cp` (event E) forks `m1_fork.py` from `m1_base.py`, then BOTH files are edited independently. Pin two novel properties: (1) copy-time snapshot — the fork is born as the source AS OF the `cp` moment (init+enable_debug, 7 lines), NOT base-final (which later gains `disable_all`); (2) per-file independence — base's `disable_all` never leaks into the fork and the fork's `enable_verbose` never leaks into the base. m1 is LINEAR (no rewind → one surviving branch, tip `#3740a519`); it is the FIRST file-level fork (all of S7–S23 forked the conversation).

## Current State
**IMPLEMENTATION COMPLETE; NOTHING COMMITTED (commit gated on user approval per project rule).**
- `npm test` = **278 pass / 0 fail** (269 baseline + 9 new). `npx tsc --noEmit` = clean.
- `git diff --stat src/` shows ONLY the pre-existing S23 changes (`reconstruction_branches.ts`, `Plan_Impl_template.md`) — **m1 added ZERO `src/` changes**, confirming the no-fix premise.
- Engine tests: `tests/reconstruction_engine_m1.test.ts` (4 tests, reader-free) all GREEN. The crux lock was proven to bite — flipping `BASE_AT_COPY`→`BASE_FINAL` turned `test_m1_fork_born_as_copy_of_base_at_copy_time…` RED (actual = 7-line base@copy, expected = 11-line base-final), then restored to GREEN.
- CLI tests: `tests/reconstruction_cli_m1.test.ts` (5 tests) all GREEN; no whitespace reconciliation needed (byte-exact vs plan §2.4).
- Docs updated: `plans/roadmap.md` M1 line flipped to `[x]`; m1 entry prepended to `plans/implementation-notes-api-from-scenarios.md`; m1 note appended to `plans/reconstruction-engine-design.md` after the S23 note (no new spec number).
- Fixture: `M1_JSONL` added to `tests/fixtures.ts` after `S23_JSONL` (Desktop path).

## What Remains
1. **(USER) Approve the commit.** Project rule: one commit per scenario, only after user approval.
2. **Commit — stage EXACTLY these paths (NEVER `git add -A`; shared files carry uncommitted S23 edits, and the worktree handoff-reorg must not be swept in):**
   - `tests/fixtures.ts`
   - `tests/reconstruction_engine_m1.test.ts`
   - `tests/reconstruction_cli_m1.test.ts`
   - `plans/roadmap.md`
   - `plans/implementation-notes-api-from-scenarios.md`
   - `plans/reconstruction-engine-design.md`
   - `plans/m1/m1-reconstruction-plan.md`
   - (optionally `plans/m1/` handoffs — match the prevailing convention for this repo)
   There is **no `src/` file** in the m1 commit. Suggested message: `Implemented m1 handling`.
3. **Next scenario: m2 (`m2-mv-rename.txt`)** — a `mv`/rename. Plan it the same way (planning session → plan + handoff → implementation session gated on the handoff).

## Key Files
- `plans/m1/m1-reconstruction-plan.md` — the authoritative plan: verbatim test code, exact CLI byte-output (§2.4), changeIds, engine file:line map (§3), TDD steps, commit list, acceptance criteria.
- `tests/reconstruction_engine_m1.test.ts` — 4 reader-free engine tests (base history, copy-time snapshot crux, fork independence, three-history count).
- `tests/reconstruction_cli_m1.test.ts` — 5 CLI tests (linear conversationDAG, independent fileDAG groups, single surviving branch, base ends at disable_all, fork copy is 7-line base@copy).
- `tests/fixtures.ts` — `M1_JSONL` (Desktop path).
- `src/reconstruction_branches.ts:139-156` (`seedOneCopy`→`lastRevisionAtOrBefore`), `src/reconstruction_lineage.ts:9-15,33-52`, `src/reconstruction_graph.ts:76-81` — WHY m1 is already correct (READ-ONLY; do not edit).

## Context the Next Agent Won't Have
- **This is a LOCK, not a fix** (like S20/S21/S22). All 9 tests GREEN on first run. If any future m-series test needs a `src/` change, that is a real engine gap — escalate, don't silently patch.
- **The 269 baseline already includes uncommitted S23 work**, so `git diff src/` is NOT empty at start (S23's `reconstruction_branches.ts` + `Plan_Impl_template.md`). m1 must add nothing new to `src/`.
- **NEVER `git checkout`/`restore` the shared docs** (`fixtures.ts`, `roadmap.md`, `implementation-notes…`, `reconstruction-engine-design.md`) to undo a temp edit — they hold S23 edits; revert by hand.
- **Worktree handoff reorg is live and pre-existing:** top-level `plans/handoff-*.md` show as staged deletions and reappear under `plans/sN/` as untracked. This is not m1's work — do not stage or revert it in the m1 commit.
- **The crux is temporal:** the engine seeds the fork from the source reconstructed at the `cp` timestamp (`lastRevisionAtOrBefore`), so the fork is born base@D (7 lines) and base's later `disable_all` can't leak in. CLI line-counts ARE the regression signal: copy block `(7 lines)`, fork final `(10 lines)`, base final `(11 lines)`.
- **No BackupReader needed** — m1 copy seeding reconstructs the source inline; engine tests pass NO reader. The CLI builds its own reader internally.
- **m1 is LINEAR** — CLI output has NO `branch`/`rewound` lines (asserted). FIRST scenario to edit BOTH source and copy after a `cp` (S3 only edited the copy).
- **Fixtures use the Desktop path**, not the worktree path — every `S*_JSONL`/`M1_JSONL` points at `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/…`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 278 pass / 0 fail
npx tsc --noEmit         # clean
git diff --stat src/     # ONLY pre-existing S23 (reconstruction_branches.ts, Plan_Impl_template.md) — no NEW src change
node --import tsx --test tests/reconstruction_engine_m1.test.ts tests/reconstruction_cli_m1.test.ts   # 9 green
# End-to-end byte eyeball (worktree JSONL; stderr is just the debugger banner):
P="scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null      # surviving tip #3740a519, NO rewound
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null # base 11 lines (disable_all); fork copy rev 7 lines, final 10 lines (enable_verbose)
```
