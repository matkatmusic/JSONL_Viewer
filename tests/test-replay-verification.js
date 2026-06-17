#!/usr/bin/env node
// Tests for api/replay-verification.js — replay + compare against a reference.
// Moved (Phase 5) from common/replay-edits.js. Ports test-verify.js
// (replayAndVerify + batchVerify), test-cumulative-replay.js
// (replayAndVerifyCumulative + collectSessionsForFile), and the replayAndVerify
// cat-integration test from test-cat.js.

var assert = require('assert');
var path = require('path');
var fs = require('fs');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../api/replay-verification');
var replayAndVerify = mod.replayAndVerify;
var batchVerify = mod.batchVerify;
var replayAndVerifyCumulative = mod.replayAndVerifyCumulative;
var collectSessionsForFile = mod.collectSessionsForFile;

console.log('\nreplayAndVerify:');

run('test_replayAndVerify_matchesWhenReplayEqualsOnDisk', function() {
  var jsonl = h.makeCreateLine('/tmp/foo.py', 'final content');
  var result = replayAndVerify(jsonl, 'final content');
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.totalEdits, 1);
  assert.strictEqual(result.kept, 1);
  assert.strictEqual(result.ignored, 0);
});

run('test_replayAndVerify_mismatchWhenReplayDiffersFromOnDisk', function() {
  var jsonl = h.makeCreateLine('/tmp/foo.py', 'wrong content');
  var result = replayAndVerify(jsonl, 'actual content');
  assert.strictEqual(result.match, false);
  assert.ok(result.diff.length > 0);
});

run('test_replayAndVerify_reportsCorrectFilename', function() {
  var jsonl = h.makeCreateLine('/Users/someone/project/scenario8.py', 'content');
  var result = replayAndVerify(jsonl, 'content');
  assert.strictEqual(result.filename, 'scenario8.py');
});

run('test_replayAndVerify_reportsReplayedContent', function() {
  var jsonl = h.makeCreateLine('/tmp/foo.py', 'the replayed text');
  var result = replayAndVerify(jsonl, 'the replayed text');
  assert.strictEqual(result.replayedContent, 'the replayed text');
});

run('test_replayAndVerify_multiEditSequenceProducesCorrectResult', function() {
  // create + edit sequence should replay to match on-disk.
  var finalContent = 'print("goodbye world")';
  var jsonl = [
    h.makeCreateLine('/tmp/foo.py', 'print("hello world")'),
    h.makeEditLine('/tmp/foo.py', 'hello', 'goodbye', false)
  ].join('\n');
  var result = replayAndVerify(jsonl, finalContent);
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.totalEdits, 2);
  assert.strictEqual(result.kept, 2);
});

run('test_replayAndVerify_matchesWhenOriginalFileCapturesUserEdit', function() {
  // End-to-end: create + user edit (via originalFile) + agent edit → matches on-disk.
  var onDisk = '# user\ndef goodbye(): return 1';
  var jsonl = [
    h.makeCreateLine('/tmp/foo.py', 'def hello(): pass'),
    h.makeEditLine('/tmp/foo.py', 'def hello(): pass', 'def goodbye(): return 1', false, '# user\ndef hello(): pass')
  ].join('\n');
  var result = replayAndVerify(jsonl, onDisk);
  assert.strictEqual(result.match, true);
});

run('test_replayAndVerify_matchesWhenCatCapturesManualEdits', function() {
  // Cat output captures user's manual edits; replay should match. (from test-cat.js)
  var jsonl = [
    h.makeCreateLine('/tmp/foo.py', 'original'),
    h.makeBashCatToolUse('cat-id-7', '/tmp/foo.py'),
    h.makeBashCatToolResult('cat-id-7', 'user edited')
  ].join('\n');
  var result = replayAndVerify(jsonl, 'user edited');
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.replayedContent, 'user edited');
});

// ─── batchVerify ────────────────────────────────────────────────────────────

console.log('\nbatchVerify:');

run('test_batchVerify_verifiesSingleJSONLFilePair', function() {
  var tmpBase = path.join(__dirname, '.test-tmp-' + Date.now());
  var jsonlDir = path.join(tmpBase, 'jsonl');
  var filesDir = path.join(tmpBase, 'files');
  fs.mkdirSync(jsonlDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });

  var pyContent = 'print("done")';
  var jsonlContent = h.makeCreateLine(filesDir + '/test.py', pyContent);
  fs.writeFileSync(path.join(jsonlDir, 'session1.jsonl'), jsonlContent);
  fs.writeFileSync(path.join(filesDir, 'test.py'), pyContent);

  try {
    var results = batchVerify(jsonlDir, filesDir);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].match, true);
    assert.strictEqual(results[0].filename, 'test.py');
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

