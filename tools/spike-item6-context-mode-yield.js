#!/usr/bin/env node
// spike-item6-context-mode-yield: READ-ONLY re-run gate for roadmap Item 6 (context-mode store
// survey). Given --projects-dir <dir>, it resolves each transcript's session cwd to its content
// DB (~/.claude/context-mode/content/<sha256(cwd)[:16]>.db), walks any EXISTING DB read-only
// (sqlite3 "file:?mode=ro"), and prints a JSON verdict whose UNIQUE_TARGET_COVERAGE counts probe
// targets for which context-mode holds verbatim, whole-file-positionable content the transcript's
// own Read/cat/Write evidence lacks. It NEVER writes/indexes/purges the store nor mutates the
// projects folder. Kill threshold: UNIQUE_TARGET_COVERAGE === 0 -> NON-VIABLE; reopen only at
// >= 5 with >= 1 file-backed (ctx_index) source. See plans/implementation-notes-item6-context-mode-survey.md.

var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var cp = require('child_process');
var extractSessionMetadata = require('../api/transcript-parsers').extractSessionMetadata;
var lineage = require('../api/file-historical-lineage');
var resolveAgainstCwd = lineage.resolveAgainstCwd;
var collectTouches = lineage.collectTouches;

// sha256 hex digest of a string.
function sha256hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// The content DB path for a session cwd. The store keys each project by sha256(cwd) truncated
// to 16 hex chars under ~/.claude/context-mode/content/. (Pure — unit-tested.)
function resolveContentDbPath(cwd) {
  var hash = sha256hex(cwd).slice(0, 16);
  return path.join(os.homedir(), '.claude', 'context-mode', 'content', hash + '.db');
}

// True when a source row carries verbatim whole-file content. file_path is set ONLY by ctx_index
// (file-backed); a prose 'batch:' source (ctx_batch_execute/ctx_execute output) has file_path
// NULL and is not a whole-file candidate. (Pure — unit-tested.)
function isWholeFileSource(source) {
  if (!source) { return false; }
  if (!source.file_path) { return false; }
  return true;
}

// Every chunk joined to its source, read-only, via the sqlite3 CLI opened file:?mode=ro (plus
// -readonly). Returns row objects in rowid order, or [] when the DB can't be opened. The mode=ro
// URI forbids writes, so DB mtimes are untouched.
function readChunkRows(dbPath) {
  var uri = 'file:' + dbPath + '?mode=ro';
  var sql = 'SELECT chunks.content AS content, sources.label AS label, '
    + 'sources.file_path AS file_path, sources.content_hash AS content_hash, '
    + 'chunks.source_id AS source_id FROM chunks '
    + 'JOIN sources ON sources.id = chunks.source_id ORDER BY chunks.rowid;';
  try {
    var out = cp.execFileSync('sqlite3', ['-readonly', '-json', uri, sql], { encoding: 'utf8', maxBuffer: 268435456 });
    if (!out.trim()) { return []; }
    return JSON.parse(out);
  } catch (e) {
    return [];
  }
}

// Group chunk rows into one aggregate per source_id, concatenating chunk content in rowid order
// (the SELECT already orders by rowid).
function groupRowsBySource(rows) {
  var bySource = {};
  for (var i = 0; i < rows.length; i++) {
    var sid = rows[i].source_id;
    if (!bySource[sid]) { bySource[sid] = { parts: [], label: rows[i].label, file_path: rows[i].file_path, content_hash: rows[i].content_hash }; }
    bySource[sid].parts.push(rows[i].content || '');
  }
  return bySource;
}

// True when a source's chunks reassemble to its recorded content_hash. Reassembly is a naive
// rowid-order concat; overlap (duplicated heading/line-group lines) yields a mismatch which is
// conservatively REJECTED — the gate only needs to undercount toward 0. No hash -> false.
function isVerbatimWholeFile(agg) {
  if (!agg.content_hash) { return false; }
  return sha256hex(agg.parts.join('')) === agg.content_hash;
}

// True for a ctx_batch_execute/ctx_execute output source (label begins 'batch:').
function labelIsBatch(label) {
  if (!label) { return false; }
  return label.indexOf('batch:') === 0;
}

// Add every path a probed file has been seen under. probe-results-v2.json entries have NO flat
// `path` field (see implementation notes) — the path-bearing keys are earliestSeenFullPath,
// lastSeenFullPath and aliasPaths[].
function addTargetPaths(set, entry) {
  if (entry.earliestSeenFullPath) { set.add(entry.earliestSeenFullPath); }
  if (entry.lastSeenFullPath) { set.add(entry.lastSeenFullPath); }
  var aliases = entry.aliasPaths || [];
  for (var i = 0; i < aliases.length; i++) { set.add(aliases[i]); }
}

// The set of absolute probe target paths from probe-results-v2.json (read, never regenerated).
function loadTargets(probePath) {
  var probe = JSON.parse(fs.readFileSync(probePath, 'utf8'));
  var files = probe.filesInProject || [];
  var set = new Set();
  for (var i = 0; i < files.length; i++) { addTargetPaths(set, files[i]); }
  return set;
}

// All *.jsonl files under dir, recursively, appended to acc.
function listJsonlFiles(dir, acc) {
  var out = acc || [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dir, entries[i].name);
    if (entries[i].isDirectory()) { listJsonlFiles(full, out); continue; }
    if (entries[i].name.endsWith('.jsonl')) { out.push(full); }
  }
  return out;
}

