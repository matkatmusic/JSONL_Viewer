#!/usr/bin/env node
// Tests for Read tool result extraction — extracting file content from
// Read tool_use/tool_result pairs as implicit update edits.
//
// Read results are NOT auto-injected into extractEditsFromJSONL because
// they can override valid accumulated state. They are extracted separately
// via extractReadEdits() for selective use by callers.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../common/replay-edits');
var extractReadEdits = mod.extractReadEdits;
var replayEdits = mod.replayEdits;

// ─── extractReadEdits ───────────────────────────────────────────────────────

console.log('\nextractReadEdits:');

function parseToParsed(jsonl) {
  var lines = jsonl.split('\n').filter(Boolean);
  var parsed = lines.map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } });
  return { lines: lines, parsed: parsed };
}

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

// ─── Replay with Read edits ────────────────────────────────────────────────

console.log('\nreplayEdits (with Read edits):');

run('test_replayEdits_readEditCanSeedContentForFile', function() {
  // Read edits are type:'update' — they set the full content.
  // This simulates using a Read result to seed a file that was only
  // created via cp/mv (no Write toolUseResult).
  var readEdit = { type: 'update', content: 'def greet(name):\n    return "Hello, " + name\n' };
  assert.strictEqual(replayEdits([readEdit]), 'def greet(name):\n    return "Hello, " + name\n');
});

run('test_replayEdits_readEditFollowedByStringEdit', function() {
  // Read captures file state, then a string edit applies on top.
  var edits = [
    { type: 'update', content: 'def greet(name):\n    return "Hello, " + name\n' },
    { type: 'edit', oldString: 'greet', newString: 'farewell', replaceAll: false }
  ];
  assert.strictEqual(replayEdits(edits), 'def farewell(name):\n    return "Hello, " + name\n');
});

h.summary();
