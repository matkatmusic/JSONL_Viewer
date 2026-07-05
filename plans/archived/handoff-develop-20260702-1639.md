# Handoff: Phase 2 (JS retirement) executed and green; merged Phase 3+5 plan drafted and refined with user, awaiting approval to implement
Conversation name: (unnamed session, continuation of harmonic-raccoon)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/d17a4921-8952-4e4b-b588-5d31e615a1aa.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/reveng-phase35-localhost-viewer.md (the merged Phase 3+5 plan — drafted this session, user has been refining it live, NOT yet explicitly approved for implementation)

## Branch
`develop` @ 7e8f1b9 in /Users/matkatmusicllc/Desktop/claude code src/RevEng (path has spaces — quote it). Only tracked change: `.gitignore` +1 line (uncommitted). All legacy/viewer files remain untracked by design. `develop-baseline` branch got two top-up commits this session: 8362467 (full on-disk legacy JS, 218 files) and a5098fa (viewer script-tag fix). Worktree at /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios still exists; its stash@{0} is a parts bin — never pop it.

## Goal
Five-phase migration, now four: Phase 1 (merge) done previously; Phase 2 (retire legacy JS pipeline) EXECUTED AND VERIFIED this session; Phases 3 and 5 MERGED by user decision into one deliverable (localhost app whose UI is the greenfield JFRED viewer); Phase 4 (GitHub Pages demo tier) last, planned separately when reached.

## Current State
- Phase 2 complete: non-viewer legacy deleted (common/, probes/, tools/*.js, tests/*.js + test-*.html, archive/read-scanner-legacy-bodies.js, .copy-seen.txt; plans/*.js never existed). Frozen viewer island kept (api/, web-shared/, jfred/, diff/, unified/, viewer/).
- All gates green post-deletion: `npm test` 343/343, `npm run typecheck` clean, `npx tsx scripts/check_scenario_coverage.ts` 85/85.
- All three legacy viewers smoke-tested in a headless browser with s19 — render with zero console errors, AFTER a 3-line fix (see Context below).
- Merged Phase 3+5 plan fully drafted at the plan file above, conforming to ~/.claude/guides/planning.md + tdd.md. User refined it live five times (see Context). Implementation notes: plans/implementation-notes-phase2-js-retirement.md (Phase 2 record + all Phase 3+5 scope decisions).
- Session task list: tasks #1–#4 all completed (Phase 2 steps + plan drafting).

## What Remains (in order)
1. Get explicit user approval of /Users/matkatmusicllc/.claude/plans/reveng-phase35-localhost-viewer.md, then implement it step by step (it is self-contained): Step 1 exec-consent gate (src/reconstruction_exec_gate.ts + 3 tests, gate checks at top of injectScriptExecutions and placeGitCommitEvidence), Step 2 server (src/viewer_api.ts logic + src/viewer_server.ts thin HTTP on 127.0.0.1:7343, npm script "app"), Step 3 client (webapp/, plain ES modules, view-model functions tested against scenario ground truth), Step 4 full gates, Step 5 island deletion only after user signs off on the working viewer.
2. If implementing under /jot:implement conventions: maintain plans/implementation-notes-<convo>.md as work proceeds (the Phase 2 one shows the expected shape).
3. Commit the uncommitted .gitignore change when the user next asks for a commit pass (user was staging TS files for commit in a prior session — ask before bundling).

## Key Files
- /Users/matkatmusicllc/.claude/plans/reveng-phase35-localhost-viewer.md — THE plan; read fully before any code.
- plans/implementation-notes-phase2-js-retirement.md — locked feature scope + deviations + open questions.
- src/reconstruction_json.ts — ReconstructionDocument (messages/branches/filesTouched/steps/lineVerdicts); buildReconstructionDocument(records, branched, reader, target).
- src/reconstruction_cli.ts:156 — buildSidecarReader (plan Step 2.1 lifts it for reuse).
- src/reconstruction_script_execution.ts:150 — findScriptExecutionRuns → ScriptRun { code, timestamp, cwd? } (pure detection; consent dialog shows .code).
- src/reconstruction_branches.ts:56,59 — the ONLY call sites of the two impure stages (injectScriptExecutions, placeGitCommitEvidence).
- src/reconstruction_render.ts:132 — renderDiff (reuse; do not write a new differ).
- scripts/check_scenario_coverage.ts:142 — the multi-JSONL pattern: jsonlPaths.flatMap(loadTranscript).

## Context the Next Agent Won't Have
- **User rules:** ALWAYS `git merge --no-ff`. Plans conform to ~/.claude/guides/planning.md (executable How + order, minimal Why — a rationale-heavy draft was rejected in the prior session). Strict red-green TDD per ~/.claude/guides/tdd.md. `npm run typecheck` (bare `npm typecheck` doesn't exist). Per-item plans go in ~/.claude/plans/, not RevEng/plans/ (that dir holds handoffs/notes/roadmap).
- **The legacy viewers were broken before Phase 2 touched anything**: all three failed on load with `scanReadEvents is not a function` because no viewer HTML ever loaded api/read-event-scanner.js (created during the June Engine-B refactor, never wired in). Fixed with one script tag per viewer, committed to develop-baseline as a5098fa. The handoff-inherited claim "frozen-but-functional" was false; user has NOT explicitly reacted to this discovery — it's flagged as an open question in the implementation notes.
- **User's live plan refinements this session (all already folded into the plan file):** (1) Phases 3+5 merged — viewer IS the localhost app UI; (2) keep BOTH whole-file version export and .patch export; (3) raw-lines view and Diff-vs-Base view are each behind a button, not permanent panes; (4) script-execution consent: show each script's code, execute only on explicit confirm, per-browser-session memory only, default OFF, declining still yields a degraded document; (5) scenarios are the client-test fixtures — view-model functions (DOM-free) tested against .step_states file states and JSONL conversational turns (s19 simple, s53 multi-JSONL canonical); (6) runtime-switchable projects folder (POST /api/config) with loose-JSONL folders treated as a synthetic "(root)" project.
- **No new engine work for multi-JSONL** — user corrected an earlier wrong assumption: s53–s62 prove the engine consumes concatenated multi-JSONL record sets (coverage script line 142). Cross-project unification is server glue only.
- **Exec-gate default is ON deliberately** (CLI/tests/coverage depend on script execution — 85/85 would break otherwise); the server boots it OFF. Don't "fix" the default.
- **The 08:10:28 incident (Jul 2):** an unidentified bulk copy once restored stale data into plans/scenarios/executed/ (identical mtimes, plain cp-style). Quarantined in plans/scenarios/.stale-copy-20260702/ (delete only with user approval). If scenario tests break with identical-mtime files, suspect recurrence. plans/scenarios/ is untracked live test ground-truth; coverage resolves it via the repo-root `scenarios` symlink.
- **Environment quirks:** VS Code's js-debug bootloader in NODE_OPTIONS pollutes all node output with "Debugger attached" noise — grep for `^ℹ` summary lines instead of tailing. `npx serve`'s clean-URL redirect (x.html → x) silently DROPS query strings — use extensionless URLs when passing ?file= params to the legacy viewers. The gstack browse tool's daemon dies between separate Bash calls — do goto+assert in ONE call; its `upload` command is broken (SAFE_DIRECTORIES error) — use the viewers' ?file= load path.
- s85 coverage depends on a /private/var temp dir that may vanish (known flagged durability item, currently green).

## How to Verify
```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npm test                                     # expect 343 pass, 0 fail
npm run typecheck                            # expect clean
npx tsx scripts/check_scenario_coverage.ts   # expect 85/85 fully reproduced
```
