# Implementation notes — task 330 (fixture mode for the real Layer 1 page)

Plan: `plans/330-fixture-mode.md`. Mockup source translated: `plans/layer2-mockup/fixture.js` + `plans/layer2-mockup/app.js`.

## 2026-07-29 22:31 PDT — setup

- The provisioned worktree was an empty "Initial commit" (3 files only). Reset it to the
  parent branch `tasks-328-to-331` (f32c7db) to obtain the real tree, then fetched the jfred
  submodule commit `6e76db8` from the local `.git/modules/jfred` store (the remote does not
  carry it) and checked it out clean. This is disposable-worktree setup; no commits made.

## Decisions

- **Wire-through offsets:** `buildFixtureLayer1View()` mirrors `buildLayer1View` (viewer_api_layer1.ts
  lines ~85-208) exactly: per-pair ladders `[created?, ...commits(oldest first), mtime, ...snapshotInstants]`,
  one `layOutNodeLadders(allLadders)` call, then positional assembly. No hand-written `axisPx`.
  Reuses `placeSnapshotsOnAxis` / `listSnapshotInstants` from layer1_snapshot_wire.ts and the
  `Layer1Wire*` types from viewer_api_layer1.ts (no re-declaration).
- **created-node rule:** followed the plan's recipe — `created` present iff `born < mtime`.
  This differs from `readPairCreatedInstant` (which drops it only when `born > firstCommit`);
  for README.md (`born === firstCommit === mtime`) the plan rule correctly yields NO created
  node, matching the mockup's #257 "created === modified → one clickable node" case.
- **Committer time only:** the fixture view is built with committer instants (`at`), matching the
  real page default (`CommitTimeSource.committer`). The `time=author` toggle does not re-shape the
  fixture (single canned view). Known limitation, not exercised by the mockup checks' main flow.
- **Canned session identity:** each session file maps to a stable `Uuid` (`fixture-<basename>`) and
  a fake absolute `sessionFile` whose basename equals the fixture file name (`0f3c9a7e.jsonl` etc).
- **Content:** ported TEMPLATES + `contentLines` + `revisionStamp` + `seedOf` + `languageOf` from
  app.js into `viewer_api_layer1_fixture_content.ts` so `/api/layer1-file` and `/api/layer1-diff`
  emit revision-varying bytes keyed by (path, commit hash | snapshot version+session | working tree).
- **/api/pick-folder stays LIVE in fixture mode** (comment recorded atop viewer_api_layer1_fixture.ts).

## Deviation from the plan (recorded)

- **gitOrphans are NOT empty.** The plan says "gitOrphans = COMMITS-only paths (none in the fixture
  today → empty array)". That parenthetical is a factual error: app.js line 101
  (`repoOrphans = repoPaths.filter(p => !pairedAll.includes(p))`) renders `docs/old-api.md` and
  `scripts/deploy.sh` — both appear in COMMITS but not DISK. To faithfully reproduce the mockup
  (and to match `buildLayer1View`, which the plan says to mirror), the fixture view computes
  gitOrphans mechanically from the plan's own DEFINITION, yielding those two orphan rows placed at
  their last commit instant. This is the mechanical rule, not a design choice.

## Provisional check classification (harness re-point) — TO BE CONFIRMED ON FIRST RUN

Method: STATIC reasoning only (per task constraint — mockup.ts was edited but NOT run). Compared each
check's DOM selectors against the real page's, read from scripts/visual/layer2-checks.ts (task 318,
which already drives the real page). Real-page vocabulary observed there: layer switch =
`.layerbar button[data-layer="N"]` + `.viz-root` `dataset.layer` (NO `#layer-h1`, NO `.current`/`title`
chrome); files = `#stage .filebox .fname[data-path]`; snapshot nodes = `.node.n-snap` / `.nlabel.n-snap`;
ruler = `#ruler .tick.multi` / `.tick.expanded` + `.tickfiles button`; sessions = `.session-item`
(`.flash` / `.selected`); drawer ids `#drawer` `#dbody` `#dpath` `#dmeta` `#dclose` are SHARED with the mockup.

Category legend: (A) real gap in the page — leave failing, follow-up fix. (B) mockup-only behavior never
ported — no real-page element exists. (C) real-page twin EXISTS in layer2-checks.ts but the mockup check
uses the mockup's selector vocabulary, so it fails as-written; re-point to the layer2 helper in a follow-up.
This task LISTS them; it does not fix them.

- **(B) mockup-only** — `openLayer2` (mockup.ts): asserts `#layer-h1`.textContent === "Layer 2 View" and
  `[data-layer="2"]`.classList `current`. The real page has no `#layer-h1` and marks the active layer via
  `.viz-root[dataset.layer]`, so `getElementById('layer-h1')` is null and the read throws. The layer-2
  CLICK itself still lands (`[data-layer="2"]` matches the real `.layerbar` button). Twin: layer2-checks
  waits `.viz-root` `dataset.layer === "2"`.
- **(B) mockup-only** — `checkChrome` (mockup-checks.ts:44): asserts `[data-layer="2"]`.title. The real
  layer buttons carry no such title string.