run('test_batchVerify_skipsJSONLFilesWithNoMatchingOnDiskFile', function() {
  var tmpBase = path.join(__dirname, '.test-tmp-' + Date.now());
  var jsonlDir = path.join(tmpBase, 'jsonl');
  var filesDir = path.join(tmpBase, 'files');
  fs.mkdirSync(jsonlDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });

  var jsonlContent = h.makeCreateLine('/tmp/missing.py', 'content');
  fs.writeFileSync(path.join(jsonlDir, 'session1.jsonl'), jsonlContent);

  try {
    var results = batchVerify(jsonlDir, filesDir);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].match, false);
    assert.ok(results[0].diff.indexOf('not found') >= 0 || results[0].error !== undefined);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

// ─── replayAndVerifyCumulative (from test-cumulative-replay.js) ──────────────

console.log('\nreplayAndVerifyCumulative:');

run('test_replayAndVerifyCumulative_twoSessionsCreateThenEdit', function() {
  // session 1 creates foo.py with "hello\n", session 2 edits hello→goodbye.
  var session1 = [
    h.makeSystemLine('sess-1', 'main', '/repo'),
    h.makeCreateLine('/repo/foo.py', 'hello\n')
  ].join('\n');
  var session2 = [
    h.makeSystemLine('sess-2', 'main', '/repo'),
    h.makeEditLine('/repo/foo.py', 'hello', 'goodbye')
  ].join('\n');
  var result = replayAndVerifyCumulative([session1, session2], 'goodbye\n', 'foo.py');
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.replayedContent, 'goodbye\n');
});

run('test_replayAndVerifyCumulative_singleSessionSameAsNormal', function() {
  var session = [
    h.makeSystemLine('sess-1', 'main', '/repo'),
    h.makeCreateLine('/repo/bar.py', 'content\n')
  ].join('\n');
  var result = replayAndVerifyCumulative([session], 'content\n', 'bar.py');
  assert.strictEqual(result.match, true);
});

run('test_replayAndVerifyCumulative_threeSessionsChained', function() {
  var s1 = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/f.py', 'aaa\n')
  ].join('\n');
  var s2 = [
    h.makeSystemLine('s2', 'main', '/repo'),
    h.makeEditLine('/repo/f.py', 'aaa', 'bbb')
  ].join('\n');
  var s3 = [
    h.makeSystemLine('s3', 'main', '/repo'),
    h.makeEditLine('/repo/f.py', 'bbb', 'ccc')
  ].join('\n');
  var result = replayAndVerifyCumulative([s1, s2, s3], 'ccc\n', 'f.py');
  assert.strictEqual(result.match, true);
});

run('test_replayAndVerifyCumulative_mismatchReturnsCorrectDiff', function() {
  var session = [
    h.makeSystemLine('sess-1', 'main', '/repo'),
    h.makeCreateLine('/repo/x.py', 'actual\n')
  ].join('\n');
  var result = replayAndVerifyCumulative([session], 'expected\n', 'x.py');
  assert.strictEqual(result.match, false);
});

run('test_replayAndVerifyCumulative_emptySessionsArray', function() {
  var result = replayAndVerifyCumulative([], 'something', 'x.py');
  assert.strictEqual(result.match, false);
  assert.strictEqual(result.replayedContent, '');
});

run('test_replayAndVerifyCumulative_ignoresOtherFiles', function() {
  var session = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/a.py', 'alpha\n'),
    h.makeCreateLine('/repo/b.py', 'beta\n')
  ].join('\n');
  var result = replayAndVerifyCumulative([session], 'alpha\n', 'a.py');
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.replayedContent, 'alpha\n');
});

console.log('\ncollectSessionsForFile:');

run('test_collectSessionsForFile_findsMatchingSessions', function() {
  var s1 = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/foo.py', 'hello\n')
  ].join('\n');
  var s2 = [
    h.makeSystemLine('s2', 'main', '/repo'),
    h.makeCreateLine('/repo/bar.py', 'other\n')
  ].join('\n');
  var s3 = [
    h.makeSystemLine('s3', 'main', '/repo'),
    h.makeEditLine('/repo/foo.py', 'hello', 'goodbye')
  ].join('\n');
  var indices = collectSessionsForFile([s1, s2, s3], 'foo.py');
  assert.deepStrictEqual(indices, [0, 2]);
});

run('test_collectSessionsForFile_returnsEmptyWhenNoMatch', function() {
  var s1 = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/other.py', 'x\n')
  ].join('\n');
  var indices = collectSessionsForFile([s1], 'missing.py');
  assert.deepStrictEqual(indices, []);
});

h.summary();
