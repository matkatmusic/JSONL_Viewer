// Tracker belief-mechanics: beacons (write/snapshot/absence), edit splice +
// floating, read-chunk corroboration, EOF fixing, and same-ms ordering. The
// conflict-record + final-verdict + report tests live in the sibling suite
// test-track-line-states-verdict.js (this file is at the 250-line write cap).
// Shared fixtures: ./track-line-states-fixtures.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var f = require('./track-line-states-fixtures');
var TS1 = f.TS1, TS2 = f.TS2, TS3 = f.TS3, MS1 = f.MS1, MS2 = f.MS2;
var withTimestamp = f.withTimestamp;
var makeReadUseWithGeometry = f.makeReadUseWithGeometry;
var makeEditLineWithPatch = f.makeEditLineWithPatch;
var makeSnapshotLine = f.makeSnapshotLine;
var trackFixture = f.trackFixture;

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

runWithContext('test_extractFileEvents_includes_grepMatches_for_the_target_file', function (ctx) {
  // Behavior: a native Grep (output_mode content, -n) that matched the target file is
  // extracted as a grepMatches event and reaches the tracker, corroborating the witnessed
  // line at the grep instant (the file's extent is left untouched — grep is a sparse overlay).
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\nc\n'), TS1),
    withTimestamp(h.makeGrepToolUse('g1', 'b'), TS2),
    withTimestamp(h.makeGrepToolResult('g1', 't.py:2:b', 1, 1), TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  // Step: the grep instant produced a timeline entry carrying a grepMatches event.
  assert.ok(entry);
  assert.ok(entry.events.some(function (e) { return e.grepMatches; }));
  // Step: the witnessed line is upgraded to observed at the grep instant.
  assert.strictEqual(entry.lines['2'].state, 'observed');
  assert.strictEqual(entry.lines['2'].confirmedAtMs, MS2);
});

h.summary();
