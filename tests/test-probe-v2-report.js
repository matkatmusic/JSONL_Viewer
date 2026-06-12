// Tests for tools/probe-v2-report.js — Phase F probe-mismatches-v2.json
// skeleton emitter (Phase E classification is covered in test-probe-v2-classify.js
// through the probe-projects-v2 re-exports).

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

var report = require('../tools/probe-v2-report');

function passingRecord() {
  return {
    earliestSeenFullPath: '/repo/ok.js', lastSeenFullPath: '/repo/ok.js',
    status: 'PASS', comparedVia: 'on-disk',
    transcriptsUsed: [{ jsonl: '/t/a.jsonl', kept: 1, ignored: 0, total: 1, earliestTimestamp: null }]
  };
}

function failingRecord() {
  return {
    earliestSeenFullPath: '/repo/old-name.js', lastSeenFullPath: '/repo/bad.js',
    status: 'MISMATCH', comparedVia: 'on-disk',
    transcriptsUsed: [
      { jsonl: '/t/a.jsonl', kept: 2, ignored: 1, total: 3, earliestTimestamp: null },
      { jsonl: '/t/b.jsonl', kept: 1, ignored: 0, total: 1, earliestTimestamp: null }
    ]
  };
}

run('test_buildMismatchesSkeleton_emitsOnlyFailingRecords', function () {
  // Behavior: PASS records are excluded; every non-PASS record gets one entry.
  var entries = report.buildMismatchesSkeleton([passingRecord(), failingRecord()]);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].status, 'MISMATCH');
});

run('test_buildMismatchesSkeleton_entryCarriesPathsTranscriptsAndEmptyFindings', function () {
  // Behavior: the skeleton keeps the existing mismatches shape — both path
  // fields, the contributing JSONL transcripts, and a findings stub left for
  // human root-cause authoring.
  var entries = report.buildMismatchesSkeleton([failingRecord()]);
  var entry = entries[0];
  assert.strictEqual(entry.earliestSeenFullPath, '/repo/old-name.js');
  assert.strictEqual(entry.lastSeenFullPath, '/repo/bad.js');
  assert.strictEqual(entry.findings, '');
  assert.deepStrictEqual(entry.relevantJSONLfileLines, ['/t/a.jsonl', '/t/b.jsonl']);
  assert.deepStrictEqual(entry.relevantPipelineSourceFiles, []);
});

function authoredEntryFor(freshEntry) {
  var authored = JSON.parse(JSON.stringify(freshEntry));
  authored.findings = 'root cause text';
  authored.relevantPipelineSourceFiles = ['tools/x.js'];
  return authored;
}

run('test_mergeExistingFindings_preservesAuthoredFindingsByPathKey', function () {
  // Behavior: regenerating the skeleton must not clobber hand-authored
  // findings — entries matching on both path fields carry them forward.
  var fresh = report.buildMismatchesSkeleton([failingRecord()]);
  var merged = report.mergeExistingFindings(fresh, [authoredEntryFor(fresh[0])]);
  assert.strictEqual(merged[0].findings, 'root cause text');
  assert.deepStrictEqual(merged[0].relevantPipelineSourceFiles, ['tools/x.js']);
});

run('test_mergeExistingFindings_newEntryKeepsEmptyFindings', function () {
  // Behavior: a newly-failing record with no existing entry stays a stub.
  var fresh = report.buildMismatchesSkeleton([failingRecord()]);
  var merged = report.mergeExistingFindings(fresh, []);
  assert.strictEqual(merged[0].findings, '');
});

run('test_mergeExistingFindings_droppedEntryDoesNotResurrect', function () {
  // Behavior: an entry whose record now PASSes (absent from the fresh
  // skeleton) is dropped — stale findings do not re-enter the output.
  var fresh = report.buildMismatchesSkeleton([failingRecord()]);
  var stale = authoredEntryFor(fresh[0]);
  stale.earliestSeenFullPath = '/repo/now-passing.js';
  stale.lastSeenFullPath = '/repo/now-passing.js';
  var merged = report.mergeExistingFindings(fresh, [stale]);
  assert.strictEqual(merged.length, fresh.length);
  assert.strictEqual(merged[0].findings, '');
});

run('test_mergeExistingFindings_freshFieldsWin', function () {
  // Behavior: only the hand-authored fields carry over; status, comparedVia,
  // and transcript provenance always come from the fresh probe run.
  var fresh = report.buildMismatchesSkeleton([failingRecord()]);
  var stale = authoredEntryFor(fresh[0]);
  stale.status = 'NOT_FOUND';
  stale.comparedVia = 'git';
  stale.relevantJSONLfileLines = ['/t/stale.jsonl'];
  var merged = report.mergeExistingFindings(fresh, [stale]);
  assert.strictEqual(merged[0].status, 'MISMATCH');
  assert.strictEqual(merged[0].comparedVia, 'on-disk');
  assert.deepStrictEqual(merged[0].relevantJSONLfileLines, ['/t/a.jsonl', '/t/b.jsonl']);
  assert.strictEqual(merged[0].findings, 'root cause text');
});

run('test_groupFilesByFolder_groupsByDirname', function () {
  // Behavior: loaded transcripts group by their containing project folder.
  var grouped = report.groupFilesByFolder([
    { file: '/projects/-repo/a.jsonl' },
    { file: '/projects/-repo/b.jsonl' },
    { file: '/projects/-other/c.jsonl' }
  ]);
  assert.deepStrictEqual(grouped, {
    '/projects/-repo': ['/projects/-repo/a.jsonl', '/projects/-repo/b.jsonl'],
    '/projects/-other': ['/projects/-other/c.jsonl']
  });
});

h.summary();
