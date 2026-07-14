# Implementation notes — Item 82: loading-progress overhaul

- **Timestamp:** 2026-07-13T23:45:00-07:00
- **Topic:** Full overhaul of the project-loading progress indicator so it never reads as frozen.
- **Conversation:** tackle-tasks 82
- **Session JSONL:** `/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/9cfec59b-f9af-4c1b-bd2f-1a7d25496e4e.jsonl`

## References

- Plan: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item82-loading-progress-overhaul.md`
- Visual contract (approved mockup): `/Users/matkatmusicllc/Desktop/claude code src/RevEng/mockups/loading-progress.html`
- Task source: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md` (item 82)
- Raw capture used to drive the mockup + diagnosis: `<scratchpad>/real-stream.json`
  (capture scripts: `<scratchpad>/wait-then-capture.mjs`, `<scratchpad>/capture.mjs`)

## What was built (files touched)

- `src/viewer_api.ts` — `PROGRESS_LABEL_SERIALIZING_DOCUMENT`, `formatSendingDocumentLabel(byteLength)`,
  `RECORD_PROGRESS_MAX_LINES = 50`, `computeRecordProgressStride(total)`; throttled `replayRecordProgress`.
- `src/viewer_server.ts` — progress path now brackets the document serialize/transfer with
  `serializing document` (before `JSON.stringify`) and `sending document (N MB)` (after, from `Buffer.byteLength`).
- `webapp/app.ts` — `LOAD_PHASES` / `LOAD_PHASE_COUNT` / `classifyLoadPhase`; reworked
  `showLoadingProgress` (phase header, ticking elapsed clock via `setInterval`, phase bar, shimmer
  on non-finite fraction); `hideLoadingProgress` clears the timer and resets state; `reportStreamProgress`
  drives the indicator on EVERY line; `LARGE_PAYLOAD_BYTES` + `formatMegabytes` + a `parsing document — N MB`
  label and paint-yield before the terminal `JSON.parse` in `fetchDocument`.
- `webapp/styles.css` — `.timeline-progress-header/-phase/-elapsed`, `position: relative` on the track,
  the `.indeterminate` shimmer rule + `@keyframes timeline-progress-slide`.
- `webapp/views/timeline.ts` (follow-up) — closes the blank/unresponsive gap between "transferring
  document" and "Building timeline": `renderTimelineView` now shows `preparing timeline…`
  (indeterminate) and yields one frame BEFORE the synchronous `buildTurnTimelineViewModel` over the
  whole document, so the shimmer paints and keeps animating on the compositor while that build blocks
  the main thread. `"preparing timeline"` added to the phase-6 matcher in `app.ts`.
- **Server boot-id consent reset** (follow-up) — script-consent choices live in the browser's
  `sessionStorage`, which survives both a page reload AND a server restart, so relaunching the server
  (to drop the sandbox memo) never re-prompted. Fix: `viewer_server.ts` mints `SERVER_BOOT_ID =
  randomUUID()` per process and returns it as `bootId` on GET/POST `/api/config`; the client's
  `reconcileServerBootId` (`webapp/app.ts`, called in `initializeHeader` before the bootstrap
  `renderRoute`) clears every `consent:*` key when the stored boot id differs, then records the new
  one. Boot id kept a plain string (a launch nonce, not a parsed domain id). Covered by
  `test_reconcileServerBootId_clears_consent_only_when_boot_id_changes` (sessionStorage stubbed).
- `tests/loading-progress.test.ts` (new) — A1 size-label, B1 stride + cache-hit throttle integration, C1 classifier.
- `tests/viewer-progress.test.ts` — updated `test_document_request_sequence_walks_records_once_when_cached`
  to the throttled contract (bounded + strictly monotonic + reaches 100%).

## Design decisions (where the spec left choices)

- **Root cause corrected by real data.** The plan's initial hypothesis (finer progress inside
  `buildStepSnapshots`/`buildLineVerdicts`) was NOT the observed freeze on the tested project. A real
  capture of `jot-backup` showed the load is a cache hit whose pain is the **67.1 MB document**:
  ~4s warm / 33s cold of server `JSON.stringify` + browser `JSON.parse`, both outside any progress
  line. The implementation targets that instead. The build-stage granularity idea is dropped, not deferred —
  it would not have moved the needle on the captured case.
- **"Walked once" invariant** in the updated cache-replay test is now **strict monotonicity of `current`**
  rather than `count === recordCount` — throttling breaks the equality but a double replay would reset
  `current`, which monotonicity still catches. Stronger than a bare count bound.
- **Phase-6 matcher** keys on `"building timeline"` (the real label from
  `computeTimelineBuildProgressLabel` = `"Building timeline… N / total rows"`), plus `"rendering timeline"`
  for robustness.
- **`replayRecordProgress` stays module-private.** B1 tests the throttle through the public
  `loadProjectRecords` (existing pattern) + the exported `computeRecordProgressStride` — no test-only export.

## Deviations from the plan

- None structural. The plan already anticipated all edits; the only refinement was the monotonicity
  assertion above (the plan said "bounded"; monotonic is a strict superset that also preserves the
  original test's intent).

## Tradeoffs

- **Bracket labels, not sub-progress, for the 67 MB steps.** A single `JSON.stringify`/`JSON.parse`
  can't be subdivided without chunking the payload — out of scope. An honest label before each + an
  animated client indicator (elapsed clock + shimmer) is the small-diff fix that removes the "frozen"
  perception. Chunking/streaming the document is the real lever and is left as a separate task.
- **Cold per-record parse flood left as-is.** Only the cache-hit *replay* was throttled (the captured
  case). Throttling the genuine cold parse in `src/parse/loadTranscript.ts` is a bigger, lower-value
  change and is out of scope.
- **`LARGE_PAYLOAD_BYTES = 200_000`** size-gates the "parsing document" label so only the terminal
  payload triggers the paint-yield; progress lines (tiny) still parse inline. A fixed threshold is
  simpler than tracking which line is terminal and is safe because only the document is ever this large.

## Open questions (for the user)

1. **Cold-path visual verify is gone for now.** The jot-backup document + records are now warm-cached
   (my captures built them), so the 33s cold stall won't recur without a server reset
   (`--resetDocumentCache` or a fresh respawn). To watch the New indicator ride the *cold* path, reset
   and reload; otherwise the warm path (~4s serialize stall) still exercises the shimmer + elapsed clock.
2. **Phase count = 6** and the phase names are my mapping of the real stage vocabulary. If you'd prefer
   different groupings/labels (e.g. splitting "Building document" from the script-run sub-stages), say so —
   it's a one-list edit in `LOAD_PHASES` / `LOAD_PHASE_MATCHERS`.

Neither blocks the work; both are confirm-or-tweak, not direction changes — so I proceeded.

## Verification status

- `tsc --noEmit` (src) and `tsc -p tsconfig.webapp.json --noEmit` (webapp): clean.
- Per your instruction I did not run the test suite; the edit hook auto-ran it and the updated
  cache-replay test passed after the throttle fix. Client overlay behaviour is your standing
  visual-verify (rebuild via `npm run app`, load a project).
