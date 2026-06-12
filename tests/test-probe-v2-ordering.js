// Tests for tools/probe-projects-v2.js — Phase C transcript ordering.
// Transcripts feeding a file's replay are ordered by the file's earliest touch
// TIMESTAMP per transcript (not by input/filename order), tie-broken by line.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

var v2 = require('../tools/probe-projects-v2');

run('test_orderTranscriptsByFirstTouch_earlierTimestampSortsFirstDespiteFilename', function () {
  // Behavior: a transcript whose filename sorts LATER but whose first touch of
  // the file is EARLIER comes first — timestamp beats filename order.
  var allJsonlFiles = [
    { file: '/t/a.jsonl', touches: [{ kind: 'write', path: '/repo/f.js', line: 5, timestamp: '2026-02-01T00:00:00.000Z' }], ops: [] },
    { file: '/t/z.jsonl', touches: [{ kind: 'write', path: '/repo/f.js', line: 9, timestamp: '2026-01-01T00:00:00.000Z' }], ops: [] }
  ];
  var ordered = v2.orderTranscriptsByFirstTouch(['/t/a.jsonl', '/t/z.jsonl'], allJsonlFiles, new Set(['/repo/f.js']));
  assert.deepStrictEqual(
    ordered.map(function (o) { return o.transcriptPath; }),
    ['/t/z.jsonl', '/t/a.jsonl']
  );
  // Step: each entry carries the earliest touch timestamp used for the sort.
  assert.strictEqual(ordered[0].earliestTimestamp, '2026-01-01T00:00:00.000Z');
});

run('test_orderTranscriptsByFirstTouch_missingTimestampTieBreaksByLine', function () {
  // Behavior: when neither transcript has touch timestamps, the one whose first
  // matching touch has the LOWER line number sorts first.
  var allJsonlFiles = [
    { file: '/t/a.jsonl', touches: [{ kind: 'write', path: '/repo/f.js', line: 3, timestamp: null }], ops: [] },
    { file: '/t/b.jsonl', touches: [{ kind: 'write', path: '/repo/f.js', line: 1, timestamp: null }], ops: [] }
  ];
  var ordered = v2.orderTranscriptsByFirstTouch(['/t/a.jsonl', '/t/b.jsonl'], allJsonlFiles, new Set(['/repo/f.js']));
  assert.deepStrictEqual(
    ordered.map(function (o) { return o.transcriptPath; }),
    ['/t/b.jsonl', '/t/a.jsonl']
  );
});

run('test_orderTranscriptsByFirstTouch_usesOnlyTouchesOfTheFileItself', function () {
  // Behavior: the sort key is the earliest touch OF THIS FILE (alias set), not
  // the transcript's earliest touch of anything.
  var allJsonlFiles = [
    { file: '/t/a.jsonl', touches: [
      { kind: 'write', path: '/repo/other.js', line: 0, timestamp: '2025-12-01T00:00:00.000Z' },
      { kind: 'write', path: '/repo/f.js', line: 8, timestamp: '2026-03-01T00:00:00.000Z' }
    ], ops: [] },
    { file: '/t/b.jsonl', touches: [{ kind: 'write', path: '/repo/f.js', line: 2, timestamp: '2026-01-15T00:00:00.000Z' }], ops: [] }
  ];
  var ordered = v2.orderTranscriptsByFirstTouch(['/t/a.jsonl', '/t/b.jsonl'], allJsonlFiles, new Set(['/repo/f.js']));
  assert.deepStrictEqual(
    ordered.map(function (o) { return o.transcriptPath; }),
    ['/t/b.jsonl', '/t/a.jsonl']
  );
});

h.summary();
