# Handoff: S23 (`s23-user-edits-code-rewind`) reconstruction PLAN is complete and engine-verified — IMPLEMENT it. This is the FIRST scenario since S19 that needs a REAL production-code change (S20/S21/S22 were no-op characterization locks). The fix was PROTOTYPED AND VERIFIED LIVE this session: with it applied the full suite goes 260 → 269 pass / 0 fail, `tsc` clean, `src/reconstruction_branches.ts` lands at exactly 250 lines, and the surviving `scenario23.py` reconstructs byte-for-byte to the 8-line on-disk ground truth (was 8 buggy lines with a DUPLICATE `push` and no `size`). Implementing = 1 fixture + 9 tests (4 engine + 5 CLI) + a 1-file engine fix + 3 doc edits. The plan contains the exact verified fix code. NOTHING about S23 is committed.
Conversation name: plan s23
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/e0f7d417-2037-42a6-8933-f312b69362d4.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s23/s23-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `ce18413 implemented S22 handling` (S19/S20 at `4b25f21`, S21 at `2c4909e`, S22 at `ce18413`). All prior scenarios are committed; the working tree holds ONLY the new `plans/s23/` (the plan). `git diff src/` is EMPTY.

## Goal
Lock — with tests AND a real engine fix — that `reconstruction_cli` correctly reconstructs the file-change history of `s23-user-edits-code-rewind`, the **two-user-edit CODE-rewind** scenario (the code-rewind twin of S22, as S20 is to S19). The surviving `scenario23.py` must end at the real 8-line on-disk file (`init + size + push + blank + is_empty`); the rewound branch reconstructs separately to 5 lines (`init + push + pop`). S23 is the first scenario since S19 where the engine is WRONG out of the box.

## Current State
**PLANNED, fix prototyped + verified live, then REVERTED to a clean tree, nothing committed.** This session:
- Was monitor-gated on the S22 IMPLEMENTED handoff (`plans/handoff-...-2232.md`); it fired first-poll, then I planned S23.
- Ran S23 through the CLI: confirmed the engine produces a WRONG surviving `scenario23.py` — line 4 `push`, line 5 `push` (DUPLICATE), `size` dropped. Rewound branch and branch enumeration are already correct.
- Forensics (3 subagents + direct JSONL/file-history probes): the user's `size` edit (scenario step 7) leaves NO file-change event — only the code-rewind restore echo (`#a68b543d`, `init+push`) is captured. `size` survives only in file-history backup `11be2855feaa5668@v5` (`init+size+push`) and a Read result. G's `is_empty` edit (`#01Gbp8oE`, hunk `oldStart=3`, context `self.items/size/push`) was computed against that v5 disk; the engine's 4-line base (`init+push`) makes the `size` context line land on `push` and `resolveContextLine` born-duplicates `push`.
- Root cause: `editBaseIsStale` (`src/reconstruction_branches.ts:64`) only tests base-too-SHORT (`oldStart-1 > baseLength`); S23 is a content-mismatch WITHIN bounds, undetected, so the existing `seedStaleEditBases` reseed stays inert.
- **Verified fix (single file):** generalise `editBaseIsStale` to a per-line context-match walk against the reconstructed base (add a `reconstructedBaseText` helper). Applied live → S23 surviving = byte-identical 8-line GT, **260 → all green, S19/S20/S21/S22 unaffected** (S19 still seeds its v3 base — length-overflow is now a special case of the mismatch). Reverted afterward so the implementer does red→green.

## What Remains
Execute the plan `plans/s23/s23-reconstruction-plan.md` in order (it is the authoritative, verified spec):
1. **Task 1** — add `S23_JSONL` to `tests/fixtures.ts` after `S22_JSONL` (Desktop path, verified to exist).
2. **Task 2** — create `tests/reconstruction_engine_s23.test.ts` (copy the S19 engine test scaffolding); write the RED test first (in-memory reader maps `11be2855feaa5668@v5` → `init+size+push`); confirm it FAILS on the unfixed engine.
3. **Task 3** — apply the §4 fix to `src/reconstruction_branches.ts` (generalised `editBaseIsStale` + `reconstructedBaseText` helper); RED → GREEN. Confirm the file is EXACTLY 250 lines (jot hook blocks at 251 — keep the doc comment to the 4 lines shown).
4. **Task 4** — add the 3 remaining engine tests (branches; 4-revision seeded surviving ladder; rewound = init+push+pop).
5. **Task 5** — create `tests/reconstruction_cli_s23.test.ts` (mirror the S22 CLI test); RE-CAPTURE the live `--surviving --verbose` bytes before locking the line-numbered substrings in CLI test 4.
6. **Task 6** — docs: `plans/roadmap.md` line 24 → `[x] S23`; prepend an S23 entry to `plans/implementation-notes-api-from-scenarios.md`; add the S23 note to `plans/reconstruction-engine-design.md` after the S22 note.
7. **Task 7** — verify gates: `npm test` = 269 green, `npx tsc --noEmit` clean, filesize sweep clean (branches.ts = 250), end-to-end byte-identical diff.
8. **Task 8 — CREATE HANDOFF**: write a completion handoff with `/jot:handoff-prompt` whose title contains `S23` and `IMPLEMENTED`, stating 269 green + engine change made + nothing committed + the commit guidance below. (A downstream S24/next-scenario planning monitor keys on this S23-IMPLEMENTED handoff, so the title wording matters.)

