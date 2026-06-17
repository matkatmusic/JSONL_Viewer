// Tracker behavior for the Bash-file-op event kinds (roadmap item 2): bashRm
// (Tier-2 absence), bashTruncate (`>` whole-file overlay), bashAppend (`>>`
// extent-extending overlay). Its own suite — the core tracker suites are at the
// 250-line write cap. Shared fixtures: ./track-line-states-fixtures.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var f = require('./track-line-states-fixtures');
var TS1 = f.TS1, TS2 = f.TS2, TS3 = f.TS3, MS2 = f.MS2, MS3 = f.MS3;
var withTimestamp = f.withTimestamp;

runWithContext('test_trackLineStates_bashRmContradictsBeliefClearsItAndIsNotABeacon', function (ctx) {
  // Behavior: a Write establishes belief at T1; a Bash `rm` of the same file at
  // T2 contradicts every known line (one conflict each, observedText null + the
  // command ref), clears belief to zero lines with EOF known, and is NOT a
  // beacon — rm is inferred (it can fail or be undone), so its conflicts stay
  // windowed against the prior REAL beacon (the write at MS1).
  var result = f.trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    withTimestamp(h.makeBashCommandLine('b1', 'rm t.py'), TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.isBeacon, false);
  assert.strictEqual(entry.summary.knownLines, 0);
  assert.strictEqual(entry.summary.lastLine, 0);
  assert.strictEqual(entry.summary.eofConfirmed, true);
  assert.strictEqual(result.conflicts.length, 2);
  assert.strictEqual(result.conflicts[0].line, 1);
  assert.strictEqual(result.conflicts[0].excerpt.observedText, null);
  assert.strictEqual(result.conflicts[0].excerpt.presumedText, 'a');
  assert.strictEqual(result.conflicts[0].observed.textProperty.property, 'message.content[0].input.command');
  assert.deepStrictEqual(result.conflicts[0].window, { fromBeaconMs: f.MS1, toBeaconMs: MS2 });
});

runWithContext('test_trackLineStates_bashRmThenRecreateRepopulatesBelief', function (ctx) {
  // Behavior: because rm is Tier-2 (not a permanent-absence beacon), a later
  // Write recreates the file and repopulates belief — the rm only cleared it.
  var result = f.trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    withTimestamp(h.makeBashCommandLine('b1', 'rm t.py'), TS2),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'x\ny\nz\n'), TS3)
  ]);
  assert.strictEqual(result.timeline[String(MS2)].summary.knownLines, 0);
  var entry = result.timeline[String(MS3)];
  assert.strictEqual(entry.isBeacon, true);
  assert.strictEqual(entry.summary.knownLines, 3);
  assert.strictEqual(entry.summary.lastLine, 3);
});

runWithContext('test_trackLineStates_bashRmOfUnrelatedFileEmitsNoEvent', function (ctx) {
  // Behavior: an `rm` of a different file produces no bashRm event for this
  // file — belief is untouched and that instant gets no timeline entry.
  var result = f.trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    withTimestamp(h.makeBashCommandLine('b1', 'rm other.py'), TS2)
  ]);
  assert.strictEqual(result.timeline[String(MS2)], undefined);
  assert.deepStrictEqual(result.conflicts, []);
});

runWithContext('test_trackLineStates_bashTruncateReplacesBeliefAndTrimsTail', function (ctx) {
  // Behavior: a 3-line file at T1 is truncated by `echo 'X' > t.py` at T2 —
  // belief becomes exactly that one line (old tail dropped silently), the
  // changed line 1 (a -> X) conflicts, and EOF/lastLine track the new extent.
  var result = f.trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\nc\n'), TS1),
    withTimestamp(h.makeBashCommandLine('b1', "echo 'X' > t.py"), TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.isBeacon, false);
  assert.strictEqual(entry.summary.lastLine, 1);
  assert.strictEqual(entry.summary.eofConfirmed, true);
  assert.strictEqual(entry.summary.knownLines, 1);
  assert.strictEqual(entry.lines['1'].state, 'observed');
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].line, 1);
  assert.deepStrictEqual(result.conflicts[0].excerpt, { presumedText: 'a', observedText: 'X' });
});

runWithContext('test_trackLineStates_bashTruncateRecoversZeroContentEventFile', function (ctx) {
  // The headline payoff (launch.json class): a file with NO content events,
  // created only by `echo '...' > t.py`, gains belief from the redirect alone —
  // a clean final verdict against the on-disk content.
  var result = f.trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeBashCommandLine('b1', "echo 'only line' > t.py"), TS1)
  ], null, { via: 'final', content: 'only line\n' });
  var entry = result.timeline[String(f.MS1)];
  assert.strictEqual(entry.summary.lastLine, 1);
  assert.strictEqual(entry.summary.knownLines, 1);
  assert.strictEqual(result.finalVerdict.perLineStats.matchedObserved, 1);
  assert.strictEqual(result.finalVerdict.perLineStats.mismatched, 0);
});

runWithContext('test_trackLineStates_bashAppendExtendsExtentWithoutDisplacingPriorLines', function (ctx) {
  // Behavior: a 2-line file at T1; `echo 'c' >> t.py` at T2 appends one line at
  // the END (apply-time offset = current extent). Prior lines aren't displaced
  // (no conflicts); the new line 3 is observed; extent grows to 3, EOF known.
  var result = f.trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb\n'), TS1),
    withTimestamp(h.makeBashCommandLine('b1', "echo 'c' >> t.py"), TS2)
  ]);
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.isBeacon, false);
  assert.strictEqual(entry.summary.lastLine, 3);
  assert.strictEqual(entry.summary.eofConfirmed, true);
  assert.strictEqual(entry.summary.knownLines, 3);
  assert.strictEqual(entry.lines['3'].state, 'observed');
  assert.strictEqual(entry.lines['3'].confirmedAtMs, MS2);
  assert.deepStrictEqual(result.conflicts, []);
});

runWithContext('test_trackLineStates_bashAppendToEmptyBeliefActsAsTruncateFromLineOne', function (ctx) {
  // Behavior: with no prior belief (offset 0), `>>` degrades gracefully to
  // writing from line 1.
  var result = f.trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeBashCommandLine('b1', "echo 'first' >> t.py"), TS1)
  ], null, { via: 'final', content: 'first\n' });
  var entry = result.timeline[String(f.MS1)];
  assert.strictEqual(entry.summary.lastLine, 1);
  assert.strictEqual(entry.lines['1'].state, 'observed');
  assert.strictEqual(result.finalVerdict.perLineStats.matchedObserved, 1);
});

h.summary();
