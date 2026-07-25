# Plan — tasks 198 + 183

Two independent tasks, implemented in order (198 first: pure engine, no server).
All code lives in the `jfred/` submodule. Follow `plans/coding-requirements.md`
(domain types, vocabulary single-source, DRY, enum-member comparisons, verb-named
functions) and strict red-green TDD (`~/.claude/guides/tdd.md`): write each test
file first with plain-English step comments, then the minimum code. **Do not run
tests or suites — the user runs them after the work is staged.**

---

## Task 198 — Layer 1: anchor selection + pre-anchor stubs with byte-op refusal (spec S2)

Ground truth already in place:

- `src/layered_types.ts` — `BeaconNode` / `PreAnchorStubNode` / `EndStateNode` /
  `PresumedUserEditNode` / `ScriptRunNode`, `Timeline`. The first beacon of a
  timeline is its ANCHOR (Q14 comment on `BeaconNode`).
- `src/layered_load.ts` — `buildNodeFromEvent` currently maps only
  `EventKind.write` / `EventKind.userEdit` to beacons
  (`checkEventCarriesFullContent`); everything else becomes a stub.
- Commit-blob beacons = `src/layered_git_beacons.ts` (task 200); snapshot
  beacons = `src/layered_snapshot_beacons.ts` (task 201). Both already emit
  `BeaconNode`s, so those two evidence classes need no new code — the missing
  full-content classes are **populated `originalFile` on an Edit** and a
  **complete Read echo**.

### New module: `src/layered_anchor.ts`, tests in `tests/layered_anchor.test.ts`

Naming follows the sibling modules (`layered_git_beacons.ts` etc.). Header
comment: task 198, spec S2.

#### Phase A — anchor query + byte-op refusal

1. Write `tests/layered_anchor.test.ts` (RED) with these tests, each with
   plain-English step comments; build nodes inline as object literals typed
   against `layered_types.ts` (`LayeredNodeKind` members from
   `structures/vocabulary.ts`, `new Date(...)` instants, `Path` for
   `sessionFile`):
   - `test_selectAnchorNode_returns_first_beacon_of_timeline` — timeline of
     [stub, stub, beacon A, beacon B] (instants ascending) → returns beacon A.
   - `test_selectAnchorNode_returns_undefined_when_timeline_has_no_beacon` —
     stubs only → `undefined`.
   - `test_requireNodeContent_returns_beacon_content` — beacon → its `content`.
   - `test_requireNodeContent_returns_end_state_content` — endState node → its
     `content`.
   - `test_requireNodeContent_refuses_pre_anchor_stub` — `assert.throws`; the
     error message must name the refusal (contains "pre-anchor stub" and
     "byte").
   - `test_requireNodeContent_refuses_presumed_user_edit_node` —
     `assert.throws` (a gap node is byteless too).
2. Implement in `src/layered_anchor.ts` (GREEN):
   - `selectAnchorNode(timeline: Timeline): BeaconNode | undefined` — the first
     node whose `kind === LayeredNodeKind.beacon` (nodes are already
     instant-ordered by the loader). Compare via the enum member.
   - `requireNodeContent(node: TimelineNode): string` — beacon and endState
     return `node.content`; every other kind throws
     `Error("<kind> node refuses byte operations (display/placement only)")`.
     Structure the conditionals per
     `~/.claude/guides/single-condition-branching.md`.

#### Phase B — the two missing full-content evidence classes

