# Handoff: m4 (`m4-delete-recreate`) IMPLEMENTED as a characterization/regression LOCK — NO `src/` change. 305 tests pass (296 baseline + 9 new). All acceptance criteria in `plans/m4/m4-reconstruction-plan.md` §10 met except §10.7 (commit, gated on user approval) and §10.8 (this handoff, now satisfied). **Next scenario: m5** (roadmap line 29 — currently `[ ] M5 ->`, no scenario yet authored in `scenarios/`) — plan and implement it the same way (ground-truth-first: run the CLI live against the executed transcript, verify byte-for-byte, then char-lock or real-fix depending on whether the engine is already correct).
Conversation name: api-from-scenarios — m4 impl monitor → implement m4 (delete-recreate)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/2e8b966a-b7ab-4da5-b2b4-9cd17d2f9485.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m4/m4-reconstruction-plan.md
Planning handoff (gated this impl): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m4/handoff-api-from-scenarios-20260624-0757.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling` (S23 and m1 are committed). Working tree carries uncommitted m2 + m3 + m4 work — do NOT revert it. Untracked: `plans/m2/`, `plans/m3/`, `plans/m4/`, `tests/reconstruction_cli_m2.test.ts`, `tests/reconstruction_engine_m2.test.ts`, `tests/reconstruction_cli_m3.test.ts`, `tests/reconstruction_engine_m3.test.ts`, `tests/reconstruction_cli_m4.test.ts`, `tests/reconstruction_engine_m4.test.ts`. Modified (shared with m2 + m3): `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/roadmap.md`, `tests/fixtures.ts`. `git diff src/` is **EMPTY** — m2, m3, and m4 each add zero `src/` change.

## Goal
Lock — with tests only — that `reconstruction_cli` correctly reconstructs `m4-delete-recreate`: TWO files where the source `m4_lifecycle.py` is written (v1 `def v1(): return 1`), edited (appends `v1_helper()`), DELETED via bash `rm`, then RE-CREATED at the same path (v2 `def v2(): return 2`); the sibling `tests/test_m4_lifecycle.py` is written (v1 test) then edited to v2. m4 is the FIRST scenario with a NON-TERMINAL delete and the FIRST write→delete→write recreate — it drives the dormant `fileIsPresent` delete-branch ("locked decision 3", `src/reconstruction_replay_edit.ts:30-35`) that labels the post-delete Write a fresh create (kind `EventKind.write`, not `EventKind.overwrite`, every line genesis, carrying NONE of the pre-delete v1/v1_helper lineage). Engine is already correct, so this is a characterization/regression LOCK with no production-code change — exactly like m1/m2/m3/S20/S21/S22.

## Current State
**m4 IMPLEMENTED, fully verified, uncommitted.** Acceptance criteria from plan §10:
- [x] `tests/fixtures.ts` has `M4_JSONL` (Desktop path), appended after `M3_JSONL` (1 file edited, +3 lines).
- [x] `tests/reconstruction_engine_m4.test.ts` — 4 tests, reader-free (`reconstructAll(loadRecords(M4_JSONL))`), all GREEN on first run. Both crux tests proven to bite: (a) `recreate.kind` flipped from `EventKind.write` to `EventKind.overwrite` → RED with `actual='write', expected='overwrite'`; (b) `source.revisions[2]!.lines.length` flipped from `0` to `1` → RED with `actual=0, expected=1`. Both restored.
- [x] `tests/reconstruction_cli_m4.test.ts` — 5 tests, NO reader (CLI builds its own real on-disk sidecar reader), all GREEN on first run. Both sentinel prove-the-lock flips proven to bite: (c) `def v2():` → `def v2_SENTINEL():` → RED; (d) `(file absent — 0 lines)` → `(file absent — 0 lines)SENTINEL` → RED. Both restored.
- [x] `npm test` = **305 pass / 0 fail** (7.3s); `npx tsc --noEmit` clean.
- [x] `git diff --stat src/` is **EMPTY** (m4 added no engine change). HEAD already commits S23 + m1; m2 added no `src/`; m3 added no `src/`; m4 added no `src/`.
- [x] roadmap M4 line 28 flipped to `[x]` with the full §7.1 entry; impl-notes entry prepended above the m3 entry; design.md m4 note appended after the m3 note (NO new spec number, indented inside the existing parent bullet to match m1/m2/m3 style).
- End-to-end CLI byte-spot-check (worktree JSONL, `--surviving --verbose`) is byte-identical to plan §2.5: source 4 revisions kinds `[write, edit, delete, write]` rendered as `(2 lines)` v1 → `(6 lines)` v1+v1_helper → `(0 lines)\n  (file absent — 0 lines)` delete → `(2 lines)\n     1 | def v2():\n     2 |     return 2` recreate; test file 3 revisions ending at the v2 test; `--list-branches` lists exactly `surviving  tip #3b6a446e    m4_lifecycle.py, test_m4_lifecycle.py` with NO `rewound`.
- [ ] **Commit — DEFERRED**, gated on user approval per project rule (one commit per scenario). Files to stage are listed under "What Remains" below.

