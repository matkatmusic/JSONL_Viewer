MUST READ: plans/script-handling.txt

# Handoff: IMPLEMENT Scenario s29 (`s29-script-rename-repo-walk`) — PLANNED as a CHARACTERIZATION / REGRESSION LOCK (NO engine source change). Engine already reconstructs all 8 files byte-perfect on the post-S28 tree; one Bash `os.walk` run emits COMPLETE + 4×TRUNCATED + ELIDED beacons plus 2 no-beacon VENDOR CONTROLS, exercising S27 + S28 + vendor-skip together. Implement via TDD per the plan (8 engine + 6 CLI tests, 398→412). Next: s30.
Conversation name: api-from-scenarios — S29 planning (/plan-scenario 29)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/b8be0325-4343-4317-9a61-43542285e3d8.jsonl
Plan file: plans/s29/s29-reconstruction-plan.md  (AUTHORITATIVE — every ladder / changeId / byte / line count was verified LIVE with the real sidecar reader; two mutation probes recorded in §2.7)

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae`. **The tree is NOT clean:** the
S28 work is implemented but UNCOMMITTED (modified `src/reconstruction_branches.ts`,
`_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`; untracked `tests/reconstruction_engine_s28.test.ts`,
`tests/reconstruction_cli_s28.test.ts`, `plans/s28/`; and the S28 doc edits in
`plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/reconstruction-engine-design.md`). S29's plan lives in untracked `plans/s29/`.

## Goal
Lock S29's byte-perfect reconstruction and prove which existing engine code makes it work.
S29 is the COMPOSITION test: a single `python3 walk_rename.py` Bash run (recursive `os.walk`,
skipping `vendor/`) renames `helper`→`compute_value` across the package and emits SIX
`edited_text_file` beacons in every shape the engine already handles — 1 COMPLETE, 4 TRUNCATED
(S27 `completeTruncatedBeacon`), 1 ELIDED (S28 `completeElidedBeacons`) — while the two
`pkg/vendor/*` files get NO beacon and must keep `helper` (the control). No new engine code is
needed or wanted.

## Current State — PLANNED only (nothing implemented yet)
- `npm test` baseline = **398 / 0**, `npx tsc --noEmit` clean (with S28 present). If you do not
  see 398, STOP — the S28 baseline is missing and every value in the plan is invalid (plan §1.4).
- Verified LIVE during planning: 8 surviving files, 0 rewound, tip `#e6bfddf3`, prompt `#726893c2`.
  All final byte lengths, revision ladders, synthetic-`overwrite` changeIds (incl. the
  content-not-recency version selection: `pkg/a.py`→`@v4` over same-128-line `@v3`,
  `pkg/b.py`→`@v3` over same-101-line `@v2`), and the reader/poison matrix are in plan §2.
- Mutation probes done LIVE (plan §2.7): neutralizing `completeTruncatedBeacon` breaks ONLY
  `main.py` / `tests/test_pkg.py` / `walk_rename.py`; neutralizing `completeElidedBeacons` breaks
  ONLY `pkg/a.py`. `src/reconstruction_branches.ts` was restored byte-identically afterward
  (verified `diff`-clean; suite back to 398).

## What Remains (execute in this order — full detail in the plan)
1. **Task 1 (plan §4):** confirm 398 baseline + tsc clean; add `S29_JSONL` to `tests/fixtures.ts`
   after `S28_JSONL` (Desktop canonical path).
2. **Task 2 (plan §5):** write `tests/reconstruction_engine_s29.test.ts` — 8 tests (hermetic
   reader: serves the 3 truncated files' chosen backup from the RENDERED files, plus 4 INLINE
   backup blobs for the `pkg/a.py` and `pkg/b.py` cruxes — extract per plan §2.8). Cruxes: the
   vendor control (reader-independent + poison-stable, keeps `helper`), the 3 truncated byte-locks,
   the elided `pkg/a.py` version-selection (`@v4` over `@v3`), `pkg/b.py` truncated+pipeline, the
   no-reader/poison guards, and `extractFileEvents` (6 user-edits, 0 overwrites, 8 writes, 4 edits).
3. **Task 3 (plan §6):** write `tests/reconstruction_cli_s29.test.ts` — 6 tests (real reader via
   `runCli`): conversationDAG (6 beacon user-edits, linear), fileDAG (`c.py` has NO user-edit —
   the control), list-branches (tip `#e6bfddf3`, 8 files), verbose byte-lock for the 3 rendered
   files, verbose `c.py` keeps `helper`, verbose `pkg/a.py` elided-completed.
4. **Task 4 (plan §7):** 3 doc edits (roadmap, implementation-notes, engine-design) — these files
   already carry S28's uncommitted edits; ADD the S29 entries.
5. **Task 5 (plan §8):** `npm test` → **412 / 0**; tsc clean; prove ZERO S29 src change via the
   baseline-diff (`git diff src/` identical to the pre-work snapshot — see plan §3, the tree is
   NOT clean so "empty diff" is the wrong check).
6. **Task 6 (plan §9):** re-run both mutation probes to prove T3 and T5 go RED→GREEN; restore
   `src/reconstruction_branches.ts` byte-identically; record results in your completion handoff.
7. **Task 7 (plan §10):** COMMIT is USER-APPROVAL-ONLY — stage EXACTLY the S29 files (fixtures,
   2 test files, 3 docs, `plans/s29/`); NEVER `git add -A`; do NOT stage `src/*` or the
   templates; coordinate so the S29 commit does not swallow uncommitted S28 src. Then **CREATE
   HANDOFF** with `/jot:handoff-prompt`, title containing `Scenario s29 … IMPLEMENTED`.

## Key Files
- `plans/s29/s29-reconstruction-plan.md` — AUTHORITATIVE plan (§2 = all exact literals; §5/§6 =
  the two test files; §9 = the mutation proof).
- `plans/script-handling.txt` — the MUST-READ HAS-BEACON vs NO-BEACON premise.
- `tests/reconstruction_engine_s28.test.ts` + `tests/reconstruction_cli_s28.test.ts` — the exact
  patterns to mirror (hermetic reader + rendered ground truth; `runCli` + `fileVerboseBlock`).
- `tests/fixtures.ts` — add `S29_JSONL`.
- `scenarios/s29-script-rename-repo-walk.txt` + `scenarios/executed/s29-script-rename-repo-walk/`
  — scenario + executed transcript and the 3 rendered files.
- `~/.claude/file-history/543492c4-1d45-47b7-a4a1-a2d14857161f/` — backups (the inline-blob source;
  see plan §2.8 for the exact hashes/versions/byte counts).

## Context the Next Agent Won't Have
- **NO engine change. This is a char-lock.** Resist any urge to "fix" the engine — planning proved
  byte-perfect reconstruction already (3 rendered files match disk; 5 `pkg/*` files match their
  file-history backups exactly). If a lock fails, the bug is in the test literal/reader.
- **GROUND-TRUTH GAP (differs from every prior script-rename scenario):** the executed-scenario
  folder — in BOTH the worktree and the Desktop canonical store — captured only `main.py`,
  `walk_rename.py`, `tests/test_pkg.py`. The entire `pkg/` subtree was NOT rendered to disk. So
  `pkg/*` ground truth exists ONLY in file-history backups → the engine test inlines backup blobs
  for the `pkg/a.py`/`pkg/b.py` cruxes (plan §2.8); the CLI test covers `pkg/*` via the real reader.
- **Version selection is by CONTENT, not recency** (the strongest crux): `pkg/a.py` picks `@v4`
  over the SAME-line-count `@v3` (both 128L; differ only by `helper`→`compute_value`); `pkg/b.py`
  picks `@v3` over the same-101-line `@v2`, then the `pipeline` Edit replays on top. The hermetic
  reader MUST serve both the rejected and chosen versions so the test proves the choice.
- **`pkg/b.py` LEAKS poison under a poison reader** (via the pre-existing `seedStaleEditBases`
  S19/S23 path for the `pipeline` Edit's stale base) — identical to S28's `catalog_view`. This is
  prior-scenario behaviour, NOT something S29 introduces. **Exclude `pkg/b.py` from poison
  asserts.** The clean poison guards are `pkg/a.py` (elided) and the 3 truncated files.
- **`pkg/b.py` is NOT a unique crux for `completeTruncatedBeacon`** — its truncated beacon is also
  repaired by `seedStaleEditBases` via the later Edit, so neutralizing `completeTruncatedBeacon`
  does NOT break it. The unique S27 cruxes are `main.py` / `test_pkg.py` / `walk_rename.py`.
- `walk_rename.py` is SELF-MODIFYING (the walk renames its own string literals); its final must
  contain `compute_value` and no bare `helper`. It has only one backup version (`@v2`) — the clean
  isolation of truncation-completion from version-selection.
- The synthetic `overwrite` revisions are REVISIONS, not extracted events (`overwrites = 0` in
  `extractFileEvents`) and never appear as DAG nodes — assert this (plan T8 / C2).
- For C1/C4 exact spacing, copy substrings from a LIVE `runCli` run (plan §8) — do not hand-count.
- LESSON from S22/S26: the handoff TITLE drives the next monitor; keep the next-scenario token
  ONLY in the title, never elsewhere, to avoid false-fires.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # baseline 398 now; 412 after S29 tests
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s29.test.ts   # 8 green (after Task 2)
node --import tsx --test tests/reconstruction_cli_s29.test.ts      # 6 green (after Task 3)
diff /tmp/s29-src-before.diff <(git diff src/)                     # identical → zero S29 src change
```
