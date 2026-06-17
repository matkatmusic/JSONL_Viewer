#!/usr/bin/env node
// probe-projects-v2: per-file reconstruction probe — gather every file
// referenced in the JSONL transcripts, run the production reconstruction
// pipeline per file, log success/fail per file with full provenance.
// Outputs TWO lists (filesInProject: on disk AND inside a probed project root;
// filesNotInProject: deleted OR outside every root) to probe-results-v2.json,
// plus a probe-mismatches-v2.json skeleton. v1 probe-projects.js stays intact.
// Usage: node probe-projects-v2.js --projects-dir <path> [--snapshots <path>]

var fs = require('fs');
var path = require('path');
var shared = require('./probe-v2-shared');
var td = require('../api/transcript-discovery');
var ct = require('../api/file-historical-lineage');
var fph = require('../api/file-path-history');
var editStream = require('../api/edit-stream-extraction');
var editReplay = require('../api/edit-replay');
var classify = require('../api/rewind-classification');
var refSources = require('../api/reconstruction-reference-sources');
var report = require('./probe-v2-report');
var assembly = require('./probe-v2-assembly');
var parsers = require('../api/transcript-parsers');

// ─── Phase A: scan the projects folder ONCE ─────────────────────────────────

// First non-null session cwd across a folder's transcripts (sorted order, so
// derivation is deterministic). Null when no transcript carries one.
function rootFromTranscripts(transcriptPaths) {
  var sorted = transcriptPaths.slice().sort();
  for (var i = 0; i < sorted.length; i++) {
    var cwd = parsers.extractSessionMetadata(fs.readFileSync(sorted[i], 'utf8')).cwd;
    if (cwd !== null) { return cwd; }
  }
  return null;
}

// Each project's root comes from its transcripts' session cwd — exact, no
// decoding, so roots with spaces or dashes survive. The dash-to-slash folder
// name decode remains ONLY as the fallback for projects whose transcripts
// carry no cwd. Deduped: folders can share a cwd.
function deriveProjectRoots(projectsDir, allJsonlFiles) {
  var filesByFolder = td.groupFilesByFolder(allJsonlFiles);
  var projects = td.discoverProjects(projectsDir);
  var roots = [];
  for (var p = 0; p < projects.length; p++) {
    var root = rootFromTranscripts(filesByFolder[projects[p].dir] || []);
    if (root === null) { root = td.cwdFromFolderName(projects[p].name); }
    if (roots.indexOf(root) < 0) { roots.push(root); }
  }
  return roots;
}

// The one-and-only scan of the projects folder. Loads every JSONL file once
// and builds every shared lookup structure the per-file loop needs:
//   allJsonlFiles   — per-transcript {file, touches, ops} (the loaded data)
//   samePathGraph   — rename/move/copy graph over all transcripts
//   pathHistoryIndex— path-history index for earliest/current path resolution
//   projectRoots    — session-cwd root of every project folder (see above)
function scanProjectsFolderOnce(projectsDir) {
  var allJsonlFiles = td.loadAllJsonlFilesInProjectsFolder(projectsDir);
  return {
    allJsonlFiles: allJsonlFiles,
    samePathGraph: ct.buildLineageGraph(ct.gatherAllOps(allJsonlFiles)),
    pathHistoryIndex: fph.buildFilePathHistoryIndex(projectsDir, allJsonlFiles),
    projectRoots: deriveProjectRoots(projectsDir, allJsonlFiles)
  };
}

// ─── Phase B: file-identity enumeration ─────────────────────────────────────

// Touch kinds that mean a session AUTHORED content at the path (something to
// replay). Reads/rm/redirect are observations or deletions, not authored edits.
var AUTHORING_TOUCH_KINDS = { write: true, edit: true };

// Every distinct absolute path with an authoring touch, sorted for
// deterministic enumeration order. Temp-dir paths are excluded the same way
// v1 excludes them (they never survive the session, so nothing to verify).
function collectAuthoredPaths(allJsonlFiles) {
  var seen = {};
  for (var i = 0; i < allJsonlFiles.length; i++) {
    var touches = allJsonlFiles[i].touches;
    for (var t = 0; t < touches.length; t++) {
      if (!AUTHORING_TOUCH_KINDS[touches[t].kind]) { continue; }
      if (shared.isTempFilePath(touches[t].path)) { continue; }
      seen[touches[t].path] = true;
    }
  }
  return Object.keys(seen).sort();
}

