#!/usr/bin/env node
// Snapshot-based file reconstruction algorithm.
// Uses snapshots as ground-truth checkpoints, falling back to
// last-snapshot + cumulative edits when no snapshot is available.
//
// Usage: node snapshot-reconstruction.js --jsonl <path> --file <target>
//        node snapshot-reconstruction.js --jsonl-dir <path> --files-dir <path>

var fs = require('fs');
var path = require('path');
var replayMod = require('../common/replay-edits');
var extractEditsFromJSONL = replayMod.extractEditsFromJSONL;
var applySingleEdit = replayMod.applySingleEdit;

function tryParse(line) {
  try { return JSON.parse(line); } catch (e) { return null; }
}

function extractSnapshots(lines) {
  var snapshots = [];
  for (var i = 0; i < lines.length; i++) {
    var obj = tryParse(lines[i]);
    if (!obj || obj.type !== 'file-history-snapshot') { continue; }
    snapshots.push({ line: i, snapshot: obj.snapshot || {} });
  }
  return snapshots;
}

function getSnapshotFileContent(snapshot, targetFile) {
  var backups = (snapshot && snapshot.trackedFileBackups) || {};
  var keys = Object.keys(backups);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k] === targetFile || keys[k].split('/').pop() === targetFile.split('/').pop()) {
      var entry = backups[keys[k]];
      if (entry && entry.content !== undefined) { return entry.content; }
    }
  }
  return null;
}

function filterEditsForFile(edits, targetFile) {
  var basename = targetFile.split('/').pop();
  var result = [];
  for (var i = 0; i < edits.length; i++) {
    var fp = edits[i].filePath || edits[i].file || '';
    if (fp === targetFile || fp.split('/').pop() === basename) { result.push(edits[i]); }
  }
  return result;
}

function buildSnapshotTimeline(lines, snapshots, edits) {
  var events = [];
  for (var s = 0; s < snapshots.length; s++) {
    events.push({ type: 'snapshot', line: snapshots[s].line, snapshot: snapshots[s].snapshot });
  }
  for (var e = 0; e < edits.length; e++) {
    events.push({ type: 'edit', line: edits[e].line, edit: edits[e] });
  }
  events.sort(function(a, b) { return a.line - b.line; });
  return events;
}

function applySnapshotReset(state, snapContent, line, steps) {
  if (snapContent === null) { return state; }
  if (snapContent !== state) {
    steps.push({ type: 'snapshot-reset', line: line, before: state, after: snapContent });
    return snapContent;
  }
  return state;
}

function applyEditEvent(state, edit, line, steps) {
  var before = state;
  var after = applySingleEdit(edit, state);
  steps.push({ type: edit.type, line: line, before: before, after: after, edit: edit });
  return after;
}

function processEvent(ev, state, steps, targetFile) {
  if (ev.type === 'snapshot') {
    var snapContent = getSnapshotFileContent(ev.snapshot, targetFile);
    return applySnapshotReset(state, snapContent, ev.line, steps);
  }
  if (ev.type === 'edit') { return applyEditEvent(state, ev.edit, ev.line, steps); }
  return state;
}

function reconstructFile(jsonlText, targetFile) {
  var lines = jsonlText.split('\n');
  var snapshots = extractSnapshots(lines);
  var allEdits = extractEditsFromJSONL(jsonlText);
  var fileEdits = filterEditsForFile(allEdits, targetFile);
  var events = buildSnapshotTimeline(lines, snapshots, fileEdits);
  var state = '';
  var steps = [];
  for (var i = 0; i < events.length; i++) {
    state = processEvent(events[i], state, steps, targetFile);
  }
  return { finalContent: state, steps: steps };
}

function reconstructAndVerify(jsonlText, onDiskContent, targetFile) {
  var result = reconstructFile(jsonlText, targetFile);
  var match = result.finalContent === onDiskContent;
  return { match: match, finalContent: result.finalContent, steps: result.steps };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function runSingleFile(jsonlPath, targetFile, onDiskContent) {
  var jsonlText = fs.readFileSync(jsonlPath, 'utf8');
  var result = reconstructAndVerify(jsonlText, onDiskContent, targetFile);
  var status = result.match ? 'MATCH' : 'MISMATCH';
  console.log(status + ': ' + targetFile + ' (' + result.steps.length + ' steps)');
  if (!result.match) {
    var expLines = onDiskContent.split('\n');
    var actLines = result.finalContent.split('\n');
    console.log('  Expected ' + expLines.length + ' lines, got ' + actLines.length + ' lines');
  }
  return result.match;
}

function runBatchFromScenarios(scenariosDir) {
  var execDir = path.join(scenariosDir, 'executed');
  var dirs = fs.readdirSync(execDir).filter(function(f) {
    return fs.statSync(path.join(execDir, f)).isDirectory();
  }).sort();
  var matchCount = 0, mismatchCount = 0, skipCount = 0;
  for (var d = 0; d < dirs.length; d++) {
    var dir = path.join(execDir, dirs[d]);
    var jsonlPathFile = path.join(dir, 'jsonl_path.txt');
    if (!fs.existsSync(jsonlPathFile)) { skipCount++; continue; }
    var jsonlPath = fs.readFileSync(jsonlPathFile, 'utf8').trim();
    if (!fs.existsSync(jsonlPath)) { skipCount++; continue; }
    var testsDir = path.join(dir, 'tests');
    if (!fs.existsSync(testsDir)) { skipCount++; continue; }
    var pyFiles = fs.readdirSync(testsDir).filter(function(f) { return f.endsWith('.py'); });
    if (pyFiles.length === 0) { skipCount++; continue; }
    var jsonlText = fs.readFileSync(jsonlPath, 'utf8');
    for (var p = 0; p < pyFiles.length; p++) {
      var onDisk = fs.readFileSync(path.join(testsDir, pyFiles[p]), 'utf8');
      var result = reconstructAndVerify(jsonlText, onDisk, pyFiles[p]);
      var status = result.match ? 'MATCH' : 'MISMATCH';
      console.log(status + ': ' + dirs[d] + '/' + pyFiles[p] + ' (' + result.steps.length + ' steps)');
      if (result.match) { matchCount++; } else { mismatchCount++; }
    }
  }
  console.log('\n--- Summary ---');
  console.log('MATCH:    ' + matchCount);
  console.log('MISMATCH: ' + mismatchCount);
  console.log('SKIPPED:  ' + skipCount);
}

function main() {
  var args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--scenarios') {
    var scenariosDir = args[1] || path.join(__dirname, 'plans', 'scenarios');
    runBatchFromScenarios(scenariosDir);
    return;
  }
  console.log('Usage: node snapshot-reconstruction.js [--scenarios <path>]');
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { reconstructFile: reconstructFile, reconstructAndVerify: reconstructAndVerify };
}
