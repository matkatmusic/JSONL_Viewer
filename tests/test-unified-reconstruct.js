#!/usr/bin/env node
// Tests for api/unified-reconstruct.js — drift detection, source application,
// rewind handling, and full reconstruction. The patch-op and step-extraction
// tests were split (Phase 5) into test-unified-reconstruct-patch.js and
// test-unified-reconstruct-steps.js so each module of the moved trio has its own
// test-<basename>.js suite (and to fit the 300-line test-file cap). Assertions
// unchanged. makeStep is reached via the main module's re-export.

var assert = require('assert');
var t = require('./test-helpers');
var run = t.run;
var summary = t.summary;

var u = require('../api/unified-reconstruct');

console.log('test-unified-reconstruct.js\n');

function makeSnapshotLine(targetFile, content) {
  var backups = {};
  backups[targetFile] = { content: content };
  return JSON.stringify({
    type: 'file-history-snapshot',
    snapshot: { trackedFileBackups: backups }
  });
}

// ─── Drift detection ─────────────────────────────────────────────────────────

run('detectFullContentDrift returns null when identical', function() {
  // Scenario: state and source have the same content
  assert.strictEqual(u.detectFullContentDrift('hello', 'hello'), null);
});

run('detectFullContentDrift returns diff when different', function() {
  // Scenario: state and source differ
  var result = u.detectFullContentDrift('old', 'new');
  assert.strictEqual(result.before, 'old');
  assert.strictEqual(result.after, 'new');
});

run('detectDrift returns null when snapshot matches state', function() {
  // Scenario: state content equals the snapshot content
  var state = { content: 'hello' };
  var step = u.makeStep(0, '', '', { snapshot: 'hello' });
  assert.strictEqual(u.detectDrift(state, step), null);
});

run('detectDrift returns diff when snapshot differs', function() {
  // Scenario: state content differs from snapshot — user edited the file
  var state = { content: 'old' };
  var step = u.makeStep(0, '', '', { snapshot: 'new' });
  var drift = u.detectDrift(state, step);
  assert.strictEqual(drift.before, 'old');
  assert.strictEqual(drift.after, 'new');
});

run('detectDrift checks originalFile when present', function() {
  // Scenario: originalFile differs from state
  var state = { content: 'modified' };
  var edit = { type: 'edit', oldString: 'x', newString: 'y' };
  var step = u.makeStep(0, '', '', { originalFile: 'original', edit: edit });
  var drift = u.detectDrift(state, step);
  assert.strictEqual(drift.after, 'original');
});

run('detectDrift returns null when no source available', function() {
  // Scenario: step has only an edit (no ground-truth source)
  var state = { content: 'anything' };
  var step = u.makeStep(0, '', '', { edit: { type: 'create', content: 'new' } });
  assert.strictEqual(u.detectDrift(state, step), null);
});

run('detectDrift checks readResult', function() {
  // Scenario: readResult differs from state
  var state = { content: 'stale' };
  var step = u.makeStep(0, '', '', { readResult: 'fresh' });
  var drift = u.detectDrift(state, step);
  assert.strictEqual(drift.after, 'fresh');
});

run('detectDrift checks bashReadResult', function() {
  // Scenario: bashReadResult differs from state
  var state = { content: 'stale' };
  var step = u.makeStep(0, '', '', { bashReadResult: 'cat output' });
  var drift = u.detectDrift(state, step);
  assert.strictEqual(drift.after, 'cat output');
});

// ─── Source application ───────────────────────────────────────────────────────

run('applySourceToState sets content from snapshot', function() {
  // Scenario: snapshot overrides current state
  var state = { content: 'old' };
  u.applySourceToState(state, u.makeStep(0, '', '', { snapshot: 'snap content' }));
  assert.strictEqual(state.content, 'snap content');
});

run('applySourceToState applies edit to originalFile', function() {
  // Scenario: edit with originalFile — replacement applied to originalFile base
  var state = { content: '' };
  var edit = { type: 'edit', oldString: 'hello', newString: 'world', replaceAll: false, originalFile: 'say hello' };
  u.applySourceToState(state, u.makeStep(0, '', '', { originalFile: 'say hello', edit: edit }));
  assert.strictEqual(state.content, 'say world');
});

run('applySourceToState sets content from readResult', function() {
  // Scenario: readResult overrides current state
  var state = { content: 'old' };
  u.applySourceToState(state, u.makeStep(0, '', '', { readResult: 'read content' }));
  assert.strictEqual(state.content, 'read content');
});

run('applySourceToState sets content from bashReadResult', function() {
  // Scenario: bashReadResult overrides current state
  var state = { content: 'old' };
  u.applySourceToState(state, u.makeStep(0, '', '', { bashReadResult: 'cat output' }));
  assert.strictEqual(state.content, 'cat output');
});

