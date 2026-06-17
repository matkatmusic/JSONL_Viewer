// Tests for api/snapshot-events.js — the snapshot/fileAbsent beacon extractor.
// Unit-level: drives the snapshot-events functions directly. The end-to-end
// snapshot cases that flow through extractFileEvents remain as integration
// coverage in test-file-events-extractors.js.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var se = require('../api/snapshot-events');
var efe = require('../api/file-events-extractors');

var TS = '2026-05-22T03:38:27.174Z';

function snapshotRecord(messageId, snapTimestamp, isSnapshotUpdate, trackedFileBackups) {
  return {
    type: 'file-history-snapshot',
    messageId: messageId,
    isSnapshotUpdate: isSnapshotUpdate,
    snapshot: { messageId: messageId, timestamp: snapTimestamp, trackedFileBackups: trackedFileBackups }
  };
}

function snapshotContext(snapshotsBase, sessionId, aliasPaths) {
  return { aliasSet: new Set(aliasPaths), aliasPaths: aliasPaths, sessionId: sessionId, snapshotsBase: snapshotsBase };
}

run('test_snapshotDedupKey_joinsMessageIdAndSnapshotTimestamp', function () {
  // Behavior: a resume-copied snapshot repeats (messageId, snapshot.timestamp);
  // that pair is the dedup key.
  assert.strictEqual(se.snapshotDedupKey(snapshotRecord('m1', TS, false, {})), 'm1|' + TS);
});

run('test_defaultSnapshotsBase_pointsAtClaudeFileHistory', function () {
  // Behavior: the default blob root is ~/.claude/file-history.
  assert.ok(se.defaultSnapshotsBase().endsWith('/.claude/file-history'));
});

run('test_buildBackupKindEvent_nullBackupFileNameYieldsFileAbsent', function () {
  // Behavior: a null backupFileName is POSITIVE evidence of absence.
  var event = se.buildBackupKindEvent('/x.jsonl', 2, snapshotRecord('m1', TS, true, {}), { backupFileName: null }, 's1', '/snap');
  assert.notStrictEqual(event.fileAbsent, null);
  assert.strictEqual(event.snapshot, null);
  assert.strictEqual(event.unixMs, Date.parse(TS));
});

run('test_buildBackupKindEvent_missingBlobYieldsNull', function () {
  // Behavior: a named blob that is not on disk is not a beacon.
  var event = se.buildBackupKindEvent('/x.jsonl', 2, snapshotRecord('m1', TS, false, {}), { backupFileName: 'gone' }, 's1', '/no-such-base');
  assert.strictEqual(event, null);
});

runWithContext('test_buildBackupKindEvent_liveBlobYieldsSnapshotCarryingBlobPath', function (ctx) {
  // Behavior: a live on-disk blob is a Tier-1 snapshot beacon carrying its path.
  var fs = require('fs'), path = require('path');
  var base = ctx.tempDir('rev-se-');
  fs.mkdirSync(path.join(base, 's1'));
  fs.writeFileSync(path.join(base, 's1', 'blob-1'), 'a\n');
  var event = se.buildBackupKindEvent('/x.jsonl', 2, snapshotRecord('m1', TS, false, {}), { backupFileName: 'blob-1' }, 's1', base);
  assert.strictEqual(event.snapshot.blob, path.join(base, 's1', 'blob-1'));
  assert.strictEqual(event.snapshot.isSnapshotUpdate, false);
});

runWithContext('test_snapshotEventsForFile_dedupsResumeCopiesAndFiltersByAlias', function (ctx) {
  // Behavior: only alias-matching backups become events; the same record twice
  // (a resume copy) yields ONE event after dedup.
  var fs = require('fs'), path = require('path');
  var base = ctx.tempDir('rev-se-');
  fs.mkdirSync(path.join(base, 's1'));
  fs.writeFileSync(path.join(base, 's1', 'blob-1'), 'a\n');
  var backups = { 'scripts/t.py': { backupFileName: 'blob-1' }, 'other/x.py': { backupFileName: 'blob-1' } };
  var record = snapshotRecord('m1', TS, false, backups);
  var parsed = [null, record, record];
  var events = se.snapshotEventsForFile('/x.jsonl', parsed, snapshotContext(base, 's1', ['/repo/scripts/t.py']));
  assert.strictEqual(events.length, 1);
  assert.notStrictEqual(events[0].snapshot, null);
});

