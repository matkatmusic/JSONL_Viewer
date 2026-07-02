# Handoff: s28 + s40 recoverable engine gaps IMPLEMENTED (green, uncommitted); s41 proven unreproducible
Conversation name: expressive-nibbling-abelson
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/a758186f-1a25-4103-a626-e3664f7308bd.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/expressive-nibbling-abelson.md
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-expressive-nibbling-abelson.md

## Branch
`api-from-scenarios` based on `master`. Nothing committed this session — all work is in the uncommitted working tree (the user makes all commits).

## Goal
Close the two "recoverable engine gaps" the per-step coverage sweep surfaced (plan `expressive-nibbling-abelson.md`): make `OK s28 8/8` and `OK s40 9/9` without regressing the full s1–s72 sweep, the unit suite, `tsc --noEmit`, or the 250-line file cap. s41 was scoped in but turned out to be a transcript-information gap (unreproducible) and was deferred with the user's explicit approval.

## Current State
DONE and verified (nothing committed):
- **s28 → 8/8 GREEN.** Recovers `catalog_view.py`'s renamed-no-preview base by reversing the preview Edit off its after-backup. New: `reverseEditFromAfter` + private `unapplyHunkAgainstAfter` in `src/reconstruction_replay_edit.ts` (with 3 unit tests in `tests/reconstruction_replay_edit.test.ts`); `backupAfterWriteFor` in `src/reconstruction_sidecar.ts`; `reversedEditBaseSeed` wired as the primary stale-base seed in `src/reconstruction_reseed.ts::staleEditSeedFor`, GUARDED (only reverse when an at/before backup also exists and differs from the reversed base — else s25 regresses 9→8).
- **s40 → 9/9 GREEN.** s40 is an s34-twin (out-of-hunk-window trailing `# reviewed by ops` append), NOT the plan's elided-beacon model. Fixed by teaching `outOfWindowEditSeed` (in `reconstruction_reseed.ts`) to seed from the Edit's own `originalFile`. Required adding `originalFile?: string` to `EditEvent` (`src/reconstruction_engine.ts`) and threading it through extraction (`src/reconstruction_extract.ts`: the per-tool_use map now carries `{hunks, originalFile}`). NO change to `completeElidedBeacons`.
- **s41 → DEFERRED (unreproducible).** Left as a known out-of-scope coverage FAIL (8/10), alongside s34/s35/s38/s42/s43/s44.
- **File split:** `src/reconstruction_sidecar_reader.ts` is NEW — the reader-factory trio (`createSidecarReader`/`getDefaultFileHistoryRoot`/`findSessionId`) was moved out of `reconstruction_sidecar.ts` to stay under the 250-line cap; 7 importers were repointed directly (cli + coverage_sidecar + 5 test files).

