// Tracker apply branches for the partial-content Bash-read kinds (roadmap item
// 4): bashReadChunk (head/sed/tail), bashExtent (wc -l), bashGrep (grep -n).
// Split from test-track-line-states (250-line write cap). Shared fixtures:
// ./track-line-states-fixtures. All three are sparse/extend-only observations —
// none claim EOF from a Bash line count (the harness strips trailing newlines).

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var f = require('./track-line-states-fixtures');
var TS1 = f.TS1, TS2 = f.TS2, MS1 = f.MS1, MS2 = f.MS2;
var withTimestamp = f.withTimestamp;
var trackFixture = f.trackFixture;

runWithContext('test_trackLineStates_bashReadChunkCorroboratesPresumedToObserved', function (ctx) {
  // Behavior: a head/sed/tail chunk matching belief upgrades the covered line to
  // observed (refreshed confirmedAtMs); uncovered lines stay presumed; no conflict.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    withTimestamp(h.makeBashCommandLine('u1', 'head -n 1 /repo/t.py'), TS2),
    withTimestamp(h.makeBashCatToolResult('u1', 'a\n'), TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.lines['1'].state, 'observed');
  assert.strictEqual(entry.lines['1'].confirmedAtMs, MS2);
  assert.strictEqual(entry.lines['2'].state, 'presumed');
  assert.deepStrictEqual(result.conflicts, []);
});

runWithContext('test_trackLineStates_bashReadChunkDisagreementRecordsConflict', function (ctx) {
  // Behavior: a chunk whose witnessed text contradicts belief wins the line and
  // records one conflict on that line.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    withTimestamp(h.makeBashCommandLine('u1', 'sed -n 1p /repo/t.py'), TS2),
    withTimestamp(h.makeBashCatToolResult('u1', 'X\n'), TS2)
  ]);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].line, 1);
});

runWithContext('test_trackLineStates_bashReadChunkNeverClaimsEofFromBashLineCount', function (ctx) {
  // Behavior: a bash chunk returning FEWER lines than asked must NOT fix the
  // extent. The Bash harness strips stdout's trailing newline, so the line count
  // is a lower bound (a trailing blank line vanishes) — claiming EOF could drop a
  // real tail. The chunk still overlays its witnessed lines, but eofConfirmed
  // stays false (sparse overlay, no finishChunk).
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeBashCommandLine('u1', 'head -n 5 /repo/t.py'), TS1),
    withTimestamp(h.makeBashCatToolResult('u1', 'a\nb\n'), TS1)
  ]);
  var entry = result.timeline[String(MS1)];
  assert.strictEqual(entry.summary.lastLine, 2);
  assert.strictEqual(entry.summary.eofConfirmed, false);
});

runWithContext('test_trackLineStates_bashExtentExtendsLowerBoundWithoutClaimingEof', function (ctx) {
  // Behavior: wc -l implies lines 1..N exist and raises lastLine, but is a lower
  // bound — it must NOT set eofConfirmed (a too-low count can't drop a real tail).
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeBashCommandLine('u1', 'wc -l /repo/t.py'), TS1),
    withTimestamp(h.makeBashCatToolResult('u1', '5 /repo/t.py'), TS1)
  ]);
  var entry = result.timeline[String(MS1)];
  assert.strictEqual(entry.summary.lastLine, 5);
  assert.strictEqual(entry.summary.eofConfirmed, false);
  assert.deepStrictEqual(result.conflicts, []);
});

runWithContext('test_trackLineStates_bashGrepCorroboratesMatchingLine', function (ctx) {
  // Behavior: a single-file grep -n match upgrades the witnessed line to observed;
  // grep witnesses no extent, so other lines and lastLine are untouched.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\nc\n'), TS1),
    withTimestamp(h.makeBashCommandLine('u1', 'grep -n b /repo/t.py'), TS2),
    withTimestamp(h.makeBashCatToolResult('u1', '2:b'), TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.lines['2'].state, 'observed');
  assert.strictEqual(entry.lines['2'].confirmedAtMs, MS2);
  assert.deepStrictEqual(result.conflicts, []);
});

runWithContext('test_trackLineStates_bashGrepDisagreementConflictsWithoutClaimingExtent', function (ctx) {
  // Behavior: a grep match contradicting belief records one conflict and wins the
  // line, but never witnesses extent — the beacon's lastLine (3) is unchanged.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\nc\n'), TS1),
    withTimestamp(h.makeBashCommandLine('u1', 'grep -n X /repo/t.py'), TS2),
    withTimestamp(h.makeBashCatToolResult('u1', '2:X'), TS2)
  ]);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].line, 2);
  assert.strictEqual(result.timeline[String(MS2)].summary.lastLine, 3);
});

h.summary();
