// ARCHIVED — the extractReadEdits unit tests, moved out of
// tests/test-file-event-observations.js when roadmap Item 17 retired the legacy
// extractReadEdits scanner (api/file-event-observations.js) in favor of the
// unified api/read-event-scanner.js. tests/archive/ uses a non-recursive glob so
// these do NOT run in the suite. The behavior these tests covered is now
// characterized against the legacy golden in tests/test-read-event-scanner.js
// (test_derivedEditRecords_matchLegacyExtractReadEdits). Preserved verbatim as a
// historical record (extractReadEdits no longer exists, so running this throws).

var assert = require('assert');
var h = require('../test-helpers');
var run = h.run;
var obs = require('../../api/file-event-observations');
var extractReadEdits = obs.extractReadEdits;   // RETIRED in Item 17 — undefined now

function parseToParsed(jsonl) {
  var lines = jsonl.split('\n').filter(Boolean);
  var parsed = lines.map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } });
  return { lines: lines, parsed: parsed };
}

console.log('\nextractReadEdits (ARCHIVED — retired Item 17):');

run('test_extractReadEdits_detectsReadToolUseAndResult', function() {
  // Read tool_use + matching tool_result → one update edit with stripped content.
  var readContent = '1\tdef greet(name):\n2\t    return "Hello, " + name\n';
  var jsonl = [
    h.makeNonEditLine(),
    h.makeReadToolUse('read-1', '/tmp/foo.py'),
    h.makeReadToolResult('read-1', readContent)
  ].join('\n');
  var p = parseToParsed(jsonl);
  var result = extractReadEdits(p.lines, p.parsed);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].type, 'update');
  assert.strictEqual(result[0].file, 'foo.py');
  assert.strictEqual(result[0].content, 'def greet(name):\n    return "Hello, " + name\n');
});

run('test_extractReadEdits_linksToolUseToResultById', function() {
  // Mismatched IDs produce no result.
  var jsonl = [
    h.makeReadToolUse('read-2', '/tmp/foo.py'),
    h.makeReadToolResult('different-id', '1\thello\n')
  ].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractReadEdits(p.lines, p.parsed).length, 0);
});

run('test_extractReadEdits_stripsLineNumbersFromContent', function() {
  // Tab-separated line numbers stripped, preserving indentation.
  var readContent = '1\tclass Foo:\n2\t    def bar(self):\n3\t        pass\n';
  var jsonl = [
    h.makeReadToolUse('read-3', '/tmp/foo.py'),
    h.makeReadToolResult('read-3', readContent)
  ].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractReadEdits(p.lines, p.parsed)[0].content, 'class Foo:\n    def bar(self):\n        pass\n');
});

run('test_extractReadEdits_extractsFilenameFromPath', function() {
  var jsonl = [
    h.makeReadToolUse('read-4', '/Users/someone/project/scenario14.py'),
    h.makeReadToolResult('read-4', '1\tcode\n')
  ].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractReadEdits(p.lines, p.parsed)[0].file, 'scenario14.py');
});

run('test_extractReadEdits_skipsWastedCallResponses', function() {
  // "Wasted call" responses are not file content — skip them.
  var jsonl = [
    h.makeReadToolUse('read-5', '/tmp/foo.py'),
    h.makeReadToolResult('read-5', 'Wasted call — file unchanged since your last Read.')
  ].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractReadEdits(p.lines, p.parsed).length, 0);
});

run('test_extractReadEdits_skipsErrorResponses', function() {
  // Error responses are not file content — skip them.
  var jsonl = [
    h.makeReadToolUse('read-6', '/tmp/missing.py'),
    h.makeReadToolResult('read-6', 'Error: file not found')
  ].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractReadEdits(p.lines, p.parsed).length, 0);
});

h.summary();
