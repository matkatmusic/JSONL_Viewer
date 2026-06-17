// Tests for api/file-events-extractors.js — per-file event extraction with
// timestamps (sidecar event representation). Moved (Phase 4) from
// tests/test-extract-file-events.js; adds readsForFile/editsForFile.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var efe = require('../api/file-events-extractors');

var TS = '2026-05-22T03:38:27.174Z';
var KIND_NAMES = ['snapshot', 'fileAbsent', 'write', 'edit', 'readFull', 'readChunk', 'cat', 'originalFile'];

// Patch a helper-built JSONL line with a top-level record timestamp.
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
  // A success-confirmed Write extracts as a write event, unixMs from the record.
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
  // An old->new splice extracts as an edit event; floating starts false.
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
  // A Read with no offset/limit returning < the 2000-line cap saw the whole file.
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
  // EOF lesson: a Read exactly filling its limit proves nothing about the tail.
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
  // A chunk returning FEWER lines than requested proves where the file ends.
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
  // A Bash cat capture extracts as a cat event (content stays in the record).
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

runWithContext('test_extractFileEvents_unconfirmedWriteIsExcluded', function (ctx) {
  // A Write whose tool_result errored produced no toolUseResult — no write event.
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
  // An edit classified 'ignored' contributes no event (edit.line+1 keys lookup).
  var parsed = [null, { timestamp: TS }];
  var edits = [{ line: 1, filePath: '/repo/t.py', file: 't.py', type: 'create', content: 'x' }];
  var kept = efe.authoredEventsFromKeptEdits('/x.jsonl', parsed, edits, { 2: 'kept' }, ['/repo/t.py']);
  assert.strictEqual(kept.length, 1);
  var ignored = efe.authoredEventsFromKeptEdits('/x.jsonl', parsed, edits, { 2: 'ignored' }, ['/repo/t.py']);
  assert.deepStrictEqual(ignored, []);
});

runWithContext('test_extractFileEvents_editForDifferentFileWithSameBasenameIsExcluded', function (ctx) {
  // Alias filtering is by FULL absolute path — same-basename elsewhere excluded.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/elsewhere/t.py', 'x'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.deepStrictEqual(events, []);
});

// ─── originalFile events (whole-file pre-edit observation) ──────────────────

runWithContext('test_extractFileEvents_editWithOriginalFileYieldsOriginalFileEvent', function (ctx) {
  // An Edit carries the whole pre-edit file in originalFile; that surfaces as a
  // distinct originalFile observation at the edit's line+1 and timestamp,
  // ALONGSIDE the edit event itself (it does not replace it).
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeEditLine('/repo/t.py', 'a', 'b', false, 'a\nx\n'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  var originalFileEvents = events.filter(function (e) { return e.originalFile !== null; });
  assert.strictEqual(originalFileEvents.length, 1);
  assertOnlyKindNonNull(originalFileEvents[0], 'originalFile');
  assert.deepStrictEqual(originalFileEvents[0].originalFile, {});
  assert.strictEqual(originalFileEvents[0].jsonlLine, 2);
  assert.strictEqual(originalFileEvents[0].unixMs, Date.parse(TS));
  assert.strictEqual(events.filter(function (e) { return e.edit !== null; }).length, 1);
});

run('test_originalFileEventsFromEdits_emitsOnlyForKeptEditsWithPreEditContent', function () {
  // Only edit-type records that carry a non-empty originalFile string, belong to
  // the file, and are not classified 'ignored' produce an originalFile event.
  var parsed = [null, { timestamp: TS }, { timestamp: TS }, { timestamp: TS }];
  var edits = [
    { line: 1, type: 'edit', filePath: '/repo/t.py', file: 't.py', originalFile: 'a\nb\n' },
    { line: 2, type: 'edit', filePath: '/repo/t.py', file: 't.py', originalFile: '' },
    { line: 3, type: 'create', filePath: '/repo/t.py', file: 't.py', originalFile: null }
  ];
  var kept = efe.originalFileEventsFromEdits('/x.jsonl', parsed, edits, {}, ['/repo/t.py']);
  assert.strictEqual(kept.length, 1);
  assert.strictEqual(kept[0].jsonlLine, 2);
  // Step: classifying that edit 'ignored' drops it.
  assert.deepStrictEqual(efe.originalFileEventsFromEdits('/x.jsonl', parsed, edits, { 2: 'ignored' }, ['/repo/t.py']), []);
  // Step: a wrong-file alias yields none.
  assert.deepStrictEqual(efe.originalFileEventsFromEdits('/x.jsonl', parsed, edits, {}, ['/other/t.py']), []);
});

h.summary();
