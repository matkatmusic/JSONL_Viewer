// Tests for tools/probe-projects-v2.js — Phase E two-list classification.
// list1 filesInProject: on disk AND inside a probed project root.
// list2 filesNotInProject: deleted OR outside every project root.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

var v2 = require('../tools/probe-projects-v2');
var report = require('../tools/probe-v2-report');

// ─── isInProject ─────────────────────────────────────────────────────────────

run('test_isInProject_trueForFileUnderARoot', function () {
  // Behavior: a file under a project root (with a / boundary) is in-project.
  assert.strictEqual(report.isInProject('/repo/src/f.js', ['/other', '/repo']), true);
});

run('test_isInProject_falseForFileOutsideEveryRoot', function () {
  assert.strictEqual(report.isInProject('/elsewhere/f.js', ['/repo']), false);
});

run('test_isInProject_requiresPathBoundaryNotBareSubstring', function () {
  // Behavior: /repo-extra is NOT inside /repo — the match requires root + '/',
  // not a bare prefix.
  assert.strictEqual(report.isInProject('/repo-extra/f.js', ['/repo']), false);
});

run('test_isInProject_falseForEmptyPath', function () {
  // Behavior: a deleted file (lastSeenFullPath "") is never in-project.
  assert.strictEqual(report.isInProject('', ['/repo']), false);
});

// ─── groupRecordsIntoLists ───────────────────────────────────────────────────

run('test_groupRecordsIntoLists_onDiskInsideRootGoesToList1', function () {
  // Behavior: a record whose current on-disk path is under a project root
  // lands in filesInProject.
  var records = [{ identityKey: '/repo/f.js', lastSeenFullPath: '/repo/f.js', status: 'PASS' }];
  var lists = report.groupRecordsIntoLists(records, ['/repo']);
  assert.strictEqual(lists.filesInProject.length, 1);
  assert.strictEqual(lists.filesNotInProject.length, 0);
});

run('test_groupRecordsIntoLists_deletedFileGoesToList2', function () {
  // Behavior: lastSeenFullPath "" (no alias on disk) ⇒ filesNotInProject.
  var records = [{ identityKey: '/repo/gone.js', lastSeenFullPath: '', status: 'NOT_FOUND' }];
  var lists = report.groupRecordsIntoLists(records, ['/repo']);
  assert.strictEqual(lists.filesInProject.length, 0);
  assert.strictEqual(lists.filesNotInProject.length, 1);
});

run('test_groupRecordsIntoLists_onDiskOutsideRootsGoesToList2', function () {
  // Behavior: exists on disk but its full path is outside every project root
  // (e.g. ~/.claude/hooks) ⇒ filesNotInProject.
  var records = [{ identityKey: '/home/u/.claude/hook.sh', lastSeenFullPath: '/home/u/.claude/hook.sh', status: 'PASS' }];
  var lists = report.groupRecordsIntoLists(records, ['/repo']);
  assert.strictEqual(lists.filesInProject.length, 0);
  assert.strictEqual(lists.filesNotInProject.length, 1);
});

// ─── summarizeList ───────────────────────────────────────────────────────────

run('test_summarizeList_countsStatusesAndActionablePassRate', function () {
  // Behavior: a per-list summary carries the record count, per-status counts,
  // and the actionable pass rate (PASS / (PASS+MISMATCH+NOT_FOUND)).
  var records = [{ status: 'PASS' }, { status: 'PASS' }, { status: 'MISMATCH' }, { status: 'NOT_FOUND' }];
  var summary = v2.summarizeList(records);
  assert.strictEqual(summary.count, 4);
  assert.strictEqual(summary.PASS, 2);
  assert.strictEqual(summary.MISMATCH, 1);
  assert.strictEqual(summary.NOT_FOUND, 1);
  assert.strictEqual(summary.actionablePassRate, 50.0);
});

h.summary();