## What Remains
1. **User approval to commit m4.** Project rule: one commit per scenario, only after the user approves. Stage **exactly** the 7 files below — do NOT `git add -A` (the worktree carries uncommitted m2 and m3 work which are separate commits and must not be swept in, and the `plans/sN/`/`plans/m1/`/`plans/m2/`/`plans/m3/`/`plans/m4/` handoff layout must not be swept in):
   - `tests/fixtures.ts`
   - `tests/reconstruction_engine_m4.test.ts`
   - `tests/reconstruction_cli_m4.test.ts`
   - `plans/roadmap.md`
   - `plans/implementation-notes-api-from-scenarios.md`
   - `plans/reconstruction-engine-design.md`
   - `plans/m4/m4-reconstruction-plan.md`
   There is no `src/` file in the commit. Suggested message: `Implemented m4 handling`. NOTE: m2's and m3's commits (their parallel 7-file sets, plus `plans/m2/`/`plans/m3/`) are also outstanding and are separate decisions — do not bundle.
2. **Plan and implement m5** — roadmap line 29 (`[ ] M5 ->`). The scenario script `scenarios/m5-*.txt` does NOT exist yet (only m1–m4 exist under `scenarios/`); if/when it lands, follow the ground-truth-first methodology identical to m1/m2/m3/m4:
   - Read `scenarios/m5-*.txt` (the scenario script) and inspect `scenarios/executed/m5-*/<uuid>.jsonl` + rendered files.
   - Run the CLI live against the executed JSONL: `npx tsx src/reconstruction_cli.ts <m5-jsonl> --list-branches` and `--surviving --verbose`.
   - Compare the reconstructed output to the on-disk ground-truth files byte-for-byte.
   - If byte-identical → char/regression LOCK (no `src/` change): write `plans/m5/m5-reconstruction-plan.md` mirroring m4's structure (verbatim tests, §3 file:line map, prove-the-lock flips, commit list, acceptance criteria). Expected baseline after m4 commits: 305; m5 will likely add ~9 → ~314.
   - If diverges → real engine fix is required: forensics (file:line map of the gap), prototype the fix live, then write the plan with the fix.
   - Either way: hand off via `/jot:handoff-prompt` so an impl agent can execute.

## Key Files
- `plans/m4/m4-reconstruction-plan.md` — the AUTHORITATIVE m4 plan that was executed verbatim
- `plans/m4/handoff-api-from-scenarios-20260624-0757.md` — the m4 planning handoff that gated this impl
- `tests/fixtures.ts` — `M4_JSONL` constant appended after `M3_JSONL`, Desktop path
- `tests/reconstruction_engine_m4.test.ts` — 4 reader-free engine tests pinning the source 4-revision history, the non-terminal delete, the born-fresh recreate (THE CRUX), and the sibling Edit-pair
- `tests/reconstruction_cli_m4.test.ts` — 5 CLI tests pinning the conversationDAG, fileDAG, list-branches, the delete byte-lock (`(file absent — 0 lines)`), and the recreate byte-lock (2-line v2-only block)
- `plans/roadmap.md` — line 28 M4 entry flipped to `[x]` with full prose
- `plans/implementation-notes-api-from-scenarios.md` — new top entry `2026-06-24:08:05:00` covering decisions/deviations/tradeoffs
- `plans/reconstruction-engine-design.md` — m4 note appended after the m3 note, 2-space indented inside the same parent bullet (NO new spec number)
- `src/reconstruction_replay_edit.ts:30-35` — `fileIsPresent` ("locked decision 3"); the engine line m4 is the FIRST fixture to drive on its delete-branch
- `src/reconstruction_replay.ts:43-53,55-62,140-147` — `writeRevision`, `deleteRevision`, dispatch
- `src/reconstruction_extract.ts:39-45,91-100,163-164` — `parseRmTarget`, `bashEventFrom`, dispatch
- `scenarios/m4-delete-recreate.txt` — scenario script
- `scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl` — executed transcript (worktree copy)

