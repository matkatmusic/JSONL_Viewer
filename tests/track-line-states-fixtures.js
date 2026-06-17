// Shared fixtures for the track-line-states suites. The tracker tests outgrew a
// single file (the 250-line write cap), so they split into test-track-line-states
// (belief mechanics) and test-track-line-states-verdict (conflicts + final
// verdict). Both build transcripts and run the engine through the SAME helpers,
// which live here — one canonical home, imported directly (no re-export shim).

var h = require('./test-helpers');
var efe = require('../api/file-events-extractors');
var tls = require('../api/track-line-states');

var TS1 = '2026-05-22T03:00:00.000Z';
var TS2 = '2026-05-22T03:10:00.000Z';
var TS3 = '2026-05-22T03:20:00.000Z';
var MS1 = Date.parse(TS1);
var MS2 = Date.parse(TS2);
var MS3 = Date.parse(TS3);

// Re-stamp a JSONL line builder's output with an ISO timestamp.
function withTimestamp(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

// A Read tool_use carrying explicit offset/limit geometry.
function makeReadUseWithGeometry(toolUseId, filePath, offset, limit) {
  var record = JSON.parse(h.makeReadToolUse(toolUseId, filePath));
  var input = record.message.content[0].input;
  if (offset !== null) { input.offset = offset; }
  if (limit !== null) { input.limit = limit; }
  return JSON.stringify(record);
}

// An edit record with a populated structuredPatch (helpers leave it empty).
function makeEditLineWithPatch(filePath, oldString, newString, patchLines, iso) {
  var record = JSON.parse(h.makeEditLine(filePath, oldString, newString));
  record.toolUseResult.structuredPatch = [{ lines: patchLines }];
  record.timestamp = iso;
  return JSON.stringify(record);
}

// An edit record carrying FULL structuredPatch hunk objects (each with
// newStart), unlike makeEditLineWithPatch which sets only lines. patchContext
// needs newStart to number context lines by post-edit absolute position.
function makeEditLineWithHunks(filePath, oldString, newString, hunks, iso) {
  var record = JSON.parse(h.makeEditLine(filePath, oldString, newString));
  record.toolUseResult.structuredPatch = hunks;
  record.timestamp = iso;
  return JSON.stringify(record);
}

function makeSnapshotLine(messageId, snapTimestamp, isSnapshotUpdate, trackedFileBackups) {
  var snapshot = { messageId: messageId, timestamp: snapTimestamp, trackedFileBackups: trackedFileBackups };
  return JSON.stringify({ type: 'file-history-snapshot', messageId: messageId, isSnapshotUpdate: isSnapshotUpdate, snapshot: snapshot });
}

// Write a fixture transcript, extract its events, and run the tracker.
// targetPath defaults to /repo/t.py; snapshot fixtures pass a LONGER path
// (/work/repo/t.py) because shortened snapshot keys ('repo/t.py') match by
// strict full-path suffix — an equal-length key never matches.
function trackFixture(ctx, lines, snapshotsDir, reference, targetPath) {
  var fs = require('fs'), path = require('path');
  var target = targetPath ? targetPath : '/repo/t.py';
  var dir = ctx.tempDir('rev-tls-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  var events = efe.extractFileEvents(jsonlPath, [target], snapshotsDir);
  var options = {
    filePath: target,
    aliasPaths: [target],
    jsonlsScanned: [jsonlPath],
    reference: reference ? reference : { via: 'none', content: null }
  };
  return tls.trackLineStates(events, options);
}

module.exports = {
  TS1: TS1, TS2: TS2, TS3: TS3, MS1: MS1, MS2: MS2, MS3: MS3,
  withTimestamp: withTimestamp,
  makeReadUseWithGeometry: makeReadUseWithGeometry,
  makeEditLineWithPatch: makeEditLineWithPatch,
  makeEditLineWithHunks: makeEditLineWithHunks,
  makeSnapshotLine: makeSnapshotLine,
  trackFixture: trackFixture
};
