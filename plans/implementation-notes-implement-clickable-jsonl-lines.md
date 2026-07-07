## 2026-07-05:13:55:00 — TASKS.md items 5 + 6: revision deep-links & clickable console JSONL lines
Chat title: implement clickable JSONL lines
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/7667b49b-9ceb-43e7-ae59-863e5da549c8.jsonl

### References

/Users/matkatmusicllc/.claude/plans/i-want-to-plan-imperative-bear.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260705-1347.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- Executing the plan as written — it was code-verified at HEAD `12d5088` and every line anchor re-confirmed at implementation time (app.js dispatch now at 326-336, routeToTimeline at 262-265, timeline.js session anchor at 643-650, nodeRows at 345). No redesign.
- Subagents not used despite the skill's suggestion: steps 2, 3, 5, 7 all edit `webapp/app.js` and the plan is strictly ordered TDD with exact snippets — parallel agents would only add merge conflicts.

### Deviations

- Baseline `npm test` is NOT fully green: one pre-existing failure, `s85 reproduces every captured step state` (tests/scenario_coverage.test.ts, actual 7 ≠ expected 0), caused by the concurrent session's uncommitted `src/reconstruction_reseed.ts` / `src/structures/vocabulary.ts` edits. Unrelated to the five target files. Proceeding with the bar "no new failures; the three touched suites green."

### Tradeoffs

- Browser verification ran headless (gstack browse) against the already-running viewer server on port 7343 (it reads webapp files per request, so it served the new code). GET-only traffic plus one script-consent run on scenario fixtures; the server's config was not touched.
- The console-link click (plan check 6) was verified with a REAL synthesized mouse click on the xterm canvas, but against an INJECTED label line (`window.progressTerminal.writeln(...)` — the debug handle that exists exactly for this) rather than a live script-run label: the second consent run served cached sandbox results whose progress lines carried no `[file:line]` token. The injected line exercises the identical link-provider → activate → route path; the only thing not covered is `formatRunSource`'s label shape, which tests already pin server-side.

### Verification results (2026-07-05 14:35)

- `npm test`: 431 pass / 1 fail — the fail is the pre-existing `s85 reproduces every captured step state`, untouched by this work. `npm run typecheck`: clean.
- 5a: hard-load `…/file/<path>/rev/2` → 4 rows, #2 anchored + expanded; "Show content" on #3 → URL `…/rev/3` via replaceState (no re-render); second click → URL drops back to the bare file route.
- 5b: `…/vsbase/2` → select preselects #2; changing the select → URL `…/vsbase/4`; `…/vsbase/999` → falls back to the last revision, no error box.
- 6: real click on a `[<jsonl>:39]` xterm token → `…/timeline/session/<jsonl>/at/38` (1-based → 0-based conversion correct), owning step row anchored + centered, inspector open on raw line 38. Token click while on `#/` → hash unchanged, no errors.

## 2026-07-05:14:50:00 — Follow-up: bare project route now defaults to the timeline view

User report: `#/project/s43-git-baseline-uncommitted-module` showed the summary landing pane (not the timeline) after script consent. Root cause: commit `41a9152` ("Timeline view is shown when project loads") only pointed the drawer's JSONL links at timeline routes — the bare `#/project/<p>` dispatch still rendered `renderProjectView`, and the consent dialog's re-render landed there too. Fix: `renderRoute` rewrites a bare project route to its `/timeline` route via `history.replaceState` (no history entry, so no back-button trap) before dispatch. Verified in-browser on s43: URL rewritten on load, consent dialog on the timeline route, timeline renders after consent, `timeline-route` layout class applied. Suites: 37 pass, 0 fail. Note: the `segments.length === 2` → `renderProjectView` dispatch branch is now unreachable; left in place rather than deleted.

## 2026-07-05:15:20:00 — Follow-up: inspector backupFileName values are clickable revision links

User request: `backupFileName` values in the JSON inspector (e.g. line 125 of s43's a4918fd5 transcript, a `file-history-snapshot` record) should open the file viewer with that revision selected. Implemented via the existing jump-link mechanism in `webapp/inspector.js`: a string value that is no uuid/toolu jump target is looked up as a revision changeId through the new `findRevisionForChangeId` (webapp/views/file-history.js, TDD'd with 4 tests).

