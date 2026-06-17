// Tests for probe-projects.js result builders.
// Focus: the per-file record carries the two path-history fields —
//   earliestSeenFullPath (the file's first-known absolute path) and
//   lastSeenFullPath (its current on-disk path, "" if deleted) —
// through buildProbeResult and into the emitted JSON record (buildFileRecord),
// and the redundant `filename` field is dropped from the JSON output.

var assert = require('assert');
var h = require('./test-helpers');
var probe = require('../tools/probe-projects');

// ─── buildProbeResult ───────────────────────────────────────────────────────

h.run('it carries both path fields through buildProbeResult when set', function () {
  // 1. A raw verification result carrying the file's earliest + current paths.
  var raw = {
    filename: 'f.js', earliestSeenFullPath: '/abs/old/f.js', lastSeenFullPath: '/abs/new/f.js',
    jsonlFile: 'x.jsonl', match: true, totalEdits: 3, kept: 3, ignored: 0, note: null
  };
  // 2. Convert it to a probe result.
  var out = probe.buildProbeResult(raw, 'on-disk', 'dir/f.js');
  // 3. Both path fields are preserved verbatim.
  assert.strictEqual(out.earliestSeenFullPath, '/abs/old/f.js');
  assert.strictEqual(out.lastSeenFullPath, '/abs/new/f.js');
  assert.strictEqual(out.status, 'PASS');
});

h.run('it emits empty lastSeenFullPath through buildProbeResult for a deleted file', function () {
  // 1. A raw result for a file whose current on-disk path is gone (deleted).
  var raw = {
    filename: 'f.js', earliestSeenFullPath: '/abs/old/f.js', lastSeenFullPath: '',
    jsonlFile: 'x.jsonl', match: false, error: 'file not found',
    totalEdits: 1, kept: 0, ignored: 0, note: 'file not found'
  };
  // 2. Convert it to a probe result.
  var out = probe.buildProbeResult(raw, 'none', null);
  // 3. lastSeenFullPath is the empty string (deleted), and present (not missing).
  assert.strictEqual(out.lastSeenFullPath, '');
  assert.ok('lastSeenFullPath' in out);
  assert.strictEqual(out.status, 'NOT_FOUND');
});

h.run('it carries both path fields through the NOT_TESTABLE branch of buildProbeResult', function () {
  // 1. A NOT_TESTABLE raw result still has recorded paths.
  var raw = {
    filename: 'tmp.js', earliestSeenFullPath: '/tmp/tmp.js', lastSeenFullPath: '/tmp/tmp.js',
    jsonlFile: 'x.jsonl', status: 'NOT_TESTABLE', reason: 'temp file path'
  };
  // 2. Convert it.
  var out = probe.buildProbeResult(raw, 'none', null);
  // 3. Both path fields are preserved on the NOT_TESTABLE record too.
  assert.strictEqual(out.earliestSeenFullPath, '/tmp/tmp.js');
  assert.strictEqual(out.lastSeenFullPath, '/tmp/tmp.js');
  assert.strictEqual(out.status, 'NOT_TESTABLE');
});

// ─── buildFileRecord ────────────────────────────────────────────────────────

h.run('it carries both path fields into the file record and omits filename', function () {
  // 1. A finished probe result carrying earliest + current absolute paths.
  var r = {
    filename: 'f.js', earliestSeenFullPath: '/abs/old/f.js', lastSeenFullPath: '/abs/new/f.js',
    repoPath: 'dir/f.js', jsonlFile: 'x.jsonl', status: 'PASS', totalEdits: 3, kept: 3, ignored: 0,
    reason: 'replayed content matches', comparedVia: 'on-disk'
  };
  // 2. Reduce it to the compact JSON record.
  var rec = probe.buildFileRecord(r);
  // 3. The record exposes both absolute paths for downstream tooling.
  assert.strictEqual(rec.earliestSeenFullPath, '/abs/old/f.js');
  assert.strictEqual(rec.lastSeenFullPath, '/abs/new/f.js');
  // 4. The redundant basename `filename` is NOT emitted in the JSON record.
  assert.ok(!('filename' in rec));
});

h.run('it emits empty lastSeenFullPath in the file record for a deleted file, still no filename', function () {
  // 1. A finished probe result for a deleted file (no current on-disk path).
  var r = {
    filename: 'f.js', earliestSeenFullPath: '/abs/old/f.js', lastSeenFullPath: '',
    repoPath: null, jsonlFile: 'x.jsonl', status: 'NOT_FOUND', totalEdits: 1, kept: 0, ignored: 0,
    reason: 'file not found', comparedVia: 'none'
  };
  // 2. Reduce it to the compact JSON record.
  var rec = probe.buildFileRecord(r);
  // 3. lastSeenFullPath is "" and present; earliestSeenFullPath survives.
  assert.strictEqual(rec.lastSeenFullPath, '');
  assert.ok('lastSeenFullPath' in rec);
  assert.strictEqual(rec.earliestSeenFullPath, '/abs/old/f.js');
  // 4. Still no `filename` in the JSON record.
  assert.ok(!('filename' in rec));
});

h.summary();
