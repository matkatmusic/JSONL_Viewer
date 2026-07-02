# Handoff: IMPLEMENT Scenario s40 (`s40-git-baseline-user-edits`) — CHAR-LOCK, no engine change [PLANNED]

MUST READ: plans/script-handling.txt

Conversation name: plan-scenario 40
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/af6f945c-9e6a-481c-ad17-3c50dad455e0.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s40/s40-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock the engine's reconstruction of Scenario **s40** (`s40-git-baseline-user-edits`, second of
the new `git-baseline` family) as a characterization test. The engine ALREADY reconstructs s40
correctly — verified live this session — so this is a **CHAR-LOCK: tests only, NO source change.**

## Current State
PLANNED. Engine probed live against the s40 JSONL through `runCli` (real sidecar reader, the CLI's
own path) in all four modes; output is correct:
- `orders.py` reconstructs as a linear 4-node ladder (B edit → C user-edit → D edit → E user-edit),
  one surviving branch, tip `#86c30c1a`.
- `--verbose` tip (rev 6, 55 lines) **byte-matches** the rendered on-disk `orders.py` after stripping
  `  N | ` line-number prefixes and the trailing newline (verified programmatically).
- No `tests/test_orders.py` section, no rewound branch — exactly like s39.

Baseline before s40 tests: 526 green (per the s39 handoff; includes uncommitted s37/s38/s39 work).
Nothing committed (user commits, not the implementer). Only `plans/s40/` is new/untracked.

## What Remains
1. Add `S40_JSONL` to `tests/fixtures.ts` → local executed copy
   `scenarios/executed/s40-git-baseline-user-edits/e2fee02a-29c1-4710-9146-8d8055e7fe94.jsonl`
   (local-copy convention, same as `S39_JSONL`).
2. **create** `tests/reconstruction_cli_s40.test.ts`, modeled on `tests/reconstruction_cli_s39.test.ts`
   (reuse its `fileVerboseBlock` / `finalRevisionSlice` / `stripLineNumberPrefixes` /
   `stripTrailingNewline` helpers). Lock: default DAG + prompt `#e84ca6bc`; `--list-branches`
   (`surviving  tip #86c30c1a`, one file); `--graphFile` 4 nodes; `--verbose` 7-revision ladder
   (line counts `28,40,9,41,54,9,55`) with tip byte-match; no `test_orders.py` anywhere.
3. (Optional) `tests/reconstruction_engine_s40.test.ts` for the structural/reader-dependence lock
   (s39 added one; the CLI test alone satisfies the characterization).
4. Append the s40 entry to `plans/reconstruction-engine-design.md` and notes to
   `plans/implementation-notes-api-from-scenarios.md`.
5. Verify (below). Do NOT commit.
6. **create handoff** documenting s40 IMPLEMENTED (fires the next pipeline monitor).

## Key Files
- `plans/s40/s40-reconstruction-plan.md` — the plan this implements (has all locked literals).
- `tests/reconstruction_cli_s39.test.ts` — the template to copy for the s40 CLI test.
- `tests/fixtures.ts` — add `S40_JSONL` here.
- `scenarios/executed/s40-git-baseline-user-edits/orders.py` — rendered ground truth the tip byte-matches.
- `plans/s39/handoff-api-from-scenarios-20260624-2223.md` — the upstream s39 handoff; explains the
  git-baseline family's reader-dependence and `--excludeJSONL` mid-stream-open transcript.

## Context the Next Agent Won't Have
- **s40 = s39 + two interleaved USER edits on `orders.py`.** The `--excludeJSONL` respawn drops the
  baseline session (git init, the Writes, the "baseline" commit, the `feature` branch) — the JSONL has
  NO git markers and opens mid-stream. The git repo is invisible to the engine; do not try to surface it.
- **The 9-line revisions (rev 2, rev 5) are EXPECTED, not a defect.** They are the user-edit partial-echo
  snapshots — the tail window of the file ending in the appended comment (`# reviewed by ops`,
  `# checked`). The same value-snapshot rendering s39 documented for its single edit. Their paired
  full-state revisions are rev 3 (41) and rev 6 (55). Full-state ladder is correct and monotonic:
  40 (B:count) → 41 (C:reviewed) → 54 (D:subtotal, inserted before count) → 55 (E:checked, tip).
- **Reader-DEPENDENT** (governs the whole git-baseline family per the s39 handoff). `runCli` builds the
  real sidecar reader internally, so the CLI test needs no special wiring — just call `runCli([S40_JSONL, …])`.
  If you also write an engine test, you must pass the real sidecar reader (`buildSidecarReader`, as s39 does)
  or `orders.py` degrades.
- **Re-capture exact CLI literals live before writing asserts** (S33 lesson) — the node changeIds, prompt
  hash, tip hash, and line counts above were captured this session but confirm them with your own `runCli`
  run rather than trusting them blind.
- Engine keys `orders.py` under an absolute temp path (`/private/var/folders/.../run-scenario.*/orders.py`);
  match on the `/orders.py` suffix as the s39 test does.

## How to Verify
```
node --import tsx --test tests/*.test.ts    # all green (526 prior + new s40 tests)
npx tsc --noEmit                            # clean
```
