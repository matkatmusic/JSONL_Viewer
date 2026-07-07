# Handoff: Timeline drawer UX shipped (41a9152) + handoffs archived — pick next work from TASKS.md, start with #15
Conversation name: witty-lampson (timeline 3-column drawer layout + follow-ups)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/9d892588-85eb-41ae-8a98-5badf96364d3.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/i-m-viewing-http-127-0-0-1-7343-project-witty-lampson.md (executed; kept for the 12-step manual verification list)

## Branch
`develop` based on `main`. HEAD `12d5088` "updated TASKS.md".
Repo root: `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (path has spaces — always quote).

## Goal
This session shipped the Timeline drawer UX (commit `41a9152`): collapsible left Files/JSONL
drawer, the JSONL inspector as a slide-in overlay drawer on the timeline route, and a set of
inspector usability follow-ups. It also archived all 95 handoff docs into `plans/archived/`
(commit `10a0a0f`) and marked TASKS.md #2 done (`12d5088`). Next session: new work from TASKS.md.

## Current State
- All of this session's work is COMMITTED (`41a9152`, `10a0a0f`, `12d5088`). Nothing of ours is
  staged or unstaged.
- Shipped in `41a9152` (all webapp/ = static files, browser refresh picks them up, no server
  restart): timeline-route-gated inspector overlay (leaves drawer + 260px timeline strip
  visible; collapses to a 24px rail with « reopen); left drawer collapses to a 24px rail, its
  chevron absolutely positioned on the column's right edge, vertically centered, tracking the
  collapse via `--drawer-width` on `.layout`; empty-timeline-background click closes the
  inspector; session-header links open the transcript in the inspector (line 0) instead of
  navigating (href kept for middle-click); inspector JSON word-wraps; string values > 560 chars
  clamp to 7 lines (CSS `line-clamp`) behind a […]/[hide] toggle; inspector ✕ → » chevron,
  left-edge, vertically centered via flex row `[chevron][.inspector-content scroll column]`;
  new `tests/route-predicates.test.ts` (red-green) for exported `checkRouteIsTimeline`.
- Working tree still carries the same 7 modified files from OTHER sessions (package.json,
  package-lock.json, src/reconstruction_reseed.ts, src/structures/vocabulary.ts,
  tests/vocabulary.test.ts, webapp/views/conversation.js, webapp/views/projects.js). Do not
  revert, fix, or stage them. Untracked legacy dirs (api/, jfred/, diff/, unified/, viewer/,
  web-shared/, docs/, archive/) are the frozen legacy island — never build there.
- Typecheck clean; route-predicates 2/2; timeline-viewmodels 11/11 at last run. Full `npm test`
  is the user's to run (420/420 at last known green).

## What Remains
Pick from `TASKS.md` (repo root — read it first; 3 done, 14 open). Suggested order:
1. Task #15 — s85 git-repo durability: `readCommittedFileContent`
   (`src/reconstruction_git_evidence.ts:86`) resolves s85's repo via the RECORDED temp cwd and
   silently returns `undefined` when it is gone (silent `catch` at `:99`); temp cleanup
   regresses s85 steps 4–10. Add a fallback to the preserved repo at
   `scenarios/executed/s85-git-commit-csv-and-move-scripts/.git`. The only confirmed latent
   bug; strict red-green TDD.
2. Decision tasks #16 (Phase B `kept[]` — finish or retire + fix the stale header in
   `src/reconstruction_parse_lines.ts`) and #14 (ReconstructionCorpus still worth building?) —
   conversations with the user first, not code.
3. Feature queue #4–#10 and approval-gated #11–#13, #17 — each needs user direction/approval.
4. Optional timeline-UX polish flagged but not requested: the inspector rail's « is a CSS
   pseudo-element (not keyboard-focusable), and ending a text-selection drag over empty
   timeline background closes the inspector. Only touch if the user asks.

## Key Files
- `TASKS.md` (repo root) — THE backlog; item provenance now points into `plans/archived/`.
- `plans/implementation-notes-witty-lampson.md` — this session's decisions/deviations log.
- `webapp/views/timeline.js` — timeline render + inspector wiring + empty-click close.
- `webapp/inspector.js` — inspector flex layout, long-value clamp, » collapse.
- `webapp/app.js` — `checkRouteIsTimeline`, `timeline-route` class toggle, rail-reopen
  listener (`handleInspectorRailClick`), per-route inspector clearing.
- `webapp/styles.css` — drawer/overlay/rail rules, `--drawer-width`, `.json-collapsed`.
- `src/reconstruction_git_evidence.ts:86` — task #15's target.

## Context the Next Agent Won't Have
- ALL 95 handoff docs live in `plans/archived/` (renamed from my initial `plans/archive/` to
  match TASKS.md's references; the roadmap moved there too). Any doc citing
  `plans/handoff-*.md` paths means `plans/archived/handoff-*.md` now.
- The overlay-inspector CSS is gated by `.layout.timeline-route`; the conversation and
  raw-lines routes still use the pane in flex flow with plain `display:none` hiding. If you
  touch inspector show/hide, know that on the timeline route `.hidden` does NOT mean
  display:none — it means "slid out to the 24px rail" (or fully off-screen when `:empty`).
- `renderRoute` clears `#inspector` content on every route change ON PURPOSE: the CSS `:empty`
  rule is what suppresses the reopen rail before anything was selected.
- The rail-reopen listener ignores clicks whose target isn't the pane itself — the » collapse
  button's click bubbles to the pane AFTER adding `.hidden` and would otherwise instantly
  reopen it (bug found and fixed this session). Don't "simplify" that guard away.
- The empty-click close handler is `container.onclick` (property assignment, not
  addEventListener) so `renderRoute` can clear it with `view.onclick = null`. Keep that pairing.
- The left drawer's collapse state is the `collapsed` class on the persistent `#drawer`
  element — it must NOT live in the drawer's children because `renderProjectDrawer` rebuilds
  them twice per route render.
- User workflow rules (standing): he runs the 7343 server (`lsof -i :7343`, never kill it;
  smoke on 7345) and runs `npm test` himself — you run typecheck + targeted tsx tests only;
  stage ONLY files you touched (never `-A`), he commits; merges `--no-ff`; never delete files
  (RETIRED headers); strict red-green TDD `test("test_<snake_case>")` with `// Scenario:`
  step comments; 4-space indent everywhere; verb-named functions; one condition per `if`;
  compare exported constants, never string literals.
- Environment: prefix `NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS=` on all node/npm commands;
  `npm run typecheck` (bare `npm typecheck` doesn't exist); grep node test output for `^ℹ`;
  webapp changes need only a browser refresh — only `src/` server-side changes need a server
  restart (server also memoizes built documents in memory, so engine-output changes need that
  restart to show).

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npm run typecheck   # expect clean
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npx tsx --test tests/route-predicates.test.ts   # 2/2
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npx tsx scripts/check_scenario_coverage.ts      # 85/85
# full test suite is the user's to run (420/420 at last green)
```
