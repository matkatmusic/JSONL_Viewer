# Handoff: Revision Timeline shipped (b3b11fa) — 8 open items queued for next work
Conversation name: Revision timeline default view — implementation
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/b6550a1c-2865-416f-a3d4-96507832f96a.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/reveng-revision-timeline-default-view.md (EXECUTED — done; do not re-implement)

## Branch
`develop` based on `main`. HEAD `b3b11fa` "timeline of revisions v0.1" — the complete timeline
implementation, committed by the user. The working tree still carries 8 modified files from OTHER
sessions (package.json, package-lock.json, src/reconstruction_reseed.ts,
src/structures/vocabulary.ts, webapp/views/conversation.js, webapp/views/projects.js,
tests/viewer-viewmodels.test.ts, tests/vocabulary.test.ts — memoization/progress work). Do not
revert or commit them as part of any item below. Merges always `--no-ff`; never delete files
(RETIRED comment headers only).

## Goal
The Revision Timeline feature is DONE (see Current State). This handoff exists to queue the
user's next 8 work items, each to be tackled in a fresh session — the implementing session's
context was too full to start them.

## Current State
- Timeline shipped and committed (b3b11fa, 17 files, +1452/−21): project-wide chronological
  timeline is the webapp's default view when a JSONL is opened from the drawer
  (`#/project/<n>/timeline/session/<jsonl>`). Engine document now carries message/step
  `sessionId`, `rewoundFilesTouched`, `commitMarkers`; `renderRangePatch` + `GET /api/range-patch`
  export git-apply-able patches; pick rules (contiguous, commit hard-stops, orphan skipping),
  rail SVG, inspector jump, file-state/range-diff previews all live.
- All gates passed at commit time: `npm test` 400/400, `npm run typecheck` clean, scenario
  coverage 85/85, browse smoke gates A–F with zero console errors.
- Full implementation record: `plans/implementation-notes-revision-timeline-default-view.md`
  (untracked, repo root convention).
- No server is currently running on port 7343.

## What Remains
The user's queued items, verbatim intent with located anchors. Each is its own work item —
plan/scope before coding; several are design conversations first:

1. **Scenarios for unhandled JSON fields in real JSONL files** — extend the executed-scenario
   suite so real-session transcripts' unmodeled envelope/tool fields (the ones the viewer
   currently tolerates via the field-gate bypass in `buildProjectDocument`,
   `src/viewer_api.ts:105-108`, and surfaces as `UnmodeledFieldError` elsewhere) get proper
   scenario coverage. Start by grepping real `~/.claude/projects` transcripts for fields the
   parser skips.
2. **Clickable file-history snapshots** — in the file-history view
   (`webapp/views/file-history.js`), each revision should be clickable and navigate to that
   revision of that file (deep-link into the revision's content/diff, not just toggle a pane).
3. **Clickable JSONL lines in the loading console** — the xterm.js console
   (`webapp/app.js` `logProgress`/`ensureProgressTerminal`) prints per-line progress; those
   lines should link to the conversation file/line they describe. May require replacing
   xterm.js with a DOM-based console (xterm renders to canvas — no per-line anchors). User
   explicitly flagged "might require stopping the use of xterm.js".
4. **Core Design Change: one reconstruction Artifact** — architectural conversation: collapse
   the per-view document builds into a single reconstruction artifact shared across views.
   Today every view fetches/caches `ReconstructionDocument` per (project, jsonl) via
   `fetchDocument` (`webapp/app.js:179`) and the server rebuilds per request
   (`src/viewer_server.ts` — the `/api/document` handler notes records are parsed twice).
   Scope with the user before designing.
5. **`terminal_windowSizeBlocks(s)` should use an enum, not `if` chains** — in the JOT PLUGIN
   repo (`/Users/matkatmusicllc/Programming/jot`), the terminal-window-spawning code. Find it
   with `grep -rn "windowSizeBlocks" /Users/matkatmusicllc/Programming/jot`. Not a RevEng change.
6. **`coverage_sidecar.ts:43` — "same @vN blobs have different content"** — investigate the
   comment's claim in `scripts/coverage_sidecar.ts` (line ~43): duplicate `@vN` backup blob
   names carrying different content. Determine whether it's a real sidecar collision (data-loss
   risk for reconstruction) or a stale note; write a failing test if real.