// One entry per distinct authored file. A file's entry spans EVERY path the
// file has had across its rename/move/copy history (its alias set), keyed by
// the smallest alias path. Two authored paths joined by a recorded mv are ONE
// identity; the same path authored in many transcripts is ONE identity.
function enumerateFileIdentities(allJsonlFiles, samePathGraph) {
  var authoredPaths = collectAuthoredPaths(allJsonlFiles);
  var identityKeyByPath = {};
  var identityByKey = {};
  var identities = [];
  for (var i = 0; i < authoredPaths.length; i++) {
    if (identityKeyByPath[authoredPaths[i]]) { continue; }
    var aliasPaths = Array.from(ct.resolveAliases([authoredPaths[i]], samePathGraph)).sort();
    var identityKey = aliasPaths[0];
    for (var a = 0; a < aliasPaths.length; a++) { identityKeyByPath[aliasPaths[a]] = identityKey; }
    if (identityByKey[identityKey]) {
      mergeAliasPaths(identityByKey[identityKey], aliasPaths);
      continue;
    }
    var identity = { identityKey: identityKey, aliasPaths: aliasPaths };
    identityByKey[identityKey] = identity;
    identities.push(identity);
  }
  return identities;
}

// Union newAliasPaths into an existing identity's aliasPaths (kept sorted).
// Happens when a directional cp edge gives two authored paths overlapping
// alias sets that share the same smallest path.
function mergeAliasPaths(identity, newAliasPaths) {
  for (var i = 0; i < newAliasPaths.length; i++) {
    if (identity.aliasPaths.indexOf(newAliasPaths[i]) < 0) {
      identity.aliasPaths.push(newAliasPaths[i]);
    }
  }
  identity.aliasPaths.sort();
}

// Compute the replay inputs ONCE per transcript, reused across every file
// identity: the full edit list and the kept/ignored status lookup.
// Returns { transcriptPath -> {edits, statusByLine} }.
function buildPerTranscriptEdits(allJsonlFiles) {
  var perTranscript = {};
  for (var i = 0; i < allJsonlFiles.length; i++) {
    var text = fs.readFileSync(allJsonlFiles[i].file, 'utf8');
    perTranscript[allJsonlFiles[i].file] = {
      edits: editStream.extractEditsFromJSONL(text),
      statusByLine: report.buildStatusLookup(classify.analyzeJSONL(text))
    };
  }
  return perTranscript;
}

// ─── Phase E: per-file probe + run orchestration ────────────────────────────
// (Phase C transcript ordering + kept-edit assembly lives in probe-v2-assembly.js.)

// Retry the reference decision with the (possibly lossy) trailing observation
// edits dropped. Returns {decision, content} on a PASS, else null — the full
// replay's verdict stands unless the trimmed replay positively verifies.
function retryWithoutTrailingObservations(keptEdits, sources) {
  var trimmed = assembly.dropTrailingObservationEdits(keptEdits);
  if (trimmed.droppedCount === 0) { return null; }
  var trimmedContent = editReplay.replayEdits(trimmed.edits);
  var trimmedDecision = refSources.chooseReferenceSource(trimmedContent, sources);
  if (trimmedDecision.status !== 'PASS') { return null; }
  return { decision: trimmedDecision, content: trimmedContent };
}

// Retry with the file's trailing newline restored. Recorded Bash stdout trims
// the final "\n", so a cat/read observation that is the replay's final
// authority comes up one byte short against the real file. Only applies when
// the last kept edit IS an observation — an authored final state that differs
// by a newline is a genuine change. Returns {decision, content} on a PASS,
// else null.
function retryWithTrailingNewlineRestored(keptEdits, replayedContent, sources) {
  if (keptEdits.length === 0) { return null; }
  if (!assembly.isObservationEdit(keptEdits[keptEdits.length - 1])) { return null; }
  var restoredContent = replayedContent + '\n';
  var restoredDecision = refSources.chooseReferenceSource(restoredContent, sources);
  if (restoredDecision.status !== 'PASS') { return null; }
  return { decision: restoredDecision, content: restoredContent };
}

