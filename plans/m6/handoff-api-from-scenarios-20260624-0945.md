# Handoff: m6 (`m6-cp-user-edit-rewind`) IMPLEMENTED — the FIRST real engine fix since S19/S23 (rewound branch was duplicating `return self.name`). 2 src files (+21/−2), 12 new tests, 327 green, tsc clean. NOTHING COMMITTED (commit gated on user approval). Next scenario in the roadmap: m7.
Conversation name: api-from-scenarios — m6 impl monitor → implement m6 (cp-user-edit-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/17cd387d-e9df-47e6-88a1-98adee8edcdd.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m6/m6-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling`. Working tree carries uncommitted m2–m5 work plus this m6 work — do NOT revert it.

## Goal
Make `reconstruction_cli` reconstruct the REWOUND branch of `m6_derived.py` correctly. m6 = a `cp`-fork of `m6_source.py` → `m6_derived.py` (m1 pattern), a USER out-of-band edit inserting `# derived version` into the copy, Claude adds `transform()`, a `Rewind: 2, code` discards it, Claude adds `validate()`. The surviving branch was already correct; the rewound branch was WRONG — the `transform()` Edit spliced onto the bare 6-line copy and DUPLICATED `return self.name` (and dropped `# derived version`). After the fix the rewound branch is the 10-line transform v2 with no duplicate.

## Current State
**COMPLETE and verified. Nothing committed.**
- `npm test` = **327 pass / 0 fail** (315 baseline + 12 new: 2 sidecar + 5 engine + 5 CLI).
- `npx tsc --noEmit` = clean.
- `git diff --stat src/` = exactly `reconstruction_sidecar.ts` (+21) + `reconstruction_branches.ts` (net-zero, 1 call edited); branches.ts stays at the 250-line cap, sidecar.ts at 198.
- Live CLI verified: rewound `m6_derived.py` = 3 revisions `[copy(6), overwrite(7 w/ # derived version), edit(10 transform)]`, byte-identical to plan §2.6, NO duplicate.
- The new tests BITE: reverting §4.2's `true` turned the 4 rewound/duplicate-guard tests RED (the 3 surviving/DAG tests stayed green); restored and re-confirmed 327.

### The fix (already applied)
- `src/reconstruction_sidecar.ts`: added `findBackupPointAfter` (BackupPoint variant of `findBackupAfter`) right after `findBackupAtOrBefore`; added an `includeAfter: boolean = false` param to `backupSeedWriteFor` that falls back to the nearest strictly-later backup ONLY when no at-or-before backup exists (`atOrBefore ?? (includeAfter ? findBackupPointAfter(...) : undefined)`).
- `src/reconstruction_branches.ts:101`: `staleEditSeedFor` passes `true` for `includeAfter` (the ONLY caller that opts in; `seedEditBaseFromBackup` keeps the `false` default so spec-39 first-event-edit semantics are untouched).

### Files changed (the exact m6 set for Task 8 staging)
- src: `src/reconstruction_sidecar.ts`, `src/reconstruction_branches.ts`
- tests: `tests/fixtures.ts` (added `M6_JSONL`), `tests/reconstruction_sidecar.test.ts` (+2 tests), `tests/reconstruction_engine_m6.test.ts` (new), `tests/reconstruction_cli_m6.test.ts` (new)
- docs: `plans/roadmap.md` (M6 flipped to `[x]`), `plans/implementation-notes-api-from-scenarios.md` (m6 entry prepended), `plans/reconstruction-engine-design.md` (m6 note after the m5 note)
- plan dir: `plans/m6/`

## What Remains
1. **Commit (USER APPROVAL ONLY).** Stage EXACTLY the files listed above — never `git add -A` (m2–m5 are separate outstanding commit decisions). Suggested message: `Implemented m6 handling`. End the commit message with the standard Co-Authored-By / Claude-Session trailers.
2. After committing (or if the user declines), proceed to **m7** (next unchecked roadmap line). A separate planning monitor/agent owns m7 planning; this session does not.

## Key Files
- `plans/m6/m6-reconstruction-plan.md` — authoritative plan (§2 ground truth incl. all changeIds, §3 root cause, §4 exact fix, §5 tasks, §6 acceptance).
- `plans/m6/handoff-api-from-scenarios-20260624-0930.md` — the planning handoff that gated this impl.
- `src/reconstruction_sidecar.ts` — the fix lives here (`findBackupPointAfter` + `backupSeedWriteFor(includeAfter)`).
- `src/reconstruction_branches.ts:101` — `staleEditSeedFor` passes `true` (net-zero; file at 250 cap — add NO lines here).
- `tests/reconstruction_engine_m6.test.ts` / `tests/reconstruction_cli_m6.test.ts` — the m6 locks (reader load-bearing + duplicate byte-lock).
- Executed transcript: `scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl`.

## Context the Next Agent Won't Have
- **Why the bug existed (the 22 ms crux):** the only pre-edit backup (`b90d0fcb711472b4@v1`, 16:07:55.546) is 22 ms AFTER the transform Edit's tool-use time (16:07:55.524) because the user edit and the edit consuming it share one turn. `findBackupAtOrBefore` (≤ when) missed it, so the S19/S23 reseed correctly DETECTED the stale base but recovered nothing. The fix is purely "also look just after, on the stale-edit path only."
- **Do NOT make the after-fallback unconditional.** A blanket fallback in `backupSeedWriteFor` turns `test_seed_passes_through_when_no_backup_precedes_the_edit` RED (spec-39 first-event-edit MUST NOT seed from a later backup). The `includeAfter` flag is what keeps both call sites correct — this was confirmed live.
- **The rewound endpoint is reader-DEPENDENT** (unlike m5, whose endpoint was reader-independent): without a `BackupReader` the duplicate persists. `test_m6_rewound_requires_reader_else_duplicate_persists` locks both directions.
- **`historyEndingWith` suffixes lead with a slash** (`/m6_source.py`) so `m6_source.py` does not also match `test_m6_source.py`.
- **`branches.ts` is at the 250-line cap** — a PostToolUse hook blocks any save over it. The change there is intentionally a one-call net-zero edit; all explanatory comments live in `sidecar.ts`.
- **Worktree-git-checkout hazard:** the four shared docs (`tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`) carry uncommitted m2–m5 edits. Do NOT `git checkout`/`restore` them; revert by hand if ever needed.
- **Monitor false-fire lesson (carry forward):** name the next scenario (m7) ONLY in a handoff TITLE line, never in loose body prose, or the downstream m7 planning monitor false-fires.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # expect: tests 327 / pass 327 / fail 0
npx tsc --noEmit      # expect: clean
git diff --stat src/  # expect: reconstruction_sidecar.ts + reconstruction_branches.ts ONLY (+21/-2)
P="scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --branch 9b69e66c --verbose 2>/dev/null
# expect: m6_derived.py 3 revisions; rev1 = 7-line # derived version seed; rev2 = 10-line transform v2; NO duplicated return self.name
```
