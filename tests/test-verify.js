#!/usr/bin/env node
// Tests for replayAndVerify and batchVerify — end-to-end replay + comparison.

var assert = require('assert');
var path = require('path');
var fs = require('fs');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../common/replay-edits');
var replayAndVerify = mod.replayAndVerify;
var batchVerify = mod.batchVerify;

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

h.summary();
