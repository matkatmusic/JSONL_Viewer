// Tests for tools/spike-item6-context-mode-yield: the two PURE helpers of the read-only
// Item-6 re-run gate. resolveContentDbPath maps a session cwd to its content DB path
// (~/.claude/context-mode/content/<sha256(cwd)[:16]>.db); isWholeFileSource is true only for
// a file-backed source (file_path set by ctx_index), false for a prose batch: source. The
// DB-walk is integration-verified by running the spike against the frozen fixture (expected
// UNIQUE_TARGET_COVERAGE: 0), so it has no unit test here.

var assert = require('assert');
var path = require('path');
var os = require('os');
var h = require('./test-helpers');
var run = h.run;
var spike = require('../tools/spike-item6-context-mode-yield');

run('test_resolveContentDbPath_maps_cwd_to_sha256_prefixed_content_db', function () {
  // Behavior: a session cwd resolves to ~/.claude/context-mode/content/<sha256(cwd)[:16]>.db.
  // Step: the known jot cwd whose sha256 hex prefix is b55ec227de3101d0.
  var cwd = '/Users/matkatmusicllc/Programming/jot';
  var expected = path.join(os.homedir(), '.claude', 'context-mode', 'content', 'b55ec227de3101d0.db');
  assert.strictEqual(spike.resolveContentDbPath(cwd), expected);
});

run('test_isWholeFileSource_true_when_file_path_set', function () {
  // Behavior: a file-backed source (file_path set by ctx_index) IS a whole-file candidate.
  // Step: a source carrying an absolute file_path.
  var source = { file_path: '/Users/matkatmusicllc/Programming/jot/a.py', content_hash: 'abc' };
  assert.strictEqual(spike.isWholeFileSource(source), true);
});

run('test_isWholeFileSource_false_for_prose_batch_source', function () {
  // Behavior: a batch:-labelled source (ctx_batch_execute/ctx_execute output) has file_path
  // NULL and is NOT a whole-file candidate.
  // Step: a prose batch source with no file_path.
  var source = { label: 'batch: inspect probe schema and hashes', file_path: null };
  assert.strictEqual(spike.isWholeFileSource(source), false);
});

run('test_isWholeFileSource_false_when_file_path_absent', function () {
  // Behavior: a source object with no file_path key at all is not whole-file.
  // Step: an empty source object.
  assert.strictEqual(spike.isWholeFileSource({}), false);
});

h.summary();
