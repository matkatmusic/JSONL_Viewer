# Task 330 — Fixture mode: the REAL Layer 1 page served from canned payloads

Hard constraints (user decision 2026-07-29, in the task):
- `jfred/webapp/` has ZERO changes in the diff. All work is in `jfred/src/`,
  `jfred/scripts/visual/`, and this plans folder.
- OFF by default: a `--fixture` argument to the viewer. Flag off = byte-identical
  behavior to today.
- `plans/layer2-mockup/` is NOT deleted or modified.
- STALE-TEXT NOTE: the task says Layer 2 "does not exist in the real page yet". It
  does now — tasks 310-318 landed (snapshots are `Layer1WirePair.snapshots`, drawer
  snapshot fetch is task 317, `scripts/visual/layer2.ts` already drives the real page).
  So the fixture DOES include SNAPSHOTS data; the "Layer 1 only" scope limit is void.

## Files and their jobs

1. NEW `jfred/src/viewer_api_layer1_fixture_data.ts` — the data. Translate
   `plans/layer2-mockup/fixture.js` wholesale to TS: `COMMITS`, `DISK`, `SESSIONS`,
   `SNAPSHOTS`, the deterministic BULK generator loop (it is plain arithmetic — port
   it, do not truncate it; the ~90 bubbles are what make scrolling real), and the
   self-check block at the bottom (throw at import time on any violated invariant:
   `born <= snapshot <= mtime`, snapshot inside its session window, line inside a
   title range). No `Date.now()`, no randomness — same as the source. Also port the
   per-language content templates + `contentLines(path, node)` from
   `plans/layer2-mockup/app.js` (~line 990 and the TEMPLATES above it) — they are what
   give `/api/layer1-file` and `/api/layer1-diff` revision-varying bytes. If the file
   would pass the 250-line cap, split content templates into
   `viewer_api_layer1_fixture_content.ts`.

2. NEW `jfred/src/viewer_api_layer1_fixture.ts` — the eight route handlers plus the
   mode flag: `let fixtureModeOn = false; export function enableFixtureMode(...)`,
   `export function isFixtureMode()`, and
   `export function dispatchLayer1FixtureRoute(request, response, url): boolean` with
   the SAME path-test chain shape as `dispatchLayer1Route` (return false for paths it
   does not own, so layer1.html/static serving falls through unchanged).

3. EDIT `jfred/src/viewer_server_layer1_routes.ts` — one branch at the top of
   `dispatchLayer1Route`:
   `if (isFixtureMode()) { return dispatchLayer1FixtureRoute(request, response, url); }`
   Also fix the header comment: it says "six HTTP routes"; it dispatches eight (task
   text calls this out explicitly).

4. EDIT `jfred/src/viewer_server.ts` (227/250 lines — additions must stay ~4 lines):
   in `parseServerArgs`, detect `--fixture` in argv and call `enableFixtureMode()`;
   add `[--fixture]` to `USAGE`. TRAP: `--projects-dir` is mandatory today; keep it
   mandatory even with `--fixture` (pass any existing folder in scripts) rather than
   relaxing the arg parser — smaller diff, nothing depends on relaxing it.
   `/api/pick-folder` stays LIVE in fixture mode (harmless; an OS dialog picking a
   folder changes inputs the fixture routes ignore) — record that decision as a
   one-line comment at the top of viewer_api_layer1_fixture.ts.

## The view payload — offsets go THROUGH layOutNodeLadders (non-negotiable)

In `viewer_api_layer1_fixture_data.ts` (or the fixture route file), build
`buildFixtureLayer1View(): Layer1WireView` this way, mirroring the positional
convention of `viewer_api_layer1.ts` (read `listPairNodeLadder` +
`placePairNodesOnAxis` there first — lines ~85-120):

- Per DISK file: ladder = `[born (only when born < mtime), ...its COMMITS' instants
  (oldest first), mtime, ...its SNAPSHOTS' instants (appended, never interleaved)]`.
- gitOrphans = COMMITS-only paths (none in the fixture today → empty array);
  diskOrphans: paths in DISK with no commit touch — check which fixture paths qualify
  (`notes.txt`, `.env.local`) and route them as `Layer1WireOrphan`s with their own
  one-instant ladders, exactly as `buildLayer1View` does.
- ONE `layOutNodeLadders(allLadders)` call (import from
  `../webapp/layer1-ruler-axis.ts` — src importing webapp/ is the established
  direction). Assemble `Layer1WirePair`/`Layer1WireOrphan`/`Layer1WireRulerTick`
  objects from the returned layout positionally. Do NOT hand-write any `axisPx`.
- Snapshots become `Layer1WireSnapshot`s: `version` is the NUMBER from `@vN`,
  `sessionId` a canned fixed Uuid per session, `sessionFile` a fake absolute path
  whose basename matches the fixture session file name (`0f3c9a7e.jsonl` etc.),
  `line` carried over. Fixture invariant to keep: `src/util.ts` carries `@v2` from
  TWO different sessions with different bytes.
