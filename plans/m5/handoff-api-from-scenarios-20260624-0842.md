# Handoff: m5 (`m5-full-interleave`) IMPLEMENTED as a characterization/regression LOCK — NO `src/` change. 315 tests pass (305 baseline + 10 new). All acceptance criteria in `plans/m5/m5-reconstruction-plan.md` §10 met except §9 commit (gated on user approval) and §10 final box (this handoff, now satisfied). **Next scenario: m6** (`m6-cp-user-edit-rewind`, roadmap line 30 — scenario authored at `scenarios/m6-cp-user-edit-rewind.txt`, executed transcript present, NOT yet planned) — plan and implement it the same way (ground-truth-first: run the CLI live against the executed transcript, verify byte-for-byte, then char-lock or real-fix depending on whether the engine is already correct).
Conversation name: api-from-scenarios — m5 impl monitor → implement m5 (full-interleave)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/059abe45-cdbf-4f0c-a645-d8f65587274d.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m5/m5-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling` (S23 + m1 committed). Working tree carries uncommitted m2 + m3 + m4 work plus this m5 work — do NOT revert it. Untracked: `plans/m2/`, `plans/m3/`, `plans/m4/`, `plans/m5/`, `tests/reconstruction_{cli,engine}_m{2,3,4,5}.test.ts`. Modified (shared with m2/m3/m4): `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/roadmap.md`, `tests/fixtures.ts`. `git diff src/` is **EMPTY** — m2, m3, m4, and m5 each add zero `src/` change.

## Goal
Lock — with tests only — that `reconstruction_cli` correctly reconstructs `m5-full-interleave`: ONE source file `m5_interleave.py` mutated by interleaved USER + AGENT edits straddling a **code-rewind**, plus a sibling `tests/test_m5_interleave.py` (write only). The engine was already byte-for-byte correct, so m5 is a characterization/regression LOCK with NO production-code change — the same shape as m1/m2/m3/m4/S20/S21/S22.

## Current State
**m5 IMPLEMENTED and fully verified. Nothing committed (gated on user approval).**
- `npm test` = **315 pass / 0 fail** (305 baseline + 10 new).
- `npx tsc --noEmit` = clean.
- `git diff --stat src/` = **EMPTY** (no production-code change).
- End-to-end CLI byte-eyeball matches plan §2.5 exactly: `--list-branches` shows surviving `#93e7f94c` (both files) + rewound `#fcd9c268` rewind @ `#b3aed408`; `--surviving --verbose` shows `m5_interleave.py` as 4 revisions ending at the 5-line interleaved file, revision 2 = the backup-recovered `@v5` `user_add_2` 4-line block; the test file is 1 revision.
- All 4 prove-the-lock RED-flips were confirmed to bite, then restored (see impl-notes "Prove-the-lock RED→GREEN log").

Files changed (the exact 7-file commit set in plan §9):
1. `tests/fixtures.ts` — `M5_JSONL` appended after `M4_JSONL` (Desktop path).
2. `tests/reconstruction_engine_m5.test.ts` — NEW, 5 reader-backed engine tests (in-memory `m5Reader`).
3. `tests/reconstruction_cli_m5.test.ts` — NEW, 5 CLI tests (real on-disk reader).
4. `plans/roadmap.md` — line 29 M5 flipped to `[x]` with full one-liner.
5. `plans/implementation-notes-api-from-scenarios.md` — m5 entry prepended above the m4 entry.
6. `plans/reconstruction-engine-design.md` — m5 note appended after the m4 note (NO new spec number).
7. `plans/m5/m5-reconstruction-plan.md` — the plan (already on disk).

## What Remains
1. **(User decision) Commit m5.** Stage EXACTLY the 7 files above — never `git add -A` (m2/m3/m4 commits are separate outstanding decisions; the worktree also carries the `plans/mN/` handoff layout). Suggested message: `Implemented m5 handling`. No `src/` file is in the commit.
2. **Plan the next scenario (roadmap line 30).** The scenario is authored at `scenarios/m6-cp-user-edit-rewind.txt` and its executed transcript is at `scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl` (final on-disk files `m6_source.py`, `m6_derived.py` present). It is a `cp`-fork (m1 pattern) COMBINED with a user-edit on the derived copy and a code-rewind (m5 pattern): write `m6_source.py` (class `Base`) + test; edit to add `describe()`; `cp` to `m6_derived.py`; the user out-of-band inserts `# derived version`; Claude adds `transform()`; then `Rewind: 2, code` discards `transform()`; Claude adds `validate()`. Plan it ground-truth-first: run `reconstruction_cli.ts` live against that transcript, verify byte-for-byte, then write a char-lock plan (or a real-fix plan if the engine is wrong), with a "create handoff" task.
3. **Implement that plan** the same way this m5 work was done: append the fixture, write the 2 verbatim test files, prove each lock bites then restore, make the 3 doc edits, full-verify (`npm test` / `tsc` / `git diff src/` empty), then write a completion handoff.

