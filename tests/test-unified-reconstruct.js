#!/usr/bin/env node
var assert = require('assert');
var t = require('./test-helpers');
var run = t.run;
var summary = t.summary;

var u = require('../common/unified-reconstruct');

console.log('test-unified-reconstruct.js\n');

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
  var step = u.makeStep(0, '', 'test.jsonl', {});
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
  var step = u.makeStep(5, '2026-01-01', 's.jsonl', { snapshot: 'hello' });
  assert.strictEqual(step.snapshot, 'hello');
  assert.strictEqual(step.line, 5);
  assert.strictEqual(step.timestamp, '2026-01-01');
  assert.strictEqual(step.edit, null);
});

run('makeStep populates edit and originalFile together', function() {
  // Scenario: providing edit + originalFile populates both
  var edit = { type: 'edit', oldString: 'a', newString: 'b' };
  var step = u.makeStep(3, '', 'x.jsonl', { edit: edit, originalFile: 'full content' });
  assert.strictEqual(step.edit.type, 'edit');
  assert.strictEqual(step.originalFile, 'full content');
  assert.strictEqual(step.snapshot, null);
});

// ─── Hunk operations ──────────────────────────────────────────────────────────

run('extractOldLines returns context and removed lines', function() {
  // Scenario: hunk with context, removed, and added lines yields context+removed
  var hunk = { lines: [' ctx', '-old1', '-old2', '+new1'] };
  assert.deepStrictEqual(u.extractOldLines(hunk), ['ctx', 'old1', 'old2']);
});

run('extractNewLines returns context and added lines', function() {
  // Scenario: hunk with context, removed, and added lines yields context+added
  var hunk = { lines: [' ctx', '-old1', '+new1', '+new2'] };
  assert.deepStrictEqual(u.extractNewLines(hunk), ['ctx', 'new1', 'new2']);
});

run('regionMatches detects exact match', function() {
  // Scenario: stateLines contains targetLines at the given offset
  assert.strictEqual(u.regionMatches(['a', 'b', 'c', 'd'], 1, ['b', 'c']), true);
});

run('regionMatches detects mismatch', function() {
  // Scenario: stateLines do not match targetLines at the given offset
  assert.strictEqual(u.regionMatches(['a', 'b', 'c', 'd'], 1, ['b', 'x']), false);
});

run('regionMatches rejects negative offset', function() {
  // Scenario: negative offset always returns false
  assert.strictEqual(u.regionMatches(['a', 'b'], -1, ['a']), false);
});

run('regionMatches rejects out-of-bounds', function() {
  // Scenario: offset + length exceeds array size
  assert.strictEqual(u.regionMatches(['a', 'b'], 1, ['b', 'c']), false);
});

run('findHunkOffset locates at stated position', function() {
  // Scenario: old lines match at the hunk's 1-based oldStart position
  var hunk = { oldStart: 2, lines: [' b', ' c'] };
  var oldLines = u.extractOldLines(hunk);
  assert.strictEqual(u.findHunkOffset(['a', 'b', 'c', 'd'], hunk, oldLines), 1);
});

run('findHunkOffset finds drifted position', function() {
  // Scenario: old lines not at stated position but found nearby
  var hunk = { oldStart: 2, lines: [' b', ' c'] };
  var oldLines = u.extractOldLines(hunk);
  // 'b','c' are at index 2, not at index 1 (stated - 1)
  assert.strictEqual(u.findHunkOffset(['x', 'a', 'b', 'c', 'd'], hunk, oldLines), 2);
});

run('diffAgainstPatch returns null when old lines match', function() {
  // Scenario: state content matches the patch's expected old lines
  var hunks = [{ oldStart: 1, lines: [' a', '-b', '+B'] }];
  assert.strictEqual(u.diffAgainstPatch('a\nb\nc', hunks), null);
});

