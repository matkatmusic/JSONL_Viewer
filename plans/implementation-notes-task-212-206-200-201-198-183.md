## 2026-07-24:20:42:00 — Tasks 198 + 183 (layer-1 anchors; per-file debug viewer)
Chat title: task 212 206 200 201 198 183
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/21b66b94-ba20-4cc9-97f9-608329fc3675.jsonl

### References

- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks198-183-plan.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md (S2)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/SPEC.md (S10)

### Design decisions

- Tasks 212/206/200/201 were found already implemented, tested, and committed at
  jfred@43b8a5d — closed them (moved to completedTasks.json, dependents 202/207/213
  unblocked, spec statuses flipped to done) instead of re-implementing.
- Task 198: an Edit's populated `originalFile` becomes a beacon carrying the PRE-edit bytes at
  the edit's instant (the post-edit content is derived, not verified — layer-5 territory). A
  null wire `originalFile` counts as unpopulated (`typeof === "string"` gate), an empty string
  as populated (an empty file is full content).
- Task 198: a complete Read echo means `startLine === 1 && numLines === totalLines`; a partial
  window stays a byteless pre-anchor stub. Read echoes never reach `extractFileEvents`, so
  `collectReadEchoNodes` (layered_anchor.ts) gathers them straight from the records; the
  tool-name filter runs BEFORE result resolution because `getToolResultForUserRecord` throws
  on unmodeled tool names by design (exported the previously-private `resolveToolNameForRecord`
  from tool-results.ts for that filter — its canonical home, no shim).
- Byte-op refusal is `requireNodeContent`: beacon/endState hand out bytes; every other node
  kind throws. `selectAnchorNode` = first beacon of the instant-ordered timeline (Q14).
- Task 183: the endpoint reuses the proven task-182/192 surviving-branch fast path
  (`reconstructSurvivingFileHistory`) over the same merged multi-source composition
  `buildProjectReconstruction` uses (overrides → resolve → load → merge → sidecar reader). The
  no-`file` mode lists `distinctFinalPaths` over the surviving records so the page has a picker.
- The debug page is served by the existing `/app/*` static route as `/app/debug.html` — the
  only viewer_server.ts change is the 2-line route dispatch + 1 import (file was at 240/250).
- `getRequiredElementById` moved from layered-app.ts (private) to webapp/app-dom.ts and is
  imported by both pages (DRY, one canonical home).

### Deviations

- `tests/layered_load.test.ts` `test_loadLayeredProject_yields_one_entity_per_evidenced_file`
  previously asserted the Edit-with-originalFile node is a preAnchorStub; task 198's S2 mapping
  makes it a beacon, so the assertion was updated (the old comment itself said "S2 refines").
- The plan said "run nothing" — the repo's Stop hook auto-runs affected tests after every edit
  regardless; all edited test files ended green in those hook runs. The user's own full-suite
  run is still the acceptance gate.

### Tradeoffs

- The file-list mode omits script-born paths that only a sandbox execution would discover
  (running scripts for a mere listing is too heavy); a deep-linked ladder request still finds
  them because the fast path appends script moves itself. Marked with a ponytail comment in
  viewer_api_ladder.ts.
- Ladder JSON is the raw engine `FileHistory` (LineEntry sighting histories included) — verbose,
  but this is a debug surface and task 184 (rendering) decides what to show.

### Open questions

- None blocking. Task 199 (end-state + presumption-gap nodes) is the next S2 half; task 184
  renders the ladder this endpoint serves.
