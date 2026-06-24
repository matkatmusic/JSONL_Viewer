# Handoff: m7 (`m7-conv-rewind-no-user-edits`) IMPLEMENTED — characterization/regression LOCK, NO `src/` change; 337 tests green. m7 is the FINAL defined scenario (m1–m7 + S1–S23 all done) — there is NO next scenario to plan. AWAITING user approval to commit the 7-file m7 stage.
Conversation name: api-from-scenarios — m7 impl monitor → implement m7 (conv-rewind-no-user-edits)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/7fb776ae-90c5-443b-8bbd-a5b8072e51a1.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m7/m7-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling`. The working tree carries uncommitted m2–m6 work (their tests/docs, plus m6's two `src/` files and `tests/reconstruction_sidecar.test.ts`) — do NOT revert it; m7 layered on top and adds ZERO new `src/` change.

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs `m7-conv-rewind-no-user-edits`: Write `m7_conv.py` (step1) + sibling test → Edit +step2 → Edit +step3 → "Looking good" → Rewind:3 (conversation-only; disk NOT restored) → Edit insert step2_alt before step3. This forks `m7_conv.py` into a rewound branch (step1→+step2→+step3) and a surviving branch (step1 → off-branch disk step1+step2+step3 → +step2_alt). The engine was already correct, so this is a characterization LOCK (NO engine change), like m1–m5/S17/S20–S22.

## Current State
m7 implementation COMPLETE and fully verified:
- `npm test` = **337 pass / 0 fail** (327 baseline + 10 new). `npx tsc --noEmit` clean.
- `git diff src/` = ONLY the pre-existing uncommitted m6 files (`reconstruction_branches.ts` +2/−1 net-zero at the 250 cap, `reconstruction_sidecar.ts` +21/−1) — **m7 added NO new `src/` change** (no-fix premise held).
- Files created/edited for m7 (the exact 7-file commit stage, plan §9):
  1. `tests/fixtures.ts` — appended `M7_JSONL` (Desktop path) after `M6_JSONL`.
  2. `tests/reconstruction_engine_m7.test.ts` — 5 tests, all green (reconstruct surviving WITH in-memory `m7Reader`; reader-load-bearing test; rewound reader-independence test).
  3. `tests/reconstruction_cli_m7.test.ts` — 5 tests, all green (conversationDAG two-branch rewind, two-file fileDAG, `--list-branches`, 14-line surviving byte-lock, 10-line rewound byte-lock with NO step2_alt).
  4. `plans/roadmap.md` — flipped M7 `[ ]`→`[x]`.
  5. `plans/implementation-notes-api-from-scenarios.md` — prepended the m7 entry (newest-first).
  6. `plans/reconstruction-engine-design.md` — appended the m7 note after the m6 note (NO new spec number).
  7. `plans/m7/m7-reconstruction-plan.md` — the plan (already on disk from planning).
- Both crux engine locks PROVEN to bite (RED→GREEN, reverted): reseed blob `@v4`→`@v3` → RED; no-reader rev count `2`→`3` → RED. CLI surviving byte-lock proven via `def step2_alt():`→`def step2_alt_SENTINEL():` → RED.
- **NOTHING committed.** Commit is gated on user approval (project rule: one commit per scenario after approval).

## What Remains
1. **Get user approval, then COMMIT** exactly the 7 files listed above — `git add` each by name, NEVER `git add -A` (the tree shares fixtures/roadmap/impl-notes/design and carries uncommitted m2–m6 edits, plus m6's two `src/` files and `tests/reconstruction_sidecar.test.ts` which are a SEPARATE earlier commit decision — do not bundle). Message: `Implemented m7 handling`. There is NO `src/` file in the m7 commit.
2. **No next scenario exists.** m7 is the LAST roadmap line; `scenarios/` holds only m1–m7, all implemented. Do NOT arm a downstream planning monitor — there is nothing to gate. If the user defines an m8+, plan it ground-truth-first (run the CLI live, verify byte-for-byte, then char-lock or real-fix).

## Key Files
- `plans/m7/m7-reconstruction-plan.md` — authoritative plan (§2 ground truth incl. all changeIds/tips/timestamps, §3 no-fix reference map, §5/§6 the exact tests, §9 commit list, §10 acceptance).
- `tests/reconstruction_engine_m7.test.ts` / `tests/reconstruction_cli_m7.test.ts` — the m7 locks.
- `tests/fixtures.ts` — `M7_JSONL` (line after `M6_JSONL`); carries uncommitted m2–m6 constants.
- `tests/reconstruction_engine_m5.test.ts` / `tests/reconstruction_cli_m5.test.ts` — closest template (reader-dependent lock).
- Executed transcript (worktree): `scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl`.

## Context the Next Agent Won't Have
- **m7 is the FINAL defined scenario.** m1–m7 + S1–S23 are all implemented. There is no m8 scenario file and no next unchecked roadmap line, so — unlike every prior scenario handoff — this one names NO next scenario and arms NO planning monitor. Confirm with the user whether the series is complete.
- **m7 is reader-ASYMMETRIC** — FIRST scenario reader-INDEPENDENT on one branch (rewound; Edit bases in the JSONL) and reader-DEPENDENT on the other (surviving). Engine tests reconstruct the surviving branch WITH `m7Reader`; the rewound branch is asserted byte-identical with/without a reader.
- **Why reader-dependent where S17 was not:** the surviving Edit F inserts `step2_alt`; its hunk context (`old_string = "def step3():\n    return 3"`) references ONLY `step3`, so the spec-39 born-path alone would DROP `step2`. The S19/m5 stale-edit-base reseed recovers the full 10-line off-branch disk from backup `29a113119f194d6f@v4` (inserted as an `overwrite` revision) before F replays. FIRST time that reseed fires because of OFF-BRANCH CLAUDE EDITS (D/E left on disk by the conv rewind), not a user edit.
- **Does NOT use m6's `includeAfter` fallback:** the reseed backup (`@v4`, 16:08:12.997) precedes F's edit (16:08:40.473), so `findBackupAtOrBefore` finds it directly. Do not assert on `includeAfter` for m7.
- **CLI tests depend on the live backup** `29a113119f194d6f@v4` in `~/.claude/file-history/725204e2-…/` (confirmed present). If a surviving verbose ever shows `    return 1\n    return 2`, the backup is missing — re-sync via `/jot:sync-jsonl-projects`, do NOT "fix" the engine.
- **Worktree hazards:** `src/` already shows m6's uncommitted changes — that IS the m7 baseline. NEVER `git add -A`; NEVER `git checkout`/`restore` the shared docs (`fixtures.ts`, `roadmap.md`, `implementation-notes-…md`, `reconstruction-engine-design.md`) — they carry uncommitted m2–m6 edits; revert any temp edit by hand.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # expect 337 pass / 0 fail
npx tsc --noEmit      # expect clean
git diff --stat src/  # expect ONLY the uncommitted m6 files; NO new m7 src change
P="scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
# expect: m7_conv.py 3 revisions — 2-line step1, 10-line step1+step2+step3, 14-line step2_alt result
npx tsx src/reconstruction_cli.ts "$P" --branch 8037716c --verbose 2>/dev/null
# expect: m7_conv.py 3 revisions ending at the 10-line step3 version; NO step2_alt
```
