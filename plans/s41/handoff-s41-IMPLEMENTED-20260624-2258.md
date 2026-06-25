# Handoff: Scenario s41 (`s41-git-baseline-mid-commit`) — IMPLEMENTED (CHAR-LOCK, no engine change)

MUST READ: plans/script-handling.txt

Conversation name: impl-scenario 41
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/05b1943a-bf1e-4fff-9fa7-d674a6c1476a.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s41/s41-reconstruction-plan.md
Planning handoff: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s41/handoff-api-from-scenarios-20260624-2250.md
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-impl-scenario-41.md

## Branch
`api-from-scenarios` based on `master`

## Goal (done)
Lock the engine's reconstruction of Scenario **s41** (`s41-git-baseline-mid-commit`, third of the
`git-baseline` family) as a characterization test. The engine ALREADY reconstructs s41 correctly, so this was
a **CHAR-LOCK: tests only, NO source change.** s41 = s40 + a mid-stream `git commit "wip"` between the two
interleaved USER edits on `orders.py`.

## Current State (verified)
- `npm test` → **536 pass, 0 fail** (was 531 before s41; +5 new s41 CLI tests, all green on first run).
- `npx tsc --noEmit` → clean ("No errors found").
- NO `src/` change. Engine byte-for-byte unchanged for S1–S40 + m1–m7.
- NOTHING committed (consistent with the rest of this series; the user commits when ready).

## What Was Done
1. Added `S41_JSONL` to `tests/fixtures.ts` (local executed-dir copy convention, mirrors `S40_JSONL`):
   `scenarios/executed/s41-git-baseline-mid-commit/6d01aabb-79c5-4ca9-88b9-7834a050bf6d.jsonl`.
2. Captured live `runCli` output (default / `--list-branches` / `--graphFile` / `--verbose`) BEFORE writing
   assertions (s33/s38 lesson) — all locked values come from the real reader path, none hand-written.
3. Created `tests/reconstruction_cli_s41.test.ts` (5 tests) cloned from `tests/reconstruction_cli_s40.test.ts`
   (same helper fns). Locks: `orders.py` tip byte-identical to on-disk `orders.py`; `tests/test_orders.py`
   ABSENT; `subtotal` absent everywhere.
4. Updated `plans/roadmap.md` (added s41 line + back-filled the missing s39/s40 lines — see Deviations) and
   `plans/reconstruction-engine-design.md` (added the s41 entry after s40).
5. Wrote `plans/implementation-notes-impl-scenario-41.md`.

## Key Facts Locked (live capture)
- fileDAG = TWO nodes on `orders.py`: B `edit` #01Rw572a (Claude adds `count`) → C `user-edit` #a72dd041
  (appends `# reviewed by ops`). prompt #f4131b49. One surviving branch, tip **#fbd57365**, no rewound.
- `--verbose` = 4 revisions (0..3), line counts `29, 41, 9, 43`. rev 0 = `total`/`names` baseline (no count),
  rev 1 = +count, rev 2 = 9-line PARTIAL-ECHO of the first user edit, rev 3 (tip, 43 L) = both comments,
  byte-identical to on-disk `orders.py` (minus the trailing newline the engine drops at replay).

## Context the Next Agent Won't Have
- **reader-DEPENDENT.** Correct reconstruction needs the file-history `BackupReader`. User edit #1
  (`# reviewed by ops`) is only a 9-line truncated `edited_text_file` echo in-JSONL; user edit #2
  (`# checked`) is NOWHERE in the JSONL — backup `@v3` supplies the tip, folded into node C (no third node).
  `runCli` auto-wires the reader from the session id + `~/.claude/file-history`; no flag. Backups must exist
  on the machine (they do here).
- **The mid-stream `git commit` is INERT** — `git add`/`status`/`commit -m wip`/`log` Bash records produce no
  file events; the engine ignores them cleanly. It is the ONLY structural difference from s40 and changes
  nothing in the reconstruction.
- **`subtotal` trap:** scenario step 7 asks Claude to add `subtotal(items, n)`, but it NEVER executed (session
  ends "Thanks." + exit). No `subtotal` Edit in the JSONL or any backup; on-disk `orders.py` has none. The
  engine correctly does NOT invent one — the s41 test asserts its absence. (Contrast s40, whose JSONL DID
  contain a subtotal Edit → 55-line tip with a 4th node.)
- Only `orders.py` is reconstructed. `tests/test_orders.py` was written in the `--excludeJSONL`-dropped
  baseline session → no event → not reconstructed (same as s39/s40). Test asserts its absence.
- **Runner gotcha (s38 lesson):** `npm test` = `node --import tsx` / node:test, NOT vitest. The new s41 file
  was confirmed actually collected (5 named tests run).
- **Probe-script gotcha (s38 lesson):** a throwaway probe importing `./src/...` must live at the REPO ROOT,
  not in `/tmp` — the relative import resolves against the script's own dir. (Probe files were removed.)
- **Roadmap back-fill (deviation):** `plans/roadmap.md`'s `[x] SNN` checklist had stopped at S38 — the s39 and
  s40 implementers never added their lines (the design doc DID get s39/s40 entries). I added concise s39 and
  s40 lines (from the authoritative design-doc entries) alongside s41 so the sequence isn't broken. Strictly
  additive; if the s39/s40 owners want different prose they can revise.

## What Remains
- Nothing for s41 itself. Downstream: this IMPLEMENTED handoff fires `monitor-handoff.sh s41 impl`, unblocking
  the s42 (`git-baseline-uncommitted-module`) planning pipeline.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # expect 536 green, including the 5 s41 CLI tests
npx tsc --noEmit    # clean
```