// Run the production reconstruction pipeline for ONE file identity and build
// its record: find its transcripts (lineage-aware), order them by first touch,
// assemble kept edits (full-path filtered), replay, probe every reference
// source, decide, and record provenance.
function probeOneFileIdentity(identity, scan, perTranscriptEdits, projectsDir, snapshotBaseDir) {
  var referencingJsonls = td.findReferencingJsonls(identity.aliasPaths, projectsDir, scan.allJsonlFiles);
  var aliasSet = new Set(identity.aliasPaths);
  var ordered = assembly.orderTranscriptsByFirstTouch(referencingJsonls, scan.allJsonlFiles, aliasSet);
  var assembled = assembly.assembleKeptEdits(identity.aliasPaths, perTranscriptEdits, ordered);
  var replayedContent = editReplay.replayEdits(assembled.keptEdits);
  var earliestSeenFullPath = fph.findEarliestFilePath(identity.aliasPaths, scan.pathHistoryIndex);
  var lastSeenFullPath = fph.findCurrentOnDiskPath(identity.aliasPaths, scan.pathHistoryIndex);
  var sources = refSources.gatherReferenceSources(
    lastSeenFullPath, identity.aliasPaths, ordered, perTranscriptEdits, snapshotBaseDir);
  var decision = refSources.chooseReferenceSource(replayedContent, sources);
  var replayVariant = 'full';
  if (decision.status !== 'PASS') {
    var retried = retryWithoutTrailingObservations(assembled.keptEdits, sources);
    if (retried !== null) {
      decision = retried.decision;
      replayedContent = retried.content;
      replayVariant = 'trailing-observations-trimmed';
    }
  }
  if (decision.status !== 'PASS') {
    var restored = retryWithTrailingNewlineRestored(assembled.keptEdits, replayedContent, sources);
    if (restored !== null) {
      decision = restored.decision;
      replayedContent = restored.content;
      replayVariant = 'trailing-newline-restored';
    }
  }
  return report.buildFileRecord(
    identity, earliestSeenFullPath, lastSeenFullPath, assembled, replayedContent, decision, sources, replayVariant);
}

// Per-list summary bound to the v1 probe's counting helpers.
function summarizeList(records) {
  return report.summarizeList(records, shared.countByStatus, shared.computeActionablePassRate);
}

// Write a report payload as pretty JSON next to this script.
function writeJsonReport(fileName, payload) {
  var outPath = path.join(__dirname, fileName);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log('Wrote ' + outPath);
}

// Prior probe-mismatches-v2.json entries, for the findings-preserving merge.
// Missing, unparseable, or non-array content yields [] — a probe run never
// aborts on a bad mismatches file; the merge just starts from scratch.
function readExistingMismatches(filePath) {
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (readOrParseError) {
    return [];
  }
  if (!Array.isArray(parsed)) { return []; }
  return parsed;
}

// The full v2 probe: ONE scan, then every file identity through the pipeline,
// classified into the two lists; writes probe-results-v2.json and the
// probe-mismatches-v2.json skeleton.
function runProbeV2(opts) {
  var snapshotBaseDir = shared.resolveSnapshotDir(opts);
  var scan = scanProjectsFolderOnce(opts.projectsDir);
  var identities = enumerateFileIdentities(scan.allJsonlFiles, scan.samePathGraph);
  var perTranscriptEdits = buildPerTranscriptEdits(scan.allJsonlFiles);
  var records = identities.map(function (identity) {
    return probeOneFileIdentity(identity, scan, perTranscriptEdits, opts.projectsDir, snapshotBaseDir);
  });
  var lists = report.groupRecordsIntoLists(records, scan.projectRoots);
  var payload = report.buildResultsPayload(lists, {
    list1: summarizeList(lists.filesInProject),
    list2: summarizeList(lists.filesNotInProject)
  }, {
    generatedAt: new Date().toISOString(),
    projectsDir: opts.projectsDir,
    snapshotsDir: snapshotBaseDir,
    projectRoots: scan.projectRoots
  });
  writeJsonReport('probe-results-v2.json', payload);
  var existingMismatches = readExistingMismatches(path.join(__dirname, 'probe-mismatches-v2.json'));
  writeJsonReport('probe-mismatches-v2.json',
    report.mergeExistingFindings(report.buildMismatchesSkeleton(records), existingMismatches));
  return payload;
}

function main() {
  var opts = shared.parseProbeArgs(process.argv.slice(2));
  if (!opts.projectsDir) {
    console.error('Usage: node probe-projects-v2.js --projects-dir <path> [--snapshots <path>]');
    process.exit(1);
  }
  var payload = runProbeV2(opts);
  console.log('list1 filesInProject:    ' + JSON.stringify(payload.summary.list1));
  console.log('list2 filesNotInProject: ' + JSON.stringify(payload.summary.list2));
}

// ─── Exports ────────────────────────────────────────────────────────────────
// Only this module's own functions are exported; phase-C/D/E helpers live in
// their real homes (probe-v2-assembly, api/reconstruction-reference-sources,
// probe-v2-report) and are imported directly by callers and tests.

module.exports = {
  scanProjectsFolderOnce: scanProjectsFolderOnce,
  enumerateFileIdentities: enumerateFileIdentities,
  buildPerTranscriptEdits: buildPerTranscriptEdits,
  probeOneFileIdentity: probeOneFileIdentity,
  summarizeList: summarizeList,
  readExistingMismatches: readExistingMismatches,
  runProbeV2: runProbeV2
};

if (require.main === module) { main(); }
