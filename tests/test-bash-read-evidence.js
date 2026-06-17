// Tests for api/bash-read-evidence: materialization of bashReadChunk. The raw
// head/sed/tail stdout has NO line-number prefixes, so lines are numbered from
// the event's firstLine; each ref is a byte-span into the result stdout.

var assert = require('assert');
var h = require('./test-helpers');
var fek = require('../api/file-event-kinds');
var mat = require('../api/bash-read-evidence');
var fs = require('fs');
var path = require('path');

function writeResult(ctx, stdout) {
  var dir = ctx.tempDir('rev-bre-');
  var jsonlPath = path.join(dir, 's.jsonl');
  fs.writeFileSync(jsonlPath, h.makeBashCatToolResult('u1', stdout));
  return jsonlPath;
}

function chunkEvent(jsonlPath, firstLine, lineCount, hitEof) {
  return fek.createKindEvent(jsonlPath, 1, '2026-05-22T03:00:00.000Z', 'bashReadChunk',
    { firstLine: firstLine, lineCount: lineCount, hitEof: hitEof });
}

h.runWithContext('numbers raw stdout lines from firstLine', function (ctx) {
  var jsonlPath = writeResult(ctx, 'alpha\nbeta\ngamma\n');
  var m = mat.materializeBashReadChunk(chunkEvent(jsonlPath, 5, 3, true));
  assert.strictEqual(m.kind, 'bashReadChunk');
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [5, 6, 7]);
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.text; }), ['alpha', 'beta', 'gamma']);
});

h.runWithContext('refs carry stdout byte spans and the content property', function (ctx) {
  var jsonlPath = writeResult(ctx, 'alpha\nbeta\ngamma\n');
  var m = mat.materializeBashReadChunk(chunkEvent(jsonlPath, 5, 3, true));
  var r0 = m.byLine[0].ref;
  assert.strictEqual(r0.jsonl, jsonlPath);
  assert.strictEqual(r0.jsonlLine, 1);
  assert.strictEqual(r0.textProperty.property, 'message.content[0].content');
  assert.strictEqual(r0.structuredPatch, null);
  assert.deepStrictEqual([r0.textProperty.startIndex, r0.textProperty.endIndex], [0, 5]);
  assert.deepStrictEqual([m.byLine[1].ref.textProperty.startIndex, m.byLine[1].ref.textProperty.endIndex], [6, 10]);
  assert.deepStrictEqual([m.byLine[2].ref.textProperty.startIndex, m.byLine[2].ref.textProperty.endIndex], [11, 16]);
});

h.runWithContext('a final line without a trailing newline is still counted', function (ctx) {
  var jsonlPath = writeResult(ctx, 'one\ntwo');
  var m = mat.materializeBashReadChunk(chunkEvent(jsonlPath, 10, 2, true));
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [10, 11]);
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.text; }), ['one', 'two']);
  assert.deepStrictEqual([m.byLine[1].ref.textProperty.startIndex, m.byLine[1].ref.textProperty.endIndex], [4, 7]);
});

h.runWithContext('bashExtent parses the leading line count (ref-less)', function (ctx) {
  var jsonlPath = writeResult(ctx, '     207 /repo/t.py');
  var event = fek.createKindEvent(jsonlPath, 1, '2026-05-22T03:00:00.000Z', 'bashExtent', {});
  var m = mat.materializeBashExtent(event);
  assert.deepStrictEqual(m, { kind: 'bashExtent', lineCount: 207 });
});

h.runWithContext('bashExtent with a bare count (piped wc) still parses', function (ctx) {
  var jsonlPath = writeResult(ctx, '42');
  var m = mat.materializeBashExtent(fek.createKindEvent(jsonlPath, 1, '2026-05-22T03:00:00.000Z', 'bashExtent', {}));
  assert.strictEqual(m.lineCount, 42);
});

h.runWithContext('bashGrep parses N: match and N- context rows, skips -- separators', function (ctx) {
  var jsonlPath = writeResult(ctx, '3:gamma\n7-eta\n--\n12:zeta');
  var m = mat.materializeBashGrep(fek.createKindEvent(jsonlPath, 1, '2026-05-22T03:00:00.000Z', 'bashGrep', {}));
  assert.strictEqual(m.kind, 'bashGrep');
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [3, 7, 12]);
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.text; }), ['gamma', 'eta', 'zeta']);
  // span excludes the "N:"/"N-" prefix
  var r0 = m.byLine[0].ref.textProperty;
  assert.deepStrictEqual(['3:gamma\n7-eta\n--\n12:zeta'.slice(r0.startIndex, r0.endIndex)], ['gamma']);
});

h.summary();
