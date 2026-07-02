# Handoff: IMPLEMENT the m5 (`m5-full-interleave`) reconstruction plan — a characterization/regression LOCK, NO `src/` change. The engine ALREADY reconstructs the full-interleave scenario byte-for-byte correct (verified live: two branches, the surviving source's `user_add_2` recovered from the file-history backup `17bbea89afb745a4@v5` as a seeded `@v5` overwrite via the S19 "base too short" `seedStaleEditBases` reseed FIRING, ending at the 5-line interleaved file; the rewound branch base+user_add_1+agent_add_1 reader-independent). This work adds 10 tests (5 engine + 5 CLI) + 3 doc edits to pin it, exactly like the m1/m2/m3/m4/S20/S21/S22 locks. The plan's 10 verbatim tests were each RUN GREEN during planning (305 → 315), then removed so the tree is clean. Plan is COMPLETE and authoritative at `plans/m5/m5-reconstruction-plan.md` — follow it verbatim. Baseline 305 → 315.
Conversation name: api-from-scenarios — m5 planning monitor → plan m5 (full-interleave)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/f409b51c-48ca-49c1-a382-aaa0db3ed28b.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m5/m5-reconstruction-plan.md
Planning guide followed: ~/.claude/guides/planning.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling` (S23 + m1 committed). Working tree carries uncommitted m2 + m3 + m4 work plus this m5 plan — do NOT revert it. Untracked: `plans/m2/`, `plans/m3/`, `plans/m4/`, `plans/m5/`, `tests/reconstruction_{cli,engine}_m{2,3,4}.test.ts`. Modified (shared with m2/m3/m4): `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/roadmap.md`, `tests/fixtures.ts`. `git diff src/` is **EMPTY** — m2, m3, m4, and m5 each add zero `src/` change.

## Goal
Lock — with tests only — that `reconstruction_cli` correctly reconstructs `m5-full-interleave`: ONE source file `m5_interleave.py` mutated by interleaved USER + AGENT edits straddling a **code-rewind**, plus a sibling `tests/test_m5_interleave.py` (write only). The scenario yields TWO branches — surviving (base + user_add_1 + user_add_2 + agent_add_2, 5 lines) and rewound (base + user_add_1 + agent_add_1, 6 lines). m5 is the "full interleave": the FIRST scenario combining a user-edit kept on the surviving lineage across a rewind (S18/S20/S22), an agent edit abandoned to the rewound branch, a backup-only second user edit (`user_add_2`, recovered from `17bbea89afb745a4@v5`), and a post-rewind agent edit whose stale base triggers the **S19 `seedStaleEditBases` reseed (FIRING)**. FIRST m-series scenario with a rewind (branched conversationDAG). Engine already correct → characterization/regression LOCK, NO production-code change.

## Current State
**m5 PLANNED, not yet implemented.** The plan `plans/m5/m5-reconstruction-plan.md` is complete and authoritative. Baseline verified live: `npm test` = **305 pass / 0 fail**, `npx tsc --noEmit` clean, `git diff --stat src/` EMPTY. The plan's exact test code (5 engine + 5 CLI) was created, run (all **10 GREEN**, total would be 315), and then removed during planning — so NOTHING for m5 exists in the tree yet except the plan itself. The fixture append was likewise reverted. Ground truth (revisions, changeIds, backup blob, exact CLI byte output) is captured verbatim in plan §2.

## What Remains
Execute `plans/m5/m5-reconstruction-plan.md` in order:
1. **Task 1 (§4)** — Confirm baseline `npm test` = 305 / tsc clean / `git diff src/` empty. Then append the `M5_JSONL` constant (Desktop path) after `M4_JSONL` in `tests/fixtures.ts` (exact block in §4.2).
2. **Task 2 (§5)** — Create `tests/reconstruction_engine_m5.test.ts` (5 tests, verbatim from §5; in-memory `m5Reader` seeded with the one backup blob). Run → all GREEN. Prove crux test 2 (`overwrite`→`write`) and test 3 (length `3`→`4`) bite, then restore.
3. **Task 3 (§6)** — Create `tests/reconstruction_cli_m5.test.ts` (5 tests, verbatim from §6; `runCli` with the real on-disk reader). Run → all GREEN. Prove the two multi-line sentinel flips bite, then restore. If a multi-line `includes` fails on whitespace, re-capture with the commands in §6 (do NOT hand-edit spaces).
4. **Task 4 (§7)** — 3 doc edits: flip roadmap M5 line 29 to `[x]` (full one-liner); PREPEND an impl-notes entry above the m4 entry; APPEND a design-doc note after the m4 note (which ends at line 266) — **NO new spec number**.
5. **Task 5 (§8)** — Full verification: `npm test` = **315 pass / 0 fail**, tsc clean, `git diff src/` EMPTY, end-to-end byte-eyeball.
6. **Task 6 (§9)** — Commit ONLY on user approval (exact 7-file list in §9, message `Implemented m5 handling`, no `src/`). **Then CREATE A HANDOFF** via `/jot:handoff-prompt` naming the next scenario (roadmap line 30, `[ ] M6 ->`, undescribed) in the handoff TITLE ONLY.

## Key Files
- `plans/m5/m5-reconstruction-plan.md` — the AUTHORITATIVE m5 plan, execute verbatim (full test code, §2.5 exact CLI bytes, §3 file:line reference map, §10 acceptance criteria).
- `tests/fixtures.ts` — append `M5_JSONL` after `M4_JSONL` (Desktop path).
- `tests/reconstruction_engine_m5.test.ts` — to CREATE (5 reader-backed engine tests; verbatim in plan §5).
- `tests/reconstruction_cli_m5.test.ts` — to CREATE (5 CLI tests; verbatim in plan §6).
- `plans/roadmap.md` (line 29), `plans/implementation-notes-api-from-scenarios.md` (prepend), `plans/reconstruction-engine-design.md` (append after line 266) — the 3 doc edits.
- `scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl` — executed transcript (worktree copy; fixture points at the Desktop copy).
- `src/reconstruction_branches.ts:41-102` — `reconstructFileOver` → `seedStaleEditBases`/`editBaseIsStale`/`staleEditSeedFor` (the S19 reseed that FIRES for m5's surviving `agent_add_2`); `src/reconstruction_sidecar.ts:115` `backupSeedWriteFor`; `src/reconstruction_engine.ts:206-242` `reconstructBranches`/`buildRewoundBranchHistory`. The implementing agent reads these but modifies NONE of them.

## Context the Next Agent Won't Have
- **m5 is the m3 READER pattern, NOT the m2/m4 reader-free pattern.** The `user_add_2` out-of-band edit carries NO content in the JSONL — its disk state lives ONLY in the file-history backup `17bbea89afb745a4@v5`. Engine tests therefore use an **in-memory** `BackupReader` (one blob, so no dependency on the live `~/.claude/file-history` tree); CLI tests use `runCli`'s real on-disk reader and DEPEND on that backup resolving (verified present on this machine; same hazard m3's CLI tests accept). If CLI tests 4–5 are RED on the first run, the live backup isn't resolving — STOP and report, do NOT weaken the assertion.
- **The S19 reseed FIRES here (corrects an early mis-read).** During planning, a subagent first judged `seedStaleEditBases` INERT for m5. A live probe (`reconstructBranches` with vs. without the reader) DISPROVED that: WITH the reader the surviving source has 4 revisions including a seeded `overwrite` `17bbea89afb745a4@v5` (= `base+user_add_1+user_add_2`); WITHOUT it, 3 revisions and the agent_add_2 Edit absorbs `user_add_2` as a genesis line — final text byte-identical either way. The reseed is the S19 "base too short" case (`editBaseIsStale` returns true because the surviving on-branch base reconstructs only 3 lines while G's hunk context references line 4). On the REWOUND branch the reseed stays INERT (agent_add_1's base is aligned) — hence the rewound branch is reader-independent. Trust the live probe over prose.
- **The `historyEndingWith` suffix MUST lead with a slash** (`"/m5_interleave.py"`) — `test_m5_interleave.py` also ends with `m5_interleave.py`, so a slash-less suffix matches the wrong file.
- **`user_add_1` appears on BOTH branches with DISTINCT changeIds** — D `#5f68c3e1` (rewound) and F `#84166ae7` (surviving). The plan's engine test 4 asserts the surviving changeId `84166ae7-b7ba-42af-ae9f-74a4d070867e`.
- **Worktree-git-checkout hazard (since S18):** do NOT `git checkout`/`restore` the four shared docs (`tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`) — they carry uncommitted m2 + m3 + m4 edits. Revert specific lines by hand.
- **Commit hygiene:** stage EXACTLY the 7 files in plan §9; never `git add -A` (m2/m3/m4 commits are separate outstanding decisions).
- **Monitor false-fire lesson:** name the next scenario only in a handoff TITLE, never in loose body text — the m4 completion handoff's body literal "Next scenario: m5" false-fired this session's planning monitor.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # baseline now 305; after implementing m5 → 315 pass / 0 fail
npx tsc --noEmit      # expect clean
git diff --stat src/  # expect EMPTY (m5 is a no-src-change LOCK)

# End-to-end byte-eyeball:
P="scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# expect: surviving #93e7f94c (m5_interleave.py, test_m5_interleave.py) + rewound #fcd9c268 rewind @ #b3aed408 (m5_interleave.py)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
# expect: m5_interleave.py 4 revisions ending at the 5-line interleaved file; rev 2 = the user_add_2 @v5 block; test file 1 revision
```
