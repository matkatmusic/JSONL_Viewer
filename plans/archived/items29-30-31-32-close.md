# Close TASKS.md items 29, 30, 31, 32

Verified state (2026-07-08): all four items confirmed against the codebase. Items 29, 30, 32
are real and implemented here. Item 31's premise is WRONG — a sweep of all 85 covered
scenarios found 29 scenarios that each still produce exactly one unattributed agent-turn
(the script-execution turns whose synthetic changeIds come from `randomUUID()`, see item 34),
so the CSS hide rule is load-bearing and must NOT be removed; item 31 closes as investigated
won't-do.

Baseline: 507/507 tests green (`npm test` = `node --import tsx --test tests/*.test.ts`).
Ponytail ultra: shortest working diff; comment out replaced code first, delete only after the
suite is green (user preference).

---

## Task 1 — Item 29: rename the "Jump to conversation" button

The button (`webapp/views/file-history.js:232`) navigates via `routeToTimeline` to the
timeline anchored at the owning step, not to the conversation view. User picked the label
**"Jump to timeline step"**.

**Steps:**
1. In `webapp/views/file-history.js:232` change `text: "Jump to conversation"` to
   `text: "Jump to timeline step"`. No other occurrence exists in webapp/tests (verified by
   grep).

No test: a static label string is a trivial one-liner (YAGNI applies to tests too).

---

## Task 2 — Item 30: simplify `openRevision` in `webapp/inspector.js` (TDD)

Facts established: `checkRouteIsTimeline(segments)` is `segments[0] === "project"`
(`webapp/app.js:345-347`) — every project route carries the timeline, and `jsonl`/`file`
sub-routes render as drawers over it via `renderSubRouteDrawer` (`webapp/app.js:365-386`).
`openRevision` (`webapp/inspector.js:295-304`) only ever runs with a defined `project`
(revision links render only when `filesTouched` from `peekCachedDocument(project)` resolves a
link, `inspector.js:293-294`, and `findCurrentProject()` requires `segments[0] === "project"`).
Therefore its `!checkRouteIsTimeline(...)` branch is dead, and the live branch swaps drawer
content WITHOUT updating the URL — inconsistent with the URLs-reflect-drawers architecture.

The fix: `openRevision` becomes a hash navigation. The router then renders the file-history
drawer over the timeline AND the URL reflects it (shareable). The route-string computation is
the testable unit — export it.

### 2a. RED — route-computation tests

Add to `tests/inspector-viewmodels.test.ts` (extend the existing import from
`../webapp/inspector.js` with `computeRevisionLinkRoute`):

```ts
test("test_revision_link_route_carries_revision_anchor", () => {
    // Scenario: a revision link with a revision number routes to the file-history view
    // anchored at that revision — the same /rev/<n> shape routeToFileHistory-based routes use.
    // Steps:
    // compute the route for a resolved link with revisionNumber 3.
    const route = computeRevisionLinkRoute("proj-a", { target: "/tmp/app.py", revisionNumber: 3 });
    // assert the file-history route with the /rev/3 anchor.
    assert.equal(route, "#/project/proj-a/file/%2Ftmp%2Fapp.py/rev/3");
});

test("test_revision_link_route_without_revision_number_omits_anchor", () => {
    // Scenario: a link that resolved to a file but no single revision routes to the plain
    // file-history view (no /rev segment).
    // Steps:
    // compute the route for a link with no revisionNumber.
    const route = computeRevisionLinkRoute("proj-a", { target: "/tmp/app.py", revisionNumber: undefined });
    // assert the bare file-history route.
    assert.equal(route, "#/project/proj-a/file/%2Ftmp%2Fapp.py");
});
```

(Expected literals follow `routeToFileHistory` = `#/project/<enc(project)>/file/<enc(target)>`,
`webapp/app.js:319-321`. If `tests/inspector-viewmodels.test.ts` prefers building the
expectation via the imported `routeToFileHistory`, use
`` `${routeToFileHistory("proj-a", "/tmp/app.py")}/rev/3` `` — matches how
`timeline-viewmodels.test.ts` asserts `computeSnapshotJumpRoute`.)

Run the two tests — they must FAIL (no such export).

### 2b. GREEN — implement in `webapp/inspector.js`

1. Add next to the other exported helpers (e.g. after `findBackupTimeForBlob`):

```js
// The file-history route a resolved revision link navigates to: anchored at /rev/<n> when the
// link names one revision, the file's plain history otherwise.
export function computeRevisionLinkRoute(project, { target, revisionNumber }) {
    const base = routeToFileHistory(project, target);
    return revisionNumber === undefined ? base : `${base}/rev/${revisionNumber}`;
}
```

