#!/usr/bin/env node
// Tests for extractEditsFromJSONL — parsing JSONL lines into edit objects.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../common/replay-edits');
var extractEditsFromJSONL = mod.extractEditsFromJSONL;

console.log('\nextractEditsFromJSONL:');

run('test_extractEditsFromJSONL_returnsEmptyArrayForNoEdits', function() {
  var jsonl = h.makeNonEditLine() + '\n' + h.makeNonEditLine();
  var result = extractEditsFromJSONL(jsonl);
  assert.deepStrictEqual(result, []);
});

run('test_extractEditsFromJSONL_extractsSingleCreateOperation', function() {
  var jsonl = h.makeNonEditLine() + '\n' + h.makeCreateLine('/tmp/foo.py', 'print("hello")');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].type, 'create');
  assert.strictEqual(result[0].filePath, '/tmp/foo.py');
  assert.strictEqual(result[0].content, 'print("hello")');
  assert.strictEqual(result[0].line, 1);
});

run('test_extractEditsFromJSONL_extractsSingleEditOperation', function() {
  // Should return one edit with oldString, newString, and replaceAll fields.
  var jsonl = h.makeEditLine('/tmp/foo.py', 'hello', 'world', false);
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].type, 'edit');
  assert.strictEqual(result[0].oldString, 'hello');
  assert.strictEqual(result[0].newString, 'world');
  assert.strictEqual(result[0].replaceAll, false);
});

run('test_extractEditsFromJSONL_extractsUpdateOperation', function() {
  var jsonl = h.makeUpdateLine('/tmp/foo.py', 'updated content');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].type, 'update');
  assert.strictEqual(result[0].content, 'updated content');
});

run('test_extractEditsFromJSONL_preservesOrderAcrossMultipleEdits', function() {
  var jsonl = [
    h.makeCreateLine('/tmp/foo.py', 'initial'),
    h.makeEditLine('/tmp/foo.py', 'initial', 'modified', false),
    h.makeUpdateLine('/tmp/foo.py', 'final')
  ].join('\n');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].type, 'create');
  assert.strictEqual(result[1].type, 'edit');
  assert.strictEqual(result[2].type, 'update');
  assert.strictEqual(result[0].line, 0);
  assert.strictEqual(result[1].line, 1);
  assert.strictEqual(result[2].line, 2);
});

run('test_extractEditsFromJSONL_extractsFilenameFromFullPath', function() {
  var jsonl = h.makeCreateLine('/Users/someone/project/scenario5.py', 'content');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result[0].file, 'scenario5.py');
});

run('test_extractEditsFromJSONL_handlesReplaceAllFlag', function() {
  var jsonl = h.makeEditLine('/tmp/foo.py', 'x', 'y', true);
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result[0].replaceAll, true);
});

run('test_extractEditsFromJSONL_skipsNonEditLines', function() {
  var jsonl = [
    h.makeNonEditLine(),
    h.makeCreateLine('/tmp/foo.py', 'code'),
    h.makeNonEditLine(),
    h.makeNonEditLine()
  ].join('\n');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 1);
});

run('test_extractEditsFromJSONL_handlesMalformedJsonLines', function() {
  var jsonl = 'not valid json\n' + h.makeCreateLine('/tmp/foo.py', 'ok');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result.length, 1);
});

run('test_extractEditsFromJSONL_extractsOriginalFileFromEditOperation', function() {
  // originalFile on an edit should be preserved in the returned edit object.
  var jsonl = h.makeEditLine('/tmp/foo.py', 'old', 'new', false, 'full file before edit');
  var result = extractEditsFromJSONL(jsonl);
  assert.strictEqual(result[0].originalFile, 'full file before edit');
});

h.summary();
