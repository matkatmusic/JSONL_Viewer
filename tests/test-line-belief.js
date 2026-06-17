var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var lb = require('../api/line-belief');

var MS1 = 1000;
var MS2 = 2000;

function ref(tag) {
  return { jsonl: '/t/a.jsonl', jsonlLine: 1, textProperty: { property: tag, startIndex: 0, endIndex: 1 }, structuredPatch: null, blobFile: null };
}

// A belief seeded by a write of the given line texts at MS1.
function beliefWithLines(texts) {
  var belief = lb.createBelief();
  var lines = texts.map(function (text) { return { text: text, ref: ref('seed') }; });
  lb.applyWrite(belief, lines, MS1);
  return belief;
}

run('test_ensureImpliedLines_createsUnknownEntriesAndRaisesLastLine', function () {
  // Behavior: observation geometry implies lines exist before the covered
  // span — unknown entries (no claim) appear for them.
  var belief = lb.createBelief();
  lb.ensureImpliedLines(belief, 3);
  assert.strictEqual(belief.entries[1].state, 'unknown');
  assert.strictEqual(belief.entries[3].text, null);
  assert.strictEqual(belief.lastLine, 3);
});

run('test_overlayLine_corroborationUpgradesToObservedAndRefreshes', function () {
  // Behavior: an observation equal to belief upgrades the line to observed,
  // refreshes confirmedAtMs, and re-anchors numbering — no conflict.
  var belief = beliefWithLines(['a', 'b']);
  belief.entries[1].state = 'presumed';
  var conflict = lb.overlayLine(belief, 1, 'a', ref('read'), MS2);
  assert.strictEqual(conflict, null);
  assert.strictEqual(belief.entries[1].state, 'observed');
  assert.strictEqual(belief.entries[1].confirmedAtMs, MS2);
});

run('test_overlayLine_disagreementReturnsConflictAndTakesObserved', function () {
  // Behavior: an observation contradicting belief wins the line; the
  // displaced side and the observed side both come back as conflict info.
  var belief = beliefWithLines(['a']);
  var conflict = lb.overlayLine(belief, 1, 'X', ref('read'), MS2);
  assert.strictEqual(conflict.line, 1);
  assert.strictEqual(conflict.presumedText, 'a');
  assert.strictEqual(conflict.observedText, 'X');
  assert.strictEqual(conflict.presumedEvidence.textProperty.property, 'seed');
  assert.strictEqual(belief.entries[1].text, 'X');
  assert.strictEqual(belief.entries[1].state, 'observed');
});

run('test_applySnapshotVerify_conflictsOnDivergenceThenCollapsesToObserved', function () {
  // Behavior: a snapshot beacon verifies accumulated belief — each
  // disagreeing line becomes a conflict — and then anchors as full truth.
  var belief = beliefWithLines(['a', 'b']);
  var snapLines = [{ text: 'a', ref: ref('blob') }, { text: 'B', ref: ref('blob') }];
  var conflicts = lb.applySnapshotVerify(belief, snapLines, MS2);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].line, 2);
  assert.strictEqual(belief.entries[2].text, 'B');
  assert.strictEqual(belief.entries[2].state, 'observed');
  assert.strictEqual(belief.eofConfirmed, true);
});

run('test_degradeUntouchedToPresumed_downgradesOnlyUntouchedClaims', function () {
  // Behavior: after an instant, claims not re-established degrade to
  // presumed; touched lines and unknown lines are left alone.
  var belief = beliefWithLines(['a', 'b']);
  lb.ensureImpliedLines(belief, 3);
  var touched = new Set([1]);
  lb.degradeUntouchedToPresumed(belief, touched);
  assert.strictEqual(belief.entries[1].state, 'authored');
  assert.strictEqual(belief.entries[2].state, 'presumed');
  assert.strictEqual(belief.entries[3].state, 'unknown');
});

run('test_summarizeBelief_countsKnownUnknownAndCoverage', function () {
  // Behavior: the roll-up counts claims vs gaps and their ratio.
  var belief = beliefWithLines(['a', 'b', 'c']);
  lb.ensureImpliedLines(belief, 4);
  var summary = lb.summarizeBelief(belief);
  assert.strictEqual(summary.knownLines, 3);
  assert.strictEqual(summary.unknownLines, 1);
  assert.strictEqual(summary.lastLine, 4);
  assert.strictEqual(summary.coveragePct, 0.75);
});

run('test_knownRuns_splitsContiguousTextAtGaps', function () {
  // Behavior: known-text runs are the contiguous spans an edit can locate
  // its old_string in; unknown lines split them.
  var belief = beliefWithLines(['a', 'b']);
  lb.ensureImpliedLines(belief, 4);
  lb.overlayLine(belief, 5, 'e', ref('read'), MS2);
  var runs = lb.knownRuns(belief);
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].startLine, 1);
  assert.deepStrictEqual(runs[0].texts, ['a', 'b']);
  assert.strictEqual(runs[1].startLine, 5);
  assert.deepStrictEqual(runs[1].texts, ['e']);
});

run('test_applyFileAbsent_zeroesBeliefWithEofKnown', function () {
  // Behavior: the absence beacon resets to "no lines exist", extent known.
  var belief = beliefWithLines(['a']);
  lb.applyFileAbsent(belief, MS2);
  assert.deepStrictEqual(belief.entries, {});
  assert.strictEqual(belief.lastLine, 0);
  assert.strictEqual(belief.eofConfirmed, true);
});

run('test_applyAbsenceObservation_clearsBeliefAndReturnsConflictPerKnownLine', function () {
  // Behavior: a Tier-2 absence observation (a Bash `rm`) contradicts every
  // KNOWN line — one conflict each carrying the displaced text + the rm ref and
  // observedText null — then clears belief to "no lines exist", EOF known.
  // Unlike the Tier-1 fileAbsent BEACON it RETURNS the conflicts; a line we
  // only know EXISTS (text null) is not contradicted.
  var belief = beliefWithLines(['a', 'b']);
  belief.entries[3] = lb.makeUnknownEntry();
  var rmRef = ref('rm');
  var conflicts = lb.applyAbsenceObservation(belief, MS2, rmRef);
  assert.strictEqual(conflicts.length, 2);
  assert.strictEqual(conflicts[0].line, 1);
  assert.strictEqual(conflicts[0].presumedText, 'a');
  assert.strictEqual(conflicts[0].presumedEvidence.textProperty.property, 'seed');
  assert.strictEqual(conflicts[0].observedText, null);
  assert.strictEqual(conflicts[0].observedRef, rmRef);
  assert.deepStrictEqual(belief.entries, {});
  assert.strictEqual(belief.lastLine, 0);
  assert.strictEqual(belief.eofConfirmed, true);
});

run('test_finishChunk_hitEofDropsBeyondAndFixesExtent', function () {
  // Behavior: a chunk that hit EOF proves where the file ends — believed
  // lines beyond it are dropped and the extent is fixed.
  var belief = beliefWithLines(['a', 'b', 'c']);
  lb.finishChunk(belief, true, 2);
  assert.strictEqual(belief.entries[3], undefined);
  assert.strictEqual(belief.lastLine, 2);
  assert.strictEqual(belief.eofConfirmed, true);
});

h.summary();
