# Handoff: IMPLEMENT the m2 (`m2-mv-rename`) reconstruction plan — a characterization/regression LOCK, NO `src/` change. The engine ALREADY reconstructs the mv-rename scenario byte-for-byte correct (verified live, CLI + engine structure); this work adds 9 tests (4 engine + 5 CLI) + 3 doc edits to pin it, exactly like the m1/S20/S21/S22 locks. Plan is COMPLETE and authoritative at `plans/m2/m2-reconstruction-plan.md` — follow it verbatim. Baseline 278 → 287.
Conversation name: api-from-scenarios — m2 planning monitor → plan m2 (mv-rename)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/dee18a44-0c90-433f-ab40-6c32f5544dca.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m2/m2-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling` (S23 and m1 are now COMMITTED, unlike when the m1 plan was written). Working tree is CLEAN except the new untracked `plans/m2/` (this plan + this handoff). `git diff src/` is EMPTY.

## Goal
Lock — with tests only — that `reconstruction_cli` correctly reconstructs the file-change history of `m2-mv-rename`, the **mv-rename** scenario: a file is written, edited (`validate`), then **renamed via `mv`** (`m2_old_name.py` → `m2_new_name.py`), then the renamed file is edited again (`finalize`). m2 is the **rename twin of m1's cp-fork** and the FIRST rename scenario edited on BOTH sides of the rename (S2 only edited AFTER the move). The engine is already correct, so this is a characterization/regression LOCK with **no production-code change** — not a fix.

## Current State
**PLANNED and fully verified live; nothing implemented yet; nothing about m2 committed.** This session:
- Was monitor-gated on the m1 IMPLEMENTED handoff (`plans/m1/handoff-…-2348.md`); the monitor fired on it (correctly skipping the m1 PLAN handoff `…-2340.md`), then I planned m2.
- Ran m2 through the CLI: `--list-branches`, default DAGs, and `--surviving --verbose`. The reconstructed surviving `m2_new_name.py` is **BYTE-IDENTICAL** to the on-disk ground truth (112 bytes == 112 bytes via `diff`).
- Verified the ENGINE structure live (throwaway script against `reconstructAll`): `histories.length === 2`; the renamed file's revision kinds are exactly `[write, edit, rename, edit]`; the rename revision's `.rename.from`/`.to` are `…/m2_old_name.py` → `…/m2_new_name.py`; revision 1 (pre-rename edit) === `process+validate` and revision 3 (final) === `process+validate+finalize`; the test file is a single `write`; NO history is keyed by the bare `/m2_old_name.py`.
- Forensics (3 subagents) mapped WHY the engine is already correct (full file:line map in plan §3): `parseMvPaths`/`bashEventFrom` build the `RenameEvent` (no sidecar); `buildRenameChain`/`resolveFinalPath`/`eventBelongsToLineage` merge old+new into ONE lineage; `renameRevision` carries pre-rename content forward via `lastLinesOf`/`carryAt`; `distinctFinalPaths` collapses the old path so it is not a separate surviving file. Precedent: `s2-move-file` (design doc lines 75-90; tests `reconstruction_lineage.test.ts:92-98`, `reconstruction_engine.test.ts:124-146` & `:148-166`).
- `npm test` at HEAD = **278 pass / 0 fail**; `npx tsc --noEmit` clean.

## What Remains
Execute `plans/m2/m2-reconstruction-plan.md` in order (it contains verbatim test code, exact CLI byte-output, changeIds, the §3 engine file:line map, TDD steps, the commit list, and acceptance criteria):
1. **Task 1 (§4):** Confirm baseline `npm test` = 278/clean. Add `M2_JSONL` to `tests/fixtures.ts` (append after `M1_JSONL`, Desktop path).
2. **Task 2 (§5):** Create `tests/reconstruction_engine_m2.test.ts` (4 reader-free tests). Expect all GREEN on first run. Prove the crux bites: flip `OLD_AT_RENAME`→`MERGED_FINAL`, confirm RED, restore.
3. **Task 3 (§6):** Create `tests/reconstruction_cli_m2.test.ts` (5 tests). Expect all GREEN. If a multi-line `includes` fails, re-capture from the worktree JSONL and reconcile whitespace (§2.4 is authority).
4. **Task 4 (§7):** Docs — flip `[ ] M2 ->` in `plans/roadmap.md` to `[x]`; PREPEND an m2 entry to `plans/implementation-notes-api-from-scenarios.md`; append an m2 note after the m1 note in `plans/reconstruction-engine-design.md` (NO new spec number).
5. **Task 5 (§8):** Full verify — `npm test` = **287 pass / 0 fail**, `npx tsc --noEmit` clean, `git diff src/` shows **no NEW** engine change (m2 adds zero `src/`).
6. **Task 6 (§9):** Commit ONLY after user approval — stage EXACTLY the 7 files listed in §9 (never `git add -A`), message `Implemented m2 handling`. There is no `src/` file in the commit.
7. **CREATE A HANDOFF** via `/jot:handoff-prompt` documenting the completed m2 implementation (287 green, no-src-change confirmed, files staged) and naming the **next scenario: m3 (`m3-bash-redirect`)**. This handoff is a required deliverable.

## Key Files
- `plans/m2/m2-reconstruction-plan.md` — THE authoritative plan (verbatim tests, §2.4 exact CLI output, §3 file:line map, TDD, commit list, acceptance criteria).
- `tests/fixtures.ts` — add `M2_JSONL` after `M1_JSONL` (Desktop path).
- `tests/reconstruction_engine_m2.test.ts` — to create (4 tests; mirror `reconstruction_engine_m1.test.ts`).
- `tests/reconstruction_cli_m2.test.ts` — to create (5 tests; mirror `reconstruction_cli_m1.test.ts`).
- `plans/roadmap.md` (line 26 `[ ] M2 ->`), `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md` — the 3 doc edits.
- Scenario inputs: `scenarios/m2-mv-rename.txt`; `scenarios/executed/m2-mv-rename/70c5989e-017b-425f-8a8b-89daec0c4528.jsonl` (worktree copy for CLI re-capture).
- READ-ONLY (why m2 is already correct): `src/reconstruction_extract.ts:49,91-107`, `src/reconstruction_lineage.ts:11-65`, `src/reconstruction_replay.ts:64-94,136-187`, `src/reconstruction_branches.ts:41-58,189-195`, `src/reconstruction_render_list.ts:134-145`. Do NOT edit these.

## Context the Next Agent Won't Have
- **This is a LOCK, not a fix** (like m1/S20/S21/S22). All 9 tests are expected GREEN on first run — verified live this session. If ANY test needs a `src/` change to go green, STOP and escalate: the live verification was wrong and the plan must be revised, not the engine.
- **Fixtures use the Desktop path**, NOT the worktree path: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m2-mv-rename/70c5989e-…jsonl` (confirmed present, 178 KB). Every `S*_JSONL`/`M1_JSONL` uses that root.
- **m2's revision count is FOUR** (`write, edit, rename, edit`) — the novelty vs S2 (`s2-move-file`, which is write→move→edit = the file edited only AFTER the move). m2 carries a PRE-rename edit (`validate`) across the rename, then composes a post-rename edit (`finalize`) on top. Pin both.
- **Suffix-match gotcha:** `test_m2_old_name.py` ends with `m2_old_name.py`. To assert "no surviving history for the renamed-away old file", check `endsWith("/m2_old_name.py")` (leading slash) — without it you'd false-match the test file. The plan's tests already do this.
- **`reconstructAll` is reader-free for m2** — a rename needs NO `BackupReader`/file-history sidecar (content is carried inline from the old file's reconstructed lineage). Only bash `>`/`>>` redirects need the sidecar. (m3, the NEXT scenario, IS bash-redirect and WILL need the reader — different shape.)
- **S23/m1 are NOW committed** at `91ac563` (the m1 plan predated this), so `git diff src/` is EMPTY at start and m2 must keep it empty. The shared doc files no longer carry uncommitted edits, but still NEVER `git add -A` (other scenarios share them) and NEVER `git checkout`/`restore` them.
- **CLI column spacing** (the byte-exact `includes` strings): kind column padded to width 6 (widest = `rename`/`prompt`), two-space gaps, file column padded to the widest filename. The plan's §2.4 captured this exactly; re-capture with `2>/dev/null` (stderr is just the debugger banner) if whitespace drifts.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline now 278 pass / 0 fail; 287 after implementing m2
npx tsc --noEmit         # clean
git diff src/            # EMPTY before and after (m2 adds no engine change)
node --import tsx --test tests/reconstruction_engine_m2.test.ts tests/reconstruction_cli_m2.test.ts   # 9 green (after creating them)
# End-to-end byte eyeball (worktree JSONL; stderr is just the debugger banner):
P="scenarios/executed/m2-mv-rename/70c5989e-017b-425f-8a8b-89daec0c4528.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null      # surviving tip #7260996e; files = m2_new_name.py, test_m2_old_name.py (NO m2_old_name.py)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null # m2_new_name.py: rev1 (6 lines, validate), rev2 rename, rev3 (10 lines, finalize)
```
