# Handoff: IMPLEMENT the m3 (`m3-bash-redirect`) reconstruction plan — a characterization/regression LOCK, NO `src/` change. The engine ALREADY reconstructs the bash-redirect-interleaved-with-edit scenario byte-for-byte correct (verified live: 5 revisions, 29-byte ground truth, all engine assertions confirmed against the real engine); this work adds 9 tests (4 engine + 5 CLI) + 3 doc edits to pin it, exactly like the m1/m2/S20/S21/S22 locks. Plan is COMPLETE and authoritative at `plans/m3/m3-reconstruction-plan.md` — follow it verbatim. Baseline 287 → 296.
Conversation name: api-from-scenarios — m3 planning monitor → plan m3 (bash-redirect)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/bb810714-4211-41f7-b26e-f0daaf9c39c7.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m3/m3-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling` (S23 and m1 are COMMITTED). Working tree carries UNCOMMITTED m2 work (4 modified docs: `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/roadmap.md`, `tests/fixtures.ts`; untracked `plans/m2/`, `tests/reconstruction_cli_m2.test.ts`, `tests/reconstruction_engine_m2.test.ts`) plus the new untracked `plans/m3/` (this plan + this handoff). `git diff src/` is EMPTY. m2 may or may not be committed by the time you start — either way, do NOT revert it; m3 layers on top and shares those 4 doc files.

## Goal
Lock — with tests only — that `reconstruction_cli` correctly reconstructs `m3-bash-redirect`: ONE file `m3_mixed.txt` is written (`line one`), `>>`-appended (`line two`), edited (`line one`→`LINE ONE`), then `>>`-appended again (`line three`). The two `>>` redirects carry NO content in the JSONL — recovered from `~/.claude/file-history` backups (`@v3`, `@v5`) via the `BackupReader`; the Edit's base (`line one`/`line two`) is content the append revision recovered from a backup. m3 is the bash-redirect twin of the m-series locks and the FIRST scenario to interleave an Edit between two bash redirects on one file. The engine is already correct, so this is a characterization/regression LOCK with **no production-code change** — not a fix.

## Current State
**PLANNED and fully verified live; nothing implemented yet; nothing about m3 committed.** This session:
- Was monitor-gated on the m2 IMPLEMENTED handoff (`plans/m2/handoff-…-0006.md`); the monitor fired on it (correctly skipping the m2 PLAN handoff `…-0002.md`), then I planned m3.
- Ran m3 through the CLI (`--list-branches`, default DAGs, `--surviving --verbose`). The reconstructed surviving `m3_mixed.txt` is **byte-identical** to the on-disk ground truth (`LINE ONE\nline two\nline three\n`, 29 bytes — confirmed via `od -c`).
- Verified the ENGINE structure live (throwaway script against `reconstructAll` with an in-memory `BackupReader`): `histories.length === 1`; `revisions.length === 5`; kinds exactly `[write, append, edit, edit, append]`; rev1 append carries `line one` (oldLineNum 0) + births `line two`; rev2/rev3 are the Edit's removal+addition pair (`"line two"` then `"LINE ONE\nline two"`) **sharing one changeId**; rev4 append → the 29-byte ground truth; exactly **one** write-kind revision (rev0). Every assertion in the plan's §5 test code was confirmed true against the live engine.
- Forensics (3 subagents) established WHY the engine is already correct AND ruled out a false lead (full file:line map in plan §3): the "extra" 5th revision is NOT a bug and NOT a reseed — it is the engine's long-standing two-revision-per-replace-hunk model (`applyEdit`, `reconstruction_replay_edit.ts:174-187`; locked by `tests/reconstruction_engine.test.ts:103`). The S19/S23 stale-edit-base reseed (`seedStaleEditBases`/`editBaseIsStale`, `reconstruction_branches.ts:60-122`) stays **INERT** because the Edit's recorded base aligns exactly with the reconstructed append revision.
- `npm test` baseline = **287** (per the m2 IMPLEMENTED handoff). m3 adds 9 → **296**.

## What Remains
Execute `plans/m3/m3-reconstruction-plan.md` in order (it contains verbatim test code, exact CLI byte-output in §2.5, the §3 engine file:line map, the §2.3 backup-blob table, TDD steps, the commit list, and acceptance criteria):
1. **Task 1 (§4):** Confirm baseline `npm test` = 287 / clean. Add `M3_JSONL` to `tests/fixtures.ts` (append after `M2_JSONL`, Desktop path).
2. **Task 2 (§5):** Create `tests/reconstruction_engine_m3.test.ts` (4 reader-wired tests; build the in-memory `M3_BACKUPS` map exactly as in §5, mirroring the s5 test). Expect all GREEN on first run. Run both prove-the-lock flips (removal expectation `"line two"`→`"line one"`; `writeRevisions.length` `1`→`2`), confirm RED, restore.
3. **Task 3 (§6):** Create `tests/reconstruction_cli_m3.test.ts` (5 tests; pass NO reader — the CLI builds its own real sidecar). Expect all GREEN. If a multi-line `includes` fails, re-capture from the worktree JSONL and reconcile whitespace (§2.5 is authority).
4. **Task 4 (§7):** Docs — flip `[ ] M3 ->` in `plans/roadmap.md` (line 27) to `[x]`; PREPEND an m3 entry to `plans/implementation-notes-api-from-scenarios.md`; append an m3 note after the m2 note in `plans/reconstruction-engine-design.md` (NO new spec number).
5. **Task 5 (§8):** Full verify — `npm test` = **296 pass / 0 fail**, `npx tsc --noEmit` clean, `git diff src/` is **EMPTY** (m3 adds zero `src/`).
6. **Task 6 (§9):** Commit ONLY after user approval — stage EXACTLY the 7 files listed in §9 (never `git add -A`), message `Implemented m3 handling`. There is no `src/` file in the commit.
7. **CREATE A HANDOFF** (REQUIRED DELIVERABLE) via `/jot:handoff-prompt` documenting the completed m3 implementation (296 green, no-src-change confirmed, files staged) and naming the **next scenario: m4 (`m4-delete-recreate`)** (roadmap line 28). Add "create handoff" to your own task list now so it is not forgotten.

## Key Files
- `plans/m3/m3-reconstruction-plan.md` — THE authoritative plan (verbatim tests, §2.3 backup table, §2.5 exact CLI output, §3 file:line map, TDD, commit list, acceptance criteria).
- `tests/fixtures.ts` — add `M3_JSONL` after `M2_JSONL` (Desktop path `…/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl`).
- `tests/reconstruction_engine_m3.test.ts` — to create (4 tests; reader-wired with in-memory `M3_BACKUPS`; mirror `tests/reconstruction_engine_s5.test.ts:11-16`).
- `tests/reconstruction_cli_m3.test.ts` — to create (5 tests; no reader; mirror `tests/reconstruction_cli_m2.test.ts`).
- `plans/roadmap.md` (line 27 `[ ] M3 ->`), `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md` — the 3 doc edits.
- Scenario inputs: `scenarios/m3-bash-redirect.txt`; `scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl` (worktree copy for live CLI re-capture).
- READ-ONLY (why m3 is already correct — do NOT edit): `src/reconstruction_sidecar.ts:60-71,139-157` (sidecar recovery), `src/reconstruction_replay_edit.ts:145-187` (append + applyEdit removal/addition pair), `src/reconstruction_branches.ts:60-122` (seedStaleEditBases/editBaseIsStale — stays inert), `src/reconstruction_cli.ts:114-122,189` (CLI sidecar wiring), `src/reconstruction_extract.ts` (parseRedirect).

## Context the Next Agent Won't Have
- **This is a LOCK, not a fix** (like m1/m2/S20/S21/S22). All 9 tests are expected GREEN on first run — verified live this session. If ANY test needs a `src/` change to go green, STOP and escalate: the live verification was wrong and the plan must be revised, not the engine.
- **The 5th revision is NOT a bug, and it is NOT a reseed.** Initial inspection looks alarming: `--surviving --verbose` shows a `revision 2  (1 lines)` containing ONLY `line two` (with `line one` gone and the edit not yet applied). This is the engine's DESIGNED removal-intermediate: `applyEdit` emits a removal revision then an addition revision for any hunk that both removes and adds (`reconstruction_replay_edit.ts:174-187`; locked by `tests/reconstruction_engine.test.ts:103` `test_edit_splices_into_paired_removal_and_addition_revisions`; design doc `:338`). One forensics subagent initially hypothesized a mis-firing S19/S23 reseed — that was RULED OUT: a reseed Write would carry the backup snapshot (`line one\nline two`, 2 lines), but rev2 is 1 line (`line two`), and the math (write+append+removal+addition+append = 5) shows no extra revision was injected. So do NOT "fix" the 5th revision.
- **m3 is NOT reader-free (unlike m2).** Its engine tests MUST wire an in-memory `BackupReader` — the `>>` redirects carry no content in the JSONL. The exact blob map (from live forensics) is in plan §2.3/§5: `936191f45d79faed@v2`=`line one\n`, `@v3`=`line one\nline two\n` (queried by append C), `@v4`=`LINE ONE\nline two\n`, `@v5`=`LINE ONE\nline two\nline three\n` (queried by append E). Include all four for robustness. The CLI tests pass NO reader (the CLI builds its own real on-disk reader), so they exercise the real `~/.claude/file-history` blobs end-to-end — those blobs are confirmed present on disk for session `0a7f5fa5-deda-4208-823e-1cfe7d650a74`.
- **The reseed-dormancy is the novel invariant m3 locks.** `editBaseIsStale` is FALSE here because the Edit's `originalFile` (`line one\nline two\n`) matches the reconstructed append revision exactly — so m3 regression-locks that the S23 per-line context-match walk does NOT false-positive on a base advanced by a backup-recovered append (the dormant complement of S19/S23, where it fires).
- **Prove-the-lock CLI sentinel (m2 lesson):** when proving a CLI line-count/content assertion bites, pick a sentinel that appears NOWHERE else in the output. Do NOT reuse `(1 lines)`/`(2 lines)` (they recur across blocks). Use e.g. `line three`→`line THREE-SENTINEL`. The plan §6 already specifies this.
- **Never `git add -A` and never `git checkout`/`git restore` the shared docs** (`fixtures.ts`, `roadmap.md`, `implementation-notes-…md`, `reconstruction-engine-design.md`) to undo a temp edit — they carry uncommitted m2 edits; revert specific lines by hand (worktree-git-checkout hazard, noted across S18+).
- The Stop hook runs the test suite after every test-file edit and BLOCKS on RED — expect (and ignore) its failure notifications during deliberate prove-the-lock flips; it passes once restored.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # baseline 287 before; expect 296 pass / 0 fail after the 9 new tests
npx tsc --noEmit  # expect clean
git diff --stat src/   # expect EMPTY (no m3 src change)
# end-to-end byte spot-check:
npx tsx src/reconstruction_cli.ts "scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl" --surviving --verbose 2>/dev/null
#   -> m3_mixed.txt: 5 revisions ending at the 3-line LINE ONE/line two/line three; the (1 lines) block holds only "line two".
```
