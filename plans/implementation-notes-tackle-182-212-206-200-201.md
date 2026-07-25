# Implementation notes — tackle-tasks 182 212 206 200 201

## 2026-07-24 — Batch: task-182 closure + tasks 200/201/206/212 implementation
- Conversation: tackle-tasks 182 212 206 200 201 (session a169f2d4-bb7e-4e8f-af6c-34f5830d7334)
- JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/a169f2d4-bb7e-4e8f-af6c-34f5830d7334.jsonl

## References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-212-206-200-201-plan.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-target.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/SPEC.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/mvp-app-mockup.html

## Task 182 (closed this session, no code change)
The attempt-4 ladder JSON was validated directly: revision 0 (the gitBase
write), reconstructed as line-joined text + trailing newline, git-hashes to
exactly `9d14d60df7aebcba8455bdea7d6b817bca572fe6`. The 33 non-seed revisions
trace to all 18 distinct source Edit records (11 multi-hunk Edits emit one
ladder step per hunk — consecutive duplicates with identical timestamps,
expected engine behavior) plus 2 sidecar snapshots (`04b5333dde2392bd@v2/@v4`).
No mismatch. Documented in plans/166-per-file-target.md; task closed, spec S9
marked done, tasks 183/186/188 unblocked.

## Design decisions
- **Tasks 200/201 are standalone node producers** (`layered_git_beacons.ts`,
  `layered_snapshot_beacons.ts`) — NOT wired into `loadLayeredProject`.
  Merging beacons onto session timelines is S5/task 202's contract; wiring
  early would prejudge the merge shape.
- **Snapshot beacons carry `evidence: undefined`** (task 201). The reused
  `buildBackupTimeline` doesn't carry JSONL line refs, and `BeaconNode`
  already allows undefined evidence for git beacons; the type comment in
  `layered_types.ts` was extended to name the sidecar case. Add line refs
  when a display layer (S13) actually needs snapshot provenance.
- **Endpoint traversal guard = scanProjects membership** (task 206), the same
  posture as `resolveJsonlPaths`' legacy branch; unknown names 400 via the
  server's outer catch.
- **Graph serialized as-is** (task 206): `Path`/`Uuid` have `toJSON`, `Date`
  goes ISO — no wire-mapping layer. The page types the parsed JSON with a
  minimal local `WireLayeredGraph` interface instead of the engine types.
- **`loadLayeredGraphIntoDrawer(projectName = from location.search)`** — the
  optional parameter keeps production callers argument-free while letting the
  DOM test inject a project without faking `location`.
- **Legend is static markup + CSS only** (task 212): `.layered-timeline`
  became a non-scrolling flex column; the new `.layered-timeline-scroll`
  child is the ONLY overflow container, so the legend above it can never
  scroll away. Legend vocabulary copied from plans/mvp-app-mockup.html;
  swatch colors are placeholders until S8's visual pass.

## Deviations from the plan
- None of substance. The layered-app fetch test's stub graph moved into a
  `buildWireGraphFixture()` helper (Stop-hook deep-nesting rule).

## Tradeoffs
- Task 206's server test spawns a real server process (precedent:
  viewer_server.test.ts) rather than calling the handler with a fake
  response — heavier, but it exercises the actual route dispatch and the
  JSON wire form end to end, which is exactly what the spec's "server test"
  asks for. Scratch-port base 17900 avoids the other file's 17400 range.

## Verification state
- Per the tackle-tasks directive, NO test suite was run by the agent; the
  Stop hook ran per-file tests after each edit (expected RED before each
  module existed; no failures reported after the final GREEN edits).
  **Tasks 200/201/206/212 stay OPEN in tasks.json until the user's test run
  is green** — close them then.

## Open questions
- None blocking. Legend swatch colors and the `?project=` page-URL convention
  (the drawer currently loads only when the layered page is opened with
  `?project=<name>`) are both expected to be revisited by S8/S9 work
  (tasks 207–209).
