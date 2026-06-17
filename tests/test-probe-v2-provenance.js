// Tests for tools/probe-projects-v2.js — Phase D reference selection +
// provenance. All sources are probed for AVAILABILITY (no short-circuit);
// comparedVia is the first source whose content matches the replay, else the
// first available source, else none. dataSources records what was skipped.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

var rrs = require('../api/reconstruction-reference-sources');

// Source-probe fixtures in the shape gatherReferenceSources produces.
function onDiskSource(available, content) {
  return { name: 'onDisk', available: available, content: content, path: available ? '/repo/f.js' : null };
}
function snapshotSource(available, content) {
  var blob = available ? { sessionId: 'sess1', backupFileName: 'backup-f.txt' } : null;
  return { name: 'snapshot', available: available, content: content, blob: blob };
}
function gitSource(available, content) {
  return { name: 'git', available: available, content: content, ref: available ? 'main' : null };
}

run('test_chooseReferenceSource_onDiskMatchUsedAndSkippedNotesSnapshotAvailable', function () {
  // Behavior: replay matches on-disk while a snapshot was ALSO available — the
  // on-disk source is used and the skipped list says so explicitly.
  var sources = [onDiskSource(true, 'X'), snapshotSource(true, 'X'), gitSource(false, null)];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'PASS');
  assert.strictEqual(decision.comparedVia, 'on-disk');
  assert.strictEqual(decision.dataSources.onDisk.used, true);
  assert.strictEqual(decision.dataSources.snapshot.used, false);
  assert.ok(decision.dataSources.skipped.indexOf('snapshot available but on-disk used') >= 0);
});

run('test_chooseReferenceSource_deletedFileVerifiesAgainstSnapshotBlob', function () {
  // Behavior: file gone from disk but a snapshot blob matches — comparedVia is
  // snapshot and the blob identity is recorded for auditing.
  var sources = [onDiskSource(false, null), snapshotSource(true, 'X'), gitSource(false, null)];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'PASS');
  assert.strictEqual(decision.comparedVia, 'snapshot');
  assert.deepStrictEqual(decision.dataSources.snapshot.blob,
    { sessionId: 'sess1', backupFileName: 'backup-f.txt' });
  assert.strictEqual(decision.dataSources.snapshot.used, true);
});

run('test_chooseReferenceSource_noSourceAvailableIsNotFound', function () {
  // Behavior: no reference anywhere — status NOT_FOUND, comparedVia none.
  var sources = [onDiskSource(false, null), snapshotSource(false, null), gitSource(false, null)];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'NOT_FOUND');
  assert.strictEqual(decision.comparedVia, 'none');
  assert.strictEqual(decision.usedSource, null);
});

run('test_chooseReferenceSource_availableButDifferentContentIsMismatch', function () {
  // Behavior: a reference exists but differs from the replay — MISMATCH against
  // the first available source.
  var sources = [onDiskSource(true, 'DIFFERENT'), snapshotSource(false, null), gitSource(false, null)];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'MISMATCH');
  assert.strictEqual(decision.comparedVia, 'on-disk');
  assert.strictEqual(decision.dataSources.onDisk.used, true);
});

run('test_chooseReferenceSource_laterMatchingSourceBeatsEarlierMismatching', function () {
  // Behavior: NO short-circuit — on-disk is available but stale; git matches.
  // The matching source wins and the stale one lands in skipped.
  var sources = [onDiskSource(true, 'STALE'), snapshotSource(false, null), gitSource(true, 'X')];
  var decision = rrs.chooseReferenceSource('X', sources);
  assert.strictEqual(decision.status, 'PASS');
  assert.strictEqual(decision.comparedVia, 'git');
  assert.strictEqual(decision.dataSources.git.used, true);
  assert.ok(decision.dataSources.skipped.indexOf('onDisk available but git used') >= 0);
});

h.summary();
