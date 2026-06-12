var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var efe = require('../tools/extract-file-events');

var TS = '2026-05-22T03:38:27.174Z';
var KIND_NAMES = ['snapshot', 'fileAbsent', 'write', 'edit', 'readFull', 'readChunk', 'cat'];

// Patch a helper-built JSONL line with a top-level record timestamp (the
// helpers omit timestamps; real transcript records carry them).
function withTimestamp(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

// A Read tool_use with offset/limit geometry (the stock helper has neither).
function makeReadUseWithGeometry(toolUseId, filePath, offset, limit) {
  var record = JSON.parse(h.makeReadToolUse(toolUseId, filePath));
  var input = record.message.content[0].input;
  if (offset !== null) { input.offset = offset; }
  if (limit !== null) { input.limit = limit; }
  return JSON.stringify(record);
}

// A file-history-snapshot record. isSnapshotUpdate is TOP-LEVEL on the record;
// the beacon time lives at snapshot.timestamp (records have no top-level
// timestamp) — both verified against real transcripts.
function makeSnapshotLine(messageId, snapTimestamp, isSnapshotUpdate, trackedFileBackups) {
  var snapshot = { messageId: messageId, timestamp: snapTimestamp, trackedFileBackups: trackedFileBackups };
  return JSON.stringify({ type: 'file-history-snapshot', messageId: messageId, isSnapshotUpdate: isSnapshotUpdate, snapshot: snapshot });
}

// Write the fixture transcript to a temp dir and return its path.
function writeJsonlFixture(ctx, lines) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-efe-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

// Assert the event's seven kind sub-objects have exactly kindName non-null.
function assertOnlyKindNonNull(event, kindName) {
  for (var i = 0; i < KIND_NAMES.length; i++) {
    if (KIND_NAMES[i] === kindName) { assert.notStrictEqual(event[KIND_NAMES[i]], null); }
    else { assert.strictEqual(event[KIND_NAMES[i]], null); }
  }
}

runWithContext('test_extractFileEvents_successConfirmedWriteBecomesWriteEvent', function (ctx) {
  // Behavior: a success-confirmed Write (toolUseResult create) extracts as a
  // write event with empty sub-object, others null, unixMs from the record.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'write');
  assert.deepStrictEqual(events[0].write, {});
  assert.strictEqual(events[0].jsonl, jsonlPath);
  assert.strictEqual(events[0].jsonlLine, 2);
  assert.strictEqual(events[0].timestamp, TS);
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_editBecomesEditEventWithFloatingFalse', function (ctx) {
  // Behavior: an old_string->new_string splice extracts as an edit event;
  // floating starts false (the TRACKER flips it when old_string is unlocatable).
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeEditLine('/repo/t.py', 'a', 'b'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'edit');
  assert.deepStrictEqual(events[0].edit, { floating: false });
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_offsetlessReadProvingEofExtractsAsReadFull', function (ctx) {
  // Behavior: a Read with no offset/limit returning fewer lines than the
  // harness's 2000-line default cap witnessed the whole file -> readFull.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeReadToolUse('t1', '/repo/t.py'),
    withTimestamp(h.makeReadToolResult('t1', '1\talpha\n2\tbeta\n'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'readFull');
  assert.deepStrictEqual(events[0].readFull, {});
  assert.strictEqual(events[0].jsonlLine, 3);
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_readThatCannotProveEofExtractsAsReadChunk', function (ctx) {
  // Behavior (the EOF lesson): a Read whose result exactly fills its requested
  // limit proves nothing about the tail — it extracts as readChunk, NOT
  // readFull, even though it starts at line 1.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    makeReadUseWithGeometry('t1', '/repo/t.py', null, 2),
    withTimestamp(h.makeReadToolResult('t1', '1\talpha\n2\tbeta\n'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'readChunk');
  assert.deepStrictEqual(events[0].readChunk, { firstLine: 1, lineCount: 2, hitEof: false });
});

runWithContext('test_extractFileEvents_chunkReturningFewerLinesThanRequestedMarksHitEof', function (ctx) {
  // Behavior: a chunk returning FEWER lines than requested proves where the
  // file ends — hitEof true, geometry from the numbered content.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    makeReadUseWithGeometry('t1', '/repo/t.py', 10, 5),
    withTimestamp(h.makeReadToolResult('t1', '10\ttail-a\n11\ttail-b\n'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].readChunk, { firstLine: 10, lineCount: 2, hitEof: true });
});

runWithContext('test_extractFileEvents_bashCatBecomesCatEvent', function (ctx) {
  // Behavior: a Bash cat capture extracts as a cat event (empty sub-object —
  // the caveats are uniform for the kind; content stays in the JSONL record).
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCatToolUse('t1', '/repo/t.py'),
    withTimestamp(h.makeBashCatToolResult('t1', '1\talpha\n'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'cat');
  assert.deepStrictEqual(events[0].cat, {});
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_snapshotWithLiveBlobBecomesSnapshotEvent', function (ctx) {
  // Behavior: a file-history-snapshot whose backup blob exists on disk is a
  // Tier-1 beacon: snapshot event carrying the resolved blob path and the
  // record's top-level isSnapshotUpdate, timed by snapshot.timestamp.
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var sessionDir = path.join(snapshotsDir, 'sess-snap');
  fs.mkdirSync(sessionDir);
  fs.writeFileSync(path.join(sessionDir, 'blob-1'), 'alpha\nbeta\n');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'blob-1', version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, false, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'snapshot');
  var expectedBlob = path.join(sessionDir, 'blob-1');
  assert.deepStrictEqual(events[0].snapshot, { blob: expectedBlob, isSnapshotUpdate: false });
  assert.strictEqual(events[0].jsonlLine, 2);
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_snapshotWithMissingBlobIsExcluded', function (ctx) {
  // Behavior: a snapshot record whose blob file no longer exists is NOT a
  // beacon — no event at all (the truth is gone, not merely unread).
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'gone-blob', version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, false, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.deepStrictEqual(events, []);
});

runWithContext('test_extractFileEvents_nullBackupFileNameBecomesFileAbsentEvent', function (ctx) {
  // Behavior: backupFileName null is POSITIVE evidence the file did not exist
  // at that instant — the absence beacon today's pipeline discards.
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: null, version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, true, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'fileAbsent');
  assert.deepStrictEqual(events[0].fileAbsent, {});
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_resumeCopiedSnapshotDedupedByMessageIdAndTimestamp', function (ctx) {
  // Behavior: copyFileHistoryForResume re-appends the previous session's
  // snapshot entry with its OLD embedded timestamp; the duplicate (same
  // messageId + snapshot.timestamp) yields ONE event, not two.
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var sessionDir = path.join(snapshotsDir, 'sess-snap');
  fs.mkdirSync(sessionDir);
  fs.writeFileSync(path.join(sessionDir, 'blob-1'), 'alpha\n');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'blob-1', version: 1 };
  var snapshotLine = makeSnapshotLine('m1', TS, false, backups);
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    snapshotLine,
    snapshotLine
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
});

runWithContext('test_extractFileEvents_unconfirmedWriteIsExcluded', function (ctx) {
  // Behavior: a Write whose tool_result errored never produced a
  // toolUseResult record — it must contribute NO write event.
  var writeUse = JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 't9', name: 'Write', input: { file_path: '/repo/t.py', content: 'x' } }] }
  });
  var errorBody = { type: 'tool_result', tool_use_id: 't9', is_error: true, content: 'Error: write refused' };
  var errResult = JSON.stringify({ type: 'user', timestamp: TS, message: { content: [errorBody] } });
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    writeUse,
    errResult
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.deepStrictEqual(events, []);
});

