# Task 122 — add the per-file test files the jot hook wants (jfred)

All work happens in the jfred submodule checkout:
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred` — NEVER in
`~/Programming/jfred`. All relative paths below are relative to that jfred root.

User decisions already made (do not re-ask):
1. Add the per-file test files (not accept the convention gap).
2. Add **happy-dom** as a **dev-only** dependency to provide the DOM for the two
   webapp tests under `node --test`.

The pytest arm needs NO work: `jfredToolsPlugin/tests/test_lint_scenario.py`
already exists under the importable name; the hyphenated `test_lint-scenario.py`
stays absent. Do not create it.

## Hard constraints

- **Do NOT run any test or suite** (`npm test`, `pytest`, `node --test` — none).
  The user runs them afterward. TDD ordering still applies structurally: write
  each test file BEFORE touching any source it exercises (no source changes are
  expected at all — these are tests for existing behavior).
- Verification is limited to: `npm run typecheck` (in jfred) and
  `python3 ~/Programming/jot/common/scripts/filesize_check.py <file>` on every
  created file (250-line cap).
- Stage all changes with `git add` (run inside the jfred checkout); do NOT commit.
- Test runner is `node --test` via `npm test` with `tsx` — NOT vitest. No
  `vi.mock` / module mocking exists; all stubbing is done through globals.
- Follow `plans/coding-requirements.md` (RevEng root) and the existing test-file
  conventions: `import { test } from "node:test"`, `assert` from
  `node:assert/strict`, test names `test_<behavior>`, plain-English
  Scenario/Steps comments inside each test body, 4-space indentation.

## Why each test file is shaped the way it is (context for the implementer)

- `webapp/app-header.ts` exports one function, `initializeHeader()`. It reads
  header elements by id, wires popover toggling with `stopPropagation`
  semantics, and fetches `/api/config` (and `/api/projects` when the Projects
  menu opens) through `fetchJson` from `webapp/app-fetch.ts`.
- **Every `fetchJson` call logs** via `logProgress` in `webapp/app-console.ts`,
  which calls `ensureProgressTerminal()`, which constructs the **browser-global**
  `Terminal` (xterm) and `FitAddon`, calls `getComputedStyle`, appends into
  `#progress-console`, and creates a `ResizeObserver`. In Node those globals do
  not exist, so the test helper must install fakes BEFORE any webapp module
  runs. This is why the webapp modules are imported **dynamically after** global
  setup, never via top-level `import`.
- `webapp/inspector-snapshots.ts` exports `bumpShowLineRenderCount`,
  `buildSnapshotDrawer`, `probeTrackedBackupPresence`, and the module-level
  `blobPresenceByKey` map. The probe path also goes through `fetchJson`, so it
  needs the same global setup.
- `src/reconstruction_script_beaconless.ts` exports `beaconlessScriptExecutions`
  (plain engine logic, no DOM). `tests/reconstruction_script_stage.test.ts`
  already exercises this behavior through the `injectScriptExecutions` wrapper;
  the per-file test calls `beaconlessScriptExecutions` DIRECTLY with runs
  produced by `findScriptExecutionRuns`, reusing the same synthetic-record
  fixture shape. The sandbox spawns real python for the writing scripts — the
  existing suite already does this, so it is an accepted cost.

## Phase 0 — install happy-dom (dev-only)

In the jfred root run:

```
npm install --save-dev happy-dom
```

This edits `package.json` and `package-lock.json` and installs into the existing
`node_modules`. Do not pin a version by hand — take what npm resolves.

## Phase 1 — `tests/webapp-dom-test-helpers.ts` (shared setup helper)

New file. Purpose: one place both DOM test files call to build a browser-like
global environment. Exports exactly three functions (verb names, per
coding-standards):

