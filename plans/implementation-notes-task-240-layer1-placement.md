# Implementation notes — task 240 (Layer 1 axisPx placement test, spec S18)

- **Timestamp:** 2026-07-25
- **Topic:** Task 240 — axisPx vertical-placement test for `GET /api/layer1-view`
- **Session JSONL:** `/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b97bdfe7-d6f6-4031-ac4c-427012b322fc.jsonl`

## References

- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-240-plan.md`
- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md` (S18)
- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-task-235-layer1-view-endpoint.md`
- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1_ruler_axis.test.ts` (task 234, the resolver's isolation test)

## The ladder, derived by hand

Every expected pixel in the new test comes from this table, computed from the pinned fixture
instants rather than from what the endpoint emitted:

| instant | source | gap from previous | gap px | axisPx |
|---|---|---|---|---|
| 2026-05-20T10:00Z | `early.txt` mtime | — | — | **0** |
| 2026-07-01T10:00Z | first commit | 1008 h | `min(2520, 24)` | **24** |
| 2026-07-01T15:00Z | second commit | 5 h | 12.5 | **36.5** |
| 2026-07-01T18:00Z | `shared.txt` mtime | 3 h | 7.5 | **44** |
| 2026-07-02T14:00Z | `disk-only.txt` mtime | 20 h | `min(50, 24)` | **68** |

All five values are exact in binary floating point, so `deepEqual` on them is safe.

## Design decisions

- **Fixture extended, not replaced.** One file (`early.txt`, mtime six weeks before the first
  commit) and one retimed instant (second commit 14:00 → 15:00) cover all three gaps the task
  names: the pre-first-commit disk orphan, a multi-member bucket, and both locked cap cases
  (5 h → 12.5 px, 6 weeks → exactly 24 px) with the cap accumulating to 68.
- **`early.txt`'s name is load-bearing.** `walkCurrentFileState` sorts by relative path, so the
  disk walk yields `disk-only.txt` first while the instants run the other way. A `diskOrphans`
  bucket returned in walk order rather than instant order therefore fails — which is the point,
  since the page places a bucket at `rows[0].axisPx` with no `Math.min` of its own.
- **No new fields on the wire.** The shape is frozen (absolute `axisPx` per node, no per-pair
  widget offset). "A pair widget sits at its FIRST commit" is `pair.commits[0].axisPx` by
  construction, so it is not asserted; the widget-relative subtraction is task 237's DOM test.
- **Expectations are hardcoded, never computed.** The test does not call `resolveInstantOffsets`
  or re-implement the 2.5 px/hr and 24 px rule; doing so would make it agree with any bug.

## Deviations from the plan

- **The plan said "no new test file"; the work produced two.** The extended fixture pushed
  `tests/viewer_api_layer1.test.ts` to 255 lines against the repo's 250-line cap. Split per the
  established precedent (`tests/layered-app-widgets.test.ts` carved out of
  `tests/layered-app.test.ts`): `viewer_api_layer1.test.ts` keeps the path and bad-input cases,
  new `viewer_api_layer1_placement.test.ts` takes the three placement cases.
- **A third file appeared: `tests/layer1-view-test-helpers.ts`.** Duplicating the fixture across
  the two files would have violated `plans/coding-requirements.md` §3 and re-inflated both files,
  so the instants, pixel ladder, wire types, fixture builders and the spawn/wait harness were
  extracted. Each test file still spawns and kills its OWN viewer on its OWN port
  (`viewer_api_layer1.test.ts` 18900, `viewer_api_layer1_placement.test.ts` 19400) — the helper
  never owns a running server.
- **No fifth `test(...)` was added for the pre-first-commit orphan on its own.** The case is
  asserted where it is observable: `ruler[0]` at 0 in the ruler test, the first commit at 24 (not
  0) in the pair-node test, and `diskOrphans[0]` in the bucket test. A separate test would
  re-request the same view to restate the same numbers.

## Tradeoffs

- Considered adding a second git orphan so `gitOrphans` would also be multi-member. Skipped:
  both buckets are sorted by the same `orderRowsByInstant` helper in `src/viewer_api_layer1.ts`,
  so one multi-member bucket proves the ordering for both. Marked with a `// ponytail:` comment at
  the assertion.
- Considered leaving `viewer_api_layer1.test.ts` untouched and putting the whole extended fixture
  only in the new file. Rejected: the two files would then have diverging fixtures, and the path
  test would silently stop covering a multi-member bucket.

## Verification status

- `npx tsc --noEmit` is clean for all three files. The only error in the project is in
  `tests/layer1-page.test.ts`, which belongs to the concurrent task-237 work, not this task.
- Line counts: 84 / 134 / 152 — all under the 250-line cap.
- Per instruction, no test suite was executed by this task; the repo's Stop hook ran it.

## Open questions

- None blocking. The endpoint in `src/viewer_api_layer1.ts` was NOT modified: every value it
  emitted matched the hand-derived ladder, so no defect was found.
