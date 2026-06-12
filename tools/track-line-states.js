#!/usr/bin/env node
// track-line-states: the per-line file-state tracking sidecar (Phase 3).
// Applies extracted events (extract-file-events) to an in-memory line belief
// (line-belief + edit-splice), emitting the timestamp-keyed tracking object:
// beacons anchor truth and collapse entries to lines:"ALL"; observations
// corroborate or contradict belief (contradictions become conflict records
// localized to an inter-beacon window); the finalVerdict compares final
// belief per line against the best available reference. Runs BESIDE the
// existing reconstruction pipeline — it never changes PASS/MISMATCH.
//
// Usage: node track-line-states.js --path <file> [--jsonls <out.json>]
//        [--projects-dir <dir>] [--snapshots <dir>] [--out <report.json>]

var fs = require('fs');
var path = require('path');
var os = require('os');
var lb = require('../common/line-belief');
var es = require('../common/edit-splice');
var flv = require('../common/final-line-verdict');
var evidence = require('../common/line-state-evidence');

// ─── Event ordering ─────────────────────────────────────────────────────────

// Deterministic order: time, then transcript path, then line — reruns
// reproduce the same timeline exactly.
function compareEvents(a, b) {
  if (a.unixMs !== b.unixMs) { return a.unixMs - b.unixMs; }
  if (a.jsonl < b.jsonl) { return -1; }
  if (a.jsonl > b.jsonl) { return 1; }
  return a.jsonlLine - b.jsonlLine;
}

// Events sharing a millisecond share one timeline entry.
function groupEventsByMs(events) {
  var sorted = events.slice().sort(compareEvents);
  var groups = [];
  var current = null;
  for (var i = 0; i < sorted.length; i++) {
    var startsNewGroup = current === null ? true : current.unixMs !== sorted[i].unixMs;
    if (startsNewGroup) {
      current = { unixMs: sorted[i].unixMs, events: [] };
      groups.push(current);
    }
    current.events.push(sorted[i]);
  }
  return groups;
}

// Tier-1 beacons: snapshot, absence, success-confirmed write.
function isBeaconEvent(event) {
  if (event.snapshot) { return true; }
  if (event.fileAbsent) { return true; }
  return event.write !== null;
}

// ─── Applying one event ─────────────────────────────────────────────────────

function maxByLineNum(byLine) {
  var max = 0;
  for (var i = 0; i < byLine.length; i++) {
    if (byLine[i].lineNum > max) { max = byLine[i].lineNum; }
  }
  return max;
}

function applyEditEvent(belief, event, materialized) {
  var refForLine = function (lineText) { return evidence.refForAuthoredEditLine(event, lineText); };
  var result = es.applyEditToBelief(belief, materialized, event.unixMs, refForLine);
  // The tracker is what KNOWS the edit could not be located — record it on
  // the event so the persisted timeline carries the honest flag.
  if (result.floating) { event.edit.floating = true; }
  return [];
}

// Apply one event to the belief; returns raw conflict infos.
function applyOneEvent(belief, event) {
  var m = evidence.materializeEvent(event);
  if (m.kind === 'write') { lb.applyWrite(belief, m.lines, event.unixMs); return []; }
  if (m.kind === 'snapshot') { return lb.applySnapshotVerify(belief, m.lines, event.unixMs); }
  if (m.kind === 'fileAbsent') { lb.applyFileAbsent(belief, event.unixMs); return []; }
  if (m.kind === 'edit') { return applyEditEvent(belief, event, m); }
  if (m.kind === 'readChunk') {
    var chunkConflicts = lb.applyOverlayLines(belief, m.byLine, event.unixMs);
    lb.finishChunk(belief, event.readChunk.hitEof, maxByLineNum(m.byLine));
    return chunkConflicts;
  }
  // readFull / cat: whole-file overlay, extent witnessed.
  var conflicts = lb.applyOverlayLines(belief, m.byLine, event.unixMs);
  lb.finishWholeOverlay(belief, maxByLineNum(m.byLine));
  return conflicts;
}

// ─── Conflict + timeline records ────────────────────────────────────────────