1. `setupWebappDom(): void`
   - Create a happy-dom window: `new Window({ url: "http://localhost:7343/" })`
     (`import { Window } from "happy-dom"`). Port 7343 matches the real viewer
     server default so `location.origin` looks authentic.
   - Assign globals with a single `Object.assign(globalThis, { ... })`:
     `window`, `document`, `location` (= `window.location`), `sessionStorage`
     (= `window.sessionStorage`), `getComputedStyle` (bound to the window),
     `HTMLElement` (= `window.HTMLElement`), `HTMLInputElement`,
     `HTMLButtonElement`, `ResizeObserver` (= `window.ResizeObserver` if happy-dom
     provides one, else a three-empty-method fake: `observe`/`unobserve`/`disconnect`),
     plus the two xterm fakes below as `Terminal` and `FitAddon`.
     TypeScript will reject direct property writes on `globalThis`; funnel the
     whole record through one `Object.assign(globalThis, ...)` call with a
     single `as Record<string, unknown>`-style cast on the record — do not
     scatter `any` casts.
   - Load the REAL header markup: read `webapp/index.html` with
     `readFileSync(new URL("../webapp/index.html", import.meta.url), "utf8")`,
     slice the text between `<body>` and `</body>`, and assign it to
     `document.body.innerHTML`. This guarantees every id `initializeHeader`
     looks up (`projects-menu`, `paths-popover`, `projects-btn`, `paths-btn`,
     `projects-dir-input`, `file-history-dir-input`, `projects-dir-change`,
     `projects-dir-open`, `file-history-dir-open`, `progress-console`,
     `progress-copy`, `console-cancel`) exists with its real attributes
     (including `hidden` on the popovers).
   - xterm fakes (module-private classes in this helper):
     - `FakeXtermTerminal` with the methods `ensureProgressTerminal` and
       `logProgress` exercise: `open(_parent)`, `writeln(_text, done?)` which
       invokes `done` if given, `scrollToBottom()`, `loadAddon(_addon)`,
       `onSelectionChange(_cb)`, `getSelection()` returning `""`,
       `registerLinkProvider(_provider)`, `resize(_cols, _rows)`.
     - The `FitAddon` global is an object `{ FitAddon: FakeXtermFitAddon }`
       (the real vendor script exposes a namespace object) where
       `FakeXtermFitAddon` has `fit()` and `proposeDimensions()` returning
       `undefined`.
     - BEFORE writing the fakes, read `webapp/app-console.ts` fully (in
       particular `fitProgressColumns`) and add any additional method it calls
       on the terminal or the fit addon so no test dies on a missing method.
   - Calling `setupWebappDom` twice must be safe (tests may re-run it); a plain
     re-assignment of all globals and `innerHTML` achieves that — no guard
     needed.

2. `stubFetchRoutes(routesByPathname: Record<string, unknown>): void`
   - Replace `globalThis.fetch` with an async function that resolves the
     request URL via `new URL(String(url), "http://localhost:7343")`, looks up
     `routesByPathname[pathname]`, and returns a minimal `Response`-like object:
     `{ ok: true, status: 200, json: async () => payload, text: async () => "" }`
     (cast once to `Response`). An unknown pathname returns
     `{ ok: false, status: 404, json: async () => ({}), text: async () => "not stubbed" }`
     so a test failure names the missing stub instead of hanging.
   - `fetchJson` (`webapp/app-fetch.ts` `fetchLogged`) only uses `response.ok`,
     `.status`, `.json()`, `.text()` — nothing more is required.

3. `flushAsyncWork(): Promise<void>`
   - `await new Promise((resolve) => setTimeout(resolve, 0))` three times in a
     loop. Rationale: `populateProjectsMenu` is fired as `void promise` from a
     click handler and `probeTrackedBackupPresence` settles a `Promise.all`;
     each needs at least one macrotask turn after the stubbed fetch resolves.

Keep this file under 250 lines (expected ~100).

## Phase 2 — `tests/app-header.test.ts`

New file. Structure:

- Top of file: `import { test } from "node:test"`, `assert`, and the three
  helpers from `./webapp-dom-test-helpers.ts`. NO top-level import of any
  `webapp/*` module.
- A module-level async initializer used by each test:

```ts
// Boot the DOM, stub the two endpoints initializeHeader touches, and run it.
async function initializeHeaderInFreshDom(): Promise<void> {
    setupWebappDom();
    stubFetchRoutes({
        "/api/config": { projectsDir: "/tmp/projects", fileHistoryDir: "/tmp/file-history", bootId: "boot-1" },
        "/api/projects": [{ name: "proj-a" }, { name: "proj-b" }],
    });
    const { initializeHeader } = await import("../webapp/app-header.ts");
    await initializeHeader();
}
```

  (The dynamic import is cached after the first call — that is fine because
  `initializeHeader` re-resolves every element by id on each call; stale
  document-level listeners from a previous test resolve ids at click time
  against the CURRENT document, so re-initialization is harmless.)