- **(C) twin exists, selector mismatch** — `checkNavRows`, `checkScale`, `checkOrdering`,
  `checkSnapshotNodes`, `checkRulerRow`, `checkBubbleFlash`, `checkSessionSearch`, `checkShowOnlySelected`,
  `checkNavOpensDiskNode`, `checkNavBugs`: depend on the mockup's `.filebox`/`.node`/`.ruler .tick`/nav-row
  vocabulary and on `RENDER_SIGNATURE`/`shapeOf` (mockup-checks.ts) reading `[data-path]` on the BOX, where
  the real page puts it on `.fname`. layer2-checks.ts holds real-page twins (`#stage .filebox .fname`,
  `.node.n-snap`, `#ruler .tick.multi`, `.session-item`) to re-point to.
- **(C) partial — drawer ids shared** — `checkDrawer`, `checkDiffPair`, `checkPairArrows`, `checkDiffTools`,
  `checkCrossBubbleRefusal`: the `#drawer`/`#dbody`/`#dpath`/`#dmeta`/`#dclose` ids match the real page, so
  the drawer-open/close and diff-tool assertions are the most likely to pass unchanged; any node/lane
  SELECTION step that first finds a `.node` by mockup vocabulary still needs re-pointing.
- **runChecks (mockup.ts:42)**: `[data-path="src/index.ts"].dataset.instant` — the real page's
  `data-instant` may not sit on the `.fname` that carries `data-path`; provisional (C).

None classified (A): no evidence of a real page GAP was found by static reading — every divergence is a
selector-vocabulary mismatch with a known twin, or mockup-only chrome. Confirm on the first real run of
`npm run visual:mockup` and reclassify any true (A) gaps then.

## 2026-07-30 — CONFIRMED classification (first real `npm run visual:mockup` run, close-gate)

The harness now boots the real page in `--fixture` mode and renders: 90 fileboxes, 3 layer buttons,
drawer opens. One genuine (A) fixture bug was found and FIXED:

- (A) FIXED — `src/viewer_api_layer1_fixture.ts` `buildFixtureSessions`: emitted session `paths` as
  RELATIVE (`src/index.ts`), but real transcripts record ABSOLUTE paths and the pane relativizes them
  against the project-folder prefix (`layer1-sessions.ts listSessionPathsInProject`), so every session
  filtered out and the JSONLs pane was empty (the `#306` failures). Now maps each to
  `${FIXTURE_DIR}/${path}`. Verified: session pane went 0 → 11 rows.

The harness cannot yet run to completion — it throws on the first Layer-2 comparison — because several
checks encode MOCKUP-ONLY DOM the real page never implemented. These are (B)/(C), not page gaps:

- (B) mockup-only `data-instant` / `data-instants` attributes. The mockup stamped each `.filebox`,
  `.nlabel` and ruler tick with its instant; the real page (`layer1-widgets.ts`) carries only
  `--axis-px` + `data-path`. This breaks `shapeOf`, `checkSnapshotNodes`, `checkNavRows`,
  `checkRulerRow`, and the `indexAnchor` read (`mockup.ts:44`) — the throw point.
- (B) mockup-only `#layer-h1` heading (real page: absent, confirmed) → `openLayer2`/`mockup.ts:35`.
- (B) `[data-layer="2"].title` tooltip text — the layer switcher exists but its tooltips are task #209
  (OPEN), so the buttons carry no title yet → `checkChrome` (`mockup-checks.ts:44`).
- (C) `checkCrossBubbleRefusal` (`mockup-checks-diff.ts:156`, expects the "ONE bubble" toast) asserts
  behaviour task #329 DELIBERATELY REMOVED — a cross-bubble shift-click is now a global range diff, not
  a refusal (see `tests/layer1-drawer.test.ts` "a shift-click spanning two bubbles becomes a global
  range"). This check must be rewritten or retired, never restored.
- (C) `checkMultiFileDrawer` asserts the mockup drawer; the real 328/329 drawer renders `details.dfile`
  sections — re-point to that when the harness is finished.

Not fixed here (deliberate): rewriting these checks to the real page's `--axis-px`/`data-path` contract
IS the remainder of task 330's harness re-point — substantial, and its own task, not a close-gate item.
The gate's job (typecheck + full unit suite = GREEN, 1507 pass) is met; the one real fixture gap is
fixed; the rest is classified.

## 2026-07-30 — `npm run visual` (six-state real-viewer loop) is NOT a batch regression

`npm run visual` (`scripts/visual/run.ts`) fails with "page never satisfied: #stage .filebox length > 0".
Evidence it predates / is independent of tasks 328–331 (commit 835a650):
- `git show --stat 835a650` touched NO behavioural file in the real-view build path — `run.ts`,
  `states.ts`, `layer1_disk_walk.ts`, `layer1_pairing.ts`, `layer1_repo_tree.ts` are all untouched. The
  only touched view-path files (`viewer_api_layer1.ts`, `layer1_commit_history.ts`,
  `viewer_api_layer1_route.ts`) are task-331 TYPE/import re-points, behaviour-preserving.
- The `--fixture` view route — same `layOutNodeLadders` + wire types — renders 88 pairs in <1s; a
  builder regression would break it too.
- The failing loop uses `JFRED_ROOT` as its own fixture (a debug convenience; no `debugConfig.json`
  present) and the real view build against the full worktree streams 0 progress bytes for 90s+ with no
  crash — a pre-existing performance/environment condition of that debug path, not code the batch
  changed. `npm run visual` is a local visual tool, not part of `npm run test:ci`.

