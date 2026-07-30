# Plan — Task #311: `jfred/src/layer1_sessions.ts` (JSONL session metadata + title-in-effect)

Spec S19 ("JSONL Nav row order", "Snapshot node click"). Two new exports, one new test file.
Nothing else in the repo is edited. `jfred/src/layer1_snapshots.ts` (task 310) is not touched.

## Step 1 — Write the failing tests first

New file `jfred/tests/layer1_sessions.test.ts` (underscore name matches the module, which the
Stop hook enforces). Model it on `jfred/tests/layer1_snapshots.test.ts`: `node:test` + `assert/strict`,
`makeTempDir` from `./overrides-test-helpers.ts`, records written as one JSON object per line and
read back through `loadTranscript` (via the builder), so the live `~/.claude` tree is never reached.

Fixture helpers in the test file:
- `userRecord(sessionId, timestamp, toolUse?)` — a `RecordType.user` record with `cwd`, `sessionId`,
  `timestamp`, and a `message`. Used for the first/last instants.
- `titleRecord(sessionId, title)` — `{ type: RecordType.customTitle, sessionId, customTitle: title }`.
  `customTitle` is the modeled key (`ALLOWED_TOP_LEVEL_KEYS[RecordType.customTitle]` in
  `src/parse/recordKeys.ts`, and `findSessionTitles` in `src/reconstruction_json.ts` reads it);
  an `n` key would trip the unmodeled-field gate, so it is not used.
- `writeSession(dir, sessionId, records)` — writes `<dir>/<sessionId>.jsonl`, returns a `Path`.

Tests (four):
1. **Two titles, two ranges.** Build a session whose lines are: some user records, a custom-title
   record for "first title", more user records, a custom-title record for "second title", more user
   records. Assert `titles` has exactly two entries with ascending `fromLine`, and that
   `titleInEffectAtLine(titles, <a line between the two title records>) === "first title"` while
   `titleInEffectAtLine(titles, <a line after the second title record>) === "second title"`.
2. **Before the first title.** `titleInEffectAtLine(titles, 1) === undefined` for the same session
   (line 1 precedes the first custom-title record).
3. **Unnamed session.** A session with no custom-title record yields `titles.length === 0`, and
   `titleInEffectAtLine([], 5) === undefined`.
4. **started/ended and paths.** A session whose first user record is stamped earlier than its last
   returns exactly those two instants as `started`/`ended`, and `paths` contains the file a recorded
   Write/Edit tool_use targeted (proving the paths come from the session's writes, not from the
   snapshot timeline).

Run nothing here — the user runs the suite.

## Step 2 — Implement `jfred/src/layer1_sessions.ts`

Exports:

```ts
export type SessionTitleRange = { fromLine: number; title: string };

export type SessionMetadata = {
    file: Path;
    sessionId: Uuid | undefined;
    started: Date | undefined;
    ended: Date | undefined;
    paths: Path[];
    titles: SessionTitleRange[];
};

export function titleInEffectAtLine(titles: SessionTitleRange[], line: number): string | undefined;
export function buildSessionMetadata(sessionFiles: Path[]): SessionMetadata[];
```

`titleInEffectAtLine` is pure and takes no records: reduce over `titles`, keeping the entry with the
greatest `fromLine` that is `<= line`; return its `title`, or `undefined` when none qualifies. Written
as a reduce rather than "last element of a filter" so it stays correct if a caller ever hands it an
unsorted list — the drawer will pass ranges straight through from the wire.

`buildSessionMetadata` loops the given session files and, per file:
1. `const records = loadTranscript(file.toString(), undefined, true).records;` — tolerant mode, the
   same call `layer1_snapshots.ts` makes, so a real session with unmodeled fields still opens.
2. `sessionId` = `findSessionId(records)` from `src/reconstruction_sidecar_reader.ts`.
3. `started` / `ended` = the minimum and maximum `record.timestamp` over all records that carry one.
   Min/max rather than first/last-with-a-timestamp because a transcript is not guaranteed monotonic
   and the Nav band must span everything. Both are `undefined` when no record carries a timestamp.
   This is deliberately the RECORD instants, not the instants of the files the session touched.
4. `titles` = for each record with `record.type === RecordType.customTitle` whose `customTitle` is a
   string, push `{ fromLine: getRecordSource(record)?.lineNumber ?? 0, title }`. `getRecordSource`
   comes from `src/parse/loadTranscript.ts` and is populated by that same load. Records are pushed in
   file order, so `titles` comes out ascending. Every range is kept — no dedupe; the Nav row dedupes
   for display, the drawer needs the ranges.
5. `paths` = `extractFileEvents(records)` (`src/reconstruction_extract.ts`) flat-mapped through
   `listEventPaths(event)` (`src/reconstruction_bound.ts`), deduped by string into `Path` values in
   first-seen order. `listEventPaths` is reused because it already knows a rename/copy contributes
   both `from` and `to`.

Keep the file under the 250-line cap (it will be well under). One-line comments only.

## Step 3 — Self-check

Confirm the two exports' names and shapes match what tasks 312/313/317 will import, that
`layer1_snapshots.ts` is unmodified, and that no file exceeds 250 lines. Do not run the suite,
do not stage, do not commit, do not close the task.