- Exact changeId match → `…/file/<target>/rev/<n>` — the anchored selection rectangle + expanded pane shipped earlier today.
- Same-blob-prefix match (snapshot names `…@v2` but the document's revision carries `…@v3` — the hex before `@v` is per-file) → plain `…/file/<target>` history, nothing anchored.
- The document is resolved from `peekCachedDocument` + the current hash — no build is ever forced; on routes with no cached document the values render unlinked.

Verified in-browser on the reported line: `ffe786cb8ed6c546@v2` → rename_inv.py `/rev/3`, row #3 outlined + expanded; `5436e8e9f917cd04@v2` (v3 in the document) → inventory.py history, 6 rows, unanchored. `npm test`: 435 pass / 1 fail (the same pre-existing s85 failure).

## 2026-07-06:09:00:00 — Follow-up: blob versions without their own revision now anchor via backupTime

User report: clicking `5436e8e9f917cd04@v2` from line 110's snapshot opened inventory.py's history with nothing selected (the document's revision carries that blob at @v3, so the exact-match link couldn't anchor). Fix: the snapshot entry that names the blob also records `backupTime` — the moment the backup captured the file — and the revision in effect then IS the state the blob points to. New `findBackupTimeForBlob` (webapp/inspector.js) reads the entry's time; `findRevisionForChangeId` gained a third `backupTime` param that resolves a prefix-matched history to the last revision at or before that time (same ISO-string-comparison convention as `computeContentAtTime`). Verified against ground truth: @v2's backupTime 04:29:36.586Z falls between rev #2 (04:28:29) and rev #3 (04:30:00) → revision #2, confirmed in-browser (route `…/rev/2`, row #2 outlined + expanded). 4 new tests; suite 439 pass / 1 fail (same pre-existing s85).

## 2026-07-06:09:30:00 — Follow-up: the file viewer opens as a drawer over the timeline

User decision: clicking a backup/changeId link from the timeline must NOT navigate away — the file viewer opens in the inspector pane as a drawer over the timeline. `openRevision` (webapp/inspector.js) now renders `renderFileHistoryView` into the inspector pane when the current route is the timeline (URL untouched); on any other route it still navigates to the `/file/…[/rev/<n>]` deep link. `renderFileHistoryView`'s "Show content" URL sync gained a guard — it only rewrites the URL when the current hash IS that file's route, so a drawer-rendered viewer never rewrites the timeline's URL. Verified in-browser on the line-110 flow: URL stays `…/at/110`, timeline visible behind, drawer shows 6 revisions with #2 outlined + expanded, in-drawer toggling leaves the URL alone. Suite 439 pass / 1 fail (same pre-existing s85). Render-glue change — covered by the manual check per the repo's testing convention.

## 2026-07-06:10:00:00 — Follow-up: the timeline is ALWAYS a loaded project's base view

User decision: once a project is loaded the timeline is always shown; the left files drawer and the right inspector are layers over it. Audited every route: `/jsonl/<f>`, `/jsonl/<f>/at/<n>`, `/jsonl/<f>/lines`, `/file/<path>[/rev/<n>]`, and `/file/<path>/vsbase[/<n>]` used to REPLACE the timeline in #view. Now `renderRoute` renders the timeline for every `#/project/*` route (session-anchored to the route's jsonl where one is named) and the sub-route's view renders into the inspector pane via the new shared `openInspectorPane()` chrome (webapp/inspector.js — also deduplicates the two drawer builders that existed). `checkRouteIsTimeline` contract updated red→green in tests/route-predicates.test.ts: true for every project route, false for the projects list/unknown routes — the overlay layout now applies project-wide. `renderProjectView` (summary landing) is fully unreachable; left in place, import removed from app.js. Sub-route URLs keep their meaning as deep links — only presentation changed.

Verified in-browser on s43 (timeline visible + drawer content on every shape): bare project (no drawer), jsonl → conversation drawer, jsonl/lines → raw-lines drawer, file/rev/2 → file drawer with #2 anchored, file/vsbase/2 → diff drawer with #2 preselected, timeline/at/110 → JSON inspector on line 110. Consent flow unchanged (dialog owns #view until decided; drawers wait for the cached document). Suite 439 pass / 1 fail (same pre-existing s85).

Note: app.js ↔ inspector.js is now an import cycle (function-level use only — safe under ES modules; the node suite exercises it).

### Open questions
- `fb2558d7813b8799@v2` (test_inventory.py's backup) stays UNLINKED: no revision in the document carries that blob prefix — the engine derived no revision from that file's backups, so the wire document contains nothing to map the blob name to a path. Making it clickable would need the server to ship a blob→path map; say the word if that's wanted.

- The pre-existing s85 failure belongs to the other session; leaving it untouched.
- One human-eyeball check remains genuinely manual: hover underline/pointer styling on the console token (headless verified detection + activation, not the visual).
