// Tests for tools/probe-projects-v2.js — Phase C kept-edit assembly.
// Headline behavior: edits are filtered by FULL PATH (alias set), so two
// different files sharing a basename never cross-contaminate.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

var v2 = require('../tools/probe-projects-v2');
var assembly = require('../tools/probe-v2-assembly');

run('test_editBelongsToFile_isExportedForReuseBySidecarExtraction', function () {
  // Behavior: editBelongsToFile is part of the module's public surface so the
  // per-line sidecar's event extraction reuses the SAME path-matching rules
  // (full absolute path; snapshot keys by full path-suffix, never basename).
  var aliasPaths = ['/repo/scripts/t.py'];
  var aliasSet = new Set(aliasPaths);
  // Step: a snapshot-sourced edit with a shortened key matches by path suffix.
  var shortened = { filePath: 'scripts/t.py', source: 'snapshot' };
  assert.strictEqual(assembly.editBelongsToFile(shortened, aliasSet, aliasPaths), true);
  // Step: a same-basename key under a DIFFERENT directory does not match.
  var collision = { filePath: 'foo/t.py', source: 'snapshot' };
  assert.strictEqual(assembly.editBelongsToFile(collision, aliasSet, aliasPaths), false);
});

run('test_assembleKeptEdits_separatesTwoFilesSharingBasename', function () {
  // Behavior: two DIFFERENT launch.json files (distinct absolute paths) in one
  // transcript produce two separate kept streams — filtering by full path, not
  // basename, kills the basename-collision bug.
  // Step: one transcript edits /projA/.vscode/launch.json and /projB/.vscode/launch.json.
  var perTranscriptEdits = {
    '/t/a.jsonl': {
      edits: [
        { filePath: '/projA/.vscode/launch.json', file: 'launch.json', type: 'create', content: 'A', line: 0 },
        { filePath: '/projB/.vscode/launch.json', file: 'launch.json', type: 'create', content: 'B', line: 1 }
      ],
      statusByLine: {}
    }
  };
  var orderedTranscripts = [{ transcriptPath: '/t/a.jsonl', earliestTimestamp: null }];
  // Step: assembling for projA keeps ONLY the projA edit.
  var resultA = v2.assembleKeptEdits(['/projA/.vscode/launch.json'], perTranscriptEdits, orderedTranscripts);
  assert.strictEqual(resultA.keptEdits.length, 1);
  assert.strictEqual(resultA.keptEdits[0].filePath, '/projA/.vscode/launch.json');
  // Step: assembling for projB keeps ONLY the projB edit.
  var resultB = v2.assembleKeptEdits(['/projB/.vscode/launch.json'], perTranscriptEdits, orderedTranscripts);
  assert.strictEqual(resultB.keptEdits.length, 1);
  assert.strictEqual(resultB.keptEdits[0].filePath, '/projB/.vscode/launch.json');
});

run('test_assembleKeptEdits_dropsIgnoredClassifiedEdit', function () {
  // Behavior: an edit classified 'ignored' (classification lines are 1-indexed,
  // so edit.line+1 keys the lookup) is dropped from the kept stream and counted
  // as ignored in the transcript summary.
  // Step: two edits to the same file; the second is classified ignored.
  var perTranscriptEdits = {
    '/t/a.jsonl': {
      edits: [
        { filePath: '/repo/f.js', file: 'f.js', type: 'create', content: 'v1', line: 0 },
        { filePath: '/repo/f.js', file: 'f.js', type: 'edit', oldString: 'v1', newString: 'v2', line: 1 }
      ],
      statusByLine: { 2: 'ignored' }
    }
  };
  var orderedTranscripts = [{ transcriptPath: '/t/a.jsonl', earliestTimestamp: null }];
  var result = v2.assembleKeptEdits(['/repo/f.js'], perTranscriptEdits, orderedTranscripts);
  // Step: only the create survives; the summary counts 1 kept, 1 ignored of 2.
  assert.strictEqual(result.keptEdits.length, 1);
  assert.strictEqual(result.keptEdits[0].type, 'create');
  assert.strictEqual(result.transcriptsUsed[0].kept, 1);
  assert.strictEqual(result.transcriptsUsed[0].ignored, 1);
  assert.strictEqual(result.transcriptsUsed[0].total, 2);
});

