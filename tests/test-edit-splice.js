var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var lb = require('../api/line-belief');
var es = require('../api/edit-splice');

var MS1 = 1000;
var MS2 = 2000;

function ref(tag) {
  return { jsonl: '/t/a.jsonl', jsonlLine: 1, textProperty: { property: tag, startIndex: 0, endIndex: 1 }, structuredPatch: null, blobFile: null };
}

function beliefWithLines(texts) {
  var belief = lb.createBelief();
  var lines = texts.map(function (text) { return { text: text, ref: ref('seed') }; });
  lb.applyWrite(belief, lines, MS1);
  return belief;
}

function authoredRefFor(lineText) {
  return ref('authored:' + lineText);
}

run('test_applyEditToBelief_locatedReplaceAuthorsTheLineInPlace', function () {
  // Behavior: old_string located in known text -> in-place splice; the
  // replaced line is authored at the edit's time; neighbors untouched.
  var belief = beliefWithLines(['a', 'b', 'c']);
  var result = es.applyEditToBelief(belief, { oldString: 'b', newString: 'B', replaceAll: false }, MS2, authoredRefFor);
  assert.strictEqual(result.floating, false);
  assert.strictEqual(belief.entries[2].text, 'B');
  assert.strictEqual(belief.entries[2].state, 'authored');
  assert.strictEqual(belief.entries[2].confirmedAtMs, MS2);
  assert.strictEqual(belief.entries[1].text, 'a');
  assert.strictEqual(belief.entries[3].text, 'c');
});

run('test_applyEditToBelief_multiLineInsertionShiftsDownstreamByDelta', function () {
  // Behavior: a splice growing one line into two shifts every line below by
  // the delta, carrying their entries to the new keys.
  var belief = beliefWithLines(['a', 'b', 'c']);
  var result = es.applyEditToBelief(belief, { oldString: 'b', newString: 'b1\nb2', replaceAll: false }, MS2, authoredRefFor);
  assert.strictEqual(result.floating, false);
  assert.strictEqual(belief.entries[2].text, 'b1');
  assert.strictEqual(belief.entries[3].text, 'b2');
  assert.strictEqual(belief.entries[4].text, 'c');
  assert.strictEqual(belief.entries[4].state, 'authored');
  assert.strictEqual(belief.lastLine, 4);
});

run('test_applyEditToBelief_multiLineOldStringSpanningLinesIsLocated', function () {
  // Behavior: old_string spanning a newline is found across run lines.
  var belief = beliefWithLines(['a', 'b', 'c']);
  var result = es.applyEditToBelief(belief, { oldString: 'b\nc', newString: 'X', replaceAll: false }, MS2, authoredRefFor);
  assert.strictEqual(result.floating, false);
  assert.strictEqual(belief.entries[2].text, 'X');
  assert.strictEqual(belief.entries[3], undefined);
  assert.strictEqual(belief.lastLine, 2);
});

run('test_applyEditToBelief_unlocatableWithGapFloatsAndUnanchorsBelowGap', function () {
  // Behavior: old_string not in any known run, with an unknown gap present —
  // the edit landed somewhere unknowable; numbering below the first gap line
  // is no longer certain; the extent is no longer EOF-proved.
  var belief = beliefWithLines(['a', 'b']);
  lb.ensureImpliedLines(belief, 4);
  lb.overlayLine(belief, 5, 'e', ref('read'), MS1);
  var result = es.applyEditToBelief(belief, { oldString: 'zzz', newString: 'q', replaceAll: false }, MS2, authoredRefFor);
  assert.strictEqual(result.floating, true);
  assert.strictEqual(result.floatingOverKnownRegion, false);
  assert.strictEqual(belief.entries[1].numberingCertain, true);
  assert.strictEqual(belief.entries[2].numberingCertain, true);
  assert.strictEqual(belief.entries[5].numberingCertain, false);
  assert.strictEqual(belief.eofConfirmed, false);
});

run('test_applyEditToBelief_unlocatableOverFullyKnownRegionIsFlagged', function () {
  // Behavior (open question from the plan): an unlocatable edit over FULLY
  // known content has no gap to hide in — belief is provably wrong somewhere.
  // It floats AND is flagged so Phase 4 reports surface it; all numbering
  // becomes suspect.
  var belief = beliefWithLines(['a', 'b']);
  var result = es.applyEditToBelief(belief, { oldString: 'zzz', newString: 'q', replaceAll: false }, MS2, authoredRefFor);
  assert.strictEqual(result.floating, true);
  assert.strictEqual(result.floatingOverKnownRegion, true);
  assert.strictEqual(belief.entries[1].numberingCertain, false);
  assert.strictEqual(belief.entries[2].numberingCertain, false);
});

run('test_applyEditToBelief_replaceAllSplicesEveryOccurrenceInTheRun', function () {
  // Behavior: replaceAll swaps every occurrence within the located run.
  var belief = beliefWithLines(['x', 'y', 'x']);
  var result = es.applyEditToBelief(belief, { oldString: 'x', newString: 'z', replaceAll: true }, MS2, authoredRefFor);
  assert.strictEqual(result.floating, false);
  assert.strictEqual(belief.entries[1].text, 'z');
  assert.strictEqual(belief.entries[2].text, 'y');
  assert.strictEqual(belief.entries[3].text, 'z');
});

h.summary();
