# Handoff: S35 (`s35-script-rename-script-user-edit`) IMPLEMENTED — CHAR-LOCK, no `src/` change, suite 475 → 487
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S35 impl (/impl-scenario 35) → implement S35 + write this completion handoff
JSONL (this impl session): the active /impl-scenario 35 session under
/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/
(planning source of record: …/7e7cc3db-8f8c-4aca-8a25-04d7367574ac.jsonl)

## TL;DR
S35 is DONE and GREEN. It was a pure characterization / regression LOCK — **NO `src/` change**. The engine
already reconstructs all three touched files byte-perfectly with the real file-history reader, composing
already-shipped machinery (S28 `completeElidedBeacons` + S27 `completeTruncatedBeacon` + S15 native user-edit).
Added a fixture + 12 tests (6 engine + 6 CLI) + 3 doc entries. Full suite **487/0**, `tsc` clean. Nothing
committed (coordination hazard — see below). This handoff's title parses as `s35 … IMPLEMENTED`, which fires
the `monitor-handoff.sh s35 impl` gate (`bim0p9s6w`) that unblocks the **s36 planner**.

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (UNCHANGED — NOTHING committed; the worktree carries
uncommitted S28–S34 work plus this new S35 lock).

## What S35 is
A `python3 rename_inv.py` Bash rename (three whole-word pairs: `qty_chk→check_quantity`, `add_item→insert_item`,
`rm_item→remove_item`) across `inventory.py` + `tests/test_inventory.py`. The NOVEL twist: the file user-edited
before the run is the RENAME SCRIPT ITSELF — `rename_inv.py` is written with ONE tuple then user-edited twice
(steps 4 & 5 add the 2nd/3rd tuples), and those two edits COALESCE into a SINGLE ELIDED `edited_text_file`
beacon (`#c67cfd9c`, a 17-line head+tail-cut fragment). S35 is the COMPLEMENT of S33: same "user-edit before the
run" shape, but the script-phase beacons here are INCOMPLETE so the rescue stages FIRE (S33's were all INERT).

## Why NO `src/` change (CHAR-LOCK)
The engine reconstructs byte-perfectly WITH the real reader by composing shipped stages:
- **S28 `completeElidedBeacons`** recovers the full 45-line 3-tuple `rename_inv.py` from backup `41364cab6ad88cbb@v2`.
- **S27 `completeTruncatedBeacon`** completes `tests/test_inventory.py`'s 51-line truncated prefix from backup
  `5ea404c2628560f6@v3` → 79 L.
- `inventory.py`'s script beacon is COMPLETE (no rescue, reader-INDEPENDENT, 244 L).
The fragment+synthetic-overwrite two-revision shape (`write + userEdit(fragment) + overwrite(backup)`) was already
LOCKED by S27/S28/S30, so the 3-revision ladders are the ACCEPTED engine output — locked, not "fixed".

## Current State — IMPLEMENTED, GREEN, uncommitted
- `npm test` → **487 / 0**. `npx tsc --noEmit` → clean.
- `node --import tsx --test tests/reconstruction_engine_s35.test.ts tests/reconstruction_cli_s35.test.ts` → **12/12**.
- `git diff --stat -- src/` shows **ZERO S35 hunks** (S35 changed no source; the src/ diff is the pre-existing
  S28–S34 work only).
- All 12 tests passed on the FIRST run (no RED phase — there is no bug; these are regression locks).

## Files changed by S35 (stage EXACTLY these — never `git add -A`)
- `tests/fixtures.ts` — added `S35_JSONL` after `S34_JSONL` (sibling-store path).
- `tests/reconstruction_engine_s35.test.ts` — NEW, 6 engine tests T1–T6 (249 lines; helpers copied verbatim from
  the S34 engine test).
- `tests/reconstruction_cli_s35.test.ts` — NEW, 6 CLI tests C1–C6 (helpers `fileVerboseBlock`/`finalRevisionSlice`
  copied verbatim from the S34 CLI test).
- `plans/roadmap.md` — appended the `[x] S35 -> [x] …` entry (suite 487).
- `plans/reconstruction-engine-design.md` — S35 design note immediately after the S34 block.
- `plans/implementation-notes-api-from-scenarios.md` — prepended the S35 entry.
- `plans/s35/` — the plan, the incoming planning handoff, and this completion handoff.

## What Remains (execution order)
1. **(Optional) Commit S35** — USER APPROVAL ONLY; the worktree mixes many scenarios (see Coordination Hazard).
   Stage exactly the seven paths above. Never `git add -A`, never any `src/*` (S35 changes no source).
