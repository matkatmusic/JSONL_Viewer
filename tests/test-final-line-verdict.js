var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var lb = require('../api/line-belief');
var flv = require('../api/final-line-verdict');

var MS1 = 1000;

function ref(tag) {
  return { jsonl: '/t/a.jsonl', jsonlLine: 1, textProperty: { property: tag, startIndex: 0, endIndex: 1 }, structuredPatch: null, blobFile: null };
}

function beliefWithLines(texts) {
  var belief = lb.createBelief();
  var lines = texts.map(function (text) { return { text: text, ref: ref('seed') }; });
  lb.applyWrite(belief, lines, MS1);
  return belief;
}

run('test_buildFinalVerdict_bucketsLinesByComparisonOutcome', function () {
  // Behavior: final belief vs reference, per line — observed match vs
  // presumed (carry-forward) match vs mismatch vs never-observed.
  var belief = beliefWithLines(['a', 'b', 'c']);
  belief.entries[1].state = 'observed';
  belief.entries[2].state = 'presumed';
  belief.entries[3].state = 'presumed';
  belief.entries[3].text = 'WRONG';
  lb.ensureImpliedLines(belief, 4);
  var verdict = flv.buildFinalVerdict(belief, { via: 'on-disk', content: 'a\nb\nc\nd\n' });
  assert.strictEqual(verdict.comparedVia, 'on-disk');
  assert.deepStrictEqual(verdict.perLineStats, { matchedObserved: 1, matchedPresumed: 1, mismatched: 1, neverObserved: 1 });
});

run('test_buildFinalVerdict_mismatchedLineCarriesEvidenceAndExcerpts', function () {
  // Behavior: each divergent line is self-contained: number, last state,
  // OUR evidence reference, and short excerpts of both sides.
  var belief = beliefWithLines(['a']);
  var verdict = flv.buildFinalVerdict(belief, { via: 'on-disk', content: 'X\n' });
  assert.strictEqual(verdict.mismatchedLines.length, 1);
  var mismatch = verdict.mismatchedLines[0];
  assert.strictEqual(mismatch.line, 1);
  assert.strictEqual(mismatch.lastState, 'authored');
  assert.strictEqual(mismatch.evidence.textProperty.property, 'seed');
  assert.deepStrictEqual(mismatch.excerpt, { reconstructed: 'a', reference: 'X' });
});

run('test_buildFinalVerdict_claimedLineBeyondReferenceIsMismatched', function () {
  // Behavior: a claimed line the reference does not have diverges (its
  // reference excerpt is null).
  var belief = beliefWithLines(['a', 'b']);
  var verdict = flv.buildFinalVerdict(belief, { via: 'on-disk', content: 'a\n' });
  assert.strictEqual(verdict.perLineStats.mismatched, 1);
  assert.strictEqual(verdict.mismatchedLines[0].line, 2);
  assert.strictEqual(verdict.mismatchedLines[0].excerpt.reference, null);
});

run('test_buildFinalVerdict_noReferenceReportsBeliefOnly', function () {
  // Behavior: via 'none' is the NOT_FOUND analogue — empty stats and lines,
  // tail certainty still reported from belief.
  var belief = beliefWithLines(['a']);
  belief.eofConfirmed = false;
  var verdict = flv.buildFinalVerdict(belief, { via: 'none', content: null });
  assert.strictEqual(verdict.comparedVia, 'none');
  assert.deepStrictEqual(verdict.perLineStats, { matchedObserved: 0, matchedPresumed: 0, mismatched: 0, neverObserved: 0 });
  assert.deepStrictEqual(verdict.mismatchedLines, []);
  assert.strictEqual(verdict.tailUncertain, true);
});

h.summary();