7. **How the Timeline Of Revisions should be displayed** — design conversation with the user
   about v0.1's presentation (density, session grouping visuals, rail layout, what the mockup
   got right/wrong now that it's live on real data). Gather their feedback in the browser first.
8. **Make the web app smoother/more intuitive** — open-ended UX pass over the webapp viewer;
   interview the user for pain points before proposing changes.

## Key Files
- `plans/implementation-notes-revision-timeline-default-view.md` — decisions/deviations record
  for the shipped timeline (read before touching timeline code).
- `webapp/views/timeline.js` — view-model (tested) + render halves of the timeline.
- `webapp/app.js` — router, `fetchDocument` cache, xterm loading console (items 3, 4).
- `webapp/views/file-history.js` — revision rows to make clickable (item 2).
- `src/viewer_api.ts` / `src/viewer_server.ts` — document build + HTTP layer (items 1, 4).
- `scripts/coverage_sidecar.ts` — the @vN blob comment to investigate (item 6).
- `/Users/matkatmusicllc/Programming/jot` — jot plugin repo for item 5 (separate repo, own git).

## Context the Next Agent Won't Have
- TWO viewers exist; the target is the NEW webapp viewer (`webapp/` + `src/viewer_server.ts`,
  `npm run app`, port 7343). `jfred/`, `web-shared/`, `api/`, `diff/`, `unified/`, `viewer/`
  are the frozen legacy island — never build there.
- The declined-consent (degraded) document has FEWER steps than the consented one (s85: 7 vs 10)
  because script-derived revisions are absent — not a bug; the timeline renders what the
  document holds.
- s85's file "moves" produce NO rename revisions: the engine models them as destination
  creations with sources persisting, and 85/85 coverage certifies that as disk truth. Rename
  coverage lives in s2-move-file / s47-mv-rename.
- One s84 step has a re-stamped synthetic changeId — no sessionId attribution possible; it
  renders under a muted "(unattributed)" lane. Synthetic changeIds match no JSONL line — the
  timeline shows "no transcript line for this step" instead of opening the inspector.
- Range patches are whole-file-replacement hunks (valid unified diff, `git apply` proven);
  paths relativized via `computePatchRoot` (common dir prefix ≈ session cwd). LCS emitter
  deliberately skipped — ponytail comment in `reconstruction_render.ts` names the upgrade path.
- `/api/range-patch` honors `allowScripts=1`/`declined=1` exactly like `/api/document`
  (HTTP 200 + `kind: consent-required`, NEVER a non-2xx — browsers must keep a clean console).
- The webapp cannot import `src/structures/vocabulary.ts` (only `webapp/` is served); views use
  wire-string literals and the TS tests assert equivalence against the enum members.
- Environment: the browse daemon dies during idle `sleep`s even within one Bash call — put
  multi-step browser flows inside ONE `$B eval` polling Promise; node output is polluted by the
  VS Code js-debug bootloader (grep `^ℹ` for test summaries); repo path has spaces (always
  quote); `npm run typecheck` (bare `npm typecheck` doesn't exist); port 7343 may be held by a
  user's live viewer — check `lsof -i :7343` and never kill it without asking (smoke-test on
  7345 instead).
- User rules locked: merges `--no-ff`; never `rm` files (comment out with RETIRED header);
  4-space indent in new code even where the repo uses 2; verb-named functions; single condition
  per `if`; strict red-green TDD with `test("test_<snake_case>")` + `// Scenario:` comments.

## How to Verify
- Baseline (must pass before starting anything): `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm test && npm run typecheck` (expect 400/400, clean).
- Engine-shape changes additionally require: `npx tsx scripts/check_scenario_coverage.ts` → 85/85.
- Viewer changes: `npm run app -- --port 7345 --projects-dir <scratch copy of scenario dirs>` +
  browse-tool assertions with a clean console (gates pattern in the implementation-notes file).
