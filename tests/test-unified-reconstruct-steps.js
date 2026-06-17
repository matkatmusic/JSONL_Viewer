#!/usr/bin/env node
// Tests for api/unified-reconstruct-steps.js — step extraction from JSONL.
// Split (Phase 5) from the over-cap test-unified-reconstruct.js so each module
// of the moved trio has its own test-<basename>.js suite. Assertions unchanged.

var assert = require('assert');
var t = require('./test-helpers');
var run = t.run;
var summary = t.summary;

var s = require('../api/unified-reconstruct-steps');

console.log('test-unified-reconstruct-steps.js\n');

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSnapshotLine(targetFile, content) {
  var backups = {};
  backups[targetFile] = { content: content };
  return JSON.stringify({
    type: 'file-history-snapshot',
    snapshot: { trackedFileBackups: backups }
  });
}

function makeEditWithPatch(filePath, oldStr, newStr, originalFile, hunks) {
  return JSON.stringify({
    type: 'assistant',
    toolUseResult: {
      filePath: filePath,
      oldString: oldStr,
      newString: newStr,
      replaceAll: false,
      originalFile: originalFile,
      structuredPatch: hunks
    }
  });
}

// ─── makeStep ─────────────────────────────────────────────────────────────────

run('makeStep creates step with null defaults', function() {
  // Scenario: calling makeStep with empty fields produces all-null source fields
  var step = s.makeStep(0, '', 'test.jsonl', {});
  assert.strictEqual(step.line, 0);
  assert.strictEqual(step.snapshot, null);
  assert.strictEqual(step.originalFile, null);
  assert.strictEqual(step.readResult, null);
  assert.strictEqual(step.bashReadResult, null);
  assert.strictEqual(step.structuredPatch, null);
  assert.strictEqual(step.edit, null);
});

run('makeStep populates provided snapshot field', function() {
  // Scenario: providing a snapshot field populates it while others stay null
  var step = s.makeStep(5, '2026-01-01', 's.jsonl', { snapshot: 'hello' });
  assert.strictEqual(step.snapshot, 'hello');
  assert.strictEqual(step.line, 5);
  assert.strictEqual(step.timestamp, '2026-01-01');
  assert.strictEqual(step.edit, null);
});

run('makeStep populates edit and originalFile together', function() {
  // Scenario: providing edit + originalFile populates both
  var edit = { type: 'edit', oldString: 'a', newString: 'b' };
  var step = s.makeStep(3, '', 'x.jsonl', { edit: edit, originalFile: 'full content' });
  assert.strictEqual(step.edit.type, 'edit');
  assert.strictEqual(step.originalFile, 'full content');
  assert.strictEqual(step.snapshot, null);
});

// ─── Snapshot extraction ──────────────────────────────────────────────────────

run('getSnapshotContentForFile finds exact path match', function() {
  // Scenario: trackedFileBackups has the exact target file path
  var snap = { trackedFileBackups: { '/path/to/file.py': { content: 'hello' } } };
  assert.strictEqual(s.getSnapshotContentForFile(snap, '/path/to/file.py', 'file.py'), 'hello');
});

run('getSnapshotContentForFile finds basename match', function() {
  // Scenario: trackedFileBackups key differs in path but basename matches
  var snap = { trackedFileBackups: { '/other/path/file.py': { content: 'world' } } };
  assert.strictEqual(s.getSnapshotContentForFile(snap, '/my/path/file.py', 'file.py'), 'world');
});

run('getSnapshotContentForFile returns null when no match', function() {
  // Scenario: no backup entry matches the target file
  var snap = { trackedFileBackups: { '/path/other.py': { content: 'x' } } };
  assert.strictEqual(s.getSnapshotContentForFile(snap, '/path/file.py', 'file.py'), null);
});

run('getSnapshotContentForFile returns null for missing content field', function() {
  // Scenario: backup entry exists but only has backupFileName, not content
  var snap = { trackedFileBackups: { '/path/file.py': { backupFileName: 'abc.bak' } } };
  assert.strictEqual(s.getSnapshotContentForFile(snap, '/path/file.py', 'file.py'), null);
});

run('getSnapshotContentForFile handles null snapshot object', function() {
  // Scenario: null or undefined snapshot
  assert.strictEqual(s.getSnapshotContentForFile(null, '/path/file.py', 'file.py'), null);
});

// ─── Edit step building ──────────────────────────────────────────────────────

run('buildEditStep extracts create edit', function() {
  // Scenario: toolUseResult with type=create for the target file
  var tr = { type: 'create', filePath: '/p/file.py', content: 'new file', structuredPatch: [], originalFile: null };
  var step = s.buildEditStep(tr, 5, '', '/p/file.py', 'file.py', 'test.jsonl');
  assert.strictEqual(step.edit.type, 'create');
  assert.strictEqual(step.edit.content, 'new file');
  assert.strictEqual(step.originalFile, null);
  assert.strictEqual(step.structuredPatch, null);
});

