#!/usr/bin/env node
// Tests for api/snapshot-store-io.js — the snapshot-store IO quartet
// (defaultBaseHistoryDir, resolveHistoryDir, readBackupFile, getSnapshotBackups)
// moved (Phase 5) from common/extract-file-state.js into their own leaf home,
// shared by api/file-event-observations (extractSnapshotEdits) and
// api/reconstruction-reference-sources (findLastSnapshot*). These functions had
// no direct coverage before — granular tests added with the move.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var os = require('os');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var io = require('../api/snapshot-store-io');

console.log('\ndefaultBaseHistoryDir:');

runWithContext('test_defaultBaseHistoryDir_isClaudeFileHistoryUnderHome', function () {
  // Behavior: the default snapshot store is ~/.claude/file-history.
  assert.strictEqual(io.defaultBaseHistoryDir(), path.join(os.homedir(), '.claude', 'file-history'));
});

console.log('\nresolveHistoryDir:');

runWithContext('test_resolveHistoryDir_nullSessionIdReturnsNull', function () {
  // Behavior: without a sessionId there is no per-session directory to resolve.
  assert.strictEqual(io.resolveHistoryDir('', '/some/base'), null);
});

runWithContext('test_resolveHistoryDir_missingDirReturnsNull', function (ctx) {
  // Behavior: a sessionId whose directory does not exist under the base ⇒ null.
  var base = ctx.tempDir('hist-');
  assert.strictEqual(io.resolveHistoryDir('no-such-session', base), null);
});

runWithContext('test_resolveHistoryDir_existingDirReturnsItsPath', function (ctx) {
  // Behavior: when <base>/<sessionId> exists, resolveHistoryDir returns it.
  var base = ctx.tempDir('hist-');
  var sessDir = path.join(base, 'sessA');
  fs.mkdirSync(sessDir);
  assert.strictEqual(io.resolveHistoryDir('sessA', base), sessDir);
});

console.log('\nreadBackupFile:');

runWithContext('test_readBackupFile_returnsContentWhenPresent', function (ctx) {
  // Behavior: reads <historyDir>/<backupFileName> and returns its content.
  var dir = ctx.tempDir('hist-');
  fs.writeFileSync(path.join(dir, 'blob.txt'), 'BACKUP BODY');
  assert.strictEqual(io.readBackupFile(dir, 'blob.txt'), 'BACKUP BODY');
});

runWithContext('test_readBackupFile_returnsNullWhenMissing', function (ctx) {
  // Behavior: a missing backup file resolves to null, not a throw.
  var dir = ctx.tempDir('hist-');
  assert.strictEqual(io.readBackupFile(dir, 'absent.txt'), null);
});

console.log('\ngetSnapshotBackups:');

runWithContext('test_getSnapshotBackups_returnsTrackedFileBackupsForSnapshotRecord', function () {
  // Behavior: a file-history-snapshot record yields its trackedFileBackups map.
  var record = { type: 'file-history-snapshot', snapshot: { trackedFileBackups: { '/a.py': { backupFileName: 'b1' } } } };
  assert.deepStrictEqual(io.getSnapshotBackups(record), { '/a.py': { backupFileName: 'b1' } });
});

runWithContext('test_getSnapshotBackups_returnsEmptyMapWhenSnapshotHasNoBackups', function () {
  // Behavior: a snapshot record with no trackedFileBackups yields {} (not null).
  var record = { type: 'file-history-snapshot', snapshot: {} };
  assert.deepStrictEqual(io.getSnapshotBackups(record), {});
});

runWithContext('test_getSnapshotBackups_returnsNullForNonSnapshotRecord', function () {
  // Behavior: a non-snapshot record is not a backup source ⇒ null.
  assert.strictEqual(io.getSnapshotBackups({ type: 'user' }), null);
});

runWithContext('test_getSnapshotBackups_returnsNullForNullRecord', function () {
  // Behavior: a null record is not a backup source ⇒ null.
  assert.strictEqual(io.getSnapshotBackups(null), null);
});

h.summary();