- Types: import the `Layer1Wire*` interfaces from `viewer_api_layer1.ts` — do not
  re-declare them (that is task 331's disease).

## The eight canned routes

Read each real handler first and match its exact response contract; the page is the
consumer and must not be able to tell the difference in SHAPE:

- `GET /api/layer1-view`: `{...Layer1WireView}` via `sendJson`; when `progress=1`,
  answer through `streamNdjsonBuild` (import from viewer_api_layer1_route.ts) with a
  build that just returns the canned view — a final line with no progress lines is
  valid framing. Ignore `dir`/`repo` params entirely: NO existence checks (that is
  the point — no folder exists).
- `GET /api/layer1-refs`: `Layer1RefsView` — `branches` from the fixture's `BRANCHES`
  array, `head` = its first entry, `commits` = COMMITS mapped to `RepoCommitRow`
  (read viewer_api_repo.ts for that row's exact fields), newest first.
- `GET /api/layer1-sessions`: `{ sessions: Layer1WireSession[] }` — file (basename),
  fullPath (fake absolute), title = the session's FIRST titles entry (or "" when
  unnamed), started/ended ISO, paths. `progress=1` → same streamNdjsonBuild shape.
- `GET /api/layer1-file`: read viewer_api_layer1_file.ts and mirror both branches:
  text answers JSON `{ content, title? }` (title only for snapshot requests, from the
  fixture's title-range lookup — port `titleAt` from fixture.js); `binary=1` answers
  raw bytes with Content-Type. Content comes from the ported `contentLines`, keyed by
  (path, kind: commit hash | snapshot version+session | working tree).
- `GET /api/layer1-diff`: refactor-for-reuse, minimal: export ONE
  `buildLayer1DiffPayload(baseLines, targetLines, wantsFullContext)` from
  `viewer_api_layer1_diff.ts` containing the existing runGitUnifiedDiff +
  buildAllContextHunk logic, call it from the real handler (behavior identical) AND
  from the fixture handler with canned lines. No copy of the identical-sides rule.
- `GET/POST /api/layer1-settings`: read viewer_api_layer1_settings.ts for
  `Layer1Settings`' shape; GET answers a canned settings object whose one project
  points at fake dir/repo/jsonl paths (this is what lets the page auto-boot with no
  real folder); POST answers success WITHOUT touching disk.
- `GET /api/scan-source`: read handleScanSourceRequest for the shape; answer counts
  consistent with the fixture (e.g. jsonl count = SESSIONS length).

## Unit tests (node --test, capture-free) — WRITTEN FIRST (RED)

NEW `jfred/tests/viewer_api_layer1_fixture.test.ts`, authored BEFORE the modules it
tests exist (strict red-green per ~/.claude/guides/tdd.md): one behavior per test
function, named `test_<behavior>`, each with plain-English step comments stating what
that step proves — the shape every existing tests/*.test.ts already follows.

1. `test_fixture_data_module_imports_without_throwing` — the ported self-check passed;
2. `test_fixture_view_axis_offsets_accumulate` — every pair's node axisPx ascend along
   its ladder AND each ruler tick's axisPx >= its predecessor's;
3. `test_snapshot_free_pair_omits_the_snapshots_key` — the Layer-1-identical case;
4. `test_util_ts_carries_v2_from_two_different_sessions` — same version number, two
   distinct sessionFiles, different bytes from the content map;
5. `test_identical_sides_with_full_context_answer_the_synthesized_hunk` — guards the
   diff-payload refactor.

RED is authorship order, not execution: the implement pass runs typecheck ONLY (repo
rule); the suite executes at close time. Load nothing live (no ~/.claude fallback —
memory trap: tests must not reach the real file-history).

## Harness re-point (jfred/scripts/visual/mockup.ts)

- Replace the python static server + MOCKUP_DIR with the run.ts boot precedent:
  spawn `node_modules/.bin/tsx src/viewer_server.ts --projects-dir <any existing
  folder, e.g. the repo's own scripts dir> --port <free> --fixture`, wait on
  `/app/layer1.html`, navigate there.
- Run the existing check functions unchanged first. Every check that fails is
  CLASSIFIED, not deleted: (a) real gap in the page → leave failing and list it,
  (b) mockup-only behavior never ported → list it as such (it may switch to the
  layer2.ts-style selector the real page uses — mockup DOM ids like `data-layer`
  buttons and `layer-h1` may not exist; consult scripts/visual/layer2-checks.ts,
  which ALREADY drives the real page, for the real page's selectors and reuse its
  helpers where a mockup check has a real-page twin there).
- Write the classification into the implementation notes file (it feeds the closure
  note). Do NOT chase down and fix page gaps in this task — listing them is the
  deliverable; fixes are follow-up tasks.
- Keep `npm run` script names working: whatever script invokes mockup.ts today keeps
  invoking it (check package.json scripts and leave names unchanged).

## Order

1. Unit tests authored (RED). 2. Data module(s) + self-check port.
3. View builder + route handlers (GREEN). 4. Diff-payload refactor (its test is #5
above, already authored).
5. `--fixture` flag + dispatch branch + comment fix. 6. Harness re-point +
classification list. 7. `npm run typecheck` (both tsconfigs) — NOTHING else runs in
the implement pass; suites and the visual loop run at close time.

## Verify (close-time, from the task)

- `tsx src/viewer_server.ts --projects-dir <x> --fixture` serves /app/layer1.html
  rendering the fixture with no project folder, git repo, or JSONL configured.
- `git -C jfred diff --stat -- webapp/` is EMPTY.
- Flag off: no behavior change (real-project view unaffected).
- Re-pointed check script runs; uncarryable checks listed + classified, none
  silently dropped.

## Traps

- viewer_server.ts and the routes file sit near the 250-line cap — count lines after
  editing.
- Instants must be `Date`s when fed to layOutNodeLadders (NodeLadder = Instant[]),
  and ISO strings on the wire exactly where the real payloads emit strings — copy the
  real serialization (sendJson of a Date yields ISO via toJSON; that is what the page
  already parses).
- `Path`/`Uuid` are the repo's domain types (strict-typing memory) — canned values
  still construct them, no bare strings where the wire type says otherwise.
- The comment-reflow hook may churn files on save; re-apply, don't fight.
