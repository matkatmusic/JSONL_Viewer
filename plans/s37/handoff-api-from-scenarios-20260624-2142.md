# Handoff: s37 (`s37-script-rename-driver-back-and-forth-mcp`) IMPLEMENTED — CHAR-LOCK, NO `src/` change, 499 → 511 green

MUST READ: plans/script-handling.txt

Conversation name: api-from-scenarios — S37 impl (/impl-scenario 37)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4538a085-8ba5-463d-8914-84c38fdd96f4.jsonl
Plan file: plans/s37/s37-reconstruction-plan.md
Planning handoff (in): plans/s37/handoff-api-from-scenarios-20260624-2121.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock the engine's already-correct handling of Scenario s37 (the MCP-sandbox twin of S34) with a
characterization / regression suite, so future engine changes can't silently regress it. s37 reconstructs
byte-perfectly with no engine modification — every fix it relies on (S32 parser allow-set, S27/S28 beacon
completion, S34 out-of-window reseed) is already in the worktree. The deliverable is a fixture + 12 tests + 3
doc updates that pin the current output, with ZERO `src/` change.

## Current State
DONE — implementation complete and verified:
- `npm test` → **511/511 green** (was 499); `npx tsc --noEmit` clean.
- The 12 new s37 tests (6 engine + 6 CLI) all pass on first run (no RED phase — pure regression LOCK).
- `git diff --stat -- src/` shows ZERO s37-attributable hunks (s37 touched only `tests/` and `plans/`).
- **NOT committed** — the user chose "Don't commit yet" when asked. All s37 work is staged-but-uncommitted in
  the working tree alongside the unrelated prior-scenario S28–S36 work.

Files written/changed by s37:
- NEW `tests/reconstruction_engine_s37.test.ts` (T1–T6), `tests/reconstruction_cli_s37.test.ts` (C1–C6),
  `plans/s37/` (plan + both handoffs).
- MOD `tests/fixtures.ts` (added `S37_JSONL` after `S36_JSONL`).
- MOD `plans/roadmap.md` (S37 entry; ALSO removed a verbatim DUPLICATE S36 line — see Context below).
- MOD `plans/reconstruction-engine-design.md` (S37 block after the S36 block).
- MOD `plans/implementation-notes-api-from-scenarios.md` (S37 entry prepended).

## What Remains
1. **Commit (needs USER APPROVAL).** Stage EXACTLY these paths — never `git add -A`, never any `src/*`:
   `tests/fixtures.ts`, `tests/reconstruction_engine_s37.test.ts`, `tests/reconstruction_cli_s37.test.ts`,
   `plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
   `plans/implementation-notes-api-from-scenarios.md`, `plans/s37/`.
   NOTE: the three `plans/*.md` docs also carry prior S28–S36 edits (nothing in this worktree is committed);
   staging them includes that accumulated doc work, per the plan's Commit hygiene.
2. **Downstream s38 planner** is gated on this handoff (its title carries `s37` + `IMPLEMENTED`, which fires
   `monitor-handoff.sh s37 impl`). No action needed here beyond landing this file.

## Key Files
- `plans/s37/s37-reconstruction-plan.md` — authoritative plan (every literal, ladder, node id).
- `plans/script-handling.txt` — HAS-BEACON vs NO-BEACON premise (s37's MCP-run beacons are INCOMPLETE → the
  existing rescue stages fire).
- `tests/reconstruction_engine_s37.test.ts` / `tests/reconstruction_cli_s37.test.ts` — the new locks.
- `tests/reconstruction_engine_s34.test.ts` / `tests/reconstruction_cli_s34.test.ts` — the templates copied
  verbatim (helper blocks).
- `src/parse/loadTranscript.ts` (S32 MCP allow-set), `src/reconstruction_reseed.ts` (S34 reseed),
  `src/reconstruction_beacons.ts` (S27/S28 completion) — read-only; s37 depends on them but edits none.

## Context the Next Agent Won't Have
- **POISON CAVEAT (the biggest trap).** s34's T6 asserts poison-rejection on ALL four files; for s37 that is
  WRONG and would be RED. `ledger.py`'s rescue path ACCEPTS the poison backup (collapses to 19, leaks
  `"POISONED"`) — a LATENT robustness gap, NOT a correctness gap (real-reader AND no-reader both give the
  correct 151). It is OUT OF SCOPE for this char-lock. T6(b) asserts poison-cleanliness ONLY on the three
  guarded files (`test_ledger.py` 68 / `renames.csv` 4 / `apply_renames.py` 66) and documents the ledger.py
  exclusion in a comment. Do not "fix" this by adding a ledger.py poison assertion.
- **MCP key is allowed-but-NOT-typed** (S36 lesson, re-confirmed): the loaded record type does not expose
  `attributionMcpTool`, so T6(a) asserts MCP provenance via a RAW-JSONL read — the fixture carries exactly
  **6** `ctx_execute` assistant records (s36 had 7; do not transcribe s36's number).
- **`apply_renames.py` uses the PRECOMPILED two-line form** (`pattern = r"\b" + re.escape(old) + r"\b"` then
  `text = re.sub(pattern, new, text)`), NOT s34's inline form. Both lines asserted via `String.raw`.
- **MIXED reader-dependence** (like S25/S35, NOT uniform like S34): `ledger.py` 151 + `apply_renames.py` 66
  are reader-INDEPENDENT; `test_ledger.py` (69 real / 68 no-reader) + `renames.csv` (5 real / 4 no-reader) are
  reader-DEPENDENT. T2 captures both directions.
- **Live CLI strings were captured from a throwaway inline probe** before writing C1–C6 (deleted, no trace).
  Pinned: prompt `#ba6aa3a0`, surviving tip `#b86404ef`; ledger.py 7 revisions (final 151), test_ledger.py 3
  (69), renames.csv 3 (5), apply_renames.py 1 (66).
- **Dropped the s34 `FILES` helper constant** from the engine test (T6 iterates a local `guarded` array of
  only the three poison-clean files, so `FILES` was unused — removing it also kept the file under the 250-line
  cap enforced by the jot post-tool hook).
- **roadmap.md had a verbatim DUPLICATE S36 line** (the S36 entry was pasted twice). I replaced the second
  (duplicate) copy with the new S37 entry; the S36 entry remains intact on its original line. This is removal
  of an accidental exact-duplicate paste, not a rewrite of a prior entry.
- Nothing in this worktree is committed (S28–S36 + s37 all uncommitted); `git diff` is NOT s37-only.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 511 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s37.test.ts tests/reconstruction_cli_s37.test.ts   # 12/12
git diff --stat -- src/    # NO s37-attributable change (pure characterization lock)
```
