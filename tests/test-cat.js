#!/usr/bin/env node
// Tests for Bash cat snapshot detection — stripCatLineNumbers, extractBashCatEdits,
// and their integration with extractEditsFromJSONL and replayAndVerify.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../common/replay-edits');
var stripCatLineNumbers = mod.stripCatLineNumbers;
var extractBashCatEdits = mod.extractBashCatEdits;
var extractEditsFromJSONL = mod.extractEditsFromJSONL;
var replayAndVerify = mod.replayAndVerify;

// ─── stripCatLineNumbers ────────────────────────────────────────────────────

console.log('\nstripCatLineNumbers:');

run('test_stripCatLineNumbers_stripsPipeFormat', function() {
  // " 1 │ content" format from cat -n with unicode box character.
  var input = ' 1 │ hello\n 2 │ world\n';
  assert.strictEqual(stripCatLineNumbers(input), 'hello\nworld\n');
});

run('test_stripCatLineNumbers_stripsTabFormat', function() {
  // "     1\tcontent" format from standard GNU/BSD cat -n.
  var input = '     1\thello\n     2\tworld\n';
  assert.strictEqual(stripCatLineNumbers(input), 'hello\nworld\n');
});

run('test_stripCatLineNumbers_returnsUnchangedWhenNoLineNumbers', function() {
  var input = 'hello\nworld\n';
  assert.strictEqual(stripCatLineNumbers(input), 'hello\nworld\n');
});

run('test_stripCatLineNumbers_handlesEmptyString', function() {
  assert.strictEqual(stripCatLineNumbers(''), '');
});

// ─── extractBashCatEdits ────────────────────────────────────────────────────

console.log('\nextractBashCatEdits:');

function parseToParsed(jsonl) {
  var lines = jsonl.split('\n').filter(Boolean);
  var parsed = lines.map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } });
  return { lines: lines, parsed: parsed };
}

run('test_extractBashCatEdits_detectsCatCommand', function() {
  // Finds a Bash cat tool_use + matching tool_result and returns an update edit.
  var catStdout = ' 1 │ hello\n 2 │ world\n';
  var jsonl = [h.makeNonEditLine(), h.makeBashCatToolUse('cat-id-1', '/tmp/foo.py'), h.makeBashCatToolResult('cat-id-1', catStdout)].join('\n');
  var p = parseToParsed(jsonl);
  var result = extractBashCatEdits(p.lines, p.parsed);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].type, 'update');
  assert.strictEqual(result[0].content, 'hello\nworld\n');
  assert.strictEqual(result[0].file, 'foo.py');
});

run('test_extractBashCatEdits_ignoresPipedCatCommands', function() {
  // Piped commands (cat file | grep) are not file snapshots.
  var jsonl = [h.makeBashPipedCatToolUse('cat-id-2', '/tmp/foo.py'), h.makeBashCatToolResult('cat-id-2', 'hello')].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractBashCatEdits(p.lines, p.parsed).length, 0);
});

run('test_extractBashCatEdits_linksToolUseToResultById', function() {
  // Only the matching tool_use_id pairs; mismatched IDs produce no result.
  var jsonl = [h.makeBashCatToolUse('cat-id-3', '/tmp/foo.py'), h.makeBashCatToolResult('different-id', ' 1 │ wrong')].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractBashCatEdits(p.lines, p.parsed).length, 0);
});

run('test_extractBashCatEdits_stripsLineNumbersFromOutput', function() {
  var catStdout = '     1\tdef foo():\n     2\t    pass\n';
  var jsonl = [h.makeBashCatToolUse('cat-id-4', '/tmp/bar.py'), h.makeBashCatToolResult('cat-id-4', catStdout)].join('\n');
  var p = parseToParsed(jsonl);
  assert.strictEqual(extractBashCatEdits(p.lines, p.parsed)[0].content, 'def foo():\n    pass\n');
});

// ─── Integration with extractEditsFromJSONL ─────────────────────────────────

console.log('\nextractEditsFromJSONL (cat integration):');

run('test_extractEditsFromJSONL_includesBashCatAsUpdate', function() {
  // Cat snapshot appears as an 'update' edit merged into the edits array.
  var jsonl = [
    h.makeCreateLine('/tmp/foo.py', 'original'),
    h.makeBashCatToolUse('cat-id-5', '/tmp/foo.py'),
    h.makeBashCatToolResult('cat-id-5', ' 1 │ modified by user\n')
  ].join('\n');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].type, 'create');
  assert.strictEqual(result[1].type, 'update');
  assert.strictEqual(result[1].content, 'modified by user\n');
});

run('test_extractEditsFromJSONL_catSnapshotMergedInOrder', function() {
  // create at line 0, cat result at line 2, edit at line 3 → sorted by line.
  var jsonl = [
    h.makeCreateLine('/tmp/foo.py', 'AAA'),
    h.makeBashCatToolUse('cat-id-6', '/tmp/foo.py'),
    h.makeBashCatToolResult('cat-id-6', 'BBB'),
    h.makeEditLine('/tmp/foo.py', 'BBB', 'CCC', false)
  ].join('\n');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].line, 0);
  assert.strictEqual(result[1].line, 2);
  assert.strictEqual(result[2].line, 3);
});

// ─── Integration with replayAndVerify ───────────────────────────────────────

console.log('\nreplayAndVerify (cat integration):');

run('test_replayAndVerify_matchesWhenCatCapturesManualEdits', function() {
  // Cat output captures user's manual edits; replay should match.
  var jsonl = [
    h.makeCreateLine('/tmp/foo.py', 'original'),
    h.makeBashCatToolUse('cat-id-7', '/tmp/foo.py'),
    h.makeBashCatToolResult('cat-id-7', 'user edited')
  ].join('\n');
  var result = replayAndVerify(jsonl, 'user edited');
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.replayedContent, 'user edited');
});

h.summary();
