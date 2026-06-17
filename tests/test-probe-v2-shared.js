// Tests for the probe-v2 shared helpers (tools/probe-v2-shared.js): temp file
// detection, status counting, actionable pass rate, CLI arg parsing, and
// snapshot-dir resolution. Moved from test-probe-helpers.js in Phase 8 when the
// 5 shared helpers left probe-projects.js (v1) for their own tools/ home; the
// buildNotTestable test retired with v1.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var summary = h.summary;

var shared = require('../tools/probe-v2-shared');

// ─── isTempFilePath ───────────────────────────────────────────────────────

run('test_isTempFilePath_detectsVarFolders', function() {
  // Scenario: a file path in /var/folders/ is a temp file
  var result = shared.isTempFilePath('/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/foo.py');
  assert.strictEqual(result, true);
});

run('test_isTempFilePath_detectsPrivateVarFolders', function() {
  // Scenario: macOS resolves /var to /private/var
  var result = shared.isTempFilePath('/private/var/folders/fy/abc123/T/bar.txt');
  assert.strictEqual(result, true);
});

run('test_isTempFilePath_detectsTmp', function() {
  // Scenario: a file path in /tmp/ is a temp file
  var result = shared.isTempFilePath('/tmp/scratch.py');
  assert.strictEqual(result, true);
});

run('test_isTempFilePath_detectsPrivateTmp', function() {
  // Scenario: macOS resolves /tmp to /private/tmp
  var result = shared.isTempFilePath('/private/tmp/plate-verify/output.txt');
  assert.strictEqual(result, true);
});

run('test_isTempFilePath_rejectsNormalPath', function() {
  // Scenario: a normal user file path is not temp
  var result = shared.isTempFilePath('/Users/matkatmusicllc/Programming/jot/src/main.py');
  assert.strictEqual(result, false);
});

run('test_isTempFilePath_rejectsNull', function() {
  // Scenario: null path is not temp
  var result = shared.isTempFilePath(null);
  assert.strictEqual(result, false);
});

run('test_isTempFilePath_rejectsEmpty', function() {
  // Scenario: empty string is not temp
  var result = shared.isTempFilePath('');
  assert.strictEqual(result, false);
});

// ─── countByStatus with NOT_TESTABLE ──────────────────────────────────────

run('test_countByStatus_includesNotTestable', function() {
  // Scenario: countByStatus handles the new NOT_TESTABLE status
  var results = [
    { status: 'PASS' },
    { status: 'PASS' },
    { status: 'MISMATCH' },
    { status: 'NOT_FOUND' },
    { status: 'NOT_TESTABLE' }
  ];
  var counts = shared.countByStatus(results);
  assert.strictEqual(counts.PASS, 2);
  assert.strictEqual(counts.MISMATCH, 1);
  assert.strictEqual(counts.NOT_FOUND, 1);
  assert.strictEqual(counts.NOT_TESTABLE, 1);
});

run('test_countByStatus_zeroNotTestableWhenNonePresent', function() {
  // Scenario: countByStatus still works when no NOT_TESTABLE results exist
  var results = [{ status: 'PASS' }, { status: 'MISMATCH' }];
  var counts = shared.countByStatus(results);
  assert.strictEqual(counts.NOT_TESTABLE, 0);
});

// ─── computeActionablePassRate ────────────────────────────────────────────

run('test_computeActionablePassRate_excludesNotTestable', function() {
  // Scenario: actionable rate only considers PASS, MISMATCH, NOT_FOUND
  // 2 PASS out of 4 actionable (2 PASS + 1 MISMATCH + 1 NOT_FOUND)
  // NOT_TESTABLE is excluded from both numerator and denominator
  var counts = { PASS: 2, MISMATCH: 1, NOT_FOUND: 1, NOT_TESTABLE: 5 };
  var rate = shared.computeActionablePassRate(counts);
  assert.strictEqual(rate, 50.0);
});

run('test_computeActionablePassRate_allPass', function() {
  // Scenario: 100% when all actionable results pass
  var counts = { PASS: 10, MISMATCH: 0, NOT_FOUND: 0, NOT_TESTABLE: 3 };
  var rate = shared.computeActionablePassRate(counts);
  assert.strictEqual(rate, 100);
});

run('test_computeActionablePassRate_noActionableResults', function() {
  // Scenario: 0 when everything is NOT_TESTABLE
  var counts = { PASS: 0, MISMATCH: 0, NOT_FOUND: 0, NOT_TESTABLE: 5 };
  var rate = shared.computeActionablePassRate(counts);
  assert.strictEqual(rate, 0);
});

// ─── --snapshots CLI flag + snapshot-dir resolution (#9a) ─────────────────────

run('test_parseProbeArgs_parsesSnapshotsFlag', function() {
  // Scenario: --snapshots <path> is captured into opts.snapshots.
  var opts = shared.parseProbeArgs(['--projects-dir', '/p', '--snapshots', '/snap/dir']);
  assert.strictEqual(opts.snapshots, '/snap/dir');
});

run('test_parseProbeArgs_snapshotsDefaultsEmpty', function() {
  // Scenario: with no --snapshots flag, opts.snapshots is the empty string.
  var opts = shared.parseProbeArgs(['--projects-dir', '/p']);
  assert.strictEqual(opts.snapshots, '');
});

run('test_resolveSnapshotDir_explicitFlagWins', function() {
  // Scenario: an explicit --snapshots value is used verbatim, no auto-derive.
  var dir = shared.resolveSnapshotDir({ projectsDir: '/whatever', snapshots: '/explicit/snap' });
  assert.strictEqual(dir, '/explicit/snap');
});

runWithContext('test_resolveSnapshotDir_autoDerivesSiblingFileHistoryWhenItExists', function(ctx) {
  // Scenario: no flag, but <projectsDir>/../file-history exists ⇒ auto-derive it.
  var fs = require('fs'), path = require('path');
  var base = ctx.tempDir('claude-data-');
  fs.mkdirSync(path.join(base, 'projects'));
  fs.mkdirSync(path.join(base, 'file-history'));
  var dir = shared.resolveSnapshotDir({ projectsDir: path.join(base, 'projects'), snapshots: '' });
  assert.strictEqual(dir, path.join(base, 'projects', '..', 'file-history'));
  assert.ok(fs.existsSync(dir));
});

runWithContext('test_resolveSnapshotDir_returnsNullWhenNoSiblingAndNoFlag', function(ctx) {
  // Scenario: no flag and no sibling file-history dir ⇒ null (engine default ~/.claude).
  var fs = require('fs'), path = require('path');
  var base = ctx.tempDir('claude-data-');
  fs.mkdirSync(path.join(base, 'projects'));
  var dir = shared.resolveSnapshotDir({ projectsDir: path.join(base, 'projects'), snapshots: '' });
  assert.strictEqual(dir, null);
});

summary();