3. Add RED tests. Fixture records come from
   `tests/multi-source-test-helpers.ts` (`makeSourceTree`,
   `buildPromptRecord`, `buildWriteRecordPair`, `writeTranscriptFixture`,
   `SESSION_A`) and are loaded through `loadLayeredProject` — never via a raw
   reader, so the sidecar fallback trap (tasks 172/173 memory) is avoided.
   Check the helper file first: if it has no Edit-record or Read-record pair
   builder, add `buildEditRecordPair` / `buildReadRecordPair` there following
   `buildWriteRecordPair`'s shape (assistant `tool_use` record + user
   `tool_result` record whose `toolUseResult` carries the tool's result
   payload; see `structures/tool-results.ts` for the exact field names:
   `EditResult` = `{filePath, oldString, newString, originalFile,
   structuredPatch, userModified, replaceAll}`, `ReadResult` =
   `{type, file: {filePath, content, numLines, startLine, totalLines}}`).
   - `test_edit_with_populated_originalFile_becomes_a_beacon` — one Edit whose
     result carries `originalFile: "before\n"` → the file's timeline has a
     beacon whose `content === "before\n"`.
   - `test_edit_without_originalFile_stays_a_pre_anchor_stub` — Edit result
     with the `originalFile` key absent → stub node.
   - `test_complete_read_echo_becomes_a_beacon` — Read result with
     `startLine: 1, numLines: 2, totalLines: 2`, `content: "a\nb\n"` → beacon
     carrying those bytes.
   - `test_partial_read_echo_stays_a_pre_anchor_stub` — `startLine: 1,
     numLines: 1, totalLines: 3` → stub (a byteless mention: partial bytes are
     not full content).
   - `test_anchor_skips_pre_anchor_stubs_before_first_full_content_evidence` —
     one session: partial Read at t1, Edit-without-originalFile at t2, Write at
     t3 → `selectAnchorNode` on the loaded timeline returns the t3 write
     beacon, and the two earlier nodes are `preAnchorStub`s.
