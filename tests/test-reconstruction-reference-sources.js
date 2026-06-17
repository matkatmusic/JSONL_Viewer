#!/usr/bin/env node
// Tests for api/reconstruction-reference-sources.js — what to compare a
// reconstruction against, and the verdict.
//   findLastSnapshotContent / findLastSnapshotBlob (moved Phase 5 from
//      common/extract-file-state.js; tests ported from test-extract-file-state.js)
//   chooseReferenceSource / distinctBasenames (moved Phase 5 from
//      tools/probe-reference-sources.js; NEW direct coverage — it had no test)
// gatherReferenceSources is IO/git-heavy and is covered end-to-end by the probe
// e2e gate (tools/probe-projects-v2.js); not unit-tested here.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var rrs = require('../api/reconstruction-reference-sources');

// Build a file-history-snapshot JSONL record mapping one tracked file to a backup blob.
function snapshotLine(sessionId, trackedPath, backupFileName) {
  return JSON.stringify({
    type: 'file-history-snapshot',
    sessionId: sessionId,
    snapshot: { trackedFileBackups: { [trackedPath]: { backupFileName: backupFileName } } }
  });
}

// Create <baseHistoryDir>/<sessionId>/<backupFileName> with content; return baseHistoryDir.
function writeBackupBlob(ctx, sessionId, backupFileName, content) {
  var fs = require('fs'), path = require('path');
  var base = ctx.tempDir('hist-');
  var sessDir = path.join(base, sessionId);
  fs.mkdirSync(sessDir);
  fs.writeFileSync(path.join(sessDir, backupFileName), content);
  return base;
}

console.log('\nfindLastSnapshotContent / findLastSnapshotBlob:');

runWithContext('test_findLastSnapshotContent_readsBlobFromCustomBaseHistoryDir', function (ctx) {
  // Behavior: with an explicit baseHistoryDir, the backup blob is read from
  // <baseHistoryDir>/<sessionId>/<backupFileName> rather than ~/.claude/file-history.
  var base = writeBackupBlob(ctx, 'sess1', 'backup-x.txt', 'SNAP CONTENT');
  var jsonl = snapshotLine('sess1', '/repo/x.js', 'backup-x.txt');
  assert.strictEqual(rrs.findLastSnapshotContent(jsonl, 'x.js', base), 'SNAP CONTENT');
});

runWithContext('test_findLastSnapshotContent_defaultBaseDirMissesCustomBlob', function (ctx) {
  // Behavior: WITHOUT the override, lookups use ~/.claude/file-history, so a blob that
  // only exists under a custom dir is not found (returns null). Guards backward-compat.
  var writeBackupBlob_unused = writeBackupBlob(ctx, 'sess2', 'backup-y.txt', 'Y CONTENT');
  var jsonl = snapshotLine('sess2', '/repo/y.js', 'backup-y.txt');
  assert.strictEqual(rrs.findLastSnapshotContent(jsonl, 'y.js'), null);
});

runWithContext('test_findLastSnapshotBlob_returnsSessionIdBackupNameAndContent', function (ctx) {
  // Behavior (v2 Phase D provenance): the snapshot lookup also reports WHICH
  // blob verified the file — {sessionId, backupFileName, content}.
  var base = writeBackupBlob(ctx, 'sess4', 'backup-w.txt', 'W CONTENT');
  var jsonl = snapshotLine('sess4', '/repo/w.js', 'backup-w.txt');
  var blob = rrs.findLastSnapshotBlob(jsonl, 'w.js', base);
  assert.strictEqual(blob.sessionId, 'sess4');
  assert.strictEqual(blob.backupFileName, 'backup-w.txt');
  assert.strictEqual(blob.content, 'W CONTENT');
});

runWithContext('test_findLastSnapshotBlob_returnsNullWhenNoSnapshotRecorded', function (ctx) {
  // Behavior: a transcript with no snapshot record for the file yields null.
  var base = ctx.tempDir('hist-');
  var blob = rrs.findLastSnapshotBlob('{"type":"user"}', 'nope.js', base);
  assert.strictEqual(blob, null);
});

console.log('\nchooseReferenceSource:');

run('test_chooseReferenceSource_passWhenAvailableSourceContentMatches', function () {
  // Behavior: the first available source whose content equals the replay ⇒ PASS.
  var sources = [{ name: 'onDisk', available: true, content: 'X', path: '/p' }];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'PASS');
  assert.strictEqual(decision.comparedVia, 'on-disk');
  assert.strictEqual(decision.usedSource, sources[0]);
});

run('test_chooseReferenceSource_mismatchWhenAvailableButNoContentMatch', function () {
  // Behavior: a source is available but none match ⇒ MISMATCH against the first available.
  var sources = [{ name: 'onDisk', available: true, content: 'Y', path: '/p' }];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'MISMATCH');
  assert.strictEqual(decision.comparedVia, 'on-disk');
});

run('test_chooseReferenceSource_notFoundWhenNoSourceAvailable', function () {
  // Behavior: no available source ⇒ NOT_FOUND, comparedVia none, usedSource null.
  var sources = [{ name: 'onDisk', available: false, content: null, path: null }];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'NOT_FOUND');
  assert.strictEqual(decision.comparedVia, 'none');
  assert.strictEqual(decision.usedSource, null);
});

run('test_chooseReferenceSource_firstMatchWinsAndRecordsSkippedSources', function () {
  // Behavior: on-disk is available but doesn't match; snapshot matches ⇒ snapshot
  // used, and the skipped on-disk source is noted.
  var sources = [
    { name: 'onDisk', available: true, content: 'Y', path: '/p' },
    { name: 'snapshot', available: true, content: 'X', blob: { sessionId: 's', backupFileName: 'b' } }
  ];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'PASS');
  assert.strictEqual(decision.comparedVia, 'snapshot');
  assert.ok(decision.dataSources.skipped.indexOf('onDisk available but snapshot used') >= 0);
});

console.log('\ndistinctBasenames:');

run('test_distinctBasenames_listsLastSeenBasenameFirstThenDedups', function () {
  // Behavior: the current (last-seen) name comes first; alias basenames follow, deduped.
  var names = rrs.distinctBasenames(['/work/repo/a.py', '/other/a.py'], '/cur/dir/b.py');
  assert.deepStrictEqual(names, ['b.py', 'a.py']);
});

run('test_distinctBasenames_handlesNoLastSeenFullPath', function () {
  // Behavior: without a last-seen path, just the deduped alias basenames.
  var names = rrs.distinctBasenames(['/x/a.py', '/y/a.py'], null);
  assert.deepStrictEqual(names, ['a.py']);
});

h.summary();