Verification at handoff time:
- `OK s28 8/8`, `OK s40 9/9`. Full sweep: **65/72** — the 7 FAILs are exactly the known out-of-scope set (s34, s35, s38, s41, s42, s43, s44). Bonus: s42 14→15 and s43 14→16 improved from the originalFile seed.
- Zero scenario regressions. Zero unit-test regressions (diffed current vs clean-HEAD fail-sets; `comm -13` empty).
- `npx tsc --noEmit` clean. Every edited file ≤250 lines (sidecar 249, extract 250).
- The unit suite reports `fail 29`, but ALL 29 fail at clean-HEAD too — pre-existing drift unrelated to this task (the plan's "fail 6" baseline was stale).

## What Remains
1. **Decide whether to commit.** All changes are uncommitted and green. If committing, the suggested message scope is "close s28 + s40 recoverable engine gaps; defer s41 (unreproducible)". Do NOT `git add` anything under `scenarios/` (it is a symlink).
2. **Resolve open question — s41 recording.** s41 is currently a plain coverage FAIL. The user may want it formally marked "expected-unreproducible" somewhere (e.g. `plans/coverage-ledger.md` or a skip-list). If so, ask where and add it. (`plans/coverage-ledger.md` is already modified in the working tree — check what's there first.)
3. **Resolve open question — pre-existing unit failures.** ~29 unit tests fail at clean-HEAD (e.g. `test_evaluateLine_*`, `test_create_revision_has_genesis_lines`, `test_reconstruct_all_*`, `test_partitionLines_*`, the `--trace` flag tests). These are accumulated suite drift from prior WIP, NOT caused by this task. The user may want a separate triage pass — confirm before touching them.
4. (Optional) Clean up scratch files: `/tmp/of_check.cjs`, `/tmp/s23dbg.ts`, and the session scratchpad trace scripts (`trace_s40_s41.ts`, `trace2.ts`) under `/private/tmp/claude-501/.../scratchpad/`.

## Key Files
- `src/reconstruction_reseed.ts` — `reversedEditBaseSeed` (s28), `originalFileSeedFor` + reworked `outOfWindowEditSeed` (s40). The heart of both fixes.
- `src/reconstruction_replay_edit.ts` — `reverseEditFromAfter` / `unapplyHunkAgainstAfter` (s28 reverse-patch primitive).
- `src/reconstruction_sidecar.ts` — `backupAfterWriteFor` (s28). Now 249 lines.
- `src/reconstruction_sidecar_reader.ts` — NEW; the reader-factory trio split out of the sidecar.
- `src/reconstruction_engine.ts` — `EditEvent` now has `originalFile?: string`.
- `src/reconstruction_extract.ts` — `EditDetail` type; per-tool_use map carries `{hunks, originalFile}`; `set` guarded on `result.structuredPatch`.
- `tests/check_scenario_coverage.test.ts` — 3 new `test_checkScenario_reports_every_step_passes_for_{s28,s40,s41}` (s41 intentionally still RED — it documents the unreproducible gap).
- `tests/reconstruction_replay_edit.test.ts` — 3 new `reverseEditFromAfter` unit tests.
- `plans/implementation-notes-expressive-nibbling-abelson.md` — full design rationale, failed approaches, deviations.
- `~/.claude/plans/expressive-nibbling-abelson.md` — the original plan (note: its Phase 2 locus and s41 classification were both wrong; see notes).

## Context the Next Agent Won't Have
- **The plan was wrong in two ways.** (a) Phase 2 told you to fix s40 inside the shared `completeElidedBeacons` stage with re-timing — that's higher risk and unnecessary; s40 is an s34-twin solved in `outOfWindowEditSeed` instead. (b) The plan classified s41 as recoverable; it is NOT — its only Edit's hunk context already contains BOTH `# reviewed by ops` and `# checked`, both backups carry checked, and there is no echoed user-edit, so the 12-line reviewed-only state step-4/5 want is coalesced out of every input. Do not try to recover it; do not strip `# checked` off a backup (that is fabrication, which the plan forbids).
- **FAILED APPROACH — do not retry:** seeding s40 from the strictly-after file-history backup (`backupAfterWriteFor`) over-fires catastrophically (s28 8→7, s25 9→5, s34/s56/s62/s64 worse) because for many edits the first later backup coincidentally extends the base. The Edit's own `originalFile` is the only safe, exact pre-edit source.
- **EXTRACTION GOTCHA (already fixed, don't reintroduce):** wrapping hunks in a truthy `{hunks, originalFile}` object made an Edit result lacking `structuredPatch` (previously dropped) become a hunkless edit → `firstHunkMatchesBase` crashes (`event.hunks[0]` on undefined) on s23. The `detailById.set(...)` is guarded on `result.structuredPatch` being present — keep that guard.
- **s28 reversal needs its guard** (only reverse when an at/before backup also exists AND differs from the reversed base). Removing it regresses s25 from 9/9 to 8/9.
- The unit suite's "fail 6" claim in the plan is stale; the real clean-HEAD baseline is ~40 distinct failing tests. Judge regressions by diffing fail-SETS against clean-HEAD, not by the raw count.
- Useful tool the user pointed out: `npx tsx src/reconstruction_cli.ts <transcript.jsonl> --trace` (see `TRACE_HELP` in `src/reconstruction_cli_trace.ts`) for inspecting JSONL line verdicts.
- Test runner is `node --import tsx --test tests/*.test.ts` (NOT vitest). Filter noise with `grep -viE 'Debugger|inspector|Waiting for'`. A PostToolUse hook runs the suite after every edit and "blocks" on any failure — during TDD red phases that block is expected and harmless.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
# Targets:
npx tsx scripts/check_scenario_coverage.ts s28   # expect OK s28 8/8
npx tsx scripts/check_scenario_coverage.ts s40   # expect OK s40 9/9
# Full sweep (expect 65/72; only s34/s35/s38/s41/s42/s43/s44 FAIL):
npx tsx scripts/check_scenario_coverage.ts 2>&1 | grep -viE 'Debugger|inspector|Waiting for' | grep -E '^FAIL|fully reproduced'
# Types + line caps:
npx tsc --noEmit
wc -l src/reconstruction_sidecar.ts src/reconstruction_extract.ts   # both ≤250
```
