## 2026-07-05:12:25:00 — Timeline drawers: collapsible left nav + slide-in inspector overlay
Chat title: witty-lampson (timeline 3-column drawer layout)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/9d892588-85eb-41ae-8a98-5badf96364d3.jsonl

### References
/Users/matkatmusicllc/.claude/plans/i-m-viewing-http-127-0-0-1-7343-project-witty-lampson.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260705-0720.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/revision-timeline-mockup.html

### Design decisions
- The right drawer's collapsed rail is the inspector pane's OWN left 24px (transform
  `translateX(calc(100% - 24px))`), not a separate DOM element. Children are blanked with
  `visibility: hidden` and a `::before` pseudo-element draws the « chevron — pseudo-elements
  are not children, so it stays visible. Chose this after the user picked "thin rail with
  chevron" for BOTH drawers; it needs zero new DOM and zero changes to inspector.js.
- "Inspector always starts closed" is interpreted as closed AND empty per route:
  renderRoute now calls `inspector.replaceChildren()` next to the existing `add("hidden")`,
  and the CSS `.hidden:empty` rule parks an empty pane fully off-screen — so a fresh route
  shows no rail until something is selected. Verified safe: app.js:275 was the only place
  outside inspector.js touching #inspector, and all three openTranscriptInspector call sites
  (timeline.js, conversation.js, raw-lines.js) run after renderRoute starts.
- Overlay styling is gated by a `timeline-route` class on `.layout`, toggled in renderRoute
  via the new exported `checkRouteIsTimeline(segments)`. Conversation and raw-lines routes
  keep the original side-by-side flex inspector (`.hidden` = display:none) untouched.
- The empty-click close handler is assigned as `container.onclick` (property, not
  addEventListener) so renderRoute clears it with one `view.onclick = null` line before any
  other route renders — no handler stacking, no leak into the conversation route.
- Timeline strip stays 260px wide even when the left drawer is collapsed:
  `.layout.timeline-route:has(.drawer.collapsed)` shifts the overlay's left edge via the
  `--drawer-width` custom property.
- TDD scope: the only DOM-free logic added is `checkRouteIsTimeline` — red-green tested in
  tests/route-predicates.test.ts (RED confirmed: missing export; GREEN: 2/2). CSS and DOM
  wiring have no DOM-free surface; they are covered by the manual verification list in the
  plan file.

### Deviations
- The /jot:implement instruction suggests parallel subagents; the total diff is ~70 lines
  across 4 files I had already read line-by-line during planning, and the test had to land
  RED before the app.js change landed GREEN — sequential direct edits were faster and safer.
- None from the plan spec itself: all five steps implemented as written.

### Tradeoffs
- `:has()` (2023+ browsers) over a JS class toggle for the collapsed-drawer offset: one CSS
  line vs more JS state; this is a local dev tool on a current browser.
- Left drawer animates `flex-basis`/`min-width` (layout-triggering properties) instead of
  transform: the timeline must genuinely reflow into the freed space, so a pure-transform
  animation is impossible; 0.18s on a local tool is negligible.
- The gated `display:block` on `.inspector-pane.hidden` appears BEFORE the generic
  `.hidden { display:none }` in styles.css but wins on specificity (4 classes vs 1) — kept
  the generic rule untouched rather than reordering the file.

### Open questions
(none blocking — flagging for polish only)
- The collapsed inspector rail's « chevron is a CSS pseudo-element, not a focusable button;
  fine for mouse use. Say the word if you want a real <button> for keyboard access.
- Ending a text-selection drag over empty timeline background fires a click on the container
  and will close the inspector. Rare; a `window.getSelection().isCollapsed` guard can be
  added to the empty-click handler if it annoys in practice.

## 2026-07-05:13:05:00 — Follow-up: drawer chevron moved to the column's right edge
- User request: chevron on the right edge of the Files/JSONL column, vertically centered.
- CSS-only change in webapp/styles.css: `.drawer-toggle` is now `position: absolute` at
  `left: calc(var(--drawer-width) - 22px); top: 50%; translateY(-50%)`. It positions against
  `.layout` (the drawer is unpositioned), so it neither scrolls with the drawer's content nor
  gets clipped by its `overflow-y: auto`, and its `left` animates in step with the collapse.
- `--drawer-width` was hoisted from `.layout.timeline-route` to `.layout` (all routes have the
  drawer), and the two now-redundant timeline-route definitions were removed. The inspector
  overlay's `left: calc(var(--drawer-width) + 260px)` picks up the same variable unchanged.
- No JS changes; the button is still created in renderProjectDrawer and still survives
  re-renders via the class-on-#drawer state.

## 2026-07-05:13:40:00 — Follow-up: session-header links open the inspector, not the conversation view
- User request: clicking a session's JSONL link on the timeline must open the details
  inspector/drawer; the timeline should always stay visible once a project is loaded.
- webapp/views/timeline.js: the session-header link's click now calls preventDefault, fetches
  the transcript with the already-imported fetchRawRecords, and opens it in the inspector at
  line 0 via openTranscriptInspector. The muted filename next to it gets the same handler.
- The href (routeToConversation) is kept on the anchor: plain click stays on the timeline;
  middle-click/new-tab still reaches the full conversation view deliberately.
- No close-handler conflict: session headers are in the empty-click exclusion list.

## 2026-07-05:14:05:00 — Follow-ups: inspector word-wrap, long-value collapse, » chevron
- Inspector JSON now word-wraps: `.inspector-json` white-space pre-wrap + word-break
  break-word (was pre + horizontal scroll).
- Rule implemented: a string value longer than ~7 lines shows only its first 7 wrapped lines
  with a […] toggle ([hide] when expanded). The exact 7-line cut is CSS `line-clamp: 7` on a
  `.json-collapsed` span; a 560-char threshold (7 × ~80 chars) in inspector.js just decides
  which values get the toggle. Non-string values (objects/arrays spanning many physical
  lines) are not clamped — the rule targets long scalar strings; extend if needed.
- The inspector's ✕ close button is now a » chevron (title "Collapse inspector"), matching
  the drawer-chevron vocabulary; same behavior (adds .hidden → slides out to the 24px rail
  on the timeline route).

## 2026-07-05:14:30:00 — Follow-up: inspector chevron on the left edge, flex layout
- User asked for the inspector's » chevron on the left edge (timeline side), vertically
  centered, and whether flexbox would make it easier. It did: the pane is now a flex row —
  chevron (align-self: center) + .inspector-content (flex: 1, the scroll container). The
  chevron never scrolls because scrolling moved off the pane onto the content column.
  This replaced an intermediate float + position:sticky approach (worked, but clever).
- inspector.js showLine wraps nav/h2/pre in .inspector-content; pane holds [chevron, content].
- Gated timeline-route `.hidden` rule changed display:block → display:flex so the box type
  never flips during the slide transition.

### Verification run
- `npm run typecheck` — clean.
- `npx tsx --test tests/route-predicates.test.ts` — 2/2 pass (RED confirmed first).
- `npx tsx --test tests/timeline-viewmodels.test.ts` — 11/11 pass (import-integrity smoke of
  the edited timeline.js; full `npm test` left to the user per workflow rules).
- Manual browser checklist (12 steps) is in the plan file — server on 7343 is the user's.
