// Shared helpers for the probe-v2 orchestration (probe-projects-v2.js):
// CLI-arg parsing, snapshot-dir resolution, temp-path detection, and the
// status/pass-rate summary math. Moved verbatim from tools/probe-projects.js
// (v1) in Phase 8 so v1 could be archived; probe-projects-v2.js and its tests
// import them from here. These are probe-specific, single-consumer, and
// CLI-bound (parseProbeArgs reads argv), so they stay in tools/ — base api/
// takes no argv (layer rule).

var fs = require('fs');
var path = require('path');

// ─── Temp file detection ──────────────────────────────────────────────────

var TEMP_PREFIXES = ['/var/folders/', '/private/var/folders/', '/tmp/', '/private/tmp/'];

// Return true if filePath is inside a temporary directory.
// These files only exist during the session and are inherently unrecoverable.
function isTempFilePath(filePath) {
  if (!filePath) { return false; }
  for (var i = 0; i < TEMP_PREFIXES.length; i++) {
    if (filePath.indexOf(TEMP_PREFIXES[i]) === 0) { return true; }
  }
  return false;
}

// Compute the pass rate excluding NOT_TESTABLE results.
function computeActionablePassRate(counts) {
  var actionable = (counts.PASS || 0) + (counts.MISMATCH || 0) + (counts.NOT_FOUND || 0);
  if (actionable === 0) { return 0; }
  return Math.round(1000 * counts.PASS / actionable) / 10;
}

// ─── CLI parsing ───────────────────────────────────────────────────────────

// Parse command-line arguments into an options object.
// Supports --projects-dir (required), --skip-files (optional cross-comparison
// with jot-recovery's Python engine), and --json (per-file detail output).
function parseProbeArgs(argv) {
  var opts = { projectsDir: '', skipFilesPath: '', snapshots: '', jsonFlag: false, engine: 'old', baseline: false, actionableOnly: false };
  for (var i = 0; i < argv.length; i++) {
    var flag = argv[i];
    var hasValue = i + 1 < argv.length;
    if (flag === '--projects-dir') {
      if (hasValue) { opts.projectsDir = argv[++i]; }
    } else if (flag === '--skip-files') {
      if (hasValue) { opts.skipFilesPath = argv[++i]; }
    } else if (flag === '--snapshots') {
      if (hasValue) { opts.snapshots = argv[++i]; }
    } else if (flag === '--engine') {
      if (hasValue) { opts.engine = argv[++i]; }
    } else if (flag === '--json') {
      opts.jsonFlag = true;
    } else if (flag === '--baseline') {
      opts.baseline = true;
    } else if (flag === '--actionable-only') {
      opts.actionableOnly = true;
    }
  }
  return opts;
}

// Resolve the file-history snapshot base dir for a run. Explicit --snapshots wins;
// otherwise auto-derive <projectsDir>/../file-history and use it IF it exists; else
// null (the snapshot reader then defaults to ~/.claude/file-history). The recovered
// jot-recovery set keeps its snapshots one level up from its projects dir, so the
// auto-derive finds them with no flag.
function resolveSnapshotDir(opts) {
  if (opts.snapshots) { return opts.snapshots; }
  var sibling = path.join(opts.projectsDir, '..', 'file-history');
  if (fs.existsSync(sibling)) { return sibling; }
  return null;
}

// ─── Status counting ─────────────────────────────────────────────────────
// NOT_FOUND is distinct from MISMATCH: it means the file was deleted from
// disk after the session, not that reconstruction failed.
function countByStatus(results) {
  var c = { PASS: 0, MISMATCH: 0, NOT_FOUND: 0, NOT_TESTABLE: 0 };
  for (var i = 0; i < results.length; i++) {
    var s = results[i].status;
    c[s] = (c[s] || 0) + 1;
  }
  return c;
}

module.exports = {
  isTempFilePath: isTempFilePath,
  computeActionablePassRate: computeActionablePassRate,
  parseProbeArgs: parseProbeArgs,
  resolveSnapshotDir: resolveSnapshotDir,
  countByStatus: countByStatus
};
