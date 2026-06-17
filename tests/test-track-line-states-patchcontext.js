// Tracker behavior for the patchContext event kind (roadmap item 3): the
// unchanged context (' ') lines inside an edit's structuredPatch, surfaced as a
// SPARSE overlay at the edit instant. Kept in its own suite — the core tracker
// suite is at the 250-line write cap. Covers the sparse-overlay semantics
// (observe without claiming EOF or truncating the tail), the disagreement
// conflict, and the post-splice ordering (patchContext lands after the edit).

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var efe = require('../api/file-events-extractors');
var tls = require('../api/track-line-states');
var fx = require('./track-line-states-fixtures');

var TS1 = fx.TS1, TS2 = fx.TS2, MS2 = fx.MS2;

// Write a transcript, extract events, run the tracker. Optional eventFilter
// trims the stream (e.g. drop the edit event to isolate the context overlay).
function trackFixture(ctx, lines, reference, eventFilter) {
  var fs = require('fs'), path = require('path');
  var jsonlPath = path.join(ctx.tempDir('rev-tlspc-'), 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  if (eventFilter) { events = events.filter(eventFilter); }
  var options = {
    filePath: '/repo/t.py', aliasPaths: ['/repo/t.py'], jsonlsScanned: [jsonlPath],
    reference: reference ? reference : { via: 'none', content: null }
  };
  return tls.trackLineStates(events, options);
}

function withoutEdit(e) { return e.edit === null; }

// A Read that fills its limit exactly (hitEof false) → readChunk over lines 1-5
// with eofConfirmed left false and a known tail (lines 4-5).
function readChunkOfFive(ctx, hunks) {
  return trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    fx.makeReadUseWithGeometry('r1', '/repo/t.py', null, 5),
    fx.withTimestamp(h.makeReadToolResult('r1', '1\ta\n2\tb\n3\tc\n4\td\n5\te\n'), TS1),
    fx.makeEditLineWithHunks('/repo/t.py', 'b', 'B', hunks, TS2)
  ], null, withoutEdit);
}

runWithContext('test_trackLineStates_patchContextSparseOverlayObservesWithoutClaimingEofOrTruncating', function (ctx) {
  // Behavior: context lines 'b'@2 and 'c'@3 corroborate carried belief — they
  // become observed at the edit ms WITHOUT flipping eofConfirmed, without
  // truncating the known tail (lines 4-5), and the group is not a beacon.
  var result = readChunkOfFive(ctx, [{ newStart: 2, lines: [' b', ' c'] }]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.isBeacon, false);
  assert.strictEqual(entry.lines['2'].state, 'observed');
  assert.strictEqual(entry.lines['2'].confirmedAtMs, MS2);
  assert.strictEqual(entry.lines['3'].state, 'observed');
  assert.strictEqual(entry.lines['3'].confirmedAtMs, MS2);
  assert.strictEqual(entry.summary.eofConfirmed, false);
  assert.strictEqual(entry.summary.lastLine, 5);
  assert.notStrictEqual(entry.lines['4'], undefined);
  assert.notStrictEqual(entry.lines['5'], undefined);
  assert.strictEqual(result.conflicts.length, 0);
});

runWithContext('test_trackLineStates_patchContextLineDisagreeingWithBeliefEmitsOneConflict', function (ctx) {
  // Behavior: a context line whose text differs from carried belief ('WRONG' vs
  // 'c' at line 3) surfaces exactly one conflict — the observation displaces it.
  var result = readChunkOfFive(ctx, [{ newStart: 2, lines: [' b', ' WRONG'] }]);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].line, 3);
  assert.deepStrictEqual(result.conflicts[0].excerpt, { presumedText: 'c', observedText: 'WRONG' });
});

runWithContext('test_trackLineStates_patchContextLandsOnPostSpliceStateAfterTheEdit', function (ctx) {
  // Behavior: within one record the edit (kindRank 1) applies before patchContext
  // (kindRank 2). A readFull pins a,b,c; the edit authors b->B; patchContext then
  // corroborates the unchanged neighbors a@1 and c@3 at the post-splice state —
  // line 2 stays authored, lines 1 and 3 observed, no conflict, clean verdict.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeReadToolUse('r1', '/repo/t.py'),
    fx.withTimestamp(h.makeReadToolResult('r1', '1\ta\n2\tb\n3\tc\n'), TS1),
    fx.makeEditLineWithHunks('/repo/t.py', 'b', 'B', [{ newStart: 1, lines: [' a', '-b', '+B', ' c'] }], TS2)
  ], { via: 'final', content: 'a\nB\nc\n' });
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.lines['2'].state, 'authored');
  assert.strictEqual(entry.lines['1'].state, 'observed');
  assert.strictEqual(entry.lines['1'].confirmedAtMs, MS2);
  assert.strictEqual(entry.lines['3'].state, 'observed');
  assert.strictEqual(entry.lines['3'].confirmedAtMs, MS2);
  assert.strictEqual(result.conflicts.length, 0);
  assert.strictEqual(result.finalVerdict.perLineStats.mismatched, 0);
});

h.summary();