## Key Files
- `plans/m5/m5-reconstruction-plan.md` — the authoritative m5 plan (executed verbatim; §2.5 has the exact CLI bytes, §3 the file:line reference map, §10 acceptance criteria).
- `tests/reconstruction_engine_m5.test.ts`, `tests/reconstruction_cli_m5.test.ts` — the 10 m5 tests.
- `tests/fixtures.ts` — `M5_JSONL` (and `M6_*` would be appended next).
- `scenarios/m6-cp-user-edit-rewind.txt` — the next scenario script.
- `scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl` — its executed transcript (worktree copy; the fixture would point at the Desktop copy).
- `plans/reconstruction-engine-design.md` (m5 note ends just before the `path-resolve.ts` bullet), `plans/implementation-notes-api-from-scenarios.md` (newest-first; m5 entry on top), `plans/roadmap.md` (line 30 is the next entry to flip).
- `src/reconstruction_branches.ts:41-102` (`seedStaleEditBases`/`editBaseIsStale`/`staleEditSeedFor` — the S19 reseed), `src/reconstruction_sidecar.ts:115` (`backupSeedWriteFor`), `src/reconstruction_engine.ts:206-242` (`reconstructBranches`/`buildRewoundBranchHistory`) — read but DO NOT modify for a char-lock.

## Context the Next Agent Won't Have
- **m5 is the m3 READER pattern, NOT reader-free.** `user_add_2` (the second user edit) carries NO content in the JSONL — its disk state lives ONLY in the file-history backup `17bbea89afb745a4@v5`. Engine tests therefore seed an IN-MEMORY `BackupReader` (one blob → independent of the live `~/.claude/file-history`); CLI tests 4–5 drive `runCli`'s REAL on-disk reader and DEPEND on that backup resolving (verified present on this machine — all 5 were green on the first run). If a future reader-backed CLI test is RED on first run, the live backup isn't resolving — STOP and report, do not weaken the assertion.
- **The S19 reseed FIRES here** (it is DORMANT in m3). The surviving `agent_add_2` Edit records a base that includes the backup-only `user_add_2` line, so its on-branch base reconstructs too SHORT (3 lines) → `editBaseIsStale` true → `@v5` recovered as a synthetic `overwrite` before the Edit. WITHOUT a reader the overwrite is dropped (3 revisions) but the final text is byte-identical. On the rewound branch the reseed stays INERT (aligned base), so the rewound branch is reader-independent.
- **`historyEndingWith` suffixes MUST lead with a slash** (`/m5_interleave.py`) — `test_m5_interleave.py` also ends with `m5_interleave.py`.
- **Worktree-git-checkout hazard:** do NOT `git checkout`/`restore` the four shared docs (`tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`) — they carry uncommitted m2 + m3 + m4 + m5 edits. Revert specific lines by hand.
- **Monitor false-fire lesson (carried forward):** name the next scenario ONLY in a handoff TITLE line, never in loose body prose — the m4 completion handoff's body literal "Next scenario: m5" false-fired the m5 planning monitor; this session's impl monitor also false-fired once on that same line until its predicate was tightened to "line-1 first `m[0-9]+` token must equal the target". Handoffs nest in `plans/<scenario>/` SUBFOLDERS, never `plans/` top-level — watch the subfolder.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # expect: tests 315 / pass 315 / fail 0
npx tsc --noEmit      # expect: clean
git diff --stat src/  # expect: EMPTY (m5 is a no-src-change LOCK)

# End-to-end byte-eyeball:
P="scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# expect: surviving #93e7f94c (m5_interleave.py, test_m5_interleave.py) + rewound #fcd9c268 rewind @ #b3aed408 (m5_interleave.py)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
# expect: m5_interleave.py 4 revisions ending at the 5-line interleaved file; revision 2 = the user_add_2 @v5 block; test file 1 revision
```