run('applySourceToState applies structuredPatch', function() {
  // Scenario: structuredPatch splices lines into current state
  var state = { content: 'a\nb\nc' };
  var patch = [{ oldStart: 2, lines: ['-b', '+B'] }];
  u.applySourceToState(state, u.makeStep(0, '', '', { structuredPatch: patch }));
  assert.strictEqual(state.content, 'a\nB\nc');
});

run('applySourceToState applies create edit as lowest-priority fallback', function() {
  // Scenario: create edit with no higher-confidence source
  var state = { content: '' };
  var edit = { type: 'create', content: 'new file content' };
  u.applySourceToState(state, u.makeStep(0, '', '', { edit: edit }));
  assert.strictEqual(state.content, 'new file content');
});

// ─── classifySourceType ───────────────────────────────────────────────────────

run('classifySourceType returns correct type for each source', function() {
  // Scenario: each source type maps to its string label
  assert.strictEqual(u.classifySourceType(u.makeStep(0, '', '', { snapshot: 'x' })), 'snapshot');
  assert.strictEqual(u.classifySourceType(u.makeStep(0, '', '', { originalFile: 'x', edit: {} })), 'originalFile');
  assert.strictEqual(u.classifySourceType(u.makeStep(0, '', '', { readResult: 'x' })), 'readResult');
  assert.strictEqual(u.classifySourceType(u.makeStep(0, '', '', { bashReadResult: 'x' })), 'bashReadResult');
  assert.strictEqual(u.classifySourceType(u.makeStep(0, '', '', { structuredPatch: [{}] })), 'structuredPatch');
  assert.strictEqual(u.classifySourceType(u.makeStep(0, '', '', { edit: {} })), 'edit');
});

// ─── Core algorithm ───────────────────────────────────────────────────────────

run('applyAndAccountForDrift records AgentEdit when state changes', function() {
  // Scenario: create edit changes state from '' to 'hello' — one AgentEdit
  var state = { content: '', patches: [] };
  var edit = { type: 'create', content: 'hello' };
  u.applyAndAccountForDrift(state, u.makeStep(0, 'ts1', 'test.jsonl', { edit: edit }));
  assert.strictEqual(state.content, 'hello');
  assert.strictEqual(state.patches.length, 1);
  assert.strictEqual(state.patches[0].type, 'AgentEdit');
  assert.strictEqual(state.patches[0].diff.before, '');
  assert.strictEqual(state.patches[0].diff.after, 'hello');
});

run('applyAndAccountForDrift records UserEdit and AgentEdit on drift', function() {
  // Scenario: state is 'stale', snapshot says 'current' — both recorded
  var state = { content: 'stale', patches: [] };
  u.applyAndAccountForDrift(state, u.makeStep(0, 'ts1', 'test.jsonl', { snapshot: 'current' }));
  assert.strictEqual(state.content, 'current');
  assert.strictEqual(state.patches.length, 2);
  assert.strictEqual(state.patches[0].type, 'UserEdit');
  assert.strictEqual(state.patches[1].type, 'AgentEdit');
});

run('applyAndAccountForDrift records nothing when state matches snapshot', function() {
  // Scenario: state already matches snapshot — no drift, no change
  var state = { content: 'same', patches: [] };
  u.applyAndAccountForDrift(state, u.makeStep(0, '', 'test.jsonl', { snapshot: 'same' }));
  assert.strictEqual(state.patches.length, 0);
});

run('applyAndAccountForDrift records patch metadata correctly', function() {
  // Scenario: verify patch has correct line, timestamp, sourceType
  var state = { content: '', patches: [] };
  var edit = { type: 'create', content: 'x' };
  u.applyAndAccountForDrift(state, u.makeStep(42, 'ts-42', 'src.jsonl', { edit: edit }));
  assert.strictEqual(state.patches[0].line, 42);
  assert.strictEqual(state.patches[0].timestamp, 'ts-42');
  assert.strictEqual(state.patches[0].sourceType, 'edit');
});

// ─── Rewind handling ──────────────────────────────────────────────────────────

run('isLineIgnoredByRewind detects ignored line within range', function() {
  // Scenario: line falls between parentLine and landingLine of code-restoration
  var rewinds = [{ parentLine: 5, landingLine: 20, classification: 'code-restoration' }];
  assert.strictEqual(u.isLineIgnoredByRewind(10, rewinds), true);
});

run('isLineIgnoredByRewind keeps line before rewind range', function() {
  // Scenario: line is before the rewind's parentLine
  var rewinds = [{ parentLine: 5, landingLine: 20, classification: 'code-restoration' }];
  assert.strictEqual(u.isLineIgnoredByRewind(3, rewinds), false);
});

run('isLineIgnoredByRewind keeps line after rewind range', function() {
  // Scenario: line is after the rewind's landingLine
  var rewinds = [{ parentLine: 5, landingLine: 20, classification: 'code-restoration' }];
  assert.strictEqual(u.isLineIgnoredByRewind(25, rewinds), false);
});

