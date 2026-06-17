#!/usr/bin/env node
// Tests for api/edit-stream-extraction.js — the replay edit-stream representation.
//   extractEditsFromJSONL  (moved Phase 5 from common/replay-edits.js; ported
//                           from test-extract.js + the cat-integration tests
//                           from test-cat.js)
//   extractKeptEditsForFile (moved Phase 5 from tools/reconstruct.js; NEW direct
//                            coverage — reconstruct.js had no test)
//   fileModifyingEventsInTranscript (NEW Phase 5 — the diff viewer's file tree,
//                            groupEditsByFile over extractEditsFromJSONL)

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var mod = require('../api/edit-stream-extraction');
var extractEditsFromJSONL = mod.extractEditsFromJSONL;
var extractKeptEditsForFile = mod.extractKeptEditsForFile;
var fileModifyingEventsInTranscript = mod.fileModifyingEventsInTranscript;

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

// ─── cat integration (ported from test-cat.js) ──────────────────────────────

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

// ─── extractKeptEditsForFile (path-based; from tools/reconstruct.js) ─────────

console.log('\nextractKeptEditsForFile:');

runWithContext('test_extractKeptEditsForFile_returnsKeptEditsForTargetFile', function(ctx) {
  // Behavior: load a JSONL path, classify, return {kept, ignored, total} for the
  // target file. With no rewinds every edit is kept.
  var dir = ctx.tempDir('esx-');
  var jsonlPath = path.join(dir, 's.jsonl');
  fs.writeFileSync(jsonlPath, [
    h.makeCreateLine('/repo/foo.py', 'hello'),
    h.makeEditLine('/repo/foo.py', 'hello', 'goodbye', false)
  ].join('\n'));
  var result = extractKeptEditsForFile(jsonlPath, 'foo.py');
  assert.strictEqual(result.total, 2);
  assert.strictEqual(result.kept.length, 2);
  assert.strictEqual(result.ignored, 0);
  assert.strictEqual(result.kept[0].type, 'create');
});

runWithContext('test_extractKeptEditsForFile_excludesEditsForOtherFiles', function(ctx) {
  // Behavior: only edits whose basename matches the target are returned.
  var dir = ctx.tempDir('esx-');
  var jsonlPath = path.join(dir, 's.jsonl');
  fs.writeFileSync(jsonlPath, [
    h.makeCreateLine('/repo/a.py', 'alpha'),
    h.makeCreateLine('/repo/b.py', 'beta')
  ].join('\n'));
  var result = extractKeptEditsForFile(jsonlPath, 'a.py');
  assert.strictEqual(result.kept.length, 1);
  assert.strictEqual(result.kept[0].file, 'a.py');
});

// ─── fileModifyingEventsInTranscript (diff viewer's file tree) ───────────────

console.log('\nfileModifyingEventsInTranscript:');

run('test_fileModifyingEventsInTranscript_groupsEditsByFilePath', function() {
  // Behavior: groups every extracted edit by its filePath (the diff viewer tree).
  var jsonl = [
    h.makeCreateLine('/repo/a.py', 'alpha'),
    h.makeEditLine('/repo/a.py', 'alpha', 'ALPHA', false),
    h.makeCreateLine('/repo/b.py', 'beta')
  ].join('\n');
  var map = fileModifyingEventsInTranscript(jsonl);
  assert.deepStrictEqual(Object.keys(map).sort(), ['/repo/a.py', '/repo/b.py']);
  assert.strictEqual(map['/repo/a.py'].length, 2);
  assert.strictEqual(map['/repo/b.py'].length, 1);
});

run('test_fileModifyingEventsInTranscript_emptyForNoEdits', function() {
  // Behavior: a transcript with no file-modifying records yields an empty map.
  var jsonl = h.makeNonEditLine() + '\n' + h.makeNonEditLine();
  assert.deepStrictEqual(fileModifyingEventsInTranscript(jsonl), {});
});

h.summary();
