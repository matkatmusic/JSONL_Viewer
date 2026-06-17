// Tracker conflict + final-verdict + report tests. Relocated (preserved, not
// rewritten) from test-track-line-states.js when that suite hit the 250-line
// write cap (roadmap item 2, Phase 0). Shared fixtures: ./track-line-states-fixtures.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var f = require('./track-line-states-fixtures');
var TS1 = f.TS1, TS2 = f.TS2, MS1 = f.MS1, MS2 = f.MS2;
var withTimestamp = f.withTimestamp;
var makeReadUseWithGeometry = f.makeReadUseWithGeometry;
var trackFixture = f.trackFixture;

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
