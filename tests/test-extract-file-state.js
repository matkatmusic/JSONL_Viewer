// Tests for common/extract-file-state.js snapshot lookups — specifically the
// configurable `baseHistoryDir` parameter (#9a). The file-history snapshot blobs
// for the jot-recovery set live at ~/Programming/jot-recovery/claude-data/file-history,
// NOT under ~/.claude/file-history, so the base dir must be overridable.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var efs = require('../common/extract-file-state');

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

runWithContext('test_findLastSnapshotContent_readsBlobFromCustomBaseHistoryDir', function (ctx) {
  // Behavior: with an explicit baseHistoryDir, the backup blob is read from
  // <baseHistoryDir>/<sessionId>/<backupFileName> rather than ~/.claude/file-history.
  // Step: stage a backup blob under a custom base dir.
  var base = writeBackupBlob(ctx, 'sess1', 'backup-x.txt', 'SNAP CONTENT');
  // Step: a transcript whose snapshot points at that blob for /repo/x.js.
  var jsonl = snapshotLine('sess1', '/repo/x.js', 'backup-x.txt');
  // Step: resolving x.js against the custom base returns the blob's content.
  assert.strictEqual(efs.findLastSnapshotContent(jsonl, 'x.js', base), 'SNAP CONTENT');
});

runWithContext('test_findLastSnapshotContent_defaultBaseDirMissesCustomBlob', function (ctx) {
  // Behavior: WITHOUT the override, lookups use ~/.claude/file-history, so a blob that
  // only exists under a custom dir is not found (returns null). Guards backward-compat.
  var writeBackupBlob_unused = writeBackupBlob(ctx, 'sess2', 'backup-y.txt', 'Y CONTENT');
  var jsonl = snapshotLine('sess2', '/repo/y.js', 'backup-y.txt');
  // Step: no baseHistoryDir arg ⇒ default ~/.claude/file-history ⇒ blob absent ⇒ null.
  assert.strictEqual(efs.findLastSnapshotContent(jsonl, 'y.js'), null);
});

runWithContext('test_extractSnapshotEdits_readsBackupsFromCustomBaseHistoryDir', function (ctx) {
  // Behavior: extractSnapshotEdits honors baseHistoryDir when materializing snapshot edits.
  // Step: stage a backup blob and a parsed snapshot record referencing it.
  var base = writeBackupBlob(ctx, 'sess3', 'backup-z.txt', 'Z CONTENT');
  var parsed = [JSON.parse(snapshotLine('sess3', '/repo/z.js', 'backup-z.txt'))];
  // Step: extract snapshot edits against the custom base dir.
  var edits = efs.extractSnapshotEdits([''], parsed, 'sess3', base);
  // Step: one snapshot edit, carrying the blob content and source tag.
  assert.strictEqual(edits.length, 1);
  assert.strictEqual(edits[0].filePath, '/repo/z.js');
  assert.strictEqual(edits[0].content, 'Z CONTENT');
  assert.strictEqual(edits[0].source, 'snapshot');
});

runWithContext('test_findLastSnapshotBlob_returnsSessionIdBackupNameAndContent', function (ctx) {
  // Behavior (v2 Phase D provenance): the snapshot lookup also reports WHICH
  // blob verified the file — {sessionId, backupFileName, content} — so the
  // probe record can audit the exact snapshot used.
  var base = writeBackupBlob(ctx, 'sess4', 'backup-w.txt', 'W CONTENT');
  var jsonl = snapshotLine('sess4', '/repo/w.js', 'backup-w.txt');
  var blob = efs.findLastSnapshotBlob(jsonl, 'w.js', base);
  assert.strictEqual(blob.sessionId, 'sess4');
  assert.strictEqual(blob.backupFileName, 'backup-w.txt');
  assert.strictEqual(blob.content, 'W CONTENT');
});

runWithContext('test_findLastSnapshotBlob_returnsNullWhenNoSnapshotRecorded', function (ctx) {
  // Behavior: a transcript with no snapshot record for the file yields null.
  var base = ctx.tempDir('hist-');
  var blob = efs.findLastSnapshotBlob('{"type":"user"}', 'nope.js', base);
  assert.strictEqual(blob, null);
});

h.summary();