Three tests, in this order:

1. `test_initializeHeader_fills_folder_inputs_from_config`
   - Steps: boot + initialize; assert
     `(document.getElementById("projects-dir-input") as HTMLInputElement).value`
     equals `"/tmp/projects"` and the file-history input equals
     `"/tmp/file-history"`.

2. `test_projects_button_opens_menu_and_document_click_closes_it`
   - Steps: boot + initialize; assert `#projects-menu` starts hidden; call
     `.click()` on `#projects-btn` (happy-dom dispatches a real bubbling click,
     so the handler's `stopPropagation` genuinely prevents the document-level
     closer); assert `#projects-menu` is no longer hidden; `await
     flushAsyncWork()` and assert the menu now contains one `.menu-item` per
     stubbed project (2) with the project names as text; then call
     `document.body.click()` and assert BOTH `#projects-menu` and
     `#paths-popover` are hidden again.

3. `test_paths_popover_stays_open_on_inside_click`
   - Steps: boot + initialize; click `#paths-btn`; assert `#paths-popover`
     visible; click `#projects-dir-input` (an inside element whose id is NOT
     `projects-dir-change`); assert the popover is STILL visible — the inside
     click's propagation stop is the behavior under test.

Do not test the folder-change POST flow or the native folder picker — those are
`fetch`-POST plumbing with server echo, out of smoke scope for this task.

## Phase 3 — `tests/inspector-snapshots.test.ts`

New file. Same import discipline: helpers statically, the module under test via
`await import("../webapp/inspector-snapshots.ts")` AFTER `setupWebappDom()`
(its import chain pulls `app-fetch.ts`/`inspector-json.ts`, which type against
DOM but must also be safe to load — dynamic import keeps the order guaranteed).

Before writing assertions, read `webapp/inspector-links.ts` to confirm the
exact URL `computeBlobRequestUrl(sessionId, blobName)` produces — the fetch
stub for test 3 keys on that pathname (query strings are ignored by
`stubFetchRoutes` since it matches on `pathname` only, which is why the helper
matches pathname and not the full URL).

Three tests:

1. `test_bumpShowLineRenderCount_returns_strictly_increasing_counts`
   - Steps: call `bumpShowLineRenderCount()` twice; assert the second result is
     exactly the first plus one.

2. `test_buildSnapshotDrawer_close_button_removes_drawer_and_split_class`
   - Steps: create a pane `document.createElement("div")` with class
     `snapshot-drawer` added; build a `snapshotText` element the same way; call
     `buildSnapshotDrawer(pane, { relativePath: "src/a.py" } as WireTrackedBackup-shaped literal, "blob-1", snapshotText)`
     (type the entry literal via the imported `WireTrackedBackup` type from
     `../webapp/inspector-links.ts` — no `any`); append the drawer to the pane;
     assert the drawer's header text contains `"src/a.py — blob-1"`; click the
     drawer's `Close` button (`drawer.querySelector("button")`); assert the
     drawer is detached (`drawer.parentElement === null`) and the pane's class
     list no longer contains `snapshot-drawer`.

3. `test_probeTrackedBackupPresence_records_presence_and_reshows_current_line`
   - Steps: stub the blob-presence pathname to return `{ exists: true }`;
     compute `renderCountAtStart = bumpShowLineRenderCount()`; call
     `probeTrackedBackupPresence({ "src/a.py": { backupFileName: "blob-A" } }, "session-1", renderCountAtStart, showLineSpy, 7)`
     where `showLineSpy` records its calls into an array; `await
     flushAsyncWork()`; assert `blobPresenceByKey.get("session-1|blob-A") === true`
     and the spy was called exactly once with `7`.
   - Add a second scenario IN THE SAME TEST FILE as its own test only if it
     stays simple; otherwise stop at these three. (The stale-render guard —
     bumping the counter again before the probe settles suppresses the re-show —
     is the natural fourth test; include it as
     `test_probeTrackedBackupPresence_skips_reshow_after_a_newer_render` using
     blob name `"blob-B"` so the presence cache from the prior test cannot
     short-circuit the probe.)

