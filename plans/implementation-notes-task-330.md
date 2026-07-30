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
</content>
</invoke>