run('buildEditStep extracts edit with originalFile and structuredPatch', function() {
  // Scenario: toolUseResult with oldString/newString, originalFile, and hunks
  var hunks = [{ oldStart: 1, lines: ['-old', '+new'] }];
  var tr = {
    filePath: '/p/file.py', oldString: 'old', newString: 'new',
    originalFile: 'full original', structuredPatch: hunks
  };
  var step = s.buildEditStep(tr, 10, '', '/p/file.py', 'file.py', 'test.jsonl');
  assert.strictEqual(step.edit.type, 'edit');
  assert.strictEqual(step.originalFile, 'full original');
  assert.strictEqual(step.structuredPatch.length, 1);
});

run('buildEditStep returns null for wrong file', function() {
  // Scenario: toolUseResult targets a different file
  var tr = { type: 'create', filePath: '/p/other.py', content: 'x', structuredPatch: [] };
  assert.strictEqual(s.buildEditStep(tr, 0, '', '/p/file.py', 'file.py', 'test.jsonl'), null);
});

run('buildEditStep returns null for irrelevant toolUseResult', function() {
  // Scenario: toolUseResult without create/update/edit indicators
  var tr = { filePath: '/p/file.py', stdout: 'some output' };
  assert.strictEqual(s.buildEditStep(tr, 0, '', '/p/file.py', 'file.py', 'test.jsonl'), null);
});

// ─── matchesTargetFile ────────────────────────────────────────────────────────

run('matchesTargetFile matches exact path', function() {
  // Scenario: exact path equality
  assert.strictEqual(s.matchesTargetFile('/p/file.py', '/p/file.py', 'file.py'), true);
});

run('matchesTargetFile matches by basename', function() {
  // Scenario: different directory but same filename
  assert.strictEqual(s.matchesTargetFile('/other/file.py', '/p/file.py', 'file.py'), true);
});

run('matchesTargetFile rejects different file', function() {
  // Scenario: different filename entirely
  assert.strictEqual(s.matchesTargetFile('/p/other.py', '/p/file.py', 'file.py'), false);
});

// ─── Step extraction integration ─────────────────────────────────────────────

run('extractStepsFromSingleJSONL extracts snapshot step', function() {
  // Scenario: JSONL with one snapshot for the target file
  var jsonl = makeSnapshotLine('/p/file.py', 'snap content');
  var steps = s.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].snapshot, 'snap content');
  assert.strictEqual(steps[0].sourceFile, 'test.jsonl');
});

run('extractStepsFromSingleJSONL extracts edit step', function() {
  // Scenario: JSONL with one create toolUseResult
  var jsonl = t.makeCreateLine('/p/file.py', 'new file');
  var steps = s.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].edit.type, 'create');
  assert.strictEqual(steps[0].edit.content, 'new file');
});

run('extractStepsFromSingleJSONL extracts read step', function() {
  // Scenario: JSONL with Read tool_use and tool_result pair
  var jsonl = t.makeReadToolUse('read-1', '/p/file.py') + '\n' +
    t.makeReadToolResult('read-1', '1\thello\n2\tworld');
  var steps = s.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].readResult, 'hello\nworld');
});

run('extractStepsFromSingleJSONL extracts cat step', function() {
  // Scenario: JSONL with Bash cat tool_use and tool_result pair
  var jsonl = t.makeBashCatToolUse('cat-1', '/p/file.py') + '\n' +
    t.makeBashCatToolResult('cat-1', 'cat content');
  var steps = s.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].bashReadResult, 'cat content');
});

run('extractStepsFromSingleJSONL sorts steps by line number', function() {
  // Scenario: edit at line 0, snapshot at line 1 — both extracted and sorted
  var jsonl = t.makeCreateLine('/p/file.py', 'v1') + '\n' +
    makeSnapshotLine('/p/file.py', 'v2');
  var steps = s.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 2);
  assert.ok(steps[0].line <= steps[1].line);
});

run('extractStepsFromSingleJSONL ignores unrelated files', function() {
  // Scenario: JSONL with edits for a different file
  var jsonl = t.makeCreateLine('/p/other.py', 'content');
  var steps = s.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 0);
});

run('extractStepsFromSingleJSONL extracts edit with structuredPatch', function() {
  // Scenario: toolUseResult has originalFile and structuredPatch
  var hunks = [{ oldStart: 1, lines: ['-old', '+new'] }];
  var jsonl = makeEditWithPatch('/p/file.py', 'old', 'new', 'old content', hunks);
  var steps = s.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].originalFile, 'old content');
  assert.strictEqual(steps[0].structuredPatch.length, 1);
});

run('extractStepsFromJSONLs merges steps from multiple sources', function() {
  // Scenario: two JSONL texts, each with one step — merged into one sorted list
  var jsonl1 = t.makeCreateLine('/p/file.py', 'v1');
  var jsonl2 = makeSnapshotLine('/p/file.py', 'v2');
  var steps = s.extractStepsFromJSONLs([
    { text: jsonl1, path: 'a.jsonl' },
    { text: jsonl2, path: 'b.jsonl' }
  ], '/p/file.py');
  assert.strictEqual(steps.length, 2);
});

summary();
