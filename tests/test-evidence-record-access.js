// Tests for api/evidence-record-access.js — the record-loading + locator
// cluster extracted from line-state-evidence: loadParsedRecord (cached per
// transcript), findToolResultText (the tool_result text + its record property),
// and findStructuredPatchLine (a result line's hunk/index location).

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var era = require('../api/evidence-record-access');

function writeJsonlFixture(ctx, lines) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-era-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

runWithContext('test_loadParsedRecord_returnsParsedRecordAtOneBasedLine', function (ctx) {
  // Behavior: the 1-based non-empty-line index maps to the parsed record.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/t.py', 'a\nb\n')
  ]);
  var record = era.loadParsedRecord(jsonlPath, 2);
  assert.strictEqual(record.toolUseResult.type, 'create');
  assert.strictEqual(record.toolUseResult.filePath, '/repo/t.py');
});

runWithContext('test_loadParsedRecord_outOfRangeLineYieldsNull', function (ctx) {
  // Behavior: a line index past the transcript end yields null, not a throw.
  var jsonlPath = writeJsonlFixture(ctx, [h.makeSystemLine('s1', 'main', '/repo')]);
  assert.strictEqual(era.loadParsedRecord(jsonlPath, 99), null);
});

run('test_findToolResultText_readsStringAndTextBlockContent', function () {
  // Behavior: a tool_result with string content -> that string; with a
  // text-block array -> the first text block. Each carries its record property.
  var stringRecord = { message: { content: [{ type: 'tool_result', content: 'hello' }] } };
  assert.deepStrictEqual(era.findToolResultText(stringRecord), { property: 'message.content[0].content', text: 'hello' });
  var blockRecord = { message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: 'world' }] }] } };
  assert.deepStrictEqual(era.findToolResultText(blockRecord), { property: 'message.content[0].content[0].text', text: 'world' });
});

run('test_findToolResultText_noToolResultYieldsNull', function () {
  // Behavior: a record with no tool_result (or no record) yields null.
  assert.strictEqual(era.findToolResultText({ message: { content: [{ type: 'text', text: 'x' }] } }), null);
  assert.strictEqual(era.findToolResultText(null), null);
});

run('test_findStructuredPatchLine_locatesAddedLineByHunkAndIndex', function () {
  // Behavior: a spliced result line exists verbatim in the record's
  // structuredPatch as a '+' (or context) line; the locator is index-based.
  var hunk0 = { lines: [' keep', '-old line', '+new line'] };
  var hunk1 = { lines: ['+other'] };
  var record = { toolUseResult: { structuredPatch: [hunk0, hunk1] } };
  assert.deepStrictEqual(era.findStructuredPatchLine(record, 'new line'), { hunkIndex: 0, lineIndex: 2 });
  assert.deepStrictEqual(era.findStructuredPatchLine(record, 'other'), { hunkIndex: 1, lineIndex: 0 });
  // Step: a '-' (removed) line is NOT result content.
  assert.strictEqual(era.findStructuredPatchLine(record, 'old line'), null);
});

h.summary();
