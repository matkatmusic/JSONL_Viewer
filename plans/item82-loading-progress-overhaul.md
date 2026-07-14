# Item 82 — Loading-progress overhaul (never reads as frozen)

## Goal

While a project loads, the centered indicator must **always convey the current stage and
never sit static**, and the two known-silent blocking steps must be **bracketed by honest
progress lines**. Grounded in a real capture of `/api/document?progress=1` for
`-Users-matkatmusicllc-Programming-jot-backup`:

- 16 transcripts → **20,418** per-record parse lines flood in ~2.6s (re-emitted even on a
  records-cache hit).
- Document is a cache hit but **67.1 MB**.
- Frozen tail = server `JSON.stringify` (~4s warm, 33s cold) + 0.5s transfer + browser
  `JSON.parse` of 67 MB — **all outside any progress line**, so the console freezes on
  "reusing cached document artifact".

The approved mockup is `mockups/loading-progress.html`; it is the visual contract for the
client behaviour below.

## Constraints

- Follow `plans/coding-requirements.md` (domain types, wire vocabulary in
  `src/structures/vocabulary.ts`, verb-named functions, enum-member comparisons).
- Reuse the existing NDJSON stream, `reportReconstructionProgress()`/`ProgressSink`,
  `showLoadingProgress()`, and the console. This is **additive granularity + an
  always-alive indicator**, not a new transport.