run('diffAgainstPatch detects drift', function() {
  // Scenario: state content differs from the patch's expected old lines
  var hunks = [{ oldStart: 1, lines: [' a', '-b', '+B'] }];
  var result = u.diffAgainstPatch('a\nX\nc', hunks);
  assert.strictEqual(result.hunkIndex, 0);
  assert.deepStrictEqual(result.expected, ['a', 'b']);
  assert.deepStrictEqual(result.actual, ['a', 'X']);
});

run('applyPatchToState applies single hunk', function() {
  // Scenario: replacing 'b' with 'B' in three-line file
  var hunks = [{ oldStart: 1, lines: [' a', '-b', '+B'] }];
  assert.strictEqual(u.applyPatchToState('a\nb\nc', hunks), 'a\nB\nc');
});

run('applyPatchToState applies multiple hunks in reverse order', function() {
  // Scenario: two hunks at different positions both apply correctly
  var hunks = [
    { oldStart: 1, lines: ['-a', '+A'] },
    { oldStart: 3, lines: ['-c', '+C'] }
  ];
  assert.strictEqual(u.applyPatchToState('a\nb\nc\nd', hunks), 'A\nb\nC\nd');
});

// ─── Snapshot extraction ──────────────────────────────────────────────────────

run('getSnapshotContentForFile finds exact path match', function() {
  // Scenario: trackedFileBackups has the exact target file path
  var snap = { trackedFileBackups: { '/path/to/file.py': { content: 'hello' } } };
  assert.strictEqual(u.getSnapshotContentForFile(snap, '/path/to/file.py', 'file.py'), 'hello');
});

run('getSnapshotContentForFile finds basename match', function() {
  // Scenario: trackedFileBackups key differs in path but basename matches
  var snap = { trackedFileBackups: { '/other/path/file.py': { content: 'world' } } };
  assert.strictEqual(u.getSnapshotContentForFile(snap, '/my/path/file.py', 'file.py'), 'world');
});

run('getSnapshotContentForFile returns null when no match', function() {
  // Scenario: no backup entry matches the target file
  var snap = { trackedFileBackups: { '/path/other.py': { content: 'x' } } };
  assert.strictEqual(u.getSnapshotContentForFile(snap, '/path/file.py', 'file.py'), null);
});

run('getSnapshotContentForFile returns null for missing content field', function() {
  // Scenario: backup entry exists but only has backupFileName, not content
  var snap = { trackedFileBackups: { '/path/file.py': { backupFileName: 'abc.bak' } } };
  assert.strictEqual(u.getSnapshotContentForFile(snap, '/path/file.py', 'file.py'), null);
});

run('getSnapshotContentForFile handles null snapshot object', function() {
  // Scenario: null or undefined snapshot
  assert.strictEqual(u.getSnapshotContentForFile(null, '/path/file.py', 'file.py'), null);
});

// ─── Edit step building ──────────────────────────────────────────────────────

run('buildEditStep extracts create edit', function() {
  // Scenario: toolUseResult with type=create for the target file
  var tr = { type: 'create', filePath: '/p/file.py', content: 'new file', structuredPatch: [], originalFile: null };
  var step = u.buildEditStep(tr, 5, '', '/p/file.py', 'file.py', 'test.jsonl');
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
  var step = u.buildEditStep(tr, 10, '', '/p/file.py', 'file.py', 'test.jsonl');
  assert.strictEqual(step.edit.type, 'edit');
  assert.strictEqual(step.originalFile, 'full original');
  assert.strictEqual(step.structuredPatch.length, 1);
});

run('buildEditStep returns null for wrong file', function() {
  // Scenario: toolUseResult targets a different file
  var tr = { type: 'create', filePath: '/p/other.py', content: 'x', structuredPatch: [] };
  assert.strictEqual(u.buildEditStep(tr, 0, '', '/p/file.py', 'file.py', 'test.jsonl'), null);
});

run('buildEditStep returns null for irrelevant toolUseResult', function() {
  // Scenario: toolUseResult without create/update/edit indicators
  var tr = { filePath: '/p/file.py', stdout: 'some output' };
  assert.strictEqual(u.buildEditStep(tr, 0, '', '/p/file.py', 'file.py', 'test.jsonl'), null);
});

