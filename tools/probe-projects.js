#!/usr/bin/env node
// Diagnostic probe: run the replay engine against real-world JSONL files
// from jot-recovery and report pass/fail per file.
//
// Problem: the replay engine is tested against controlled scenarios, but we
// need to know how it performs on hundreds of real JSONL transcripts across
// multiple projects. This script scans project directories, replays every
// file edit found in each JSONL session, compares the result against the
// actual on-disk file (using full absolute paths from the edits), and
// produces per-project pass/fail reports plus a JSON summary.
//
// Usage: node probe-projects.js [--projects-dir <path>] [--skip-files <path>] [--engine old|unified] [--json]

var fs = require('fs');
var path = require('path');
var replay = require('../common/replay-edits');
var unified = require('../common/unified-reconstruct');
var gitState = require('../common/git-file-state');
var findLastSnapshotContent = require('../common/extract-file-state').findLastSnapshotContent;
var fph = require('../common/file-path-history');

var activeEngine = 'old';
// The file-history snapshot base dir for this run (resolved in runProbe from
// --snapshots / auto-derive). null → extract-file-state defaults to ~/.claude/file-history.
var snapshotBaseDir = null;

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

// Build a result for a file that cannot be tested (JSONL deleted, temp file, etc).
function buildNotTestable(jsonlFile, target, reason) {
  return {
    jsonlFile: jsonlFile, filename: target, totalEdits: 0,
    kept: 0, ignored: 0, match: false,
    status: 'NOT_TESTABLE', reason: reason
  };
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
    if (argv[i] === '--projects-dir' && i + 1 < argv.length) { opts.projectsDir = argv[++i]; }
    else if (argv[i] === '--skip-files' && i + 1 < argv.length) { opts.skipFilesPath = argv[++i]; }
    else if (argv[i] === '--snapshots' && i + 1 < argv.length) { opts.snapshots = argv[++i]; }
    else if (argv[i] === '--engine' && i + 1 < argv.length) { opts.engine = argv[++i]; }
    else if (argv[i] === '--json') { opts.jsonFlag = true; }
    else if (argv[i] === '--baseline') { opts.baseline = true; }
    else if (argv[i] === '--actionable-only') { opts.actionableOnly = true; }
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

// ─── Project discovery ─────────────────────────────────────────────────────

// Scan a projects directory for subdirectories containing JSONL files.
// Claude Code stores transcripts in folders named after the working directory
// (e.g., -Users-matkatmusicllc-Programming-jot/). Each folder is one "project"
// containing all JSONL sessions for that working directory.
function discoverProjects(projectsDir) {
  var entries = fs.readdirSync(projectsDir);
  var projects = [];
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(projectsDir, entries[i]);
    if (!fs.statSync(full).isDirectory()) { continue; }
    var jsonls = fs.readdirSync(full).filter(function(f) { return f.endsWith('.jsonl'); });
    if (jsonls.length > 0) { projects.push({ name: entries[i], dir: full, jsonlCount: jsonls.length }); }
  }
  return projects;
}

// Convert a Claude projects folder name back to the original filesystem path.
// Claude encodes paths by replacing / with - and prepending -, so
// "-Users-matkatmusicllc-Programming-jot" becomes "/Users/matkatmusicllc/Programming/jot".
function cwdFromFolderName(folderName) {
  return folderName.replace(/^-/, '/').replace(/-/g, '/');
}