## Key Files
- `plans/s23/s23-reconstruction-plan.md` — THE plan to execute (verified fix code, ground-truth tables, changeIds, both branch ladders, verbatim test code). Read first.
- `src/reconstruction_branches.ts` — the ONLY source file to change (`editBaseIsStale` at lines 60–70 → §4 replacement). Lands at exactly 250 lines.
- `src/reconstruction_replay_edit.ts` — READ-ONLY: `insertHunkAdditions` / `resolveContextLine` (lines 96–139) are where the duplicate `push` is born; understand them, do NOT edit.
- `src/reconstruction_sidecar.ts` — READ-ONLY: `backupSeedWriteFor` / `findBackupAtOrBefore` (the reseed already picks v5); no change.
- `tests/reconstruction_engine_s19.test.ts` — copy as the S23 engine-test scaffolding (real fix + in-memory `BackupReader`).
- `tests/reconstruction_cli_s22.test.ts` — copy as the S23 CLI-test scaffolding (real on-disk reader via `runCli`).
- S23 JSONL (worktree): `scenarios/executed/s23-user-edits-code-rewind/2bb895d4-b58b-483e-bc3a-d6a4505cbf08.jsonl`; backups at `~/.claude/file-history/2bb895d4-b58b-483e-bc3a-d6a4505cbf08/` (the CLI tests' real reader source — confirmed present).

## Context the Next Agent Won't Have
- **S23 is a REAL FIX, not a characterization lock** — the inverse of S20/S21/S22. Do change `src/`. If after the fix any pre-S23 test fails, the FIX is wrong (not the old test) — but it was verified to hold all 260, so this is unlikely.
- **The user's `size` edit leaves NO event in the JSONL.** This is the crux and is counter-intuitive: there is exactly ONE surviving `edited_text_file` (the code-rewind restore echo `init+push`). `size` is recoverable ONLY from the file-history backup `…@v5`. Do not look for a `size` attachment — there isn't one.
- **`oldStart-1 == baseLength` is NOT the trigger.** An earlier prototype changed `>` to `>=` and it did NOT fix S23 (G's hunk is `oldStart=3`, well within the 4-line base). The staleness is a per-line CONTENT mismatch, not a length boundary — hence the context-match walk. Do not shortcut to `>=`.
- **The seed renders as `overwrite` `#11be2855`, NOT a user-edit, and stays OUT of the DAGs** (changeId = backup blob name, spec 40). The conversationDAG / fileDAG / `--list-branches` outputs are byte-identical with and without the fix — only `--surviving`/`--branch` reconstructions change.
- **`reconstructedBaseText` is a noun-phrase accessor** (like the existing `linesTextOf` / `currentText`) — acceptable under the local convention despite the verb-name rule. Keep it to stay at 250 lines.
- **changeIds (verified):** B `#0131iJBP`, C `#01SEvVm1`, D `#9565e2ac`, E `#017pMPEo`, F `#a68b543d`, G `#01Gbp8oE`; surviving tip `#f224cf19`, rewound tip `#e62d73ad`, rewind point `#bbf6cd91`; seed blob `11be2855feaa5668@v5`.
- **Do NOT `git checkout`/`git restore` shared files** to revert temp edits (fixtures/roadmap/impl-notes/design are shared) — edit the specific lines back. (S22 is now committed at HEAD, so this is lower-risk than prior sessions, but keep the habit.)
- **Commit ONLY on user approval**, one commit, message `Implemented S23 handling`, staging EXACTLY the 8 files listed in plan §7 (never `git add -A`).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 269 pass / 0 fail (260 baseline + 9 new)
npx tsc --noEmit         # No errors found
git diff src/            # only src/reconstruction_branches.ts, ~+18/-7 lines; file = 250 lines
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s23-user-edits-code-rewind/2bb895d4-b58b-483e-bc3a-d6a4505cbf08.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null          # surviving #f224cf19 + rewound #e62d73ad (rewind @ #bbf6cd91)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null     # 4 revisions: 3 → 4 (restore echo) → 5 (v5 seed) → 8 (final); size@4, push@5
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/scenario23.py/,/test_scenario23/p' | grep -E "^ +[0-9]+ \| " | tail -8 | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s23-user-edits-code-rewind/scenario23.py && echo BYTE-IDENTICAL
```
