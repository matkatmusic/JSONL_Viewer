# Handoff: Phase 1 merge verified green; Phase 2 (JS retirement) plan written, awaiting approval; Phases 3–5 queued
Conversation name: harmonic-raccoon (phase planning for JS→TS pipeline migration + JFRED viewer)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/85d4dcc1-e358-42af-b7ba-b1116dc4aa53.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/the-api-from-scenario-branch-has-harmonic-raccoon.md (the Phase 2 plan — NOT yet approved)

## Branch
`develop` @ 7e8f1b9 in /Users/matkatmusicllc/Desktop/claude code src/RevEng (path has spaces — quote it). `api-from-scenarios` was merged at feeb5ee (--no-ff). The worktree at /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios still exists; user may still commit there.

## Goal
Five-phase migration, tracked as tasks #1–#5 in the session task list:
1. ✅ Merge api-from-scenarios into develop (done, verified).
2. ⏳ Retire the legacy JS pipeline; TS pipeline (`src/reconstruction_*.ts`, CLI `--json`) becomes the only engine. Plan written, pending approval.
3. Build ONE greenfield JFRED viewer consuming the CLI `--json` ReconstructionDocument (decision made: greenfield, not retrofit; old viewers stay frozen-but-functional until it proves out).
4. GitHub Pages = demo tier only (demoted).
5. Local web app (localhost server wrapping buildReconstructionDocument) = primary deployment target.

## Current State
- All gates green on develop: `npm test` 343/343, `npm run typecheck` clean, `npx tsx scripts/check_scenario_coverage.ts` 85/85.
- Post-merge fixes already applied: `scenarios → plans/scenarios` symlink created at repo root (untracked, git-ignored); stale scenario data quarantined (see below).
- Phase 2 plan is fully drafted in the plan file above (baseline top-up → delete non-viewer legacy JS → gates → rewrite task 3). User has NOT approved it — two ExitPlanMode attempts were rejected (first: conform to ~/.claude/guides/planning.md — done; second: rewrite task 3 first — done; third rejection led to this handoff).
- Task #3's description was rewritten with the full greenfield-viewer seed context (data model, load-path requirement, exit step). Task #2 is in_progress.

## What Remains (in order)
1. Present the Phase 2 plan for approval (ExitPlanMode with the existing plan file — do not rewrite it unless the user asks).
2. Execute Phase 2 per the plan: top-up `develop-baseline` branch via temp worktree, delete non-viewer legacy (tools/*.js, tests/*.js + test-*.html, common/, probes/, plans/*.js, archive/read-scanner-legacy-bodies.js, .copy-seen.txt), keep the frozen viewer island (api/, web-shared/, jfred/, diff/, unified/, viewer/), run all three gates + smoke-test the 3 legacy viewers.
3. Plan Phase 3 (task #3 description contains the complete seed context and open question: which old-viewer features to keep vs drop — ask the user).
4. Plan Phase 5 (task #5: localhost app, security gate for script execution is non-negotiable v1), then Phase 4 (Pages demo tier).

## Key Files
- ~/.claude/plans/the-api-from-scenario-branch-has-harmonic-raccoon.md — the pending Phase 2 plan (exact commands + gates).
- src/reconstruction_json.ts — ReconstructionDocument types/builders (the interface everything downstream consumes).
- src/reconstruction_cli.ts — `--json` / `--allRecords` / `--file` flags.
- scripts/check_scenario_coverage.ts — the 85/85 regression gate.
- plans/scenarios/.stale-copy-20260702/ — quarantined stale data (37 items; delete only with user approval).
- Session task list (TaskList tool): tasks #1–#5 with dependency chain 2→3→5→4.

## Context the Next Agent Won't Have
- **User rules:** ALWAYS `git merge --no-ff` (never fast-forward, saved to memory). Plans must conform to ~/.claude/guides/planning.md — executable How + order, minimal Why; the user rejected a rationale-heavy draft over this. `npm run typecheck` (bare `npm typecheck` doesn't exist).
- **The 08:10:28 incident:** on Jul 2 at 08:10:28 an unidentified bulk copy (plain cp-style; identical mtimes; NOT shutil.copy2) restored stale data into plans/scenarios/executed/ — resurrected the renamed-away m1–m7 dirs and added 23 stale duplicate transcripts, breaking 16 scenarios + 21 unit tests. Quarantined to plans/scenarios/.stale-copy-20260702/. Source of the copy is UNKNOWN — if scenario tests break again with identical-mtime files, suspect a recurrence.
- **plans/scenarios/ is untracked live data** — the test suite's ground truth lives outside git. Data drift breaks tests that hardcode expectations (S13 fork uuid etc.). The coverage script resolves scenarios via `new URL("../scenarios/executed/", import.meta.url)` → repo-root symlink.
- **All 254 legacy JS files are untracked on develop.** TS imports none of them (verified). `npm test` glob only runs `tests/*.test.ts` — the 102 legacy JS tests never run. `develop-baseline` branch tracks the legacy JS but INCOMPLETELY (47 api/ files tracked vs 67 on disk) — hence the top-up step in the Phase 2 plan.
- **Greenfield-viewer rationale (gap map):** steps[].files carries full whole-repo snapshots per step (strictly richer than old expectedState); per-step diffs = client-side diff of consecutive snapshots (replaces oldString/newString edit objects); lineVerdicts replaces analyzeJSONL().rewinds; the old divergence-hunting UI is obsolete (the engine resolves what the JS could only flag). Retrofit was rejected because an adapter faking the old state shape across 3 overlapping viewers costs more than one new page.
- **Script-execution constraint (Phases 4/5):** reconstruction execSyncs python3/bash/node/npx tsx (src/reconstruction_script_execution.ts) and shells to git (src/reconstruction_git_evidence.ts) — impossible on static hosting, dangerous on foreign transcripts. Local app must gate these stages behind explicit opt-in, default OFF.
- The worktree's stash@{0} is a parts bin — never pop it. s85 coverage depends on a /private/var temp dir that may vanish (known flagged durability item, currently green).

## How to Verify
```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npm test                                     # expect 343 pass, 0 fail
npm run typecheck                            # expect clean
npx tsx scripts/check_scenario_coverage.ts   # expect 85/85 fully reproduced
```
