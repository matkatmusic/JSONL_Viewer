#!/usr/bin/env node
// track-line-states (CLI): the per-line file-state tracking sidecar (Phase 3).
// Thin wrapper over the api/track-line-states engine: discovers the transcripts
// that touched the target, extracts file events (api/file-events-extractors),
// resolves rename/copy aliases, chooses a reference, runs trackLineStates, and
// writes the timestamp-keyed report JSON. Runs BESIDE the existing
// reconstruction pipeline — it never changes PASS/MISMATCH.
//
// Usage: node track-line-states.js --path <file> [--jsonls <out.json>]
//        [--projects-dir <dir>] [--snapshots <dir>] [--out <report.json>]

var fs = require('fs');
var path = require('path');
var os = require('os');
var tls = require('../api/track-line-states');

// ─── CLI ────────────────────────────────────────────────────────────────────

var ARG_MAP = { '--path': 'path', '--jsonls': 'jsonls', '--projects-dir': 'projectsDir', '--snapshots': 'snapshots', '--out': 'out' };

function parseArgs(argv) {
  var opts = { path: '', jsonls: '', projectsDir: '', snapshots: '', out: '' };
  for (var i = 0; i < argv.length; i++) {
    var key = ARG_MAP[argv[i]];
    if (key) { opts[key] = argv[i + 1]; i++; }
  }
  return opts;
}

// Rename/copy lineage aliases of the target (events are matched against ALL).
function resolveAliasPaths(target, projectsDir) {
  var ct = require('../api/file-historical-lineage');
  var td = require('../api/transcript-discovery');
  var cache = td.loadAllJsonlFilesInProjectsFolder(projectsDir);
  var graph = ct.buildLineageGraph(ct.gatherAllOps(cache));
  return Array.from(ct.resolveAliases([target], graph));
}

function discoverJsonls(opts, target, projectsDir) {
  if (opts.jsonls) { return JSON.parse(fs.readFileSync(opts.jsonls, 'utf8')).referencedIn; }
  var sj = require('../api/subagent-transcript-discovery');
  return sj.findReferencingJsonlsIncludingSubagents([target], projectsDir);
}

// The most recent snapshot blob among the events, or null.
function latestSnapshotBlob(events) {
  var best = null;
  for (var i = 0; i < events.length; i++) {
    if (!events[i].snapshot) { continue; }
    if (best === null) { best = events[i]; continue; }
    if (events[i].unixMs > best.unixMs) { best = events[i]; }
  }
  return best ? best.snapshot.blob : null;
}

// The probe's source ladder, first available wins. (The git rung is not yet
// implemented here — on-disk, else latest snapshot blob, else none.)
function chooseReference(target, events) {
  if (fs.existsSync(target)) { return { via: 'on-disk', content: fs.readFileSync(target, 'utf8') }; }
  var blob = latestSnapshotBlob(events);
  if (blob) { return { via: 'snapshot', content: fs.readFileSync(blob, 'utf8') }; }
  return { via: 'none', content: null };
}

function printConflicts(conflicts) {
  console.log('Conflicts: ' + conflicts.length);
  for (var i = 0; i < conflicts.length; i++) {
    var c = conflicts[i];
    console.log('  line ' + c.line + ' at ' + c.timestampOfContradictingRecord +
      ' window [' + c.window.fromBeaconMs + ' .. ' + c.window.toBeaconMs + ']');
    console.log('    presumed: ' + JSON.stringify(c.excerpt.presumedText));
    console.log('    observed: ' + JSON.stringify(c.excerpt.observedText));
  }
}

function printVerdict(verdict) {
  console.log('Final verdict (vs ' + verdict.comparedVia + '): ' + JSON.stringify(verdict.perLineStats) +
    (verdict.tailUncertain ? '  TAIL UNCERTAIN' : ''));
  for (var i = 0; i < verdict.mismatchedLines.length; i++) {
    var m = verdict.mismatchedLines[i];
    console.log('  line ' + m.line + ' (' + m.lastState + ') reconstructed=' +
      JSON.stringify(m.excerpt.reconstructed) + ' reference=' + JSON.stringify(m.excerpt.reference));
  }
}

function main() {
  var opts = parseArgs(process.argv.slice(2));
  if (!opts.path) {
    console.error('Usage: node track-line-states.js --path <file> [--jsonls <out.json>] [--projects-dir <dir>] [--snapshots <dir>] [--out <report.json>]');
    process.exit(1);
  }
  var target = path.resolve(opts.path);
  var projectsDir = opts.projectsDir ? opts.projectsDir : path.join(os.homedir(), '.claude', 'projects');
  var jsonls = discoverJsonls(opts, target, projectsDir);
  var aliasPaths = resolveAliasPaths(target, projectsDir);
  var efe = require('../api/file-events-extractors');
  var events = [];
  for (var i = 0; i < jsonls.length; i++) {
    Array.prototype.push.apply(events, efe.extractFileEvents(jsonls[i], aliasPaths, opts.snapshots ? opts.snapshots : null));
  }
  var result = tls.trackLineStates(events, {
    filePath: target,
    aliasPaths: aliasPaths,
    jsonlsScanned: jsonls,
    reference: chooseReference(target, events)
  });
  var outPath = opts.out ? opts.out : path.join(__dirname, 'line-state-report.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Tracked ' + target);
  console.log('Transcripts: ' + jsonls.length + ', events: ' + events.length +
    ', timeline entries: ' + Object.keys(result.timeline).length);
  printConflicts(result.conflicts);
  printVerdict(result.finalVerdict);
  console.log('Report written to ' + outPath);
}

if (require.main === module) { main(); }
