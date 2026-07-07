# Handoff: Implement TASKS.md items 5 + 6 — clickable file-history revision snapshots & clickable console JSONL lines
Conversation name: Plan TASKS.md items 5+6 (imperative-bear)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/1cee6cdd-6f09-48a6-b5eb-40c79823b9a4.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/i-want-to-plan-imperative-bear.md

## Branch
`develop` (project mainline; HEAD `12d5088` at handoff time)

## Goal
Make two dead UI surfaces clickable in the RevEng viewer webapp: (1) file-history revision snapshots get shareable deep-link routes (`/rev/<n>` auto-expand, `/vsbase/<n>` preselect) instead of a URL-less pane toggle; (2) the loading console's `[<file>.jsonl:<line>]` progress tokens become xterm links that open the Timeline view scrolled to the owning step with the JSON inspector on that raw line. Client-only — the server and wire format already support everything.

## Current State
- Planning is COMPLETE and code-verified; **no implementation has started**. The full step-by-step plan (7 ordered steps, red-green TDD pairs for 4 new pure helpers, exact code snippets, edge cases, verification) is in the plan file above. Execute it as written.
- Every load-bearing claim in the plan was verified against the working tree at HEAD `12d5088`: `registerLinkProvider`/`ILink` present in vendored xterm 6.0.0 (`webapp/vendor/xterm.js`, typings 1-based coords, inclusive end cell); progress labels carry 1-based transcript line numbers (`src/reconstruction_parse_lines.ts:156`, `src/reconstruction_script_execution.ts:44-46`); server `rev` param exists (`src/viewer_server.ts:167`); `.anchored` CSS at `webapp/styles.css:203`; `openTranscriptInspector` un-hides its pane itself (`webapp/inspector.js:153`).
- `npm test` state was NOT run this session — run it before starting to establish the baseline.

## What Remains
Execute the plan file's steps in order (details, snippets, and test names are all in the plan — do not redesign):
1. `git pull` on `develop`; re-confirm the plan's line anchors (`webapp/app.js` dispatch ~322/327-330, `timeline.js` anchor block ~636-643); run `npm test` for a green baseline.
2. Step 1 (RED→GREEN): `computeAnchoredRevisionIndex` in `webapp/views/file-history.js`, tests in `tests/viewer-viewmodels.test.ts`.
3. Step 2 (RED→GREEN): `matchJsonlSourceLink` in `webapp/app.js`, tests in `tests/viewer-progress.test.ts`.
4. Step 3 (RED→GREEN): `routeToTimeline` gains a third `anchorLine` param (`webapp/app.js:262-265`), tests co-located with existing route-helper tests.
5. Step 4 (RED→GREEN): `findTimelineNodeIndexForRawLine` in `webapp/views/timeline.js` view-model half, tests in `tests/timeline-viewmodels.test.ts`.
6. Step 5: route dispatch wiring in `webapp/app.js` `renderRoute` (timeline `/at/` passthrough; file `/rev/<n>` and `/vsbase/<n>` params).
7. Step 6: Task 5 view wiring — `renderFileHistoryView` anchor param + toggle-with-`history.replaceState` onclick + anchored-row expand/scroll; `renderDiffVsBaseView` anchor param + select preselect + URL sync in the change listener.
8. Step 7: Task 6 wiring — link provider inside `ensureProgressTerminal()` (after `.open()`, `webapp/app.js:73`); timeline line-anchor block after the session anchor in `renderTimelineView`.
9. Manual browser verification per the plan's Verification section, then `npm test` once more.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/i-want-to-plan-imperative-bear.md` — the plan; read FIRST, it contains the exact code
- `RevEng/webapp/app.js` — router helpers/dispatch, `ensureProgressTerminal`, new `matchJsonlSourceLink`
- `RevEng/webapp/views/file-history.js` — anchor expand/scroll, replaceState toggle, new `computeAnchoredRevisionIndex`
- `RevEng/webapp/views/diff-vs-base.js` — `anchorRev` preselect + URL sync
- `RevEng/webapp/views/timeline.js` — new `findTimelineNodeIndexForRawLine`, line-anchor block
- `RevEng/tests/viewer-viewmodels.test.ts`, `tests/viewer-progress.test.ts`, `tests/timeline-viewmodels.test.ts` — RED tests go here
- `RevEng/plans/coding-requirements.md` — mandatory style (the plan's snippets already conform)

## Context the Next Agent Won't Have
- **User decision (overrides TASKS.md wording):** console `[file:line]` clicks must open the **Timeline view + JSON inspector drawer** — NOT the conversation view and NOT the raw-lines view. This was chosen explicitly because another session was adding drawers/inspector to the viewer.
- **Concurrent session warning:** a parallel session landed `41a9152` (timeline default view + collapsible drawers) and, at handoff time, still had UNCOMMITTED edits in `webapp/views/conversation.js` and `webapp/views/projects.js` (plus `src/reconstruction_reseed.ts`, `src/structures/vocabulary.ts`, `tests/vocabulary.test.ts`, `package.json`). None of these overlap the plan's five target files, but pull/re-check before editing and do not touch those files.
- **Off-by-one trap:** progress labels embed 1-based transcript line numbers; `/at/<line>` anchors and `rawLines[]` are 0-based. `matchJsonlSourceLink` does the `- 1` exactly once — do not subtract again anywhere else.
- **Why toggle + `history.replaceState` instead of setting `location.hash`:** a hash write re-renders the whole view (losing scroll), and re-setting an identical hash fires no `hashchange`, so a pure hash-driven toggle could never collapse the pane. `replaceState` fires no re-render.
- **Why the timeline anchor calls `openTranscriptInspector` directly** instead of reusing `openStepInspector`: the latter re-derives (jsonl, line) from the step's first resolvable changeId and can land on a different line than the one the console token named.
- Rejected alternatives (do not resurrect): replacing xterm with a DOM console (loses free copy/scrollback/fit); adding `sourceFile`/`sourceLine` fields to the NDJSON progress wire format (label substring already carries it).
- User works under strict guides baked into the plan: red-green TDD (`test_<behavior>` names, plain-English step comments), single-condition branching (no `&&`/`||` chains in ifs, ternaries only for value selection), 4-space indent, verb-named functions.

## How to Verify
- `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm test` — must be green after each GREEN step and at the end.
- Manual: start the viewer server (see `package.json` scripts), then: reload `#/project/<p>/file/<path>/rev/2` → revision #2 expanded/outlined/centered; `…/vsbase/999` → falls back to last revision; click a `[foo.jsonl:123]` console token → route `…/timeline/session/foo.jsonl/at/122`, owning step outlined, inspector showing raw line 122; clicking a token on `#/` is a no-op.
