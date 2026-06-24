# Handoff: S23 (`s23-user-edits-code-rewind`) is IMPLEMENTED and fully verified — the FIRST REAL production-code change since S19 (S20/S21/S22 were no-op characterization locks). `editBaseIsStale` was generalised from a length-overflow check to a per-line context-match walk against the reconstructed base, so the existing `seedStaleEditBases` reseeds the `…@v5` file-history backup before the surviving `is_empty` edit. The surviving `scenario23.py` now reconstructs byte-for-byte to the 8-line on-disk ground truth (size on line 4, a SINGLE push on line 5 — the unfixed engine dropped `size` and duplicated `push`). 269 tests green (was 260), `npx tsc --noEmit` clean, `src/reconstruction_branches.ts` lands at EXACTLY 250 lines, `git diff src/` = that one file only (+23/-5). Added an `S23_JSONL` fixture + 9 tests (4 engine + 5 CLI) + 3 doc edits. NOTHING is committed.
Conversation name: api-from-scenarios — S23 impl monitor → implement S23 (user-edits-code-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/04c4acc5-cf42-4a1b-802c-831311d8fa74.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s23/s23-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `ce18413 implemented S22 handling` (S19/S20 at `4b25f21`, S21 at `2c4909e`, S22 at `ce18413`). All prior scenarios are committed; the working tree holds the S23 work (engine fix + tests + docs + the plan dir + this handoff). `git diff src/` is exactly `src/reconstruction_branches.ts`.

## Goal
Lock — with tests AND a real engine fix — that `reconstruction_cli` correctly reconstructs the file-change history of `s23-user-edits-code-rewind`, the **two-user-edit CODE-rewind** scenario (the code-rewind twin of S22, as S20 is to S19). The surviving `scenario23.py` must end at the real 8-line on-disk file (`init + size + push + blank + is_empty`); the rewound branch reconstructs separately to 5 lines (`init + push + pop`). S23 is the first scenario since S19 where the engine was WRONG out of the box.

## Current State
**IMPLEMENTED and verified; nothing committed.** Executed the authoritative plan `plans/s23/s23-reconstruction-plan.md` end to end under strict red→green TDD:
- **Engine fix (1 file, `src/reconstruction_branches.ts`, 232→250 lines):** generalised `editBaseIsStale` from `firstHunk.oldStart - 1 > baseLength` (length-overflow only) to a per-line context-match walk against the reconstructed base, plus a new `reconstructedBaseText(priorEvents)` accessor. Once `editBaseIsStale` returns true for G's `is_empty` edit, the existing `staleEditSeedFor`/`seedStaleEditBases`/`backupSeedWriteFor` pipeline (UNCHANGED) splices the `…@v5` backup (`init + size + push`) as a synthetic `overwrite` before G.
- **Tests (9 new):** `tests/reconstruction_engine_s23.test.ts` (4, in-memory `BackupReader` with v5/v4 blobs) + `tests/reconstruction_cli_s23.test.ts` (5, real on-disk file-history reader). `S23_JSONL` added to `tests/fixtures.ts`. RED was confirmed first (unfixed engine produced duplicate `push`, dropped `size`), then GREEN after the fix.
- **Docs:** `plans/roadmap.md` line 24 flipped to `[x] S23` with a full summary; an S23 entry prepended to `plans/implementation-notes-api-from-scenarios.md`; the S23 note + a spec-39 wording fix added to `plans/reconstruction-engine-design.md`.
- **Gates all green:** `npm test` = **269 pass / 0 fail**; `npx tsc --noEmit` clean; filesize sweep clean (`reconstruction_branches.ts` = 250, at the cap); end-to-end `--surviving --verbose` diff vs `scenario23.py` = **BYTE-IDENTICAL**.

## What Remains
1. **Commit on user approval only** (project rule: one commit per scenario). Stage EXACTLY these 8 files — do NOT `git add -A` (other scenarios share fixtures/roadmap/impl-notes/design):
   - `tests/fixtures.ts`
   - `tests/reconstruction_engine_s23.test.ts`
   - `tests/reconstruction_cli_s23.test.ts`
   - `src/reconstruction_branches.ts`
   - `plans/roadmap.md`
   - `plans/implementation-notes-api-from-scenarios.md`
   - `plans/reconstruction-engine-design.md`
   - `plans/s23/s23-reconstruction-plan.md`
   Suggested message: `Implemented S23 handling`.
2. **Next scenario (S24 / `M1`+):** plan and implement the next roadmap entry. A downstream planning monitor keys on this S23-IMPLEMENTED handoff title, so the `S23` + `IMPLEMENTED` wording above matters.

## Key Files
- `plans/s23/s23-reconstruction-plan.md` — the authoritative plan executed (verified fix code, ground-truth tables, changeIds, both branch ladders, verbatim test code).
- `src/reconstruction_branches.ts` — the ONLY source file changed; `editBaseIsStale` (now a context-match walk) + new `reconstructedBaseText` helper at lines 60–88. Lands at exactly 250 lines (the cap).
- `tests/reconstruction_engine_s23.test.ts` — 4 engine tests (in-memory `BackupReader`).
- `tests/reconstruction_cli_s23.test.ts` — 5 CLI byte-lock tests (real on-disk reader via `runCli`).
- `tests/fixtures.ts` — `S23_JSONL` constant (Desktop path).
- S23 JSONL (worktree): `scenarios/executed/s23-user-edits-code-rewind/2bb895d4-b58b-483e-bc3a-d6a4505cbf08.jsonl`; backups at `~/.claude/file-history/2bb895d4-b58b-483e-bc3a-d6a4505cbf08/` (v2–v6 present; the CLI tests' real-reader source).

## Context the Next Agent Won't Have
- **S23 is a REAL FIX, not a characterization lock** — the inverse of S20/S21/S22. The fix is strictly MORE conservative than the old check: for an ALIGNED edit every context/removed line equals the base line at its index, so the walk never returns true → S1–S22 byte-for-byte unaffected (verified, 260 held). S19's length-overflow case is now a special case of the same walk (`index >= base.length`), so S19 still seeds its v3 base.
- **The user's `size` edit leaves NO event in the JSONL.** This is the crux: there is exactly ONE surviving `edited_text_file` (the code-rewind restore echo F = `init + push`). `size` is recoverable ONLY from the file-history backup `…@v5`. The on-branch base before G is the SAME length as S20's (4 lines) but a WRONG line (`push` where `size` belongs) — that's why the old length-only check missed it.
- **`oldStart-1 == baseLength` is NOT the trigger** — an earlier prototype changing `>` to `>=` did NOT fix S23 (G's hunk is `oldStart=3`, within the 4-line base). It is a per-line CONTENT mismatch, hence the context-match walk.
- **Plan deviation (Task 4):** the plan said `reconstructBranches`'s `branched.rewound` is `FileHistory[]`; it is actually `RewoundBranchHistory[]`, each wrapping `.histories: FileHistory[]`. The rewound engine test therefore selects the rewound branch by tip (`e62d73ad`) and reads `.histories`. Same result; only the access path differs. (Documented in the impl-notes Deviations section.)
- **The seed renders as `overwrite` `#11be2855`, NOT a user-edit, and stays OUT of the DAGs** (changeId = backup blob name, spec 40). The conversationDAG / fileDAG / `--list-branches` outputs are byte-identical with and without the fix — only `--surviving`/`--branch` reconstructions change.
- **`reconstructedBaseText` is a noun-phrase accessor** (like the existing `linesTextOf`/`currentText`) — acceptable under the local convention despite the verb-name rule. Keep it to stay at 250 lines; keep the `editBaseIsStale` doc comment to the 4 lines as written. The "split, never condense" rule still holds for any future growth.
- **Do NOT `git checkout`/`git restore` shared files** (`tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`) to revert temp edits — edit the specific lines back. (Lower risk now that S22 is committed, but keep the habit.)
- **changeIds (verified):** B `#0131iJBP`, C `#01SEvVm1`, D `#9565e2ac`, E `#017pMPEo`, F `#a68b543d`, G `#01Gbp8oE`; surviving tip `#f224cf19`, rewound tip `#e62d73ad`, rewind point `#bbf6cd91`; seed blob `11be2855feaa5668@v5`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 269 pass / 0 fail (260 baseline + 9 new)
npx tsc --noEmit         # No errors found
git diff --stat src/     # only src/reconstruction_branches.ts (+23/-5); file = 250 lines
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s23-user-edits-code-rewind/2bb895d4-b58b-483e-bc3a-d6a4505cbf08.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null          # surviving #f224cf19 + rewound #e62d73ad (rewind @ #bbf6cd91)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null     # 4 revisions: 3 → 4 (restore echo) → 5 (v5 seed) → 8 (final); size@4, push@5
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/scenario23.py/,/test_scenario23/p' | grep -E "^ +[0-9]+ \| " | tail -8 | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s23-user-edits-code-rewind/scenario23.py && echo BYTE-IDENTICAL
```