## Context the Next Agent Won't Have
- **m5 scenario does not exist yet.** Roadmap line 29 is `[ ] M5 ->` with no description; `scenarios/` has only m1–m4. Confirm with the user before planning m5 — they may want a different next scenario, or they may need to author the m5 scenario script first.
- **Watcher gotcha (cost-me-an-hour lesson, captured here for the next monitor author):** my first m4 impl-watcher (`scratchpad/m4_watch.sh`) used a title-region regex `m4|m4-delete-recreate|scenario m4|delete.recreate` and **FALSE-FIRED** on the m3 IMPLEMENTED handoff `plans/m3/handoff-…-0740.md`, whose line 1 named m4 in the phrase "Next scenario: m4". The fix that actually worked: parse line 1 with `awk` and require the **first `m[0-9]+` token to equal `m4`** — that rejects "Handoff: m3 ... Next scenario: m4" (first token = `m3`) and accepts "Handoff: m4 (`m4-delete-recreate`) PLAN COMPLETE …" (first token = `m4`). Verified both directions live before respawn. Always tighten predicates this way; "title-only" is not enough when prior handoffs name the next scenario.
- **The two crux properties are double-locked (engine + CLI), and both layers' prove-the-lock flips succeeded.** If a future engine refactor breaks born-fresh recreate, BOTH `test_m4_recreate_after_delete_is_born_fresh_write_not_overwrite` (kind + DOES_NOT_EXIST_YET genesis on every line) AND `test_m4_surviving_verbose_recreate_shows_only_v2_content` (rendered 2-line v2-only block, no `revision 4`) will go RED simultaneously — they pin the property at the engine level and the rendered level.
- **m4 is reader-free (m2/m4 pattern, not m3 pattern).** Every event carries content inline or as an Edit `originalFile` base; the `rm` is a content-less delete (0-line revision, nothing to recover); no bash `>>`/`>` redirect. Engine tests therefore call `reconstructAll(loadRecords(M4_JSONL))` with NO reader; the CLI builds its own real on-disk sidecar reader internally that resolves unused. If you ever see m4 needing a backup reader, the engine has been broken upstream — investigate, do not "fix" m4.
- **The 23-byte recreate text is `def v2():\n    return 2\n` (with trailing newline);** `finalTextOf` newline-joins so its 22-byte assertion is `def v2():\n    return 2` (no trailing) — this is the m2/m3 idiom, not a mistake. The 76-byte test-file final has the same shape.
- **Worktree-git-checkout hazard (documented since S18, applies here too):** do NOT `git checkout`/`git restore` the four shared docs (`tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`) to undo a temp edit — they carry uncommitted m2 + m3 edits as well as m4. Revert specific lines by hand.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                                   # expect 305 pass / 0 fail
npx tsc --noEmit                           # expect clean
git diff --stat src/                       # expect EMPTY (m4 is no-src-change LOCK)

# End-to-end byte-eyeball:
P="scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# expect: surviving  tip #3b6a446e    m4_lifecycle.py, test_m4_lifecycle.py
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
# expect: source 4 revisions [write, edit, delete, write] with `(file absent — 0 lines)`
#         at rev 2 and `def v2():` / `    return 2` at rev 3; test 3 revisions ending at v2
```
