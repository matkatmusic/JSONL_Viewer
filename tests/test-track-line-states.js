var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var efe = require('../tools/extract-file-events');
var tls = require('../tools/track-line-states');

var TS1 = '2026-05-22T03:00:00.000Z';
var TS2 = '2026-05-22T03:10:00.000Z';
var TS3 = '2026-05-22T03:20:00.000Z';
var MS1 = Date.parse(TS1);
var MS2 = Date.parse(TS2);

function withTimestamp(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

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

runWithContext('test_trackLineStates_writeProducesBeaconEntryWithLinesAll', function (ctx) {
  // Behavior: a success-confirmed Write is a Tier-1 beacon — its timeline
  // entry collapses to lines: "ALL" and total length + EOF become known.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1)
  ]);
  var entry = result.timeline[String(MS1)];
  assert.ok(entry);
  assert.strictEqual(entry.isBeacon, true);
  assert.strictEqual(entry.lines, 'ALL');
  assert.strictEqual(entry.summary.knownLines, 2);
  assert.strictEqual(entry.summary.lastLine, 2);
  assert.strictEqual(entry.summary.eofConfirmed, true);
  assert.strictEqual(entry.summary.coveragePct, 1);
});

runWithContext('test_trackLineStates_snapshotProducesBeaconEntryWithLinesAll', function (ctx) {
  // Behavior: a live-blob snapshot is a Tier-1 beacon entry with lines "ALL".
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  fs.mkdirSync(path.join(snapshotsDir, 's1'));
  fs.writeFileSync(path.join(snapshotsDir, 's1', 'blob-1'), 'a\nb\n');
  var backups = {};
  backups['repo/t.py'] = { backupFileName: 'blob-1', version: 1 };
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/work/repo'),
    makeSnapshotLine('m1', TS1, false, backups)
  ], snapshotsDir, null, '/work/repo/t.py');
  var entry = result.timeline[String(MS1)];
  assert.strictEqual(entry.isBeacon, true);
  assert.strictEqual(entry.lines, 'ALL');
  assert.strictEqual(entry.summary.eofConfirmed, true);
});

runWithContext('test_trackLineStates_locatedEditSplicesAndShiftsDownstreamKeys', function (ctx) {
  // Behavior: an edit whose old_string is located splices in place; the
  // replaced line becomes authored and every line below shifts by the line
  // delta, re-keyed in the per-line map.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\nc\n'), TS1),
    makeEditLineWithPatch('/repo/t.py', 'b', 'b1\nb2', ['-b', '+b1', '+b2'], TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.isBeacon, false);
  assert.strictEqual(entry.lines['2'].state, 'authored');
  assert.strictEqual(entry.lines['3'].state, 'authored');
  // Step: 'c' moved from line 3 to line 4, carried forward as presumed.
  assert.strictEqual(entry.lines['4'].state, 'presumed');
  assert.strictEqual(entry.summary.lastLine, 4);
  // Step: the authored line's evidence locates it inside the structuredPatch.
  assert.strictEqual(entry.lines['2'].evidence.structuredPatch.property, 'toolUseResult.structuredPatch');
});

runWithContext('test_trackLineStates_floatingEditMarksNumberingUncertainBelowGap', function (ctx) {
  // Behavior: an edit that cannot be located in known text landed somewhere
  // unknowable; the event is flagged floating and every line below the first
  // unknown gap loses numberingCertain.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    makeReadUseWithGeometry('t1', '/repo/t.py', null, 2),
    withTimestamp(h.makeReadToolResult('t1', '1\ta\n2\tb\n'), TS1),
    makeReadUseWithGeometry('t2', '/repo/t.py', 5, 2),
    withTimestamp(h.makeReadToolResult('t2', '5\te\n6\tf\n'), TS2),
    makeEditLineWithPatch('/repo/t.py', 'zzz', 'qqq', ['-zzz', '+qqq'], TS3)
  ]);
  var entry = result.timeline[String(Date.parse(TS3))];
  assert.strictEqual(entry.events[0].edit.floating, true);
  // Step: lines above the gap keep their numbering; lines below lose it.
  assert.strictEqual(entry.lines['1'].numberingCertain, true);
  assert.strictEqual(entry.lines['5'].numberingCertain, false);
  assert.strictEqual(entry.lines['6'].numberingCertain, false);
  // Step: the gap lines exist but are unknown.
  assert.strictEqual(entry.lines['3'].state, 'unknown');
});

runWithContext('test_trackLineStates_readChunkCorroborationUpgradesPresumedToObserved', function (ctx) {
  // Behavior: a chunk matching current belief upgrades the covered line to
  // observed with a refreshed confirmedAtMs; uncovered lines stay presumed.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    makeReadUseWithGeometry('t1', '/repo/t.py', 1, 1),
    withTimestamp(h.makeReadToolResult('t1', '1\ta\n'), TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.lines['1'].state, 'observed');
  assert.strictEqual(entry.lines['1'].confirmedAtMs, MS2);
  assert.strictEqual(entry.lines['2'].state, 'presumed');
  assert.strictEqual(entry.lines['2'].confirmedAtMs, MS1);
  assert.deepStrictEqual(result.conflicts, []);
});