- TDD: each pure helper gets its red test first. `tests/viewer-progress.test.ts` is already
  at 264 lines (over the project's ~250-line file cap) — do **not** add new tests there.
  Put all NEW item-82 tests in a new file `tests/loading-progress.test.ts` (mirror the
  imports of `viewer-progress.test.ts`: `node:test`, `node:assert/strict`, the target
  symbols from `../src/viewer_api.ts` and `../webapp/app.ts`, plus `./fixtures.ts` /
  `./utilities.ts` as needed). Only the ONE existing test that changes contract is edited
  in place in `viewer-progress.test.ts`. DOM/timing code (the overlay, the elapsed clock,
  the paint-yield) is visually verified by the user — no unit test, matching the project's
  console-helper convention.
- Do **not** run tests or the suite; the user runs them after.

---

## Part A — Server: bracket the silent document serialize/transfer

### A1 (test first) — size-label formatter

In the new `tests/loading-progress.test.ts` add:

- `test_formatSendingDocumentLabel_reports_megabytes_to_one_decimal` — assert
  `formatSendingDocumentLabel(67_100_000)` === `"sending document (67.1 MB)"` and
  `formatSendingDocumentLabel(0)` === `"sending document (0.0 MB)"`.

### A2 — implement the labels in `src/viewer_api.ts`

Beside the other `PROGRESS_LABEL_*` constants (near line 139 / 287):

```ts
// Emitted right BEFORE the two synchronous blocking steps the build's progress sink can't
// see into: JSON.stringify of the whole document (server) and its transfer. A single
// stringify/transfer can't be subdivided, so an honest label before each is what keeps the
// client from freezing on the previous line. See item 82.
export const PROGRESS_LABEL_SERIALIZING_DOCUMENT = "serializing document";

// Verb-named per coding-requirements rule 5. byteLength is a genuine numeric measure, not a
// domain value, so it stays primitive (rule 1).
export function formatSendingDocumentLabel(byteLength: number): string {
    return `sending document (${(byteLength / 1_000_000).toFixed(1)} MB)`;
}
```

### A3 — wire them into the progress path of `handleDocumentRequest`

In `src/viewer_server.ts`, the `progress=1` branch currently ends with:

```ts
const document = buildDocumentWithConsent(jsonlPaths, target, allowScripts, (event) => { ... });
response.end(JSON.stringify(document) + "\n");
```

Replace the final two statements with (import the new symbols from `./viewer_api.ts`):

```ts
const document = buildDocumentWithConsent(jsonlPaths, target, allowScripts, (event) => {
    writeNdjsonLine(event);
    logBuildProgressToConsole(event);
});
// The stringify below blocks the event loop for the whole 67 MB (seconds); announce it FIRST
// so the client shows "serializing document" instead of freezing on the last build line.
reportStage(PROGRESS_LABEL_SERIALIZING_DOCUMENT);
const serialized = JSON.stringify(document);
// Now the byte size is known — announce the transfer before it goes on the wire.
reportStage(formatSendingDocumentLabel(Buffer.byteLength(serialized)));
response.end(serialized + "\n");
```

Rationale for order: the label must be flushed to the socket *before* the blocking call, so
`reportStage(SERIALIZING)` precedes `JSON.stringify`; the size is only known *after*
stringify, so `formatSendingDocumentLabel` follows it. `reportStage` already exists in this
function (line 184) and uses `writeNdjsonLine`, which flushes per line.

> Non-progress path (`handleDocumentRequest` line 159) and `/api/diff`, `/api/range-patch`
> are unchanged — they never stream, so there is nothing to bracket.

---

## Part B — Server: collapse the 20,418-line parse flood on a records-cache hit

The flood is `replayRecordProgress` emitting one event **per record**. Throttle it to a
bounded, still-counted, still-source-token-bearing set of lines.

### B1 (test first) — throttle contract

New tests go in `tests/loading-progress.test.ts`; the contract-change edit is in
`tests/viewer-progress.test.ts`:

- Add (in `loading-progress.test.ts`) `test_computeRecordProgressStride_bounds_line_count`:
  assert `computeRecordProgressStride(20_000) === Math.ceil(20_000 / RECORD_PROGRESS_MAX_LINES)`,
  `computeRecordProgressStride(10) === 1` (fewer records than the cap → every record),
  and `computeRecordProgressStride(0) === 1` (never zero — avoids `% 0`).
- Add `test_cached_record_replay_is_throttled_counted_and_token_bearing`: prime the caches
  with the S19 fixture (`copyFixtureIntoTempDir(S19_JSONL)` then `loadProjectRecords([path])`),
  then re-run `loadProjectRecords([path], spy)` collecting events. Filter to the per-record
  events (`event.total === recordCount`) and assert: (a) count ≤ `RECORD_PROGRESS_MAX_LINES`;
  (b) `current` strictly increasing; (c) the **last** has `current === recordCount`; (d) every
  such `label` yields a `matchJsonlSourceLink(...)` match. This exercises the throttle through
  the public `loadProjectRecords` — `replayRecordProgress` stays module-private (no
  test-only export).
- **Update** `test_document_request_sequence_walks_records_once_when_cached` (line 87): it
  currently asserts `perRecordCount === recordCount`. Change the assertion to
  `perRecordCount <= RECORD_PROGRESS_MAX_LINES && perRecordCount >= 1` and that the last
  such event has `current === recordCount`. Keep the "walked once" intent: assert the count
  of `event.total === recordCount` events is ≤ the cap (a second replay would exceed it).
- `test_per_record_progress_labels_carry_source_tokens_cold_and_cached` (line 105) stays as
  written — sampled lines are real records and still carry the token; it asserts
  `perRecordEvents.length > 0`, which the throttled set satisfies. Do not change it.

### B2 — implement in `src/viewer_api.ts`

Replace `replayRecordProgress` (lines 154-166) with a throttled emitter:

```ts
// A cache hit must still show counted per-record progress (never silence the console), but
// one line per record floods the stream with 20k+ lines for a large project (item 82).
// Emit at a stride so at most RECORD_PROGRESS_MAX_LINES lines go out, always including the
// final record so the bar reaches 100%. Sampled lines keep the clickable source token.
export const RECORD_PROGRESS_MAX_LINES = 50;

export function computeRecordProgressStride(total: number): number {
    return Math.max(1, Math.ceil(total / RECORD_PROGRESS_MAX_LINES));
}

function replayRecordProgress(records: TranscriptRecord[], onProgress: ProgressSink | undefined): void {
    if (onProgress === undefined) {
        return;
    }
    const stride = computeRecordProgressStride(records.length);
    records.forEach((record, index) => {
        const isSampled = (index + 1) % stride === 0;
        const isLast = index === records.length - 1;
        if (!isSampled && !isLast) {
            return;
        }
        onProgress({
            kind: DocumentResponseKind.progress,
            label: `${record.type}${formatRecordSourceToken(getRecordSource(record))}`,
            current: index + 1,
            total: records.length,
        });
    });
}
```

`computeRecordProgressStride` is exported so B1 can test it directly and so the cold-parse
path could reuse it later; `RECORD_PROGRESS_MAX_LINES` is exported for the test's bound.

> Scope note: the **cold** parse (`loadTranscript` in `src/parse/`) still emits per record —
> that reflects real parse work and is left unchanged. The captured freeze was a cache-hit
> replay, which this fixes; the bar is determinate in both cases now.

---

## Part C — Client: an always-alive indicator (elapsed clock + phase model + shimmer)

Target `webapp/app.ts` and `webapp/styles.css`. The visual contract is
`mockups/loading-progress.html` (two bars: a phase bar + a stage bar; a header with the
phase name/count and an elapsed clock; shimmer when a stage carries no count).

### C1 (test first) — phase classifier

In `tests/viewer-progress.test.ts`, import `classifyLoadPhase` from `../webapp/app.ts` and add:

- `test_classifyLoadPhase_maps_real_stage_labels_to_ordered_phases` — assert the phase index
  for representative real labels:
  - `"resolving transcript files for X"` and `"resolved 16 transcript file(s)"` → phase 1
  - `"reusing cached transcript records"` and `"assistant [x.jsonl:9]"` → phase 2
  - `"scanning parsed records for recorded script executions"` and
    `"no script-execution consent needed"` → phase 3
  - `"reusing cached document artifact"`, `"reading sidecar backups"`,
    `"reconstructing orders.py"`, `"building step snapshots"`, `"building line verdicts"` → phase 4
  - `"serializing document"`, `"sending document (67.1 MB)"`, `"parsing document — 67.1 MB"` → phase 5
  - `"rendering timeline rows"` → phase 6
  - an unmatched label (e.g. `"???"`) → `undefined`
- `test_classifyLoadPhase_total_is_six` — assert `LOAD_PHASE_COUNT === 6`.

### C2 — implement the classifier in `webapp/app.ts`

Add near `reportStreamProgress` (line 261). Order matters (first matching phase wins on a
label that could match two families — none do here, but keep the array ordered):

```ts
// The ordered phases the loading indicator advances through. Labels are matched by substring
// against the real server/client progress vocabulary (item 82). Unknown labels return
// undefined; the caller then keeps the last known phase rather than regressing the bar.
export const LOAD_PHASES = [
    "Resolving transcripts",
    "Parsing records",
    "Checking script consent",
    "Building document",
    "Transferring document",
    "Rendering timeline",
] as const;
export const LOAD_PHASE_COUNT = LOAD_PHASES.length;

const LOAD_PHASE_MATCHERS: string[][] = [
    ["resolving transcript", "resolved "],
    ["reusing cached transcript records", ".jsonl:", "parsing records"],
    ["scanning parsed records", "consent", "no script-execution"],
    ["reusing cached document artifact", "reading sidecar", "constructing branches",
     "replaying lineage", "reconstructing ", "script stage", "executing script run",
     "building pre-execution", "indexing change ids", "extracting conversation",
     "summarizing branches", "building step snapshots", "building line verdicts",
     "building document"],
    ["serializing document", "sending document", "parsing document"],
    ["rendering timeline"],
];

// The 1-based phase for a progress label, or undefined when no family matches.
export function classifyLoadPhase(label: string): number | undefined {
    const lowered = label.toLowerCase();
    for (let phaseIndex = 0; phaseIndex < LOAD_PHASE_MATCHERS.length; phaseIndex++) {
        if (LOAD_PHASE_MATCHERS[phaseIndex]!.some((needle) => lowered.includes(needle))) {
            return phaseIndex + 1;
        }
    }
    return undefined;
}
```

### C3 — always-alive overlay in `webapp/app.ts`

Rework the `showLoadingProgress` overlay (lines 236-259) to the mockup's box: header
(`phase name · phase N of 6` + elapsed clock), a phase bar, a stage label, and a stage bar
that shimmers when indeterminate. Keep the exported function name `showLoadingProgress` but
change its contract:

```ts
export function showLoadingProgress(label: string, fraction: number): void
```

Behaviour:

- **First call** builds the box (as today) AND records `loadingProgressStartMs = Date.now()`
  and starts a `setInterval` (100 ms) that writes `${((Date.now()-start)/1000).toFixed(1)}s`
  into the elapsed element. Store the interval id on `loadingProgressElements` so
  `hideLoadingProgress` can `clearInterval` it and null it out.
- Each call: set the stage label; classify the phase with `classifyLoadPhase(label)` — if
  defined, update `loadingProgressCurrentPhase`; render the header
  `${LOAD_PHASES[phase-1]} · phase ${phase} of ${LOAD_PHASE_COUNT}` and set the **phase bar**
  width to `phase / LOAD_PHASE_COUNT`.
- **Stage bar**: `Number.isFinite(fraction)` → determinate fill `fraction`, remove the
  `indeterminate` class. Non-finite fraction → add the `indeterminate` class (CSS shimmer),
  leave fill as-is. (Today non-finite fills to 100%; change it to shimmer.)
- `hideLoadingProgress` (line 257): `clearInterval` the elapsed timer, null the id, remove
  the overlay (as today).

Add module-level `let loadingProgressStartMs = 0;` and
`let loadingProgressCurrentPhase = 0;` beside `loadingProgressElements` (line 236); extend
the `loadingProgressElements` object shape to include `phaseLabel`, `phaseFill`, `elapsed`,
and `timerId` elements/fields.

### C4 — drive the overlay from EVERY streamed line

Change `reportStreamProgress` (lines 261-268) so every line shows the overlay, determinate
only when counted:

```ts
function reportStreamProgress(parsed: WireDocumentStreamLine): void {
    logProgress(parsed.current !== undefined ? `${parsed.current}/${parsed.total} ${parsed.label}` : parsed.label!);
    const hasCount = parsed.current !== undefined && parsed.total !== undefined && parsed.total > 0;
    const fraction = hasCount ? parsed.current! / parsed.total! : Number.NaN;   // NaN => shimmer
    const detail = hasCount ? `${parsed.label} — ${parsed.current} / ${parsed.total}` : parsed.label!;
    showLoadingProgress(detail, fraction);
}
```

### C5 — client-side "parsing document" label before the big JSON.parse

In `fetchDocument` (lines 385-402), the terminal 67 MB line is `JSON.parse`d inline in the
read loop, freezing the tab with no indicator. Announce and yield to paint before parsing
any oversized line. Add a constant and a paint-yield, and guard the parse:

```ts
// Only the terminal document payload is ever this large; progress lines are tiny. Gating on
// size lets the tiny lines parse inline while the one huge line gets a visible label + a
// paint-yield first, so the browser's synchronous JSON.parse of ~67 MB no longer freezes the
// tab with a stale indicator. (item 82)
const LARGE_PAYLOAD_BYTES = 200_000;

export function formatMegabytes(byteLength: number): string {
    return `${(byteLength / 1_000_000).toFixed(1)} MB`;
}
```

In the `for (const line of lines)` loop, replace `const parsed = JSON.parse(line) ...` with:

```ts
if (line.length > LARGE_PAYLOAD_BYTES) {
    showLoadingProgress(`parsing document — ${formatMegabytes(line.length)}`, Number.NaN);
    await new Promise((resolve) => setTimeout(resolve, 0));   // let the label/shimmer paint before the blocking parse
}
const parsed = JSON.parse(line) as WireDocumentStreamLine;
```

The enclosing loop is already inside an `async` function and the reader loop already
`await`s, so adding `await` here is safe. `formatMegabytes` is exported so a test can pin the
format if desired (optional; primary coverage is the server formatter A1).

### C6 — CSS for the new box in `webapp/styles.css`

Port the mockup's indicator styles into the existing `.timeline-progress-*` block
(lines 851-896). Add:

- `.timeline-progress-header` — flex row, space-between, `font-size: 12px; color: var(--muted)`.
- `.timeline-progress-phase` — `color: var(--text); font-weight: 600` (the phase name).
- A second track/fill pair reusing `.timeline-progress-track`/`.timeline-progress-fill` for
  the phase bar (no new class needed — put two `.timeline-progress-track` rows in the box).
- `.timeline-progress-track.indeterminate .timeline-progress-fill { width: 100% !important; opacity: .16; }`
  plus the `::after` sliding gradient keyframe `slide` — copy the exact rule from
  `mockups/loading-progress.html` (`.track.indeterminate`), renaming `.track` →
  `.timeline-progress-track` and `.fill` → `.timeline-progress-fill`, `--accent` unchanged.

Match the mockup's box structure: header row, phase track, stage label
(`.timeline-progress-label`, already exists), stage track.

---

## Order of implementation

1. Part A (A1 red → A2 → A3) — smallest, self-contained, unblocks the client's phase-5 labels.
2. Part B (B1 red + test updates → B2) — independent of A.
3. Part C (C1 red → C2 → C3 → C4 → C5 → C6) — depends on A's labels existing for the
   phase-5/`parsing document` classification test to reflect reality.

## Definition of done

- New tests A1, B1, C1 written before their implementations; existing cache-replay test
  updated to the throttled contract; token-carrying test untouched and still green.
- Server brackets the serialize + transfer with `serializing document` / `sending document
  (N MB)` lines; cache-hit replay emits ≤ 50 counted, token-bearing lines.
- Client indicator stays visible for the whole load with a ticking elapsed clock, a
  phase-N-of-6 header + bar, a determinate stage bar when counted and a shimmer when not, and
  a `parsing document — N MB` label + paint-yield before the terminal parse.
- No new dependency; NDJSON transport, `ProgressSink`, `showLoadingProgress`, and the console
  are reused, not replaced.
- Stage everything; do not commit; do not run tests.

## Explicitly out of scope (separate tasks)

- Shrinking/streaming the 67 MB document (the real cost lever).
- Throttling the **cold** per-record parse in `src/parse/loadTranscript.ts`.
- Closing any flash-gap between the document-parse indicator and item 78's timeline-row bar.
