// Tests for api/split-read-assembly.js — stitching chunked Read events
// (offset/limit) from one transcript into a complete per-file copy keyed by
// absolute line number, per the split-read assembly algorithm. Moved from
// tests/test-assemble-split-reads.js when the library logic moved to api/
// (Phase 4); the thin CLI stays in tools/assemble-split-reads.js.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

var asr = require('../api/split-read-assembly');

// A Read tool_use carrying chunk geometry (offset/limit), the way subagents
// read large files. test-helpers' makeReadToolUse has no offset support.
function makeChunkReadUse(toolUseId, filePath, offset, limit) {
  var input = { file_path: filePath, offset: offset, limit: limit };
  var toolUse = { type: 'tool_use', id: toolUseId, name: 'Read', input: input };
  return JSON.stringify({ type: 'assistant', message: { content: [toolUse] } });
}

// Its tool_result: lines numbered from startLine in the real "N\tcontent"
// format, with the record timestamp the assembly should adopt.
function makeChunkReadResult(toolUseId, startLine, contentLines, timestamp) {
  var numbered = contentLines.map(function (text, i) { return (startLine + i) + '\t' + text; });
  return JSON.stringify({
    type: 'user',
    timestamp: timestamp,
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: numbered.join('\n') }] }
  });
}

run('test_extractReadEvents_capturesChunkGeometryAndStripsLineNumbers', function () {
  var text = [
    makeChunkReadUse('t1', '/repo/big.py', 100, 2),
    makeChunkReadResult('t1', 100, ['alpha', 'beta'], '2026-05-15T02:46:18.393Z')
  ].join('\n');
  var events = asr.extractReadEvents(text);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].filePath, '/repo/big.py');
  assert.strictEqual(events[0].firstLineNumber, 100);
  assert.deepStrictEqual(events[0].contentLines, ['alpha', 'beta']);
  assert.strictEqual(events[0].timestamp, '2026-05-15T02:46:18.393Z');
});

run('test_assembleSplitReads_contiguousChunksProduceCompleteCopy', function () {
  var text = [
    makeChunkReadUse('t1', '/repo/big.py', 1, 2),
    makeChunkReadResult('t1', 1, ['line one', 'line two'], '2026-05-15T02:46:00.000Z'),
    makeChunkReadUse('t2', '/repo/big.py', 3, 2),
    makeChunkReadResult('t2', 3, ['line three', 'line four'], '2026-05-15T02:47:00.000Z')
  ].join('\n');
  var assemblies = asr.assembleSplitReads(asr.extractReadEvents(text));
  assert.strictEqual(assemblies.length, 1);
  assert.strictEqual(assemblies[0].complete, true);
  assert.strictEqual(assemblies[0].content, 'line one\nline two\nline three\nline four');
  assert.deepStrictEqual(assemblies[0].gaps, []);
});

run('test_assembleSplitReads_gapMeansIncompleteWithGapReported', function () {
  var text = [
    makeChunkReadUse('t1', '/repo/big.py', 1, 2),
    makeChunkReadResult('t1', 1, ['line one', 'line two'], '2026-05-15T02:46:00.000Z'),
    makeChunkReadUse('t2', '/repo/big.py', 5, 2),
    makeChunkReadResult('t2', 5, ['line five', 'line six'], '2026-05-15T02:47:00.000Z')
  ].join('\n');
  var assemblies = asr.assembleSplitReads(asr.extractReadEvents(text));
  assert.strictEqual(assemblies[0].complete, false);
  assert.strictEqual(assemblies[0].content, null);
  assert.deepStrictEqual(assemblies[0].gaps, [{ from: 3, to: 4 }]);
});

run('test_assembleSplitReads_overlappingLinesLastReadWins', function () {
  var text = [
    makeChunkReadUse('t1', '/repo/big.py', 1, 3),
    makeChunkReadResult('t1', 1, ['one', 'two OLD', 'three'], '2026-05-15T02:46:00.000Z'),
    makeChunkReadUse('t2', '/repo/big.py', 2, 1),
    makeChunkReadResult('t2', 2, ['two NEW'], '2026-05-15T02:47:00.000Z')
  ].join('\n');
  var assemblies = asr.assembleSplitReads(asr.extractReadEvents(text));
  assert.strictEqual(assemblies[0].complete, true);
  assert.strictEqual(assemblies[0].content, 'one\ntwo NEW\nthree');
});

run('test_assembleSplitReads_assemblyCarriesLastReadTimestampPerFile', function () {
  var text = [
    makeChunkReadUse('t1', '/repo/big.py', 1, 1),
    makeChunkReadResult('t1', 1, ['one'], '2026-05-15T02:46:00.000Z'),
    makeChunkReadUse('t2', '/repo/big.py', 2, 1),
    makeChunkReadResult('t2', 2, ['two'], '2026-05-15T02:47:00.000Z'),
    makeChunkReadUse('t3', '/repo/other.py', 1, 1),
    makeChunkReadResult('t3', 1, ['solo'], '2026-05-15T02:48:00.000Z')
  ].join('\n');
  var assemblies = asr.assembleSplitReads(asr.extractReadEvents(text));
  var big = assemblies.filter(function (a) { return a.filePath === '/repo/big.py'; })[0];
  assert.strictEqual(big.timestamp, '2026-05-15T02:47:00.000Z');
  assert.strictEqual(big.readCount, 2);
});

h.summary();
