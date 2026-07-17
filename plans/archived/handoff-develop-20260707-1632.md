# Handoff: file-click drawer + "Jump to conversation" timeline fix — plan mostly obsoleted by router rewrite
Conversation name: tranquil-meteor (clicking a file on the left column)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/fd138761-c6c3-436c-8959-dd414495ec84.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/clicking-a-file-on-tranquil-meteor.md

## Branch
`develop` (no parent feature branch; work is directly on develop)

## Goal
Two viewer bugs: (1) clicking a file in the left "Files touched" column replaced the Timeline with a full-page File Versions view — it should open in the right-side drawer; (2) "Jump to conversation" in the File Versions view landed on the conversation view instead of the Timeline scrolled to the revision.

## Current State
- **Issue 1 needed no new code.** The router rewrite already on develop (committed before this session resumed, in the `827fa3f`..`27d29ec` range) made the timeline every project route's base view: `checkRouteIsTimeline(segments)` is now just `segments[0] === "project"`, and `renderSubRouteDrawer` (webapp/app.js, ~line 367) renders `/file/…` and `/jsonl/…` sub-routes into `openInspectorPane()` over the timeline. A plain drawer `href` to `/file/…` now does exactly what the plan wanted, with a shareable URL and route-driven `.active` highlighting.
- **Issue 2 is fixed and verified but UNCOMMITTED**: `webapp/views/file-history.js` (+4/−3) — `jumpToConversation` now builds `routeToTimeline(project, jsonl, line)` instead of `routeToConversation(...)`, so the jump lands on `#/…/timeline/session/<jsonl>/at/<line>`, which scrolls to the owning step, adds `.anchored`, and opens the transcript inspector on that line (existing anchor logic in webapp/views/timeline.js ~1028-1048).
- Tests: 462/463 pass. The 1 failure (`s85 reproduces every captured step state`, tests/scenario_coverage.test.ts) is pre-existing from a concurrent session's engine work — not caused by this diff.
- Browser-verified end-to-end via headless DOM assertions on project s2-move-file (see How to Verify).

## What Remains
1. Commit the `webapp/views/file-history.js` fix on develop (user commits, or agent commits when asked). Suggested message: "Jump to conversation now anchors the timeline at the revision's step instead of opening the conversation view."
2. (Open question, ask user) The button is still labeled "Jump to conversation" but now jumps to the timeline anchored at the step + transcript inspector. Rename to "Jump to timeline" / "Jump to step"?
3. (Open question, ask user) `openRevision` inside `openTranscriptInspector` (webapp/inspector.js ~226) still has a `!checkRouteIsTimeline(...)` branch that is now dead on all project routes, and it swaps drawer content WITHOUT updating the URL — inconsistent with the new URLs-reflect-drawers architecture. Simplifying it to a plain `location.hash = routeToFileHistory(...) (+ /rev/N)` would delete the branch and make revision links shareable, at the cost of a full timeline re-render per click. Not done because it's outside the reported bugs.

## Key Files
- `webapp/views/file-history.js` — the uncommitted fix (`jumpToConversation`, ~line 166; import swap at top). Also note the "Show content" replaceState is already gated by `location.hash.startsWith(revisionRoute)` (~line 194) — no work needed there.
- `webapp/app.js` — new router: `checkRouteIsTimeline` (~345), `renderSubRouteDrawer` (~367), `renderRoute` dispatch (~387-443). Read this before touching any navigation.
- `webapp/inspector.js` — `openInspectorPane()` (~136), `openRevision` closure (~226, see open question 3).
- `webapp/views/timeline.js` — anchor handling (`anchorJsonl`/`anchorLine`, ~1028-1048).
- `/Users/matkatmusicllc/.claude/plans/clicking-a-file-on-tranquil-meteor.md` — the original plan; of its 4 items only item 1 shipped, items 2-4 were superseded by the router rewrite.

## Context the Next Agent Won't Have
- **Don't reintroduce the plan's items 2-4.** This session first implemented them (click interception in project.js, an `openFileRevisions` export in inspector.js) and then REVERTED both after discovering the router rewrite already covered Issue 1 at a better altitude. A drawer file link must stay a bare `href` — intercepting it bypasses the URL and duplicates `renderSubRouteDrawer`.
- The plan was written against the pre-rewrite router (Jul 5) and reads as authoritative but isn't — trust the code on develop, not the plan.
- Edge case in the fixed jump: assigning `location.hash` the exact route it already has fires no `hashchange`, so a repeated jump to the same revision is a silent no-op. Rare; deliberately not handled.
- Under the new router, the OLD jump behavior wasn't "raw lines view" as the user described — `/jsonl/<f>/at/<line>` rendered the timeline anchored at the session with the conversation drawer over it. The real gap was step-level anchoring, which `routeToTimeline(project, jsonl, line)` provides.
- Tooling gotcha: the gstack `browse` daemon loses all state between Bash invocations in this sandbox (each call spawns a fresh server/browser). Run any browser verification as ONE `chain` invocation, and for flows longer than ~15s use fire-and-forget: a `js` step that runs an async IIFE writing `window.__report` and appending a `#marker` div, then `["wait","#marker"]`, then `["js","window.__report"]`.
- User verification rule (memory): no screenshots — verify UI with headless DOM assertions and report numbers.
- A viewer server usually already runs at `http://127.0.0.1:7343` (`--projects-dir scenarios/executed`); `npm run app` will EADDRINUSE. Static files are served fresh from disk under `/app/*` (e.g. `/app/views/project.js`), so edits are live on reload.
- Script consent is per-browser-session (localStorage): a fresh headless browser always sees the consent dialog; click "Run scripts for this reconstruction" before asserting anything.

## How to Verify
1. `npm test` — expect 462/463 pass; the s85 scenario_coverage failure is pre-existing and unrelated.
2. Browser (single browse `chain` against the running server, project s2-move-file): load `#/project/s2-move-file`, accept consent, click a `.drawer-file` link → hash becomes `…/file/…`, `#view` still contains "revision timeline", `#inspector` holds 3 `.revision-row`s; click "Jump to conversation" → hash matches `#/project/s2-move-file/timeline/session/<uuid>.jsonl/at/47`, `#view` has `.anchored` rows, `#inspector .inspector-json` exists.
