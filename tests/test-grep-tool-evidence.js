// Tests for api/grep-tool-evidence: materialization of grepMatches. The result record
// carries rows for MANY files; materialize re-parses it and keeps ONLY the rows whose
// relative path resolves (against the event's cwd) back to the event's filePath. byLine
// carries the grep-reported ABSOLUTE line numbers; each ref is a byte-span into the
// tool_result content property.

var assert = require('assert');
var h = require('./test-helpers');
var fek = require('../api/file-event-kinds');
var mat = require('../api/grep-tool-evidence');
var fs = require('fs');
var path = require('path');

function writeResult(ctx, content) {
  var dir = ctx.tempDir('rev-gtv-');
  var jsonlPath = path.join(dir, 's.jsonl');
  fs.writeFileSync(jsonlPath, h.makeGrepToolResult('g1', content, 1, 1));
  return jsonlPath;
}

function grepEvent(jsonlPath, filePath, cwd) {
  return fek.createKindEvent(jsonlPath, 1, '2026-05-22T03:00:00.000Z', 'grepMatches', { filePath: filePath, cwd: cwd });
}

h.runWithContext('test_materializeGrepMatches_returns_byLine_at_grep_reported_line_numbers', function (ctx) {
  // Behavior: byLine entries carry the grep-reported ABSOLUTE line numbers (not a 1..N
  // renumbering) and the matched text.
  var content = 'a.js:12:alpha\na.js:30:beta';
  var jsonlPath = writeResult(ctx, content);
  var m = mat.materializeGrepMatches(grepEvent(jsonlPath, '/repo/a.js', '/repo'));
  assert.strictEqual(m.kind, 'grepMatches');
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [12, 30]);
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.text; }), ['alpha', 'beta']);
});

h.runWithContext('test_materializeGrepMatches_keeps_only_rows_for_the_events_filePath', function (ctx) {
  // Behavior: a multi-file grep result is re-selected down to ONLY the rows whose resolved
  // path equals this event's filePath; other files' rows are dropped.
  var content = 'a.js:12:alpha\nb.js:5:other\na.js:30:beta';
  var jsonlPath = writeResult(ctx, content);
  var m = mat.materializeGrepMatches(grepEvent(jsonlPath, '/repo/a.js', '/repo'));
  // Step: only a.js rows survive, in order.
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [12, 30]);
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.text; }), ['alpha', 'beta']);
});

h.runWithContext('test_materializeGrepMatches_refs_point_into_the_tool_result_content', function (ctx) {
  // Behavior: each byLine ref is a byte-span into the tool_result's content string property.
  var content = 'a.js:12:alpha\na.js:30:beta';
  var jsonlPath = writeResult(ctx, content);
  var m = mat.materializeGrepMatches(grepEvent(jsonlPath, '/repo/a.js', '/repo'));
  var r0 = m.byLine[0].ref;
  assert.strictEqual(r0.jsonl, jsonlPath);
  assert.strictEqual(r0.jsonlLine, 1);
  assert.strictEqual(r0.textProperty.property, 'message.content[0].content');
  assert.strictEqual(r0.structuredPatch, null);
  // Step: the span slices back to the matched text within the content string.
  assert.strictEqual(content.slice(r0.textProperty.startIndex, r0.textProperty.endIndex), 'alpha');
});

h.summary();
