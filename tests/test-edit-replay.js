#!/usr/bin/env node
// Tests for api/edit-replay.js — applying edit sequences to reconstruct file
// content. replayEdits/applySingleEdit moved (Phase 5) from common/replay-edits.js.
// Ports test-replay.js (replayEdits) + the replayEdits-with-Read-edits
// integration tests from test-read.js, plus new granular applySingleEdit tests.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../api/edit-replay');
var replayEdits = mod.replayEdits;
var applySingleEdit = mod.applySingleEdit;

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

// ─── Read-sourced edits (ported from test-read.js) ──────────────────────────

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

// ─── applySingleEdit (new granular coverage; it is now a first-class export) ──

console.log('\napplySingleEdit:');

run('test_applySingleEdit_createReturnsItsContentRegardlessOfPrior', function() {
  // A create edit ignores prior content and sets its own.
  assert.strictEqual(applySingleEdit({ type: 'create', content: 'new' }, 'old'), 'new');
});

run('test_applySingleEdit_editReplacesWithinPriorContent', function() {
  // An edit applies its oldString→newString onto the accumulated content.
  var edit = { type: 'edit', oldString: 'b', newString: 'X', replaceAll: false };
  assert.strictEqual(applySingleEdit(edit, 'a b c'), 'a X c');
});

run('test_applySingleEdit_unknownTypeReturnsContentUnchanged', function() {
  // An unrecognized edit type is a no-op on the content.
  assert.strictEqual(applySingleEdit({ type: 'mystery' }, 'unchanged'), 'unchanged');
});

h.summary();