run('test_assembleKeptEdits_keepsSnapshotEditWithRepoRelativePath', function () {
  // Behavior: snapshot-sourced edits record REPO-RELATIVE paths (e.g.
  // "common/scripts/f.js"), not absolute ones. They are content checkpoints the
  // replay depends on, so they match an alias path by full path-suffix.
  var perTranscriptEdits = {
    '/t/a.jsonl': {
      edits: [
        { filePath: '/repo/common/scripts/f.js', file: 'f.js', type: 'create', content: 'v1', line: 0 },
        { filePath: 'common/scripts/f.js', file: 'f.js', type: 'update', source: 'snapshot', content: 'v2', line: 5 }
      ],
      statusByLine: {}
    }
  };
  var orderedTranscripts = [{ transcriptPath: '/t/a.jsonl', earliestTimestamp: null }];
  var result = v2.assembleKeptEdits(['/repo/common/scripts/f.js'], perTranscriptEdits, orderedTranscripts);
  assert.strictEqual(result.keptEdits.length, 2);
  assert.strictEqual(result.keptEdits[1].source, 'snapshot');
});

run('test_assembleKeptEdits_dropsSnapshotEditOfDifferentFileWithSameBasename', function () {
  // Behavior: the relative-path suffix match still rejects a snapshot of a
  // DIFFERENT file that merely shares the basename.
  var perTranscriptEdits = {
    '/t/a.jsonl': {
      edits: [
        { filePath: 'other/place/f.js', file: 'f.js', type: 'update', source: 'snapshot', content: 'X', line: 3 }
      ],
      statusByLine: {}
    }
  };
  var orderedTranscripts = [{ transcriptPath: '/t/a.jsonl', earliestTimestamp: null }];
  var result = v2.assembleKeptEdits(['/repo/common/scripts/f.js'], perTranscriptEdits, orderedTranscripts);
  assert.strictEqual(result.keptEdits.length, 0);
});

run('test_assembleKeptEdits_concatenatesTranscriptsInGivenOrder', function () {
  // Behavior: kept edits follow the caller-supplied transcript order — the
  // caller (Phase C ordering) is responsible for timestamp sorting.
  var perTranscriptEdits = {
    '/t/later.jsonl': {
      edits: [{ filePath: '/repo/f.js', file: 'f.js', type: 'edit', oldString: 'a', newString: 'b', line: 0 }],
      statusByLine: {}
    },
    '/t/earlier.jsonl': {
      edits: [{ filePath: '/repo/f.js', file: 'f.js', type: 'create', content: 'a', line: 0 }],
      statusByLine: {}
    }
  };
  var orderedTranscripts = [
    { transcriptPath: '/t/earlier.jsonl', earliestTimestamp: '2026-01-01T00:00:00.000Z' },
    { transcriptPath: '/t/later.jsonl', earliestTimestamp: '2026-02-01T00:00:00.000Z' }
  ];
  var result = v2.assembleKeptEdits(['/repo/f.js'], perTranscriptEdits, orderedTranscripts);
  assert.strictEqual(result.keptEdits.length, 2);
  assert.strictEqual(result.keptEdits[0].type, 'create');
  assert.strictEqual(result.keptEdits[1].type, 'edit');
  // Step: each transcript summary carries its earliest touch timestamp.
  assert.strictEqual(result.transcriptsUsed[0].earliestTimestamp, '2026-01-01T00:00:00.000Z');
});

run('test_dropTrailingObservationEdits_dropsTrailingCatAndReadRun', function () {
  // Behavior: a trailing run of observation edits (cat/read — what a session
  // SAW, possibly lossy) is dropped; the count of dropped edits is reported.
  var edits = [
    { type: 'create', content: 'x', line: 0 },
    { type: 'update', source: 'read', content: 'x', line: 5 },
    { type: 'update', source: 'cat', content: 'y', line: 9 }
  ];
  var result = v2.dropTrailingObservationEdits(edits);
  assert.strictEqual(result.edits.length, 1);
  assert.strictEqual(result.edits[0].type, 'create');
  assert.strictEqual(result.droppedCount, 2);
});

run('test_dropTrailingObservationEdits_keepsMidStreamObservations', function () {
  // Behavior: observations BETWEEN authored edits re-seed content and stay.
  var edits = [
    { type: 'update', source: 'read', content: 'seed', line: 0 },
    { type: 'edit', oldString: 'seed', newString: 'final', line: 5 }
  ];
  var result = v2.dropTrailingObservationEdits(edits);
  assert.strictEqual(result.edits.length, 2);
  assert.strictEqual(result.droppedCount, 0);
});

h.summary();
