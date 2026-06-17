// Tests for api/file-historical-lineage.js — bash-read DISCOVERY touches
// (collectBashReadTouches, wired into collectTouches). A transcript that ONLY
// bash-reads a file (head/wc/grep -n) must still discover it. Split from
// tests/test-file-historical-lineage.js at the 250-line write cap.

var assert = require('assert');
var h = require('./test-helpers');
var f = require('./track-line-states-fixtures');
var run = h.run;
var lineage = require('../api/file-historical-lineage');

run('test_collectTouches_recordsResolvedBashreadTouchForHeadOnlyRelativeRead', function () {
  // Behavior: a session that ONLY `head`-reads a relative file still discovers it — one coarse
  // 'bashread' touch at the path RESOLVED against the session cwd, anchored at the RESULT record
  // (so the touch carries that record's timestamp). The raw relative path never appears.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/abs/proj'),
    h.makeBashCommandLine('u1', 'head -n 5 sub/f.py'),
    f.withTimestamp(h.makeBashCatToolResult('u1', 'a\nb\n'), f.TS1)
  ].join('\n');
  var all = lineage.collectTouches(jsonl).touches;
  var touches = all.filter(function (t) { return t.path === '/abs/proj/sub/f.py'; });
  assert.strictEqual(touches.length, 1);
  assert.strictEqual(touches[0].kind, 'bashread');
  assert.strictEqual(touches[0].line, 2);          // anchored at the RESULT record (index 2)
  assert.strictEqual(touches[0].timestamp, f.TS1); // proves the result-index anchor
  assert.ok(!all.some(function (t) { return t.path === 'sub/f.py'; }));
});

run('test_collectTouches_recordsBashreadTouchForWcExtentRead', function () {
  // Behavior: `wc -l` (a bashExtent read) likewise yields one resolved 'bashread' touch.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/abs/proj'),
    h.makeBashCommandLine('u1', 'wc -l sub/f.py'),
    f.withTimestamp(h.makeBashCatToolResult('u1', '     207 sub/f.py'), f.TS1)
  ].join('\n');
  var touches = lineage.collectTouches(jsonl).touches.filter(function (t) { return t.kind === 'bashread'; });
  assert.strictEqual(touches.length, 1);
  assert.strictEqual(touches[0].path, '/abs/proj/sub/f.py');
});

run('test_collectTouches_recordsBashreadTouchForSingleFileGrep', function () {
  // Behavior: a single-file `grep -n` (bashGrep — the path is in the COMMAND) yields a 'bashread'
  // touch, distinct from a native-Grep 'grep' touch (whose path comes from the result rows).
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/abs/proj'),
    h.makeBashCommandLine('u1', 'grep -n foo sub/f.py'),
    f.withTimestamp(h.makeBashCatToolResult('u1', '3:foo here'), f.TS1)
  ].join('\n');
  var touches = lineage.collectTouches(jsonl).touches.filter(function (t) { return t.kind === 'bashread'; });
  assert.strictEqual(touches.length, 1);
  assert.strictEqual(touches[0].path, '/abs/proj/sub/f.py');
});

run('test_collectTouches_recordsNoBashreadTouchForUnflaggedHead', function () {
  // Behavior (negative control): `head -5` (shorthand, no -n) is NOT a recognized partial read
  // (parseBashReadCommand returns null), so it produces ZERO 'bashread' touches.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/abs/proj'),
    h.makeBashCommandLine('u1', 'head -5 sub/f.py'),
    f.withTimestamp(h.makeBashCatToolResult('u1', 'a\nb\n'), f.TS1)
  ].join('\n');
  var touches = lineage.collectTouches(jsonl).touches.filter(function (t) { return t.kind === 'bashread'; });
  assert.strictEqual(touches.length, 0);
});

h.summary();