// ─── matchesTargetFile ────────────────────────────────────────────────────────

run('matchesTargetFile matches exact path', function() {
  // Scenario: exact path equality
  assert.strictEqual(u.matchesTargetFile('/p/file.py', '/p/file.py', 'file.py'), true);
});

run('matchesTargetFile matches by basename', function() {
  // Scenario: different directory but same filename
  assert.strictEqual(u.matchesTargetFile('/other/file.py', '/p/file.py', 'file.py'), true);
});

run('matchesTargetFile rejects different file', function() {
  // Scenario: different filename entirely
  assert.strictEqual(u.matchesTargetFile('/p/other.py', '/p/file.py', 'file.py'), false);
});

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

// ─── Step extraction integration ─────────────────────────────────────────────

run('extractStepsFromSingleJSONL extracts snapshot step', function() {
  // Scenario: JSONL with one snapshot for the target file
  var jsonl = makeSnapshotLine('/p/file.py', 'snap content');
  var steps = u.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].snapshot, 'snap content');
  assert.strictEqual(steps[0].sourceFile, 'test.jsonl');
});

run('extractStepsFromSingleJSONL extracts edit step', function() {
  // Scenario: JSONL with one create toolUseResult
  var jsonl = t.makeCreateLine('/p/file.py', 'new file');
  var steps = u.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].edit.type, 'create');
  assert.strictEqual(steps[0].edit.content, 'new file');
});

run('extractStepsFromSingleJSONL extracts read step', function() {
  // Scenario: JSONL with Read tool_use and tool_result pair
  var jsonl = t.makeReadToolUse('read-1', '/p/file.py') + '\n' +
    t.makeReadToolResult('read-1', '1\thello\n2\tworld');
  var steps = u.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].readResult, 'hello\nworld');
});

run('extractStepsFromSingleJSONL extracts cat step', function() {
  // Scenario: JSONL with Bash cat tool_use and tool_result pair
  var jsonl = t.makeBashCatToolUse('cat-1', '/p/file.py') + '\n' +
    t.makeBashCatToolResult('cat-1', 'cat content');
  var steps = u.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].bashReadResult, 'cat content');
});

run('extractStepsFromSingleJSONL sorts steps by line number', function() {
  // Scenario: edit at line 0, snapshot at line 1 — both extracted and sorted
  var jsonl = t.makeCreateLine('/p/file.py', 'v1') + '\n' +
    makeSnapshotLine('/p/file.py', 'v2');
  var steps = u.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 2);
  assert.ok(steps[0].line <= steps[1].line);
});

run('extractStepsFromSingleJSONL ignores unrelated files', function() {
  // Scenario: JSONL with edits for a different file
  var jsonl = t.makeCreateLine('/p/other.py', 'content');
  var steps = u.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 0);
});

run('extractStepsFromSingleJSONL extracts edit with structuredPatch', function() {
  // Scenario: toolUseResult has originalFile and structuredPatch
  var hunks = [{ oldStart: 1, lines: ['-old', '+new'] }];
  var jsonl = makeEditWithPatch('/p/file.py', 'old', 'new', 'old content', hunks);
  var steps = u.extractStepsFromSingleJSONL(jsonl, '/p/file.py', 'test.jsonl');
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].originalFile, 'old content');
  assert.strictEqual(steps[0].structuredPatch.length, 1);
});

run('extractStepsFromJSONLs merges steps from multiple sources', function() {
  // Scenario: two JSONL texts, each with one step — merged into one sorted list
  var jsonl1 = t.makeCreateLine('/p/file.py', 'v1');
  var jsonl2 = makeSnapshotLine('/p/file.py', 'v2');
  var steps = u.extractStepsFromJSONLs([
    { text: jsonl1, path: 'a.jsonl' },
    { text: jsonl2, path: 'b.jsonl' }
  ], '/p/file.py');
  assert.strictEqual(steps.length, 2);
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