2. **s36 planning is now unblocked.** This handoff fires `monitor-handoff.sh s36 plan`'s upstream gate
   (`bim0p9s6w` = `monitor-handoff.sh s35 impl`). The s36 planner (`s36-script-rename-csv-user-edit-mcp`) is a
   composite of S33 (CSV user-edited 4th row) + S32 (MCP `ctx_execute` exec, parser fix already in the worktree).

## Live anchors the tests pin (re-verified this session, not re-derived)
- `reconstructBranches(realReader)` → `rewound = 0`, `surviving = 3`.
- `extractFileEvents` = `{write:3, edit:2, userEdit:3, overwrite:0}`, userEdit short ids (sorted)
  `["c67cfd9c","dbc2e4c1","f3e90535"]` (`c67cfd9c` = coalesced script edit; `dbc2e4c1`/`f3e90535` = run beacons).
- Ladders (real reader): `inventory.py` [write,edit,userEdit,edit] 172→192→192→244 (244 final);
  `tests/test_inventory.py` [write,userEdit,overwrite] 79→51→79 (rev2 `5ea404c2628560f6@v3`);
  `rename_inv.py` [write,userEdit,overwrite] 43→17→45 (rev2 `41364cab6ad88cbb@v2`).
- elided fragment (rename rev1) first line: `boundaries) so that substrings inside longer identifiers are left alone.`
- CLI: prompt `#da499f4e`; surviving tip `#72049b4a`; fileDAG nodes inventory 4 (B,D,G,I) / test 2 (C,H) /
  rename 2 (E,F); the synthetic completion changeIds are backup blob names, kept out of the DAGs (spec 40).
- Reader-dependence: NO reader → test 51/2-revs, rename 17/2-revs, inventory 244 (unaffected). POISON reader →
  S27/S28 guards reject it, falling back to the fragments, no `"POISONED"` leak.

## Context the Next Agent Won't Have
- **CHAR-LOCK, not a fix.** Do NOT "fix" the 17L/51L fragment revisions — they are the accepted, already-locked
  engine output (S27/S28/S30 lock the same shape). The lock pins the CURRENT correct behavior.
- **Reader is MANDATORY for the byte-locks.** With NO reader, `test_inventory.py` final = 51 and `rename_inv.py`
  final = 17 (the raw fragments); `inventory.py` is reader-INDEPENDENT (244 either way). Build the reader as
  `createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot())` (the `realReader` helper). This is
  why S35 is MIXED reader-dependence (like S25).
- **The two script user-edits (steps 4 & 5) produce ONLY ONE beacon** (`#c67cfd9c`) — the intermediate 2-tuple
  state is NOT independently observable. There is no separate 2-tuple revision to assert.
- **KEPT-NAME HAZARD (S31/S32), PRESENT:** terse-but-unrenamed `find_item`/`tot_value` SURVIVE (assert presence,
  not absence). `test_inventory.py` method names `test_qty_chk_*` keep `qty_chk` as a SUBSTRING (`_`-bounded → 
  `\bqty_chk\b` does NOT match). Assert old-name absence with WHOLE-WORD `\bqty_chk\b` (count 0) — a bare
  `includes("qty_chk")` would WRONGLY fail (substring count is 5).
- **`re.sub` literal is the STRING-CONCAT form** `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` (use
  `String.raw`) — NOT the S33 f-string form. (Same S34 lesson; verified live this session.)
- **LESSON (S33), applied:** captured exact CLI strings from a live `runCli` run BEFORE writing the CLI
  assertions, via a throwaway `tests/_probe_s35.ts` (run, then deleted — no trace left in the tree).
- **250-line cap is enforced** by a `jot:post_tool_use` hook on test files too — the engine test was trimmed
  (comment condensing + collapsed short `deepEqual` arrays) from 277 to 249 lines; no assertion dropped.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 487 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s35.test.ts tests/reconstruction_cli_s35.test.ts   # 12/12
git diff --stat -- src/    # NO s35-attributable change (pure characterization lock)
```

## Coordination Hazard (same as S28–S34)
The worktree carries uncommitted prior-scenario work — `src/parse/loadTranscript.ts` (S32 fix),
`src/reconstruction_reseed.ts`, `src/reconstruction_beacons.ts` (new in S34), `src/reconstruction_branches.ts`,
`_sidecar.ts`, `_user_edit.ts`, the S28–S34 test/plan/doc files, and unrelated `src/Plan_template.md` /
`src/Impl_template.md` edits by other agents. The three doc files in the S35 commit also carry S28–S34 edits.
`git diff --stat` is NOT S35-only — confirm the commit-split with the user; never `git add -A`.
