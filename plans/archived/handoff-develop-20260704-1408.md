# Handoff: Revision Timeline mockup approved + implementation plan drafted — ready to implement
Conversation name: Revision timeline mockup and JFRED default-view plan
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/1bcfca8c-f402-4ea9-ace8-31c0b6c1952d.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/reveng-revision-timeline-default-view.md

## Branch
`develop` based on `main` (HEAD 0490b5f). Note: the working tree carries modified files from OTHER
sessions (package.json, src/reconstruction_reseed.ts, src/structures/vocabulary.ts, webapp/views/
conversation.js, webapp/views/projects.js, tests/viewer-viewmodels.test.ts, tests/vocabulary.test.ts
— memoization/progress work). Do not revert or commit them as part of this task.

## Goal
Make a project-wide "Revision Timeline" the default view when a session JSONL is opened in the
webapp JFRED viewer (`webapp/` + `src/viewer_server.ts`, port 7343, `npm run app`). One node per
reconstruction step (`StepSnapshot`), git-graph rail, contiguous pick-ranges exportable as a
git-apply-able `.patch`, git commits as pick hard-stops, per-step file-state / JSON / range-diff
inspection. The approved visual spec is `revision-timeline-mockup.html` at the repo root.

## Current State
- Mockup DONE and user-approved through 6 feedback rounds: `revision-timeline-mockup.html`
  (untracked, repo root). Static data; live JS only for the graph rail (drawn from row geometry),
  inspector tabs, file-row preview swap, and pick-contiguity enforcement (commit-bounded segments).
  Honors OS light/dark via `prefers-color-scheme`. Selected step = full rectangle outline.
- Implementation plan DONE: `~/.claude/plans/reveng-revision-timeline-default-view.md` —
  phases 0–5, red-green per item, conforms to `~/.claude/guides/planning.md` + `plans/coding-requirements.md`.
- Zero implementation code written. No tests written. Nothing committed this session.

## What Remains
Execute the plan file phase by phase (it is self-contained; each item names files, line anchors,
test names, and assertions):
1. Phase 0 — fixtures for s84/s85 in `tests/fixtures.ts` + helpers in `tests/utilities.ts`.
2. Phase 1 — document extensions in `src/reconstruction_json.ts`: 1.1 `ConversationMessage.sessionId`,
   1.2 `StepSnapshot.sessionId` (changeId→sessionId index), 1.3 expose `rewoundFilesTouched`,
   1.4 `commitMarkers` via pure `findGitCommitEvents` (src/reconstruction_git_evidence.ts:31).
3. Phase 2 — `renderRangePatch` in `src/viewer_api.ts` (acceptance = real `git apply` round-trip
   test) + `GET /api/range-patch` in `src/viewer_server.ts`.
4. Phase 3 — pure view-models in new `webapp/views/timeline.js`, tests in
   `tests/timeline-viewmodels.test.ts` (buildTimelineViewModel, computePickSegments,
   checkPickIsLegal, computeRangeSummary, splitPatchByFile).
5. Phase 4 — renderTimelineView DOM + rail SVG; inspector wiring via
   `openTranscriptInspector` (webapp/inspector.js:100) + `findLineForChangeId`
   (webapp/views/file-history.js:55); routes in `webapp/app.js` renderRoute (:214-259); the default
   switch = drawer JSONL link in `webapp/views/project.js:48` → timeline session-anchor route.
6. Phase 5 — gates: `npm test`, `npm run typecheck`, `npx tsx scripts/check_scenario_coverage.ts`
   (85/85), browse-tool smoke gates A–F against a scratch projects dir containing copies of the
   s84/s85 executed scenario dirs.

## Key Files
- `~/.claude/plans/reveng-revision-timeline-default-view.md` — THE plan; read it in full first.
- `revision-timeline-mockup.html` — approved visual spec (repo root, untracked; keep it).
- `src/reconstruction_json.ts` — ReconstructionDocument (:169), StepSnapshot (:90),
  buildStepSnapshots (:123), indexChangeIdsToPaths (:113); Phase 1 edits land here.
- `src/viewer_api.ts` — buildProjectDocument (:104), buildDocumentWithConsent (:134),
  renderDiffVsBase (:177); Phase 2 lands here.
- `src/viewer_server.ts` — resolveJsonlPaths (:73), /api/diff route to mirror for /api/range-patch.
- `webapp/app.js` — route table renderRoute (:214-259), fetchDocument cache keyed
  `${project}|${jsonl ?? "*"}` (:133), fetchRawRecords (:101).
- `webapp/views/file-history.js` — existing per-file revision view; lift `downloadText` (:76) into
  a shared `webapp/views/download.js`.
- `scenarios/executed/s84-multiagent-scripts-git-baseline/` (3 JSONLs, multi-agent) and
  `scenarios/executed/s85-git-commit-csv-and-move-scripts/` (1 JSONL, real git commit) — the two
  mandated test scenarios.

## Context the Next Agent Won't Have
- TWO viewers exist; the target is the NEW webapp viewer. `jfred/`, `web-shared/`, `api/` are the
  frozen legacy island awaiting retirement — do not build there, do not delete anything (RETIRED
  comment headers only, per standing user rule).
- Git commits are INVISIBLE in today's document: `placeGitCommitEvidence` is consent-gated and
  only splices synthetic `user-edit` revisions with RANDOM changeIds (no commit hash/message
  reaches the JSON; those changeIds match no JSONL line — never use them for jump-to-line).
  Commit markers must come from the pure detector `findGitCommitEvents`, without touching the
  exec gate (server boots it OFF deliberately).
- Records carry `sessionId?: Uuid` (src/structures/envelope.ts:20) but ConversationMessage and
  StepSnapshot drop it — that's why Phase 1 exists. `document.sessionId` is the FIRST session only
  (lossy for merged projects).
- `FileRevision` has NO `content` field (lines model: `lines: LineEntry[]`); displayable content
  comes from `document.steps[].files` snapshots — the timeline reads file states there, exactly
  like `computeContentAtTime` in file-history.js.
- A step's `changedPaths` is a HINT (off-branch/re-stamped steps resolve to `[]`);
  `changeIds` is the reliable pointer (json.ts:133 ponytail comment).
- User rules locked in this session: picks must be contiguous; commit nodes are hard stops AND are
  themselves unpickable; range file-click defaults to diff(before-first-picked → at-last-picked);
  selected step = full rectangle outline, not a left bar; OS light/dark must be honored.
- OPEN QUESTION posed to the user, unanswered: nodes are planned strictly-chronological with
  session headers at each sessionId change (s84 sessions interleave in time); if the user wants
  hard per-session grouping instead, adjust plan Phase 3.1 before implementing.
- Consent contract: /api/document (and the new /api/range-patch) return HTTP 200 +
  `{kind:"consent-required"}` — do NOT "fix" to 428 (browsers console-error non-2xx; smoke gates
  require a clean console).
- Environment: browse daemon dies between Bash calls (goto+assert in ONE call); node output is
  polluted by VS Code js-debug bootloader (grep `^ℹ`); repo path has spaces (always quote);
  `npm run typecheck` (bare `npm typecheck` doesn't exist); requirements memory file:
  `~/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/memory/jfred-revision-timeline-requirements.md`.

## How to Verify
- Baseline before starting (must already pass): `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm test && npm run typecheck`
- Per phase: the plan's named test file via `node --import tsx --test tests/<file>.test.ts`.
- Final: plan Phase 5 gates 1–5 (tests, typecheck, 85/85 coverage, browse smoke gates A–F, clean console).