2. In `openTranscriptInspector` replace the `openRevision` const (`inspector.js:295-304`) —
   comment the old body out first — with:

```js
    // Revision links navigate: the router renders file history as a drawer over the timeline
    // (renderSubRouteDrawer) and the URL reflects it, so revision links are shareable.
    const openRevision = (revisionLink) => {
        location.hash = computeRevisionLinkRoute(project, revisionLink);
    };
```

3. Imports (`inspector.js:9-10`): `checkRouteIsTimeline` and `renderFileHistoryView` become
   unused — remove them from their import lists (comment-out first, delete after green).
   `parseRouteSegments`, `el`, `peekCachedDocument`, `routeToFileHistory` stay used;
   `findRevisionForChangeId` stays used.

4. Run the two new tests, then the full suite.

### 2c. Delete the commented-out old code once the suite is green.

---

## Task 3 — Item 32: `/api/document` walks per-line progress twice (TDD)

Facts established: `handleDocumentRequest`'s progress path (`src/viewer_server.ts:141`) calls
`loadProjectRecords(jsonlPaths, writeNdjsonLine)` for the consent scan (walk 1), then
`buildDocumentWithConsent(..., writeNdjsonLine)` walks again — on artifact-cache hit via the
explicit replay call (`src/viewer_api.ts:238`), on cache miss via `buildProjectDocument`
forwarding `onProgress` into `loadProjectRecords` (`viewer_api.ts:189`), which is by then a
records-cache hit and replays. The only caller that passes a sink into
`buildDocumentWithConsent` is this route, and it ALWAYS pre-walks (`handleDiffRequest` and
`handleRangePatchRequest` pass no sink; no other `buildProjectDocument` caller passes one —
verified by grep).

New contract: **the per-record walk belongs to `loadProjectRecords`; the route composes one
walk per request; `buildDocumentWithConsent` emits stages and deep-engine progress only.**

### 3a. RED — rewrite the three tests that encode the old double-walk contract

In `tests/viewer-progress.test.ts`:

1. Replace `test_cached_document_build_still_emits_per_record_progress` (line 69) with two
   tests modeling the route's sequence (`loadProjectRecords` with the request sink, then
   `buildDocumentWithConsent` with the same sink). `loadProjectRecords` needs importing from
   `../src/viewer_api.ts` in this file.

```ts
test("test_document_request_sequence_walks_records_once_when_cold", () => {
    // Scenario: one /api/document request = one per-record console walk. The route loads
    // records with its sink (the walk), then builds with the same sink — the build must not
    // walk them again.
    // Steps:
    // run the route's sequence cold (fresh temp copy) with one collecting sink.
    const jsonlPath = copyFixtureIntoTempDir(S19_JSONL);
    const recordCount = loadTranscript(jsonlPath.toString()).length;
    const requestEvents: ProgressEvent[] = [];
    const sink = (event: ProgressEvent) => requestEvents.push(event);
    loadProjectRecords([jsonlPath], sink);
    buildDocumentWithConsent([jsonlPath], undefined, false, sink);
    // per-record events (counted with total === recordCount) appear exactly once per record.
    const perRecordCount = requestEvents.filter((event) => event.total === recordCount).length;
    assert.equal(perRecordCount, recordCount);
});

test("test_document_request_sequence_walks_records_once_when_cached", () => {
    // Scenario: a warm request (records + artifact caches hit) still shows the walk exactly
    // once — loadProjectRecords' replay — not a second replay from the cached build.
    // Steps:
    // prime both caches, then re-run the route's sequence with a collecting sink.
    const jsonlPath = copyFixtureIntoTempDir(S19_JSONL);
    const recordCount = loadTranscript(jsonlPath.toString()).length;
    loadProjectRecords([jsonlPath]);
    buildDocumentWithConsent([jsonlPath], undefined, false);
    const requestEvents: ProgressEvent[] = [];
    const sink = (event: ProgressEvent) => requestEvents.push(event);
    loadProjectRecords([jsonlPath], sink);
    buildDocumentWithConsent([jsonlPath], undefined, false, sink);
    // exactly one replayed event per record across the whole request.
    const perRecordCount = requestEvents.filter((event) => event.total === recordCount).length;
    assert.equal(perRecordCount, recordCount);
});
```

2. Rewrite `test_per_record_progress_labels_carry_source_tokens_cold_and_cached` (line 90) to
   exercise the walk owner directly: replace its two `buildDocumentWithConsent(...)` calls
   with `loadProjectRecords([jsonlPath], (event) => coldEvents.push(event))` /
   `loadProjectRecords([jsonlPath], (event) => warmEvents.push(event))` (cold parse, then
   cached replay). Everything else — the per-record filter and the
   `matchJsonlSourceLink` assertions — stays as is.