runWithContext('test_trackLineStates_readChunkDisagreementCreatesConflictRecord', function (ctx) {
  // Behavior: a chunk contradicting belief wins the line and leaves a
  // conflict carrying both evidenceRefs, the excerpt, the timeline join key,
  // and the beacon-bounded window.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    makeReadUseWithGeometry('t1', '/repo/t.py', 1, 1),
    withTimestamp(h.makeReadToolResult('t1', '1\tX\n'), TS2)
  ]);
  assert.strictEqual(result.conflicts.length, 1);
  var conflict = result.conflicts[0];
  assert.strictEqual(conflict.timestampOfContradictingRecord, MS2);
  assert.ok(result.timeline[String(MS2)]);
  assert.strictEqual(conflict.line, 1);
  // Step: both sides are auditable evidence references.
  assert.strictEqual(conflict.presumed.textProperty.property, 'toolUseResult.content');
  assert.strictEqual(conflict.observed.textProperty.property, 'message.content[0].content');
  assert.deepStrictEqual(conflict.excerpt, { presumedText: 'a', observedText: 'X' });
  assert.deepStrictEqual(conflict.window, { fromBeaconMs: MS1, toBeaconMs: MS2 });
  // Step: the observation won the line.
  assert.strictEqual(result.timeline[String(MS2)].lines['1'].state, 'observed');
});

runWithContext('test_trackLineStates_fileAbsentZeroesBelief', function (ctx) {
  // Behavior: an absence beacon resets belief to "no lines exist" with EOF
  // (the zero-length extent) known.
  var snapshotsDir = ctx.tempDir('rev-snap-');
  var backups = {};
  backups['repo/t.py'] = { backupFileName: null, version: 1 };
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/work/repo'),
    withTimestamp(h.makeCreateLine('/work/repo/t.py', 'a\nb\n'), TS1),
    makeSnapshotLine('m1', TS2, true, backups)
  ], snapshotsDir, null, '/work/repo/t.py');
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.isBeacon, true);
  assert.strictEqual(entry.lines, 'ALL');
  assert.strictEqual(entry.summary.knownLines, 0);
  assert.strictEqual(entry.summary.lastLine, 0);
  assert.strictEqual(entry.summary.eofConfirmed, true);
});

runWithContext('test_trackLineStates_snapshotFixesEofConfirmed', function (ctx) {
  // Behavior: chunk-only belief leaves the tail unproved; a snapshot beacon
  // fixes the extent (eofConfirmed flips false -> true).
  var fs = require('fs'), path = require('path');
  var snapshotsDir = ctx.tempDir('rev-snap-');
  fs.mkdirSync(path.join(snapshotsDir, 's1'));
  fs.writeFileSync(path.join(snapshotsDir, 's1', 'blob-1'), 'a\nb\n');
  var backups = {};
  backups['repo/t.py'] = { backupFileName: 'blob-1', version: 1 };
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/work/repo'),
    makeReadUseWithGeometry('t1', '/work/repo/t.py', null, 2),
    withTimestamp(h.makeReadToolResult('t1', '1\ta\n2\tb\n'), TS1),
    makeSnapshotLine('m1', TS2, false, backups)
  ], snapshotsDir, null, '/work/repo/t.py');
  assert.strictEqual(result.timeline[String(MS1)].summary.eofConfirmed, false);
  assert.strictEqual(result.timeline[String(MS2)].summary.eofConfirmed, true);
});

runWithContext('test_trackLineStates_sameMsEventsShareOneEntryAppliedInDeterministicOrder', function (ctx) {
  // Behavior: events in the same millisecond share one timeline entry and
  // apply in (jsonl, jsonlLine) order — the write anchors, then the edit
  // splices it, deterministically across reruns.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    makeEditLineWithPatch('/repo/t.py', 'b', 'B', ['-b', '+B'], TS1)
  ]);
  assert.strictEqual(Object.keys(result.timeline).length, 1);
  var entry = result.timeline[String(MS1)];
  assert.strictEqual(entry.events.length, 2);
  assert.notStrictEqual(entry.events[0].write, null);
  assert.notStrictEqual(entry.events[1].edit, null);
  // Step: the edit applied AFTER the write — line 2 is the spliced 'B'.
  assert.strictEqual(entry.summary.lastLine, 2);
  assert.strictEqual(entry.summary.knownLines, 2);
});

runWithContext('test_trackLineStates_finalVerdictCountsAndMismatchedLineEvidence', function (ctx) {
  // Behavior: the final verdict compares final belief per line against the
  // reference: corroborated lines count as matchedObserved, carry-forward
  // matches as matchedPresumed, divergences land in mismatchedLines with the
  // line's evidenceRef and excerpts of both sides.
  var reference = { via: 'on-disk', content: 'a\nB\nc\n' };
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\nc\n'), TS1),
    makeReadUseWithGeometry('t1', '/repo/t.py', 1, 1),
    withTimestamp(h.makeReadToolResult('t1', '1\ta\n'), TS2)
  ], null, reference);
  var verdict = result.finalVerdict;
  assert.strictEqual(verdict.comparedVia, 'on-disk');
  assert.deepStrictEqual(verdict.perLineStats, { matchedObserved: 1, matchedPresumed: 1, mismatched: 1, neverObserved: 0 });
  assert.strictEqual(verdict.mismatchedLines.length, 1);
  var mismatch = verdict.mismatchedLines[0];
  assert.strictEqual(mismatch.line, 2);
  assert.strictEqual(mismatch.lastState, 'presumed');
  assert.strictEqual(mismatch.evidence.textProperty.property, 'toolUseResult.content');
  assert.deepStrictEqual(mismatch.excerpt, { reconstructed: 'b', reference: 'B' });
  assert.strictEqual(verdict.tailUncertain, false);
});

runWithContext('test_trackLineStates_reportIsSelfContained', function (ctx) {
  // Behavior: the report carries filePath, aliasPaths, and every transcript
  // scanned, so reference + list = dereferenceable without outside context.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\n'), TS1)
  ]);
  assert.strictEqual(result.filePath, '/repo/t.py');
  assert.deepStrictEqual(result.aliasPaths, ['/repo/t.py']);
  assert.strictEqual(result.jsonlsScanned.length, 1);
});

h.summary();
