// Tests for cumulative multi-session replay.
// Verifies that edits from multiple JSONL sessions can be replayed
// in chronological order to reconstruct a file's final state.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var summary = h.summary;

var replay = require('../common/replay-edits');

console.log('\nreplayAndVerifyCumulative:');

run('test_replayAndVerifyCumulative_twoSessionsCreateThenEdit', function() {
  // Scenario: session 1 creates foo.py with "hello\n",
  // session 2 edits foo.py replacing "hello" with "goodbye".
  // Cumulative replay should produce "goodbye\n".
  var session1 = [
    h.makeSystemLine('sess-1', 'main', '/repo'),
    h.makeCreateLine('/repo/foo.py', 'hello\n')
  ].join('\n');
  var session2 = [
    h.makeSystemLine('sess-2', 'main', '/repo'),
    h.makeEditLine('/repo/foo.py', 'hello', 'goodbye')
  ].join('\n');
  var result = replay.replayAndVerifyCumulative([session1, session2], 'goodbye\n', 'foo.py');
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.replayedContent, 'goodbye\n');
});

run('test_replayAndVerifyCumulative_singleSessionSameAsNormal', function() {
  // Scenario: with one session, cumulative behaves identically to normal replay.
  var session = [
    h.makeSystemLine('sess-1', 'main', '/repo'),
    h.makeCreateLine('/repo/bar.py', 'content\n')
  ].join('\n');
  var result = replay.replayAndVerifyCumulative([session], 'content\n', 'bar.py');
  assert.strictEqual(result.match, true);
});

run('test_replayAndVerifyCumulative_threeSessionsChained', function() {
  // Scenario: session 1 creates, session 2 edits, session 3 edits again.
  // Final content should reflect all three.
  var s1 = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/f.py', 'aaa\n')
  ].join('\n');
  var s2 = [
    h.makeSystemLine('s2', 'main', '/repo'),
    h.makeEditLine('/repo/f.py', 'aaa', 'bbb')
  ].join('\n');
  var s3 = [
    h.makeSystemLine('s3', 'main', '/repo'),
    h.makeEditLine('/repo/f.py', 'bbb', 'ccc')
  ].join('\n');
  var result = replay.replayAndVerifyCumulative([s1, s2, s3], 'ccc\n', 'f.py');
  assert.strictEqual(result.match, true);
});

run('test_replayAndVerifyCumulative_mismatchReturnsCorrectDiff', function() {
  // Scenario: cumulative replay doesn't match on-disk content.
  var session = [
    h.makeSystemLine('sess-1', 'main', '/repo'),
    h.makeCreateLine('/repo/x.py', 'actual\n')
  ].join('\n');
  var result = replay.replayAndVerifyCumulative([session], 'expected\n', 'x.py');
  assert.strictEqual(result.match, false);
});

run('test_replayAndVerifyCumulative_emptySessionsArray', function() {
  // Scenario: no sessions produces empty content, mismatch.
  var result = replay.replayAndVerifyCumulative([], 'something', 'x.py');
  assert.strictEqual(result.match, false);
  assert.strictEqual(result.replayedContent, '');
});

run('test_replayAndVerifyCumulative_ignoresOtherFiles', function() {
  // Scenario: session touches multiple files, cumulative only replays target.
  var session = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/a.py', 'alpha\n'),
    h.makeCreateLine('/repo/b.py', 'beta\n')
  ].join('\n');
  var result = replay.replayAndVerifyCumulative([session], 'alpha\n', 'a.py');
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.replayedContent, 'alpha\n');
});

console.log('\ncollectSessionsForFile:');

run('test_collectSessionsForFile_findsMatchingSessions', function() {
  // Scenario: given multiple JSONL texts and a target, returns indices
  // of sessions that contain edits for that file.
  var s1 = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/foo.py', 'hello\n')
  ].join('\n');
  var s2 = [
    h.makeSystemLine('s2', 'main', '/repo'),
    h.makeCreateLine('/repo/bar.py', 'other\n')
  ].join('\n');
  var s3 = [
    h.makeSystemLine('s3', 'main', '/repo'),
    h.makeEditLine('/repo/foo.py', 'hello', 'goodbye')
  ].join('\n');
  var indices = replay.collectSessionsForFile([s1, s2, s3], 'foo.py');
  assert.deepStrictEqual(indices, [0, 2]);
});

run('test_collectSessionsForFile_returnsEmptyWhenNoMatch', function() {
  // Scenario: no sessions touch the target file.
  var s1 = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/other.py', 'x\n')
  ].join('\n');
  var indices = replay.collectSessionsForFile([s1], 'missing.py');
  assert.deepStrictEqual(indices, []);
});

summary();
