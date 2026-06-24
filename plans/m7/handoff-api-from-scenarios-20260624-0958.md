# Handoff: IMPLEMENT the m7 (`m7-conv-rewind-no-user-edits`) reconstruction plan — a characterization/regression LOCK, NO `src/` change. The engine ALREADY reconstructs this conversation-only rewind byte-for-byte correct WITH a `BackupReader` (verified live: surviving branch reader-DEPENDENT = `[write, overwrite, edit]` ending at the 14-line step2_alt result; rewound branch reader-INDEPENDENT = `[write, edit, edit]` ending at the 10-line step3 version). This work adds the `M7_JSONL` fixture + 10 tests (5 engine + 5 CLI) + 3 doc edits to pin it, mirroring the m5 reader-dependent lock. Plan is COMPLETE and authoritative at `plans/m7/m7-reconstruction-plan.md` — follow it verbatim. Baseline 327 → 337.
Conversation name: api-from-scenarios — m7 planning monitor → plan m7 (conv-rewind-no-user-edits)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/80e84265-93ed-4cd3-8fc8-592b01a5e74c.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m7/m7-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling`. The working tree carries uncommitted m2–m6 work (their tests/docs, plus m6's two `src/` files) — do NOT revert it; m7 layers on top.

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs `m7-conv-rewind-no-user-edits`: Write `m7_conv.py` (step1) + sibling test → Edit +step2 → Edit +step3 → "Looking good" → **Rewind:3 (conversation-only; disk NOT restored)** → Edit insert step2_alt before step3. This forks `m7_conv.py` into a rewound branch (step1→+step2→+step3) and a surviving branch (step1 → off-branch disk step1+step2+step3 → +step2_alt). The engine is already correct, so this is a characterization LOCK (NO engine change), exactly like m1–m5/S17/S20–S22.

## Current State
- Baseline VERIFIED at planning time: `npm test` = **327 pass / 0 fail**, `npx tsc --noEmit` clean.
- Engine behaviour VERIFIED live (CLI + a direct `reconstructBranches` probe, since deleted):
  - **Surviving `m7_conv.py` WITH reader** = 3 revisions `[write, overwrite, edit]`: rev0 step1 (2 lines); rev1 `overwrite` changeId `29a113119f194d6f@v4` = 10-line step1+step2+step3 (backup-seeded off-branch disk); rev2 `edit` = 14-line `step1,step2,step2_alt,step3` (byte-identical to the on-disk file). Sibling `test_m7_conv.py` = 1 `write` revision.
  - **Surviving WITHOUT reader = WRONG** (2 revisions; final mangled — `"    return 1\n    return 2"`, no `def step2():`). The reader is LOAD-BEARING (m6-style).
  - **Rewound `m7_conv.py`** = 3 revisions `[write, edit, edit]` ending at the 10-line step3 version; byte-identical with and without a reader (reader-INDEPENDENT).
  - Branch tips: surviving `b6d67431-6b98-43b8-8483-d5f91f7cc28b`; rewound `8037716c-b633-4787-ae71-a115580b4e42` @ rewind point `a76d12e8-ded8-43fa-96b9-f3cdb43c8cc2`.
- Plan written: `plans/m7/m7-reconstruction-plan.md` (full ground truth §2, no-fix reference map §3, the exact 5 engine + 5 CLI tests §5/§6 with verbatim byte-locks, docs §7, verification §8, commit+handoff §9, acceptance §10).
- NOTHING for m7 implemented yet (no fixture, no test files, no doc edits). NOTHING committed.

## What Remains
Execute `plans/m7/m7-reconstruction-plan.md` in order:
1. **Task 1 (§4):** Confirm baseline 327/clean. Append `M7_JSONL` (Desktop path) to `tests/fixtures.ts` after `M6_JSONL`.
2. **Task 2 (§5):** Create `tests/reconstruction_engine_m7.test.ts` — 5 tests (reconstruct WITH the in-memory `m7Reader`; the load-bearing test compares with/without; the rewound test proves reader-independence). Prove the two crux locks bite (RED when the reseed blob name → `@v3`; RED when the no-reader rev count → 3), then restore.
3. **Task 3 (§6):** Create `tests/reconstruction_cli_m7.test.ts` — 5 tests (conversationDAG two-branch rewind, two-file fileDAG, `--list-branches`, the 14-line surviving byte-lock, the 10-line rewound byte-lock with NO `step2_alt`). These use the LIVE `~/.claude/file-history` reader.
4. **Task 4 (§7):** 3 doc edits — flip `plans/roadmap.md` M7 to `[x]`; PREPEND an m7 entry to `plans/implementation-notes-api-from-scenarios.md`; append an m7 note to `plans/reconstruction-engine-design.md` after the m6 note (NO new spec number).
5. **Task 5 (§8):** `npm test` = **337 / 0**; `npx tsc --noEmit` clean; `git diff src/` shows ONLY the pre-existing uncommitted m6 files (m7 adds ZERO new `src/` change).
6. **Task 6 (§9):** Commit on USER APPROVAL only — stage EXACTLY the 7 files listed in §9 (never `git add -A`), message `Implemented m7 handling`. **Then CREATE A COMPLETION HANDOFF via `/jot:handoff-prompt`** naming the NEXT scenario in the handoff TITLE line only.

## Key Files
- `plans/m7/m7-reconstruction-plan.md` — authoritative plan (§2 ground truth incl. all changeIds/tips/timestamps, §3 no-fix reference map, §5/§6 the exact tests, §10 acceptance).
- `tests/fixtures.ts` — add `M7_JSONL`; already carries uncommitted m2–m6 constants.
- `tests/reconstruction_engine_m5.test.ts` / `tests/reconstruction_cli_m5.test.ts` — the closest template (reader-dependent lock: in-memory reader, reader-load-bearing + reader-independence tests).
- `tests/reconstruction_engine_s17.test.ts` — the conv-only rewind + structural rewound-branch precedent.
- Executed transcript (worktree): `scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl`. Fixture (Desktop): same UUID under `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m7-conv-rewind-no-user-edits/`.

## Context the Next Agent Won't Have
- **m7 is reader-ASYMMETRIC** — the FIRST scenario reader-INDEPENDENT on one branch (rewound; bases in JSONL) and reader-DEPENDENT on the other (surviving). Engine tests therefore reconstruct the surviving branch WITH `m7Reader` and the rewound branch is asserted byte-identical with/without a reader.
- **Why reader-dependent where S17 was not:** the surviving Edit F inserts `step2_alt` and its hunk context (`old_string = "def step3():\n    return 3"`) references ONLY `step3`. The spec-39 born-path would materialise only `step3` and DROP `step2` (verified: the no-reader output collapses step2). The S19/m5 stale-edit-base reseed recovers the full 10-line disk from backup `29a113119f194d6f@v4`, inserted as an `overwrite` revision before F replays. This is the FIRST time that reseed fires because of OFF-BRANCH CLAUDE EDITS (D/E left on disk by the conv rewind), not a user edit.
- **Does NOT use m6's `includeAfter` fallback:** the reseed backup (`@v4`, 16:08:12.997) precedes F's edit (16:08:40.473), so `findBackupAtOrBefore` finds it directly. Do not assert on `includeAfter` for m7.
- **CLI tests depend on the live backup** `29a113119f194d6f@v4` existing in `~/.claude/file-history/725204e2-…/` (the surviving branch needs it), like every m5/m6 CLI test. Confirmed present at planning time; if a surviving verbose ever shows `    return 1\n    return 2`, the backup is missing — re-sync via `/jot:sync-jsonl-projects`, do not "fix" the engine.
- **Worktree hazards:** `src/` already shows m6's uncommitted changes — that IS the m7 baseline; m7 adds none. NEVER `git add -A` and NEVER `git checkout`/`restore` the shared docs (`fixtures.ts`, `roadmap.md`, `implementation-notes-…md`, `reconstruction-engine-design.md`) — they carry uncommitted m2–m6 edits; revert any temp edit by hand.
- **Subagent caveat:** during planning, the JSONL-analysis subagent initially concluded "reader-independent" because F's `originalFile` is in the JSONL — that was WRONG. The engine reseeds from the file-history BACKUP, not from F's `originalFile`. The live `reconstructBranches` probe (with vs without reader) is the authority; §2.6 of the plan records the exact no-reader corruption.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # expect 337 / pass 337 / fail 0  (327 baseline + 10 new)
npx tsc --noEmit      # expect clean
git diff --stat src/  # expect ONLY the uncommitted m6 files; NO new m7 src change
P="scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
# expect: m7_conv.py 3 revisions — 2-line step1, 10-line step1+step2+step3, 14-line step2_alt result
npx tsx src/reconstruction_cli.ts "$P" --branch 8037716c --verbose 2>/dev/null
# expect: m7_conv.py 3 revisions ending at the 10-line step3 version; NO step2_alt
```
Prove each new test bites: temporarily break a byte-lock (e.g. the reseed blob name `@v4`→`@v3`, or the no-reader rev count 2→3) and confirm RED, then restore.