// The set of absolute paths this transcript already evidences (Read/cat/Write/edit/grep), via
// collectTouches — context-mode only adds value for a target NOT already in this set.
function touchedPathsForText(text) {
  var result = collectTouches(text);
  var set = new Set();
  for (var i = 0; i < result.touches.length; i++) {
    if (result.touches[i].path) { set.add(result.touches[i].path); }
  }
  return set;
}

// Pass 1: per transcript, resolve cwd -> content DB and tally with/without DB. For cwds whose DB
// exists, record the transcript file so pass 2 can union their touched-path evidence.
function scanTranscripts(files) {
  var state = { transcripts: 0, cwdsWithDb: 0, cwdsMissingDb: 0, dbByCwd: {}, filesByCwd: {} };
  for (var i = 0; i < files.length; i++) { tallyTranscript(state, files[i]); }
  return state;
}

function tallyTranscript(state, file) {
  var cwd = extractSessionMetadata(fs.readFileSync(file, 'utf8')).cwd;
  if (!cwd) { return; }
  state.transcripts++;
  var dbPath = resolveContentDbPath(cwd);
  if (!fs.existsSync(dbPath)) { state.cwdsMissingDb++; return; }
  state.cwdsWithDb++;
  state.dbByCwd[cwd] = dbPath;
  if (!state.filesByCwd[cwd]) { state.filesByCwd[cwd] = []; }
  state.filesByCwd[cwd].push(file);
}

// Pass 2: walk each existing content DB read-only and accumulate file-backed/batch source counts
// and the unique set of newly-covered probe targets.
function walkContentDbs(state, targets) {
  var acc = { contentDBsFound: 0, fileBackedSources: 0, batchSources: 0, batchCatMatches: 0, coverage: new Set() };
  var cwds = Object.keys(state.dbByCwd);
  for (var i = 0; i < cwds.length; i++) { walkOneDb(acc, cwds[i], state, targets); }
  return acc;
}

function walkOneDb(acc, cwd, state, targets) {
  acc.contentDBsFound++;
  var touched = unionTouched(state.filesByCwd[cwd]);
  var bySource = groupRowsBySource(readChunkRows(state.dbByCwd[cwd]));
  var ids = Object.keys(bySource);
  for (var i = 0; i < ids.length; i++) { classifySource(acc, bySource[ids[i]], cwd, targets, touched); }
}

// Union the touched-path sets of every transcript sharing this cwd.
function unionTouched(files) {
  var set = new Set();
  var list = files || [];
  for (var i = 0; i < list.length; i++) {
    touchedPathsForText(fs.readFileSync(list[i], 'utf8')).forEach(function (p) { set.add(p); });
  }
  return set;
}

// Tally one source. A verbatim whole-file target the transcript did not already evidence is added
// to the coverage set; a batch source is counted (and probed for a bare `cat F`, which prose
// labels never match).
function classifySource(acc, agg, cwd, targets, touched) {
  if (isWholeFileSource(agg)) {
    acc.fileBackedSources++;
    var covered = coveredTargetForSource(agg, cwd, targets, touched);
    if (covered) { acc.coverage.add(covered); }
    return;
  }
  if (labelIsBatch(agg.label)) {
    acc.batchSources++;
    if (/^cat\s+\S+$/.test(agg.label)) { acc.batchCatMatches++; }
  }
}

// The absolute target path a whole-file source NEWLY covers, or null when it adds nothing: not a
// known probe target, already in this transcript's own evidence, or not a verbatim hash-verified
// reassembly.
function coveredTargetForSource(agg, cwd, targets, touched) {
  var abs = resolveAgainstCwd(cwd, agg.file_path);
  if (!targets.has(abs)) { return null; }
  if (touched.has(abs)) { return null; }
  if (!isVerbatimWholeFile(agg)) { return null; }
  return abs;
}

// The --projects-dir value, or null.
function parseProjectsDir(argv) {
  var idx = argv.indexOf('--projects-dir');
  if (idx < 0) { return null; }
  return argv[idx + 1] || null;
}

// Assemble the verdict object in the plan's field order.
function buildVerdict(state, acc) {
  return {
    transcripts: state.transcripts,
    cwdsWithDb: state.cwdsWithDb,
    cwdsMissingDb: state.cwdsMissingDb,
    contentDBsFound: acc.contentDBsFound,
    fileBackedSources: acc.fileBackedSources,
    batchSources: acc.batchSources,
    UNIQUE_TARGET_COVERAGE: acc.coverage.size
  };
}

function main() {
  var projectsDir = parseProjectsDir(process.argv);
  if (!projectsDir) {
    console.error('Usage: node spike-item6-context-mode-yield.js --projects-dir <dir>');
    process.exit(1);
  }
  var targets = loadTargets(path.join(__dirname, 'probe-results-v2.json'));
  var state = scanTranscripts(listJsonlFiles(projectsDir));
  var acc = walkContentDbs(state, targets);
  var verdict = buildVerdict(state, acc);
  console.log(JSON.stringify(verdict, null, 2));
  console.log('UNIQUE_TARGET_COVERAGE: ' + verdict.UNIQUE_TARGET_COVERAGE);
  console.log('NOTE: bare-cat detector matched ' + acc.batchCatMatches + ' of ' + acc.batchSources + ' batch sources (labels are prose, not commands).');
  console.log('VERDICT: ' + (verdict.UNIQUE_TARGET_COVERAGE === 0 ? 'NON-VIABLE' : 'REOPEN-CANDIDATE'));
}

if (require.main === module) { main(); }

module.exports = {
  resolveContentDbPath: resolveContentDbPath,
  isWholeFileSource: isWholeFileSource
};
