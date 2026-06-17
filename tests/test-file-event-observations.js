// Tests for api/file-event-observations.js — the four raw observation
// extractors moved (Phase 4) from common/extract-file-state.js:
//   stripCatLineNumbers, extractBashCatEdits  (from tests/test-cat.js)
//   extractReadEdits                          (from tests/test-read.js)
//   extractSnapshotEdits                      (from tests/test-extract-file-state.js)
// The replay-edits integration tests stay in test-cat.js/test-read.js; the
// findLastSnapshot* tests stay in test-extract-file-state.js.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var obs = require('../api/file-event-observations');
var stripCatLineNumbers = obs.stripCatLineNumbers;
var extractBashCatEdits = obs.extractBashCatEdits;
var extractReadEdits = obs.extractReadEdits;

function parseToParsed(jsonl) {
  var lines = jsonl.split('\n').filter(Boolean);
  var parsed = lines.map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } });
  return { lines: lines, parsed: parsed };
}

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

// ─── extractReadEdits ───────────────────────────────────────────────────────

console.log('\nextractReadEdits:');

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

// ─── extractSnapshotEdits ───────────────────────────────────────────────────
// Moved from tests/test-extract-file-state.js (the findLastSnapshot* tests stay
// there). Honors the baseHistoryDir override when materializing snapshot edits.

console.log('\nextractSnapshotEdits:');

// Build a file-history-snapshot JSONL record mapping one tracked file to a backup blob.
function snapshotLine(sessionId, trackedPath, backupFileName) {
  return JSON.stringify({
    type: 'file-history-snapshot',
    sessionId: sessionId,
    snapshot: { trackedFileBackups: { [trackedPath]: { backupFileName: backupFileName } } }
  });
}

// Create <baseHistoryDir>/<sessionId>/<backupFileName> with content; return baseHistoryDir.
function writeBackupBlob(ctx, sessionId, backupFileName, content) {
  var fs = require('fs'), path = require('path');
  var base = ctx.tempDir('hist-');
  var sessDir = path.join(base, sessionId);
  fs.mkdirSync(sessDir);
  fs.writeFileSync(path.join(sessDir, backupFileName), content);
  return base;
}

runWithContext('test_extractSnapshotEdits_readsBackupsFromCustomBaseHistoryDir', function (ctx) {
  // Behavior: extractSnapshotEdits honors baseHistoryDir when materializing snapshot edits.
  // Step: stage a backup blob and a parsed snapshot record referencing it.
  var base = writeBackupBlob(ctx, 'sess3', 'backup-z.txt', 'Z CONTENT');
  var parsed = [JSON.parse(snapshotLine('sess3', '/repo/z.js', 'backup-z.txt'))];
  // Step: extract snapshot edits against the custom base dir.
  var edits = obs.extractSnapshotEdits([''], parsed, 'sess3', base);
  // Step: one snapshot edit, carrying the blob content and source tag.
  assert.strictEqual(edits.length, 1);
  assert.strictEqual(edits[0].filePath, '/repo/z.js');
  assert.strictEqual(edits[0].content, 'Z CONTENT');
  assert.strictEqual(edits[0].source, 'snapshot');
});

h.summary();
