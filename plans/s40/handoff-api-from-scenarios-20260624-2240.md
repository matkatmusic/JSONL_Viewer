# Handoff: Scenario s40 (`s40-git-baseline-user-edits`) — CHAR-LOCK, no engine change [IMPLEMENTED]

MUST READ: plans/script-handling.txt

Conversation name: impl-scenario 40
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/3c972b2c-9772-4509-b892-4ab0a4115a7b.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s40/s40-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock the engine's reconstruction of Scenario **s40** (`s40-git-baseline-user-edits`, second of the new
`git-baseline` family) as a characterization test. The engine ALREADY reconstructs s40 correctly, so this
was a **CHAR-LOCK: tests only, NO source change.** s40 = s39 (`git-baseline-seed`) + two interleaved USER
edits on `orders.py`.

## Current State
**IMPLEMENTED.** Full suite **531 green** (526 prior + 5 new s40 CLI tests); `npx tsc --noEmit` clean.
No source change — engine untouched. Nothing committed (user commits, not the implementer).

Done this session:
- Added `S40_JSONL` to `tests/fixtures.ts` → local executed copy
  `scenarios/executed/s40-git-baseline-user-edits/e2fee02a-29c1-4710-9146-8d8055e7fe94.jsonl`.
- Created `tests/reconstruction_cli_s40.test.ts` (5 tests): default DAG (prompt `#e84ca6bc` + the 4-node
  ladder), `--list-branches` (`surviving  tip #86c30c1a`, one file), `--graphFile` (the exact 4-node block),
  `--verbose` (7-revision ladder `28,40,9,41,54,9,55`, partial-echo + full-state locks, tip byte-match),
  and no-`test_orders.py`.
- Appended the s40 entry to `plans/reconstruction-engine-design.md` and notes to
  `plans/implementation-notes-api-from-scenarios.md`.

Uncommitted (this work): `tests/reconstruction_cli_s40.test.ts` (new), `plans/s40/` (new),
`tests/fixtures.ts`, `plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`.
(`src/Impl_template.md` also shows modified — a pre-existing change from before this session, not part of s40.)

## What Remains
1. (User) Review and commit the s40 work — implementer does NOT commit.
2. The next pipeline scenario is **s41** (`git-baseline-mid-commit`): s40 + a mid-stream `wip` commit between
   the two user edits. This handoff's `[IMPLEMENTED]` title fires the s41 planning monitor.

## Key Files
- `tests/reconstruction_cli_s40.test.ts` — the 5 char-lock tests (NEW).
- `tests/fixtures.ts` — `S40_JSONL` added.
- `plans/s40/s40-reconstruction-plan.md` — the plan this implements (all locked literals).
- `scenarios/executed/s40-git-baseline-user-edits/orders.py` — rendered ground truth the tip byte-matches.
- `plans/reconstruction-engine-design.md` / `plans/implementation-notes-api-from-scenarios.md` — design + notes updated.

## Context the Next Agent Won't Have
- **s40 is reader-DEPENDENT** (governs the whole git-baseline family, per s39). `runCli` builds the real
  sidecar reader internally, so the CLI test needs no special wiring. An engine-level test would need
  `buildSidecarReader`/`realReader` or `orders.py` degrades — I skipped the optional engine test because the
  CLI test already byte-locks the tip through the real reader.
- **The 9-line revisions (rev 2, rev 5) are EXPECTED, not a defect** — user-edit partial-echo snapshots (the
  tail window ending in the appended comment `# reviewed by ops` / `# checked`). Their full-state pairs are
  rev 3 (41) and rev 6 (55). Full-state ladder is monotonic: 28 → 40 (count) → 41 (reviewed) → 54 (subtotal,
  inserted before count) → 55 (checked, tip).
- **Plan literals all matched the live capture exactly** (unlike s39, whose `originalFile`-seed claim was
  wrong) — but I still re-captured every literal live first (S33 lesson) before writing asserts.
- The `--excludeJSONL` respawn drops the baseline session, so the JSONL has NO git markers and opens
  mid-stream. The git repo is invisible to the engine — do not try to surface it. `tests/test_orders.py` has
  no event here and must appear NOWHERE.
- Added a `revisionSlice(block, n)` helper to the test so each interleaved revision is asserted independently.

## How to Verify
```
node --import tsx --test tests/*.test.ts    # 531 green
npx tsc --noEmit                            # clean
```
