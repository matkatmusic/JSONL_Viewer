#!/usr/bin/env node
// Tests for replayEdits — applying edit sequences to reconstruct file content.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var replayEdits = require('../common/replay-edits').replayEdits;

console.log('\nreplayEdits:');

run('test_replayEdits_createSetsContentFromEmpty', function() {
  var edits = [{ type: 'create', content: 'hello world' }];
  assert.strictEqual(replayEdits(edits), 'hello world');
});

run('test_replayEdits_updateReplacesEntireContent', function() {
  var edits = [
    { type: 'create', content: 'original' },
    { type: 'update', content: 'replaced' }
  ];
  assert.strictEqual(replayEdits(edits), 'replaced');
});

run('test_replayEdits_editReplacesFirstOccurrenceOfOldString', function() {
  var edits = [
    { type: 'create', content: 'aaa bbb aaa' },
    { type: 'edit', oldString: 'aaa', newString: 'ccc', replaceAll: false }
  ];
  assert.strictEqual(replayEdits(edits), 'ccc bbb aaa');
});

run('test_replayEdits_editWithReplaceAllReplacesAllOccurrences', function() {
  var edits = [
    { type: 'create', content: 'aaa bbb aaa' },
    { type: 'edit', oldString: 'aaa', newString: 'ccc', replaceAll: true }
  ];
  assert.strictEqual(replayEdits(edits), 'ccc bbb ccc');
});

run('test_replayEdits_sequentialEditsApplyInOrder', function() {
  // Each edit sees the result of the prior edit.
  var edits = [
    { type: 'create', content: 'A B C' },
    { type: 'edit', oldString: 'A', newString: 'X', replaceAll: false },
    { type: 'edit', oldString: 'B', newString: 'Y', replaceAll: false },
    { type: 'edit', oldString: 'C', newString: 'Z', replaceAll: false }
  ];
  assert.strictEqual(replayEdits(edits), 'X Y Z');
});

run('test_replayEdits_emptyEditsArrayReturnsEmptyString', function() {
  assert.strictEqual(replayEdits([]), '');
});

run('test_replayEdits_createAfterEditResetsContent', function() {
  // A second create after edits replaces everything.
  var edits = [
    { type: 'create', content: 'first version' },
    { type: 'edit', oldString: 'first', newString: 'modified', replaceAll: false },
    { type: 'create', content: 'completely new' }
  ];
  assert.strictEqual(replayEdits(edits), 'completely new');
});

run('test_replayEdits_multilineEditPreservesNewlines', function() {
  var edits = [
    { type: 'create', content: 'line1\nline2\nline3\n' },
    { type: 'edit', oldString: 'line2', newString: 'replaced2', replaceAll: false }
  ];
  assert.strictEqual(replayEdits(edits), 'line1\nreplaced2\nline3\n');
});

// ─── originalFile injection ─────────────────────────────────────────────────

console.log('\nreplayEdits (originalFile):');

run('test_replayEdits_originalFileOverridesAccumulatedContent', function() {
  // When an edit has originalFile, replay uses it instead of accumulated state.
  var edits = [
    { type: 'create', content: 'wrong accumulated state' },
    { type: 'edit', oldString: 'real', newString: 'REAL', replaceAll: false, originalFile: 'the real file content' }
  ];
  assert.strictEqual(replayEdits(edits), 'the REAL file content');
});

run('test_replayEdits_originalFileNullIsIgnored', function() {
  // null originalFile should not override accumulated content.
  var edits = [
    { type: 'create', content: 'aaa bbb' },
    { type: 'edit', oldString: 'aaa', newString: 'ccc', replaceAll: false, originalFile: null }
  ];
  assert.strictEqual(replayEdits(edits), 'ccc bbb');
});

run('test_replayEdits_originalFileCapturesUserEdits', function() {
  // User edited the file between create and agent edit.
  // originalFile contains "# user\ndef hello(): pass" — the user's version.
  // The agent's oldString→newString applies on top of that.
  var edits = [
    { type: 'create', content: 'def hello(): pass' },
    { type: 'edit', oldString: 'def hello(): pass', newString: 'def hello(): return 1', replaceAll: false, originalFile: '# user\ndef hello(): pass' }
  ];
  assert.strictEqual(replayEdits(edits), '# user\ndef hello(): return 1');
});

run('test_replayEdits_emptyStringOriginalFileIsIgnored', function() {
  // Empty string originalFile (default for edits without prior content) should not override.
  var edits = [
    { type: 'create', content: 'aaa bbb' },
    { type: 'edit', oldString: 'aaa', newString: 'ccc', replaceAll: false, originalFile: '' }
  ];
  assert.strictEqual(replayEdits(edits), 'ccc bbb');
});

h.summary();