run('isLineIgnoredByRewind ignores non-code-restoration rewinds', function() {
  // Scenario: rewind exists but is prompt-retry, not code-restoration
  var rewinds = [{ parentLine: 5, landingLine: 20, classification: 'prompt-retry' }];
  assert.strictEqual(u.isLineIgnoredByRewind(10, rewinds), false);
});

run('makeObservationOnly strips edit fields', function() {
  // Scenario: step with all fields — observation-only keeps only snapshot/read/cat
  var step = u.makeStep(5, 'ts', 'f.jsonl', {
    snapshot: 'snap', edit: { type: 'create' }, originalFile: 'orig',
    structuredPatch: [{}], readResult: 'rd', bashReadResult: 'cat'
  });
  var obs = u.makeObservationOnly(step);
  assert.strictEqual(obs.snapshot, 'snap');
  assert.strictEqual(obs.readResult, 'rd');
  assert.strictEqual(obs.bashReadResult, 'cat');
  assert.strictEqual(obs.edit, null);
  assert.strictEqual(obs.originalFile, null);
  assert.strictEqual(obs.structuredPatch, null);
  assert.strictEqual(obs.line, 5);
});

run('hasObservation returns true for snapshot step', function() {
  // Scenario: step with a snapshot is an observation
  assert.strictEqual(u.hasObservation(u.makeStep(0, '', '', { snapshot: 'x' })), true);
});

run('hasObservation returns false for edit-only step', function() {
  // Scenario: step with only an edit has no observation
  assert.strictEqual(u.hasObservation(u.makeStep(0, '', '', { edit: {} })), false);
});

// ─── Full reconstruction integration ─────────────────────────────────────────

run('reconstructFromJSONLTexts creates file from create edit', function() {
  // Scenario: single create edit produces the file content
  var jsonl = t.makeCreateLine('/p/file.py', 'hello world');
  var result = u.reconstructFromJSONLTexts([{ text: jsonl, path: 'test.jsonl' }], '/p/file.py');
  assert.strictEqual(result.content, 'hello world');
  assert.strictEqual(result.patches.length, 1);
  assert.strictEqual(result.patches[0].type, 'AgentEdit');
});

run('reconstructFromJSONLTexts applies create then edit', function() {
  // Scenario: file created then edited — final content reflects both
  var jsonl = t.makeCreateLine('/p/file.py', 'hello') + '\n' +
    t.makeEditLine('/p/file.py', 'hello', 'world', false, 'hello');
  var result = u.reconstructFromJSONLTexts([{ text: jsonl, path: 'test.jsonl' }], '/p/file.py');
  assert.strictEqual(result.content, 'world');
});

run('reconstructFromJSONLTexts detects drift from snapshot', function() {
  // Scenario: create 'hello', then snapshot shows 'modified' — UserEdit recorded
  var jsonl = t.makeCreateLine('/p/file.py', 'hello') + '\n' +
    makeSnapshotLine('/p/file.py', 'modified');
  var result = u.reconstructFromJSONLTexts([{ text: jsonl, path: 'test.jsonl' }], '/p/file.py');
  assert.strictEqual(result.content, 'modified');
  var userEdits = result.patches.filter(function(p) { return p.type === 'UserEdit'; });
  assert.strictEqual(userEdits.length, 1);
  assert.strictEqual(userEdits[0].diff.before, 'hello');
  assert.strictEqual(userEdits[0].diff.after, 'modified');
});

run('reconstructFromJSONLTexts handles empty JSONL', function() {
  // Scenario: empty JSONL produces empty state
  var result = u.reconstructFromJSONLTexts([{ text: '', path: 'test.jsonl' }], '/p/file.py');
  assert.strictEqual(result.content, '');
  assert.strictEqual(result.patches.length, 0);
});

run('reconstructFromJSONLTexts handles snapshot then edit sequence', function() {
  // Scenario: snapshot sets baseline, then edit modifies it
  var jsonl = makeSnapshotLine('/p/file.py', 'base content') + '\n' +
    t.makeEditLine('/p/file.py', 'base', 'updated', false, 'base content');
  var result = u.reconstructFromJSONLTexts([{ text: jsonl, path: 'test.jsonl' }], '/p/file.py');
  assert.strictEqual(result.content, 'updated content');
});

run('reconstructFromJSONLTexts handles multiple edits', function() {
  // Scenario: create then two sequential edits
  var jsonl = t.makeCreateLine('/p/file.py', 'abc') + '\n' +
    t.makeEditLine('/p/file.py', 'a', 'A', false, 'abc') + '\n' +
    t.makeEditLine('/p/file.py', 'c', 'C', false, 'Abc');
  var result = u.reconstructFromJSONLTexts([{ text: jsonl, path: 'test.jsonl' }], '/p/file.py');
  assert.strictEqual(result.content, 'AbC');
});

summary();