4. GREEN — smallest changes:
   - `src/layered_load.ts`: extend the event→node mapping so an
     `EventKind.edit` event with `originalFile !== undefined` becomes a beacon
     whose `content` is the `originalFile` bytes (evidence = the Edit's
     `JsonlRef`, instant = the event timestamp). Keep the existing
     write/userEdit beacon path; everything else stays a stub. Update the
     module-header + `buildNodeFromEvent` comments (S2 now owns this mapping —
     drop the "S1 places rows / S2 refines" ponytail note).
   - Read echoes never reach `extractFileEvents`, so collect them from the
     records directly. Put the logic in `src/layered_anchor.ts`:
     `collectReadEchoNodes(records, sessionFile): Array<{ target: Path; node:
     TimelineNode }>` — for each user record whose resolved tool result
     (`getToolResultForUserRecord`, `structures/tool-results.ts`) is
     `ToolName.Read` (enum member comparison): complete echo
     (`startLine === 1 && numLines === totalLines`) → `BeaconNode` with the
     echo `content`; otherwise → `PreAnchorStubNode`. Target =
     `result.file.filePath`; instant = the record's hydrated `timestamp`;
     evidence = `{ sessionFile, line: getRecordSource(record).lineNumber }`
     (skip records with no source, mirroring
     `collectToolUseRefsFromRecord`).
   - `src/layered_load.ts` `collectSessionNodes`: after the event loop, append
     `collectReadEchoNodes(records, sessionFile)` results into the same
     file→session→nodes map (extract the existing "get-or-create the node
     list" lines into a small helper so both call sites share it — DRY).
   - Line-cap check: `layered_load.ts` is 172 lines; the additions must keep it
     under 250. The read-echo logic living in `layered_anchor.ts` keeps the
     loader delta to ~15 lines.

### Spec bookkeeping (RevEng repo)

- `specs/from-scratch-SPEC.md` S2: change `- Status: open` to
  `- Status: open (#198 implemented 2026-07-24, staged — anchor selection +
  byte-op refusal, layered_anchor.ts; #199 open)`.
- Leave task 198 OPEN in `tasks.json` (closure happens after the user's green
  test run).

---

## Task 183 — per-file debug viewer: `/api/file-ladder` endpoint + page skeleton

The revision-ladder producer already exists and is proven on real data (task
182): `reconstructSurvivingFileHistory(records, target, reader)` in
`src/reconstruction_target.ts` returns a `FileHistory` (`{target, revisions}`)
— serve exactly that. Ladder *rendering* is task 184; this task is the
endpoint, file selection, and deep-link only.

#### Phase C — server endpoint (`src/viewer_api_ladder.ts`)

5. Write `tests/viewer_api_ladder.test.ts` (RED) by copying the
   spawned-process pattern of `tests/viewer_api_layered.test.ts` verbatim
   (fixture tree via `makeSourceTree`; project name
   `"-ladder-api-project"`; port base `18400 + (process.pid % 500)` — a base no
   other test file uses). Fixture: one prompt + one `buildWriteRecordPair`
   writing `alpha.py` with `"line one\n"`. Tests:
   - `test_file_ladder_endpoint_lists_final_paths` —
     `GET /api/file-ladder?project=<name>` → 200,
     `{ files: [<alphaPath>] }`.
   - `test_file_ladder_endpoint_returns_one_files_revision_ladder` —
     `GET /api/file-ladder?project=<name>&file=<alphaPath>` → 200; body
     `target` ends with `alpha.py`, `revisions.length === 1`,
     `revisions[0].kind === "write"`, and its `lines` carry `"line one"`.
   - `test_file_ladder_endpoint_refuses_an_unknown_file` — `&file=/no/such.py`
     → status 400.
6. Implement `src/viewer_api_ladder.ts` (GREEN). Header comment: task 183 —
   the per-file DEBUG viewer surface, free to expose engine internals; HTTP
   wiring stays in `viewer_server.ts` (precedent: `viewer_api_layered.ts`).
   - `prepareMergedProjectRecords(projectName: string): { records:
     TranscriptRecord[]; reader: BackupReader | undefined }` — mirror
     `buildProjectReconstruction` (`src/viewer_api.ts:60-82`) exactly:
     `applyProjectOverrides(projectName)`;
     `resolveJsonlPaths(projectName, null)`; `loadProjectRecords(...)`;
     `sources = getPathOverrides().sources`; when sources are declared, merge
     via `mergeMultiSourceRecords(groupRecordsBySession(records), sources)`
     (import from the same canonical homes `viewer_api.ts` imports from);
     `reader = buildSidecarReader(merged, sources)`. This IS the "merged
     multi-source reconstruction" input the task names.
   - `handleFileLadderRequest(response: ServerResponse, query:
     URLSearchParams): void` —
     `projectName = requireParam(query, "project")`; build the merged records
     + reader once. No `file` param → respond
     `{ files: string[] }`: `selectLiveBranch(records)` →
     `extractFileEvents` → `buildRenameChain` → `distinctFinalPaths`, mapped
     `toString()` and sorted (comment: script-born paths that only a sandbox
     run would discover are absent from the *list*; a deep-linked ladder
     request still finds them because the fast path appends script moves).
     With `file` → `reconstructSurvivingFileHistory(records, new Path(file),
     reader)`; `undefined` → `throw new Error(...)` naming the file (the
     server's outer catch turns it into the standard 400); otherwise
     `sendJson(response, 200, history)` — `FileHistory` is JSON-clean
     (Path/Uuid `toJSON`, Dates → ISO), internals (kind, changeId,
     unrecoverable) ride along by design.
   - `src/viewer_server.ts`: one import line + one
     `else if (url.pathname === "/api/file-ladder")` dispatch branch, placed
     beside the `/api/layered-graph` branch. **The file is at 240 of the
     250-line cap — the additions are ≤4 lines; add nothing else here.**

#### Phase D — debug page skeleton (`webapp/debug.html` + `webapp/debug-app.ts`)

The page is served by the EXISTING `/app/*` static route as
`/app/debug.html` — zero server changes. `build:webapp` (`tsc -p
tsconfig.webapp.json`) compiles every file under `webapp/`, so
`debug-app.ts` needs no build-config change. Deep-link format:
`/app/debug.html?project=<name>&file=<path>`.

7. Write `tests/debug-app.test.ts` (RED), modeled on
   `tests/layered-app.test.ts`:
   - First add `setupDebugDom()` to `tests/webapp-dom-test-helpers.ts` —
     clone `setupLayeredDom` but read `../webapp/debug.html` (do NOT touch
     the existing helpers; `setupWebappDom` reads `webapp_old.html` — known
     trap). If a deep-linked URL is needed, give `setupDebugDom` an optional
     `search: string` parameter appended to the `Window` url.
   - `test_debug_page_renders_file_list_and_status_regions` — after
     `setupDebugDom()` + importing `../webapp/debug-app.ts`:
     `#debug-file-list` and `#debug-status` exist.
   - `test_renderDebugFileList_builds_deep_link_anchors` — call
     `renderDebugFileList("proj", ["/w/alpha.py"])`; `#debug-file-list`
     contains an `<a>` whose `href` ends with
     `/app/debug.html?project=proj&file=` + the URL-encoded path and whose
     text is the path.
   - `test_debug_boot_without_project_shows_guidance` — no `?project` →
     `#debug-status` text contains "no project selected".
   - `test_debug_boot_with_project_fetches_and_renders_file_list` —
     `setupDebugDom("?project=proj")`, `stubFetchRoutes({"/api/file-ladder":
     { files: ["/w/alpha.py"] }})`, import, `await flushAsyncWork()` → the
     file list holds one deep-link anchor.
   - `test_debug_boot_with_deep_linked_file_shows_revision_count` —
     `setupDebugDom("?project=proj&file=%2Fw%2Falpha.py")`,
     `stubFetchRoutes({"/api/file-ladder": { target: "/w/alpha.py",
     revisions: [{}, {}] }})` → `#debug-status` text contains
     "2 revision". (Boot makes exactly ONE fetch per page load — list mode
     or ladder mode — so the single-payload-per-pathname stub suffices.)
8. Implement (GREEN):
   - `webapp/debug.html` — minimal skeleton: title
     "JFRED — Per-file Debug Viewer", a header with a link back to `/`, a
     `<main>` holding `#debug-status` and `#debug-file-list`, and
     `<script type="module" src="/app/debug-app.js">`. Reuse
     `/app/layered-styles.css` for the stylesheet link; no new CSS file (the
     skeleton needs no styling of its own — task 184 owns the ladder view).
   - `webapp/debug-app.ts` — check `webapp/app-dom.ts` first for an existing
     required-element helper and reuse it if one exists (one canonical home —
     no re-implementation; `layered-app.ts`'s copy is private, do not export
     it retroactively unless app-dom has nothing). Exports:
     - `renderDebugFileList(projectName: string, files: string[]): void` —
       anchors with the deep-link `href`s described by the test.
     - `renderDebugStatus(text: string): void` — sets `#debug-status`.
     - `bootDebugApp(): Promise<void>` — read `project` / `file` from
       `location.search`. No project → `renderDebugStatus("no project
       selected — open /app/debug.html?project=<name>")`. Project only →
       fetch `/api/file-ladder?project=...`, render the list, status
       "select a file". Project + file → fetch with `&file=`, then
       `renderDebugStatus(`${file}: ${revisions.length} revision(s) loaded`)`
       (rendering the ladder itself is task 184; leave a one-line comment
       saying so). Failed fetch → status shows the failure text.
     - Module tail calls `bootDebugApp()` fire-and-forget (`void`), same as
       `layered-app.ts`.

### Spec bookkeeping (RevEng repo)

- Task 183's S10 lives in `specs/SPEC.md` (the per-file-target spec, not
  from-scratch-SPEC.md) — find the S10 entry referencing task 183 and mark it
  implemented/staged with today's date. If no such spec line exists, skip.
- Leave task 183 OPEN in `tasks.json`.

---

## Ordering + verification

1. Phase A → B (task 198), then C → D (task 183); each phase writes its RED
   tests before its code.
2. After both: run NOTHING (user runs the suite). Do a `tsc`-free visual pass
   only.
3. Stage everything in `jfred/` and the spec edits in RevEng; no commits.