// ─── Integration: snapshot events through extractFileEvents ─────────────────
// The end-to-end snapshot cases (the full file-events-extractors → snapshot-events
// wiring). They live here with the snapshot unit tests because
// test-file-events-extractors.js is at the 250-line write cap.

var KIND_NAMES = ['snapshot', 'fileAbsent', 'write', 'edit', 'readFull', 'readChunk', 'cat', 'originalFile'];

// A file-history-snapshot JSONL line (beacon time at snapshot.timestamp).
function makeSnapshotLine(messageId, snapTimestamp, isSnapshotUpdate, trackedFileBackups) {
  var snapshot = { messageId: messageId, timestamp: snapTimestamp, trackedFileBackups: trackedFileBackups };
  return JSON.stringify({ type: 'file-history-snapshot', messageId: messageId, isSnapshotUpdate: isSnapshotUpdate, snapshot: snapshot });
}

function writeJsonlFixture(ctx, lines) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-efe-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

// Assert the event's kind sub-objects have exactly kindName non-null.
function assertOnlyKindNonNull(event, kindName) {
  for (var i = 0; i < KIND_NAMES.length; i++) {
    if (KIND_NAMES[i] === kindName) { assert.notStrictEqual(event[KIND_NAMES[i]], null); }
    else { assert.strictEqual(event[KIND_NAMES[i]], null); }
  }
}

runWithContext('test_extractFileEvents_snapshotWithLiveBlobBecomesSnapshotEvent', function (ctx) {
  // A snapshot whose blob exists on disk is a Tier-1 beacon carrying the path.
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var sessionDir = path.join(snapshotsDir, 'sess-snap');
  fs.mkdirSync(sessionDir);
  fs.writeFileSync(path.join(sessionDir, 'blob-1'), 'alpha\nbeta\n');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'blob-1', version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, false, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'snapshot');
  var expectedBlob = path.join(sessionDir, 'blob-1');
  assert.deepStrictEqual(events[0].snapshot, { blob: expectedBlob, isSnapshotUpdate: false });
  assert.strictEqual(events[0].jsonlLine, 2);
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_snapshotWithMissingBlobIsExcluded', function (ctx) {
  // A snapshot whose blob no longer exists is NOT a beacon — no event.
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'gone-blob', version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, false, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.deepStrictEqual(events, []);
});

runWithContext('test_extractFileEvents_nullBackupFileNameBecomesFileAbsentEvent', function (ctx) {
  // backupFileName null is POSITIVE evidence the file did not exist then.
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: null, version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, true, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
  assertOnlyKindNonNull(events[0], 'fileAbsent');
  assert.deepStrictEqual(events[0].fileAbsent, {});
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_resumeCopiedSnapshotDedupedByMessageIdAndTimestamp', function (ctx) {
  // A resume-copied snapshot (same messageId + snapshot.timestamp) yields ONE event.
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var sessionDir = path.join(snapshotsDir, 'sess-snap');
  fs.mkdirSync(sessionDir);
  fs.writeFileSync(path.join(sessionDir, 'blob-1'), 'alpha\n');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'blob-1', version: 1 };
  var snapshotLine = makeSnapshotLine('m1', TS, false, backups);
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    snapshotLine,
    snapshotLine
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
});

runWithContext('test_extractFileEvents_snapshotKeysMatchByFullPathSuffixNeverBasename', function (ctx) {
  // Snapshot keys match an alias by FULL path-suffix, never bare basename.
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var sessionDir = path.join(snapshotsDir, 'sess-snap');
  fs.mkdirSync(sessionDir);
  fs.writeFileSync(path.join(sessionDir, 'blob-match'), 'alpha\n');
  fs.writeFileSync(path.join(sessionDir, 'blob-collide'), 'beta\n');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'blob-match', version: 1 };
  backups['foo/t.py'] = { backupFileName: 'blob-collide', version: 1 };
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('sess-snap', 'main', '/repo'),
    makeSnapshotLine('m1', TS, false, backups)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/scripts/t.py'], snapshotsDir);
  assert.strictEqual(events.length, 1);
  var expectedBlob = path.join(sessionDir, 'blob-match');
  assert.strictEqual(events[0].snapshot.blob, expectedBlob);
});

h.summary();
