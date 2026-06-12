#!/usr/bin/env node
// Tests for buildFileStateHistory — intermediate state tracking at every replay step.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

console.log('\nbuildFileStateHistory:');

run('test_buildFileStateHistory_emptyEditsReturnsEmptyArray', function() {
  // Behavior: given no edits, the history should be empty.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var result = buildFileStateHistory([]);
  assert.deepStrictEqual(result, []);
});

run('test_buildFileStateHistory_singleCreateProducesOneStep', function() {
  // Behavior: a single create edit produces one step with correct contents and edit.content.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [{ line: 5, filePath: '/tmp/foo.txt', file: 'foo.txt', type: 'create', content: 'hello world' }];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].type, 'create');
  assert.strictEqual(steps[0].filename, 'foo.txt');
  assert.strictEqual(steps[0].contents, 'hello world');
  assert.strictEqual(steps[0].edit.content, 'hello world');
  assert.strictEqual(steps[0].isUserEdit, false);
  assert.strictEqual(steps[0].jsonl.line, 5);
});

run('test_buildFileStateHistory_editChainCapturesIntermediateContents', function() {
  // Behavior: a create followed by two edits produces 3 steps,
  // each with contents reflecting the state AFTER that edit.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'A B C' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit', oldString: 'A', newString: 'X' },
    { line: 3, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit', oldString: 'B', newString: 'Y' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps.length, 3);
  assert.strictEqual(steps[0].contents, 'A B C');
  assert.strictEqual(steps[1].contents, 'X B C');
  assert.strictEqual(steps[2].contents, 'X Y C');
});

run('test_buildFileStateHistory_expectedStateFromPreviousStep', function() {
  // Behavior: expectedState on step N comes from step N-1's contents.
  // On the first step, expectedState is '' (empty — no prior state).
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'AAA' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit', oldString: 'AAA', newString: 'BBB' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps[0].expectedState, '');
  assert.strictEqual(steps[1].expectedState, 'AAA');
});

run('test_buildFileStateHistory_originalFileSetsActualState', function() {
  // Behavior: when an edit has originalFile (non-null, non-empty),
  // actualState is populated with that originalFile content.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'original' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit',
      oldString: 'original', newString: 'modified',
      originalFile: 'original' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps[1].actualState, 'original');
});

run('test_buildFileStateHistory_originalFileMismatchEmitsUserEditStep', function() {
  // Behavior: when originalFile differs from previous step's contents,
  // a separate isUserEdit step is emitted BEFORE the agent step.
  // The user-edit step's contents is the originalFile value.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'version1' },
    { line: 5, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit',
      oldString: 'version1', newString: 'version3',
      originalFile: '# user added this\nversion1' }
  ];
  var steps = buildFileStateHistory(edits);
  // Step 0: create
  assert.strictEqual(steps[0].type, 'create');
  assert.strictEqual(steps[0].isUserEdit, false);
  // Step 1: user-edit step (injected)
  assert.strictEqual(steps[1].isUserEdit, true);
  assert.strictEqual(steps[1].contents, '# user added this\nversion1');
  assert.strictEqual(steps[1].type, 'edit');
  // Step 2: agent edit
  assert.strictEqual(steps[2].isUserEdit, false);
  assert.strictEqual(steps[2].contents, '# user added this\nversion3');
});

run('test_buildFileStateHistory_noUserEditWhenOriginalFileMatchesPrevious', function() {
  // Behavior: when originalFile matches previous contents, no user-edit step is emitted.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'same' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit',
      oldString: 'same', newString: 'different',
      originalFile: 'same' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps.length, 2);
  assert.strictEqual(steps[1].isUserEdit, false);
});

run('test_buildFileStateHistory_editSubObjectCarriesOldNewStrings', function() {
  // Behavior: for edit-type steps, the edit sub-object has oldString and newString.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'abc' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit', oldString: 'abc', newString: 'xyz' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps[1].edit.oldString, 'abc');
  assert.strictEqual(steps[1].edit.newString, 'xyz');
});

run('test_buildFileStateHistory_jsonlLinePopulatedCorrectly', function() {
  // Behavior: each step's jsonl.line matches the edit's line number.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 42, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'x' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps[0].jsonl.line, 42);
});

run('test_buildFileStateHistory_nullOriginalFileDoesNotSetActualState', function() {
  // Behavior: null or empty originalFile means no independent actual state.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'data' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit',
      oldString: 'data', newString: 'new', originalFile: null }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps[1].actualState, null);
});

run('test_buildFileStateHistory_emptyStringOriginalFileDoesNotTriggerUserEdit', function() {
  // Behavior: empty string originalFile (default) is not treated as user-edit signal.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'content' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'edit',
      oldString: 'content', newString: 'new', originalFile: '' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps.length, 2);
  assert.strictEqual(steps[1].isUserEdit, false);
});

run('test_buildFileStateHistory_updateTypeSetsEditContent', function() {
  // Behavior: update-type steps have edit.content set to the full content.
  var buildFileStateHistory = require('../common/file-state-history').buildFileStateHistory;
  var edits = [
    { line: 1, filePath: '/tmp/f.txt', file: 'f.txt', type: 'create', content: 'old' },
    { line: 2, filePath: '/tmp/f.txt', file: 'f.txt', type: 'update', content: 'replaced' }
  ];
  var steps = buildFileStateHistory(edits);
  assert.strictEqual(steps[1].type, 'update');
  assert.strictEqual(steps[1].edit.content, 'replaced');
  assert.strictEqual(steps[1].contents, 'replaced');
});

h.summary();
