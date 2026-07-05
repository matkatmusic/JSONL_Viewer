# Handoff: Phase 3+5 localhost JFRED viewer implemented and verified (Steps 1–4 green) plus post-ship UI revisions; Step 5 (legacy island deletion) awaits user sign-off
Conversation name: (unnamed session, continuation of harmonic-raccoon handoff chain)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/262dc6ef-03c8-4294-8a6f-2de06465fe65.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/reveng-phase35-localhost-viewer.md (implemented; deviations recorded in plans/implementation-notes-phase35-localhost-viewer.md)

## Branch
`develop` @ 7e8f1b9 in /Users/matkatmusicllc/Desktop/claude code src/RevEng (path has spaces — quote it). All viewer/engine/test/config changes are STAGED, awaiting the user's commit (user rule: every merge `--no-ff`; commit only when asked). The frozen legacy island (api/, web-shared/, jfred/, diff/, unified/, viewer/) remains untracked by design until Step 5. Worktree at /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios still exists; its stash@{0} is a parts bin — never pop it.

## Goal
Phase 3+5 of the five-phase migration: one deliverable — a localhost Node server (`npm run app`, http://127.0.0.1:7343) that scans `.claude/projects`-shaped folders, runs the existing TS engine per JSONL, and serves the greenfield JFRED viewer (webapp/, plain ES modules, no build step). Implemented this session per the plan, then revised per live user requests (light/dark, JSON inspector, title, drawer).

## Current State
- Steps 1–4 COMPLETE and green: `npm test` 368/368 (343 pre-existing + 25 new red-green tests), `npm run typecheck` clean, `npx tsx scripts/check_scenario_coverage.ts` 85/85, browse-tool smoke gates 3.1→3.7 all passed with zero console errors (consent decline AND accept, conversation, file history + jump-to-line, raw-line filters, inspector, vs-base diff), verified against s19/s53/s83 scenario ground truth AND real ~/.claude/projects data.
- New surface: src/reconstruction_exec_gate.ts (consent gate around the two impure stages, default ON, server boots it OFF), src/viewer_api.ts (all logic, tested), src/viewer_server.ts (thin node:http, 127.0.0.1:7343), webapp/ (index.html, app.js hash router, views/{projects,project,conversation,file-history,raw-lines,diff-vs-base}.js, inspector.js, styles.css), tests/{exec-gate,viewer-api,viewer-viewmodels}.test.ts.
- Post-ship revisions (all user-requested, all verified in browse): OS light/dark via prefers-color-scheme CSS variables; title "JFRED - JSONL File Reverse Engineer Debugger"; inspector shows the selected line as pretty-printed JSON with braces (legacy presentation, rebuilt without innerHTML) with Prev/Next line navigation and clickable uuid/toolu jump-links that scroll the main view in step; persistent left drawer on every #/project/* route (JSONL files + Files touched, active item highlighted) — the project landing's old two panes are deleted, the drawer is the nav.
- The viewer server may still be running from this session (`pkill -f viewer_server` to stop; `npm run app` to start).
- plans/implementation-notes-phase35-localhost-viewer.md is the full record: design decisions, deviations, tradeoffs, open questions.

## What Remains (in order)
1. User exercises the viewer and signs off → Step 5: remove the frozen island (api/, web-shared/, jfred/, diff/, unified/, viewer/ — recoverable on develop-baseline commits 8362467 + a5098fa), then re-run all Step 4 gates. NOTE the user's new standing rule (this session): never delete files, comment out with a RETIRED header instead — Step 5's deletion was plan-pre-approved, but reconfirm with the user before removing anything.
2. Commit pass when the user asks (everything viewer-related is staged; user was told; merges always `--no-ff`).
3. Open questions from the implementation notes, if the user wants them pursued: (a) most real ~/.claude/projects transcripts hit UnmodeledFieldError (e.g. `preventContinuation` on system records) — engine coverage growth belongs to the scenario-gap-analysis track, viewer already surfaces the error in-page; (b) every captured scenario carries harness script runs, so the consent dialog appears on first view of essentially every transcript — possible future whitelist of read-only runs; (c) the unified project view rebuilds all JSONLs per request with no cache/cap — the biggest real project has 3,574 JSONLs.
4. Phase 4 (GitHub Pages demo tier) planned separately when reached: canned ReconstructionDocument JSON + webapp/ with a static-data shim replacing /api/*.

## Key Files
- src/viewer_api.ts — scanProjects / buildProjectDocument / decideDocumentResponse / buildDocumentWithConsent / renderRevisionDiff / renderDiffVsBase / resolveProjectFile (trust boundary) / get+setProjectsDir; all tested in tests/viewer-api.test.ts.
- src/viewer_server.ts — routes: GET|POST /api/config, /api/projects, /api/document (consent as HTTP 200 + kind discriminant, NOT 428 — see below), /api/raw, /api/diff, static / and /app/* from webapp/.
- src/reconstruction_exec_gate.ts — process-wide switch; guard line at top of injectScriptExecutions (reconstruction_script_stage.ts) and placeGitCommitEvidence (reconstruction_git_evidence.ts).
- src/reconstruction_sidecar_reader.ts — buildSidecarReader is now THE shared multi-session reader (CLI + coverage checker + viewer); scripts/coverage_sidecar.ts is a commented-out RETIRED stub.
- webapp/views/file-history.js — buildFileHistoryViewModel (steps[].files walk), findLineForChangeId (the changeId→raw-line scan everything jump-related uses), splitDiffBlocks.
- webapp/app.js — router, fetchDocument consent protocol (sessionStorage per project: "1" run / "0" declined→`allowScripts=0&declined=1`), peekCachedDocument (drawer never forces a build), drawer refresh after each view render.
- tests/viewer-viewmodels.test.ts — scenario-ground-truth client tests (s19 .step_states, s53 multi-JSONL); note they JSON-round-trip the document (client reality) and compare file states through stripTrailingNewline.
- plans/implementation-notes-phase35-localhost-viewer.md — read this before touching anything.

## Context the Next Agent Won't Have
- **User rules (standing):** never delete files — comment out with a RETIRED note (rule born this session when coverage_sidecar.ts was rm'd and restored); every merge `--no-ff`; strict red-green TDD per ~/.claude/guides/tdd.md; 4-space indent; `npm run typecheck` (bare `npm typecheck` doesn't exist); per-item plans in ~/.claude/plans/, RevEng/plans/ holds handoffs/notes only; commit only when asked.
- **Plan-vs-reality deviations (all deliberate, all in the notes file):** (1) consent is HTTP 200 + `{kind:"consent-required",scripts}` because browsers console-error every non-2xx fetch and the plan's own gate required a clean console — don't "fix" it back to 428; (2) revision changeIds are NOT record uuids (they're toolu_… ids or `…@vN` blob names) — the plan's "changeId → lineVerdicts uuid" mapping does not exist; jump-to-line/edit-markers/Edits-Only all use findLineForChangeId (raw-line substring scan); (3) steps[].changeIds matched only 1/119 s19 lines (re-stamped uuids) — don't key UI on them; (4) buildSidecarReader was unified to the coverage checker's multi-session version because the CLI's single-session reader ENOENTs on s53-style multi-JSONL projects.
- **Scenario ground-truth quirks:** s19's scenario19.py is 3 revisions (write→overwrite→edit), not the plan's "4+"; .step_states capture dirs (9) ≠ engine steps (5) — anchor on content, not indices; captured files carry a trailing newline the engine strips — compare via stripTrailingNewline; NO covered scenario is script-free (harness ls/pytest probes count as runs).
- **Client conventions:** no innerHTML anywhere (el() builds text nodes/spans — injection-safe against transcript content); no alert() (native dialogs hang headless automation — one hung the browse daemon); exec-gate posture is default-ON for CLI/tests, OFF at server boot, enabled only inside a consented synchronous build (buildDocumentWithConsent always leaves it OFF).
- **tsconfig gained `allowJs: true`** so TS tests import the plain-JS webapp view models; app.js's browser bootstrap is guarded by `typeof window !== "undefined"` so node imports don't crash.
- **Environment quirks:** the gstack browse daemon dies between separate Bash calls AND sometimes mid-call — do goto+asserts in ONE call and prefer short poll loops over long `wait`s; VS Code's js-debug bootloader pollutes node output ("Debugger attached") — grep `^ℹ` summary lines; the staged index tracked my edits automatically this session (a hook re-stages TS files) — verify with `git status --short` before assuming.
- The viewer was smoke-tested against plans/scenarios/executed as a projects dir (each scenario dir = a project) via the UI "Change folder…" affordance — that's the fastest way to demo/verify with known ground truth.

## How to Verify
```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npm test                                     # expect 368 pass, 0 fail
npm run typecheck                            # expect clean
npx tsx scripts/check_scenario_coverage.ts   # expect 85/85 fully reproduced
npm run app                                  # then open http://127.0.0.1:7343
```