## Phase 4 — `tests/reconstruction_script_beaconless.test.ts`

New file, engine-side, no DOM — all imports top-level and static:
`beaconlessScriptExecutions` from `../src/reconstruction_script_beaconless.ts`,
`findScriptExecutionRuns` from `../src/reconstruction_script_execution.ts`,
`Path` from `../src/structures/domain.ts`, `EventKind`, `RecordType`,
`BlockType`, `ToolName` from `../src/structures/vocabulary.ts`,
`TranscriptRecord` type from `../src/structures/envelope.ts`, `BackupReader`
type from `../src/reconstruction_sidecar.ts`.

Copy the local fixture helpers exactly as `reconstruction_script_stage.test.ts`
has them (they are deliberately file-local there, matching per-file test
convention):

```ts
// A synthetic assistant record carrying one tool_use of `name` with `input`, at `timestamp`.
function buildToolRecord(name: ToolName, input: Record<string, unknown>, timestamp: string): TranscriptRecord {
    return {
        type: RecordType.assistant,
        timestamp: new Date(timestamp),
        message: { content: [{ type: BlockType.tool_use, id: "toolu_x", name, input, caller: { type: "direct" } }] },
    } as unknown as TranscriptRecord;
}

// A reader with no backups to offer — every pre-state seed comes from the authored Writes.
const emptyReader: BackupReader = () => "";
```

Three tests, each building records then
`const runs = findScriptExecutionRuns(records);` and calling
`beaconlessScriptExecutions(target, runs, records, emptyReader)` directly:

1. `test_beaconlessScriptExecutions_injects_a_birth_for_a_script_written_target`
   - Records: Write of `/proj/runit.py` (content `"x"`) at `:01Z`, then
     `ToolName.CtxExecute` with `{ cwd: "/proj", code: 'open("out.txt", "w").write("created\\n")\n' }`
     at `:02Z`. Target `new Path("/proj/out.txt")`.
   - Assert: exactly 1 event; `kind === EventKind.scriptExecution`; `content === "created\n"`;
     `timestamp` equals the run record's timestamp (`new Date("2026-01-01T00:00:02Z")`).

2. `test_beaconlessScriptExecutions_returns_no_event_for_a_read_only_run`
   - Records: Write of `/proj/ledger.py`, then a CtxExecute whose code is
     `'print(len(open("ledger.py").read()))\n'` (no write primitive — the
     item-68 `scriptCodeMayWriteFiles` gate must bail before any sandbox work).
   - Assert: `events.length === 0`.

3. `test_beaconlessScriptExecutions_chains_a_later_run_over_the_rolling_content`
   - Records: Write of `/proj/one.py` with `"def f_one(x):\n    return x + 1\n"`;
     a `shutil.move("one.py", "core_one.py")` run at `:02Z`; a glob-rename run
     (`f_one` → `alpha` over `core_*.py`) at `:03Z`. Target
     `new Path("/proj/core_one.py")`.
   - Assert: exactly 2 events; the first event's content contains
     `"def f_one(x):"`; the second event's content contains `"def alpha(x):"`
     — proving the second run executed against the FIRST run's rolling output
     even though its script never names the born file.

## Phase 5 — verification and staging (no test runs)

1. `npm run typecheck` in the jfred root — must exit 0.
2. `python3 ~/Programming/jot/common/scripts/filesize_check.py` on each of the
   four created files — each must pass the 250-line cap.
3. From the jfred root, stage exactly:
   `git add package.json package-lock.json tests/webapp-dom-test-helpers.ts tests/app-header.test.ts tests/inspector-snapshots.test.ts tests/reconstruction_script_beaconless.test.ts`
4. Do NOT commit. Do NOT run `npm test` or `pytest`.

## Success criteria

- happy-dom present in `devDependencies` only.
- Four new files under `tests/`, all typechecking, all under the line cap, all
  staged in the jfred submodule; nothing changed under `src/` or `webapp/`.
- No test/suite execution occurred.