3. In `test_buildDocumentWithConsent_emits_stage_labels_in_order` (line 139): replace the
   final assertion
   `assert.ok(stageLabels.indexOf(PROGRESS_LABEL_PARSING_RECORDS) < stageLabels.indexOf(PROGRESS_LABEL_READING_SIDECAR));`
   with the new contract — the build emits NO parsing announcement of its own:
   `assert.ok(!stageLabels.includes(PROGRESS_LABEL_PARSING_RECORDS));`
   (`PROGRESS_LABEL_PARSING_RECORDS` stays imported — the loadTranscript test at line 42 area
   still uses the surrounding machinery; keep the import as long as any test references it.)
   Update the test's scenario comment ("after the per-record parsing events" → the build
   assumes its caller already walked records).

Run `tests/viewer-progress.test.ts` — the two new tests and the modified stage-label test must
FAIL against current code (double walk / parsing label present).

### 3b. GREEN — `src/viewer_api.ts`

1. Line 189: `loadProjectRecords(jsonlPaths, onProgress)` → `loadProjectRecords(jsonlPaths)`
   (comment the old call out first). Records are always pre-walked by the only
   progress-passing caller; the stage labels that follow (`PROGRESS_LABEL_READING_SIDECAR`,
   …) keep flowing through `onProgress` unchanged.
2. Lines 236-238 (cache-hit branch of `buildDocumentWithConsent`): remove the
   `loadProjectRecords(jsonlPaths, onProgress);` replay call and its two-line comment
   (comment out first). The `reportStage(onProgress, PROGRESS_LABEL_ARTIFACT_CACHE_HIT)` line
   stays.
3. Do NOT touch `loadProjectRecords` itself — its cache-hit label + replay
   (`viewer_api.ts:112-128`) are the single-walk mechanism the route relies on, covered by
   `test_load_project_records_reports_cache_hit_label` and the rewritten source-token test.

Run `tests/viewer-progress.test.ts` and `tests/viewer-artifact-cache.test.ts`
(`test_build_with_consent_reports_artifact_cache_hit_label` must stay green — the stage label
survives, only the replay goes).

### 3c. Delete the commented-out old code once green.

---

## Task 4 — TASKS.md updates

1. Item 29 → `[x]`, append:
   **Closed 2026-07-08:** renamed to "Jump to timeline step" (user-picked label),
   `webapp/views/file-history.js`.
2. Item 30 → `[x]`, append:
   **Closed 2026-07-08:** `openRevision` is now a hash navigation via the new
   `computeRevisionLinkRoute` (`webapp/inspector.js`); the dead `!checkRouteIsTimeline` branch
   and the direct drawer render are gone, revision links are shareable URLs. 2 tests in
   `tests/inspector-viewmodels.test.ts`.
3. Item 31 → `[x]`, append:
   **Closed 2026-07-08 (won't-do — rule is load-bearing):** swept all 85 covered scenarios
   building each document and timeline view-model: 29 scenarios (s23, s29, s32, s34, s35,
   s37, s38, s41–s44, s50, s51, s54–s60, s62, s72–s75, s82–s85) each still emit exactly one
   unattributed agent-turn — the script-execution turns whose synthetic changeIds are
   per-replay `randomUUID()` (item 34). Removing the CSS rule would re-show the
   "(unattrib" header in all 29. Re-check after item 34 lands.
4. Item 32 → `[x]`, append:
   **Closed 2026-07-08:** the per-record walk now happens exactly once per request —
   `buildDocumentWithConsent`/`buildProjectDocument` no longer replay records
   (`src/viewer_api.ts`); the route's own `loadProjectRecords` call is the single walk.
   Contract tests rewritten in `tests/viewer-progress.test.ts`.

---

## Task 5 — Gates

1. Full suite: `npm test` — expect 511/511 (507 baseline + 2 inspector-route tests + 2
   route-sequence tests, with 2 rewritten in place and 1 modified).
2. Delete all commented-out replaced code (Tasks 2c, 3c) and re-run the suite.
3. Stage everything (`git add` the touched files + this plan + implementation notes); do NOT
   commit.

Touched files: `webapp/views/file-history.js`, `webapp/inspector.js`,
`tests/inspector-viewmodels.test.ts`, `tests/viewer-progress.test.ts`, `src/viewer_api.ts`,
`TASKS.md`, `plans/items29-30-31-32-close.md`.