// Schema conflict record: the observation won the line; this preserves what
// was displaced and where both sides' proof lives, localized to the window
// between the last beacon and this moment of discovery.
function buildConflictRecord(info, unixMs, fromBeaconMs) {
  return {
    timestampOfContradictingRecord: unixMs,
    line: info.line,
    presumed: info.presumedEvidence,
    observed: info.observedRef,
    excerpt: {
      presumedText: evidence.makeExcerpt(info.presumedText),
      observedText: evidence.makeExcerpt(info.observedText)
    },
    window: { fromBeaconMs: fromBeaconMs, toBeaconMs: unixMs }
  };
}

// Lines whose entry was established/verified at this exact instant.
function touchedLinesAt(belief, unixMs) {
  var touched = new Set();
  var lineNums = Object.keys(belief.entries).map(Number);
  for (var i = 0; i < lineNums.length; i++) {
    if (belief.entries[lineNums[i]].confirmedAtMs === unixMs) { touched.add(lineNums[i]); }
  }
  return touched;
}

// Belief AFTER this instant's events: beacons collapse to "ALL" (one
// reference covers every line); otherwise the per-line evidence map.
function buildTimelineEntry(group, belief, groupIsBeacon) {
  return {
    timestamp: group.events[0].timestamp,
    isBeacon: groupIsBeacon,
    events: group.events,
    lines: groupIsBeacon ? 'ALL' : lb.cloneEntriesForTimeline(belief),
    summary: lb.summarizeBelief(belief)
  };
}

// ─── The tracker ────────────────────────────────────────────────────────────

function appendConflictRecords(conflicts, infos, unixMs, fromBeaconMs) {
  for (var c = 0; c < infos.length; c++) {
    conflicts.push(buildConflictRecord(infos[c], unixMs, fromBeaconMs));
  }
}

// Apply one instant's events in order; returns whether any was a beacon.
// Conflicts are windowed against the beacon that PRECEDED this instant.
function applyEventGroup(belief, group, conflicts) {
  var groupIsBeacon = false;
  for (var e = 0; e < group.events.length; e++) {
    var infos = applyOneEvent(belief, group.events[e]);
    appendConflictRecords(conflicts, infos, group.unixMs, belief.lastBeaconMs);
    if (isBeaconEvent(group.events[e])) {
      belief.lastBeaconMs = group.unixMs;
      groupIsBeacon = true;
    }
  }
  return groupIsBeacon;
}

// Replay every event in deterministic order, anchoring at beacons and
// accumulating/verifying between them. options: {filePath, aliasPaths,
// jsonlsScanned, reference:{via, content}}.
function trackLineStates(events, options) {
  var opts = options ? options : {};
  var belief = lb.createBelief();
  var timeline = {};
  var conflicts = [];
  var groups = groupEventsByMs(events);
  for (var g = 0; g < groups.length; g++) {
    var groupIsBeacon = applyEventGroup(belief, groups[g], conflicts);
    lb.degradeUntouchedToPresumed(belief, touchedLinesAt(belief, groups[g].unixMs));
    timeline[String(groups[g].unixMs)] = buildTimelineEntry(groups[g], belief, groupIsBeacon);
  }
  var reference = opts.reference ? opts.reference : { via: 'none', content: null };
  return {
    filePath: opts.filePath ? opts.filePath : null,
    aliasPaths: opts.aliasPaths ? opts.aliasPaths : [],
    jsonlsScanned: opts.jsonlsScanned ? opts.jsonlsScanned : [],
    timeline: timeline,
    conflicts: conflicts,
    finalVerdict: flv.buildFinalVerdict(belief, reference)
  };
}

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
  var ct = require('../common/collect-touches');
  var cache = ct.loadAllJsonlFilesInProjectsFolder(projectsDir);
  var graph = ct.buildLineageGraph(ct.gatherAllOps(cache));
  return Array.from(ct.resolveAliases([target], graph));
}

function discoverJsonls(opts, target, projectsDir) {
  if (opts.jsonls) { return JSON.parse(fs.readFileSync(opts.jsonls, 'utf8')).referencedIn; }
  var sj = require('../common/subagent-jsonls');
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
  var efe = require('./extract-file-events');
  var events = [];
  for (var i = 0; i < jsonls.length; i++) {
    Array.prototype.push.apply(events, efe.extractFileEvents(jsonls[i], aliasPaths, opts.snapshots ? opts.snapshots : null));
  }
  var result = trackLineStates(events, {
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

module.exports = {
  trackLineStates: trackLineStates,
  parseArgs: parseArgs
};