run('test_authoredEventsFromKeptEdits_excludesIgnoredClassifiedEdit', function () {
  // Behavior: an edit the rewind classification marked 'ignored' contributes
  // no event (classification lines are 1-indexed, so edit.line+1 keys the
  // lookup — same convention as probe-v2-assembly's editWasKept).
  var parsed = [null, { timestamp: TS }];
  var edits = [{ line: 1, filePath: '/repo/t.py', file: 't.py', type: 'create', content: 'x' }];
  var kept = efe.authoredEventsFromKeptEdits('/x.jsonl', parsed, edits, { 2: 'kept' }, ['/repo/t.py']);
  assert.strictEqual(kept.length, 1);
  var ignored = efe.authoredEventsFromKeptEdits('/x.jsonl', parsed, edits, { 2: 'ignored' }, ['/repo/t.py']);
  assert.deepStrictEqual(ignored, []);
});

runWithContext('test_extractFileEvents_editForDifferentFileWithSameBasenameIsExcluded', function (ctx) {
  // Behavior: alias filtering is by FULL absolute path — a same-basename file
  // under another directory contributes nothing (harness bug #1 regression).
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/elsewhere/t.py', 'x'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.deepStrictEqual(events, []);
});

runWithContext('test_extractFileEvents_snapshotKeysMatchByFullPathSuffixNeverBasename', function (ctx) {
  // Behavior: snapshot keys may be shortened paths; they match an alias by
  // FULL path-suffix. A same-basename key under another directory does not.
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var sessionDir = path.join(snapshotsDir, 'sess-snap');
  fs.mkdirSync(sessionDir);
  fs.writeFileSync(path.join(sessionDir, 'blob-match'), 'alpha\n');
  fs.writeFileSync(path.join(sessionDir, 'blob-collide'), 'beta\n');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'blob-match', version: 1 };
  backups['foo/t.py'] = { backupFileName: 'blob-collide', version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, false, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
  var expectedBlob = path.join(sessionDir, 'blob-match');
  assert.strictEqual(events[0].snapshot.blob, expectedBlob);
});

h.summary();