// Find the git repository root for a given working directory.
// Used to resolve repo-relative paths and enable git-based fallback
// verification (comparing replayed content against git show <branch>:<path>).
// Returns null if the path is not inside a git repo.
function resolveRepoRoot(cwd) {
  try {
    var cp = require('child_process');
    var root = cp.execSync('git -C ' + JSON.stringify(cwd) + ' rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
    return root.trim();
  } catch (e) {
    return gitState.resolveRepoRootWalkingUp(cwd);
  }
}

// ─── Path resolution ──────────────────────────────────────────────────────

// Build a map from basename to repo-relative path for one session's edits.
// Needed for cross-comparison with jot-recovery's skip_files.json, which
// tracks files by repo-relative path (e.g., "skills/debate/scripts/debate.sh")
// rather than basename ("debate.sh"). First-seen path wins per basename.
function buildSessionRepoPathMap(edits, repoRoot) {
  var map = {};
  for (var i = 0; i < edits.length; i++) {
    if (!edits[i].file || !edits[i].filePath || map[edits[i].file]) { continue; }
    var rel = gitState.computeRepoRelativePath(edits[i].filePath, repoRoot);
    if (rel) { map[edits[i].file] = rel; }
  }
  return map;
}

// Build a map from basename to full absolute filesystem path from edits.
// This is the key fix for the probe: instead of assuming files live in the
// repo root (path.join(repoRoot, basename)), we use the actual absolute path
// recorded in each edit's filePath field. This correctly finds files in
// subdirectories (e.g., skills/debate/scripts/debate.sh) and even files
// outside the repo (e.g., ~/.claude/projects/.../memory/feedback.md).
// First-seen path wins per basename.
function buildFilePathIndex(edits) {
  var map = {};
  for (var i = 0; i < edits.length; i++) {
    if (edits[i].file && edits[i].filePath && !map[edits[i].file]) {
      map[edits[i].file] = edits[i].filePath;
    }
  }
  return map;
}

// Collect every distinct absolute path recorded for a basename in this session's
// edits — the seed set ("known file paths") handed to the path-history resolvers,
// which expand it across the file's rename/move/copy history.
function collectRecordedPaths(edits, targetBasename) {
  var seen = {};
  var paths = [];
  for (var i = 0; i < edits.length; i++) {
    if (edits[i].file !== targetBasename || !edits[i].filePath) { continue; }
    if (seen[edits[i].filePath]) { continue; }
    seen[edits[i].filePath] = true;
    paths.push(edits[i].filePath);
  }
  return paths;
}

// Collect the unique basenames of files that were created or edited in a session.
// These are the "target files" the probe will verify — each one gets replayed
// and compared against its on-disk state. Only includes create/edit operations
// (not read/cat/snapshot, which are observation sources, not file mutations).
function collectProbeTargets(edits) {
  var seen = {};
  for (var i = 0; i < edits.length; i++) {
    if (edits[i].file && (edits[i].type === 'create' || edits[i].type === 'edit')) {
      seen[edits[i].file] = true;
    }
  }
  var targets = Object.keys(seen);
  if (targets.length === 0 && edits.length > 0 && edits[0].file) { targets = [edits[0].file]; }
  return targets;
}

// ─── Engine dispatch ──────────────────────────────────────────────────────

function unifiedVerify(jsonlText, referenceContent, target) {
  var result = unified.reconstructFromJSONLTexts([{path: 'session.jsonl', text: jsonlText}], target);
  var match = result.content === referenceContent;
  var agents = result.patches.filter(function(p) { return p.type === 'AgentEdit'; });
  return {
    filename: target, totalEdits: result.patches.length,
    kept: agents.length, ignored: result.patches.length - agents.length,
    match: match, diff: match ? '' : 'content differs'
  };
}

function engineVerify(jsonlText, referenceContent, target) {
  if (activeEngine === 'unified') { return unifiedVerify(jsonlText, referenceContent, target); }
  return replay.replayAndVerify(jsonlText, referenceContent, target);
}

// ─── Verification with full paths ─────────────────────────────────────────

// Attempt to verify a file by comparing replayed content against the last
// file-history-snapshot recorded in the JSONL. Snapshots are periodic backups
// Claude Code takes of tracked files — they provide a fallback when the
// on-disk file has changed since the session (e.g., later sessions modified it).
// Returns a verification result or null if no snapshot exists for this file.
function trySnapshotVerify(jsonlText, jsonlFile, target) {
  var content = findLastSnapshotContent(jsonlText, target, snapshotBaseDir);
  if (content === null) { return null; }
  var r = engineVerify(jsonlText, content, target);
  r.jsonlFile = jsonlFile;
  r.note = 'compared against file-history snapshot';
  return r;
}

// Attempt to verify a file by comparing replayed content against its state
// in the git branch that was active during the session. This handles files
// that have since been modified or deleted — if the branch still exists,
// git show <branch>:<path> retrieves the version from that point in time.
// Returns a verification result or null if git resolution fails.
function tryGitVerify(jsonlText, jsonlFile, target, gitOpts) {
  if (!gitOpts) { return null; }
  var refs = gitState.buildMultiRefs(gitOpts.gitBranch);
  var content = gitState.resolveGitContentMultiRef(target, gitOpts.filePathMap, gitOpts.repoRoot, refs);
  if (content === null) { return null; }
  var r = engineVerify(jsonlText, content, target);
  r.jsonlFile = jsonlFile;
  r.note = 'compared against git (multi-ref)';
  return r;
}

// Extract the git branch and repo root from JSONL session metadata to
// enable git-based verification fallback. JSONL system records contain
// gitBranch and cwd fields (present on 148/150 jot project files).
// Returns null if insufficient metadata is available.
function buildProbeGitOpts(jsonlText, edits, repoRoot) {
  var meta = gitState.extractSessionMetadata(jsonlText);
  var branch = meta.gitBranch || null;
  if (!repoRoot || !branch) { return null; }
  return { repoRoot: repoRoot, gitBranch: branch, filePathMap: gitState.buildFilePathMap(edits) };
}

// Create a result object for a file that could not be found on disk,
// in any snapshot, or via git. These are typically files that were created
// during a session but later deleted — legitimate NOT_FOUND, not a
// reconstruction failure.
function buildNotFound(jsonlFile, target, editCount) {
  return {
    jsonlFile: jsonlFile, filename: target, totalEdits: editCount || 0,
    kept: 0, ignored: 0, match: false, note: 'file not found',
    diff: target + ' not found', error: 'file not found'
  };
}

// Verify a file that exists on disk at its full path.
// Replays edits and compares against on-disk content. If that mismatches,
// tries snapshot and git fallbacks — the on-disk file may be stale (modified
// by a later session or the user) while the snapshot or git version matches.
// Returns the best result found (preferring PASS over MISMATCH).
function verifyExistingFile(jsonlText, jsonlFile, target, fullPath, gitOpts, allTexts) {
  var onDisk = fs.readFileSync(fullPath, 'utf8');
  var r = engineVerify(jsonlText, onDisk, target);
  r.jsonlFile = jsonlFile;
  if (r.match) { return r; }
  if (allTexts) {
    var cum = tryCumulativeVerify(allTexts, jsonlFile, target, onDisk);
    if (cum && cum.match) { return cum; }
  }
  var snap = trySnapshotVerify(jsonlText, jsonlFile, target);
  if (snap && snap.match) { return snap; }
  var git = tryGitVerify(jsonlText, jsonlFile, target, gitOpts);
  if (git && git.match) { return git; }
  return r;
}

// Verify a file that does not exist on disk at its recorded path.
// Tries snapshot first (the file may have been deleted but a snapshot
// captured its state), then git (the branch may still have it).
// Falls through to NOT_FOUND if neither source has the file.
function verifyMissingFile(jsonlText, jsonlFile, target, gitOpts, editCount) {
  var snap = trySnapshotVerify(jsonlText, jsonlFile, target);
  if (snap) { return snap; }
  var git = tryGitVerify(jsonlText, jsonlFile, target, gitOpts);
  if (git) { return git; }
  return buildNotFound(jsonlFile, target, editCount);
}

// Top-level verification dispatcher for one target file.
// Implements the fallback chain: full-path on-disk → snapshot → git → not-found.
// Uses the actual absolute filePath from the edit (not path.join(repoRoot, basename))
// so files in subdirectories and outside the repo are correctly located.
function verifyTarget(jsonlText, jsonlFile, target, fullPath, gitOpts, editCount, allTexts) {
  // if (isTempFilePath(fullPath)) {
  //   return buildNotTestable(jsonlFile, target, 'temp file path');
  // }
  if (fullPath && fs.existsSync(fullPath)) {
    return verifyExistingFile(jsonlText, jsonlFile, target, fullPath, gitOpts, allTexts);
  }
  return verifyMissingFile(jsonlText, jsonlFile, target, gitOpts, editCount);
}

// ─── Per-project verification ──────────────────────────────────────────────

// Transform a raw verification result into a standardized probe result object.
// Adds status classification (PASS/MISMATCH/NOT_FOUND), the repo-relative path
// for skip_files comparison, and the comparison method used (on-disk/snapshot/git).
// `filename` (basename) is kept on this intermediate object because the text
// report (formatFailureLines) keys off it; buildFileRecord drops it from the
// emitted JSON. `earliestSeenFullPath`/`lastSeenFullPath` carry the file's
// first-known and current-on-disk paths (see verifyAllTargets).
function buildProbeResult(r, comparedVia, repoPath) {
  if (r.status === 'NOT_TESTABLE') {
    return {
      filename: r.filename,
      earliestSeenFullPath: r.earliestSeenFullPath || null,
      lastSeenFullPath: r.lastSeenFullPath || '',
      repoPath: repoPath || null, jsonlFile: r.jsonlFile,
      status: 'NOT_TESTABLE', totalEdits: 0, kept: 0, ignored: 0,
      reason: r.reason, comparedVia: 'none'
    };
  }
  return {
    filename: r.filename,
    earliestSeenFullPath: r.earliestSeenFullPath || null,
    lastSeenFullPath: r.lastSeenFullPath || '',
    repoPath: repoPath || null,
    jsonlFile: r.jsonlFile,
    status: r.match ? 'PASS' : (r.error === 'file not found' ? 'NOT_FOUND' : 'MISMATCH'),
    totalEdits: r.totalEdits,
    kept: r.kept,
    ignored: r.ignored,
    reason: r.note || (r.match ? 'replayed content matches' : 'content differs'),
    comparedVia: comparedVia || 'on-disk'
  };
}

// Determine which comparison source produced the result by inspecting the
// note field set during verification. Used for reporting which fallback
// level was needed to verify (or fail to verify) each file.
function classifyComparedVia(r) {
  if (r.note && r.note.indexOf('cumulative') >= 0) { return 'cumulative'; }
  if (r.note && r.note.indexOf('git') >= 0) { return 'git'; }
  if (r.note && r.note.indexOf('snapshot') >= 0) { return 'snapshot'; }
  if (r.note && r.note.indexOf('not found') >= 0) { return 'none'; }
  return 'on-disk';
}

// Verify every target file from a single JSONL session.
// Extracts the edit list, discovers which files were created/modified,
// resolves their full filesystem paths and repo-relative paths, then
// runs the verification fallback chain on each one. Returns an array
// of raw verification results with repoPath attached.
// pathHistoryIndex is the once-per-run index from file-path-history.js; it is
// optional so callers without it degrade safely (empty graph → no rename
// following). For each target, the emitted earliestSeenFullPath/lastSeenFullPath
// are resolved GLOBALLY across all transcripts and the file's rename history,
// independent of the per-session first-seen path the engine still verifies at.
function verifyAllTargets(jsonlText, jsonlFile, edits, repoRoot, allTexts, pathHistoryIndex) {
  var index = pathHistoryIndex || { samePathGraph: {}, touchesByPath: {} };
  var targets = collectProbeTargets(edits);
  var pathIndex = buildFilePathIndex(edits);
  targets = targets.filter(function(t) { return !isTempFilePath(pathIndex[t]); });
  var repoPathMap = repoRoot ? buildSessionRepoPathMap(edits, repoRoot) : {};
  var gitOpts = buildProbeGitOpts(jsonlText, edits, repoRoot);
  var results = [];
  for (var i = 0; i < targets.length; i++) {
    var fileEditCount = edits.filter(function(e) { return e.file === targets[i]; }).length;
    var knownFilePaths = collectRecordedPaths(edits, targets[i]);
    var earliestSeenFullPath = fph.findEarliestFilePath(knownFilePaths, index);
    var lastSeenFullPath = fph.findCurrentOnDiskPath(knownFilePaths, index);
    // Phase 1 (defect #1): verify against the file's CURRENT on-disk path (resolved by
    // following renames/moves), not the stale per-session first-seen path. Fall back to
    // the first-seen path when the file no longer exists on disk (lastSeenFullPath === "").
    var referencePath = lastSeenFullPath || pathIndex[targets[i]];
    var r = verifyTarget(jsonlText, jsonlFile, targets[i], referencePath, gitOpts, fileEditCount, allTexts);
    r.repoPath = repoPathMap[targets[i]] || null;
    r.earliestSeenFullPath = earliestSeenFullPath;
    r.lastSeenFullPath = lastSeenFullPath;
    results.push(r);
  }
  return results;
}

// Read and process a single JSONL file: parse it, extract all edit operations,
// and verify each target file. Returns empty array if the session has no edits
// (e.g., a conversation-only session with no file modifications).
function probeSingleJsonl(projDir, jsonlFile, repoRoot, allTexts, pathHistoryIndex) {
  var jsonlText = fs.readFileSync(path.join(projDir, jsonlFile), 'utf8');
  var edits = replay.extractEditsFromJSONL(jsonlText);
  if (edits.length === 0) { return []; }
  return verifyAllTargets(jsonlText, jsonlFile, edits, repoRoot, allTexts, pathHistoryIndex);
}

// Probe an entire project directory: iterate all JSONL sessions, verify
// every file each session touched, and collect standardized probe results.
// Resolves the git repo root once per project (not per session) since all
// sessions in a project folder share the same working directory.
// Load all JSONL texts for a project directory. Returns array of {file, text}.
function loadAllJsonlTexts(projDir, jsonlFiles) {
  var texts = [];
  for (var i = 0; i < jsonlFiles.length; i++) {
    texts.push({ file: jsonlFiles[i], text: fs.readFileSync(path.join(projDir, jsonlFiles[i]), 'utf8') });
  }
  return texts;
}

// Try cumulative replay across all sessions that touch targetFile.
function tryCumulativeVerify(allTexts, jsonlFile, target, onDiskContent) {
  var texts = allTexts.map(function(t) { return t.text; });
  var indices = replay.collectSessionsForFile(texts, target);
  if (indices.length < 2) { return null; }
  var sessionTexts = indices.map(function(idx) { return texts[idx]; });
  var r = replay.replayAndVerifyCumulative(sessionTexts, onDiskContent, target);
  r.jsonlFile = jsonlFile;
  r.note = 'compared via cumulative replay (' + indices.length + ' sessions)';
  return r;
}

function probeProject(project, pathHistoryIndex) {
  var repoRoot = resolveRepoRoot(cwdFromFolderName(project.name));
  var jsonlFiles = fs.readdirSync(project.dir).filter(function(f) { return f.endsWith('.jsonl'); });
  var allTexts = loadAllJsonlTexts(project.dir, jsonlFiles);
  var probeResults = [];
  for (var i = 0; i < jsonlFiles.length; i++) {
    var results = probeSingleJsonl(project.dir, jsonlFiles[i], repoRoot, allTexts, pathHistoryIndex);
    for (var j = 0; j < results.length; j++) {
      probeResults.push(buildProbeResult(results[j], classifyComparedVia(results[j]), results[j].repoPath));
    }
  }
  return probeResults;
}

// ─── skip_files.json comparison ────────────────────────────────────────────

// Load jot-recovery's skip_files.json and index it by repo-relative path.
// This file tracks 195 files with their pass/fail status under the Python
// reconstruction engine. Cross-comparing lets us find: files only the JS
// engine handles, files only the Python engine handles, and shared gaps.
function loadSkipFiles(skipFilesPath) {
  var data = JSON.parse(fs.readFileSync(skipFilesPath, 'utf8'));
  var map = {};
  for (var i = 0; i < data.length; i++) { map[data[i].path] = data[i]; }
  return map;
}

// Cross-compare JS probe results against the Python engine's skip_files.json.
// Matches by repo-relative path first (e.g., "skills/debate/scripts/debate.sh"),
// falling back to basename for files where repo-relative path couldn't be resolved.
// Counts four categories: both pass, JS-only pass, Python-only pass, both fail.
function compareWithSkipFiles(allResults, skipMap) {
  var counts = { jsPassPyPass: 0, jsPassPyFail: 0, jsFailPyPass: 0, jsFailPyFail: 0, jsOnly: 0 };
  for (var i = 0; i < allResults.length; i++) {
    var entry = skipMap[allResults[i].repoPath] || skipMap[allResults[i].filename];
    if (!entry) { counts.jsOnly++; continue; }
    var jsPass = allResults[i].status === 'PASS';
    if (jsPass && entry.currentlyPassing) { counts.jsPassPyPass++; }
    else if (jsPass && !entry.currentlyPassing) { counts.jsPassPyFail++; }
    else if (!jsPass && entry.currentlyPassing) { counts.jsFailPyPass++; }
    else { counts.jsFailPyFail++; }
  }
  return counts;
}

// ─── Report formatting ────────────────────────────────────────────────────

// Count probe results by status (PASS, MISMATCH, NOT_FOUND).
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

// Format the list of non-passing files for the text report.
// Shows each failure as "jsonlFile -> filename: STATUS" so the user
// can identify which session and file to investigate.
function formatFailureLines(results) {
  var fails = results.filter(function(r) { return r.status !== 'PASS' && r.status !== 'NOT_TESTABLE'; });
  var lines = [];
  if (fails.length === 0) { return lines; }
  lines.push('  Failures:');
  for (var i = 0; i < fails.length; i++) {
    lines.push('    ' + fails[i].jsonlFile + ' -> ' + fails[i].filename + ': ' + fails[i].status);
  }
  return lines;
}

// Format a human-readable text summary for one project, showing JSONL count,
// files tested, and the PASS/MISMATCH/NOT_FOUND breakdown with failure details.
function formatProjectSummary(project, results) {
  var counts = countByStatus(results);
  var actionableRate = computeActionablePassRate(counts);
  var lines = ['=== Project: ' + project.name + ' ==='];
  lines.push('  JSONL files: ' + project.jsonlCount);
  lines.push('  Files tested: ' + results.length);
  lines.push('  PASS: ' + (counts.PASS || 0) + '  MISMATCH: ' + (counts.MISMATCH || 0) + '  NOT_FOUND: ' + (counts.NOT_FOUND || 0) + '  NOT_TESTABLE: ' + (counts.NOT_TESTABLE || 0));
  lines.push('  Actionable pass rate: ' + actionableRate + '%');
  var failures = formatFailureLines(results);
  for (var i = 0; i < failures.length; i++) { lines.push(failures[i]); }
  lines.push('');
  return lines.join('\n');
}

// Format the cross-comparison between JS and Python engine results.
// The four quadrants show where the engines agree (both pass or both fail)
// and where they diverge (one passes where the other fails).
function formatSkipComparison(counts) {
  var lines = [];
  lines.push('  vs jot-recovery:');
  lines.push('    JS PASS / Python PASS: ' + counts.jsPassPyPass);
  lines.push('    JS PASS / Python FAIL: ' + counts.jsPassPyFail);
  lines.push('    JS FAIL / Python PASS: ' + counts.jsFailPyPass);
  lines.push('    JS FAIL / Python FAIL: ' + counts.jsFailPyFail);
  if (counts.jsOnly > 0) { lines.push('    JS only (not in skip_files): ' + counts.jsOnly); }
  return lines.join('\n');
}

// ─── Summary JSON ─────────────────────────────────────────────────────────

// Build a compact per-file record for the JSON report. The redundant `filename`
// basename is intentionally omitted — `earliestSeenFullPath` (the file's
// first-known absolute path) is the stable per-file identity key, and
// `lastSeenFullPath` is its current on-disk path ("" when deleted).
function buildFileRecord(r) {
  return {
    earliestSeenFullPath: r.earliestSeenFullPath || null,
    lastSeenFullPath: r.lastSeenFullPath || '',
    repoPath: r.repoPath, jsonlFile: r.jsonlFile,
    status: r.status, totalEdits: r.totalEdits, kept: r.kept,
    ignored: r.ignored, reason: r.reason, comparedVia: r.comparedVia
  };
}

// Build a per-project summary object for the JSON report.
// numFailing includes both MISMATCH and NOT_FOUND — any non-PASS result.
// percentageRate is the pass rate rounded to one decimal place.
// files array contains every per-file result for itemized inspection.
function buildProjectSummary(project, results) {
  var counts = countByStatus(results);
  var passing = counts.PASS || 0;
  var notTestable = counts.NOT_TESTABLE || 0;
  var tested = results.length;
  var files = [];
  for (var i = 0; i < results.length; i++) { files.push(buildFileRecord(results[i])); }
  return {
    project: project.name,
    jsonl: project.jsonlCount,
    tested: tested,
    numPassing: passing,
    numFailing: tested - passing - notTestable,
    numNotTestable: notTestable,
    percentageRate: tested > 0 ? Math.round(1000 * passing / tested) / 10 : 0,
    actionablePassRate: computeActionablePassRate(counts),
    files: files
  };
}

// Write the probe summary to probe-results.json in the RevEng directory.
// This file is overwritten on every probe run, providing a machine-readable
// snapshot of engine coverage. The timestamp lets you track improvement
// over time as the engine is enhanced.
function writeProbeJson(summaries) {
  var report = { timestamp: new Date().toISOString(), projects: summaries };
  var outPath = path.join(__dirname, 'probe-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log('Wrote ' + outPath);
}

// ─── Main ──────────────────────────────────────────────────────────────────

// Print the text report for one project, optionally followed by the
// cross-comparison with the Python engine's skip_files.json results.
function printProjectReport(project, results, skipMap) {
  console.log(formatProjectSummary(project, results));
  if (skipMap) { console.log(formatSkipComparison(compareWithSkipFiles(results, skipMap))); }
}

// Orchestrate the full probe: discover projects, verify each one, print
// text reports (or collect JSON output), write the summary JSON, and
// optionally cross-compare with the Python engine's results.
// Load the baseline and compare against current results. Exits non-zero on regression.
function checkBaseline(summaries) {
  var baselinePath = path.join(__dirname, 'probe-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    console.log('No baseline found at ' + baselinePath);
    return;
  }
  var baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  var basePass = 0;
  var curPass = 0;
  for (var i = 0; i < baseline.projects.length; i++) { basePass += baseline.projects[i].numPassing; }
  for (var j = 0; j < summaries.length; j++) { curPass += summaries[j].numPassing; }
  console.log('Baseline PASS: ' + basePass + '  Current PASS: ' + curPass);
  if (curPass < basePass) {
    console.error('REGRESSION: ' + (basePass - curPass) + ' fewer passing files');
    process.exit(1);
  }
  console.log('No regression detected.');
}

function runProbe(opts) {
  activeEngine = opts.engine || 'old';
  snapshotBaseDir = resolveSnapshotDir(opts);
  var projects = discoverProjects(opts.projectsDir);
  // Build the file-path-history index ONCE over all transcripts; reused for every
  // file's earliestSeenFullPath/lastSeenFullPath across every project.
  var pathHistoryIndex = fph.buildFilePathHistoryIndex(opts.projectsDir);
  var allResults = [];
  var summaries = [];
  var skipMap = opts.skipFilesPath ? loadSkipFiles(opts.skipFilesPath) : null;
  for (var i = 0; i < projects.length; i++) {
    var results = probeProject(projects[i], pathHistoryIndex);
    if (opts.actionableOnly) {
      results = results.filter(function(r) { return r.status !== 'NOT_TESTABLE'; });
    }
    summaries.push(buildProjectSummary(projects[i], results));
    if (opts.jsonFlag) { allResults = allResults.concat(results); }
    else { printProjectReport(projects[i], results, skipMap); }
  }
  writeProbeJson(summaries);
  if (opts.jsonFlag) { console.log(JSON.stringify(allResults, null, 2)); }
  if (opts.baseline) { checkBaseline(summaries); }
}

function main() {
  var opts = parseProbeArgs(process.argv.slice(2));
  if (!opts.projectsDir) {
    console.error('Usage: node probe-projects.js --projects-dir <path> [--snapshots <path>] [--engine old|unified] [--baseline] [--actionable-only] [--skip-files <path>] [--json]');
    process.exit(1);
  }
  runProbe(opts);
}

// Exports are assigned BEFORE the require.main guard so that when this file is
// the CLI entry point, main()'s lazy self-require (via collect-touches'
// enumerateJsonlFiles → discoverProjects) sees a fully-populated exports object.
module.exports = {
  probeProject: probeProject,
  discoverProjects: discoverProjects,
  cwdFromFolderName: cwdFromFolderName,
  parseProbeArgs: parseProbeArgs,
  resolveSnapshotDir: resolveSnapshotDir,
  isTempFilePath: isTempFilePath,
  buildNotTestable: buildNotTestable,
  buildProbeResult: buildProbeResult,
  buildFileRecord: buildFileRecord,
  computeActionablePassRate: computeActionablePassRate,
  countByStatus: countByStatus
};

if (require.main === module) { main(); }
