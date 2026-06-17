#!/usr/bin/env node
// Verify all 30 scenario JSONL files reconstruct their on-disk .py files.
//
// For each executed scenario:
//   1. Read the JSONL path from the executed result file
//   2. Read the on-disk .py files from the captured output directory
//   3. Run extractEditsFromJSONL + replayEdits for each .py file
//   4. Compare replayed content against on-disk content
//   5. Report MATCH / MISMATCH / SKIP

var fs = require('fs');
var path = require('path');
var extractEditsFromJSONL = require('../api/edit-stream-extraction').extractEditsFromJSONL;
var replayEdits = require('../api/edit-replay').replayEdits;
var classifyModule = require('../api/rewind-classification');

var execDir = path.join(__dirname, '..', 'plans', 'scenarios', 'executed');

function findExecutedFiles() {
  return fs.readdirSync(execDir).filter(function(f) {
    return f.endsWith('.txt') && f.indexOf('-run-') >= 0;
  }).sort();
}

// Extract tmpdir and jsonlPath from the lines of an executed result file.
function extractPathsFromLines(lines) {
  var tmpdir = '';
  var jsonlPath = '';
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('tmpdir: ') === 0) {
      tmpdir = lines[i].substring(8).trim();
    }
    var jm = lines[i].match(/jsonl_path":\s*"([^"]+)"/);
    if (jm) {
      jsonlPath = jm[1];
    }
  }
  return { tmpdir: tmpdir, jsonlPath: jsonlPath };
}

function parseExecutedFile(filename) {
  var text = fs.readFileSync(path.join(execDir, filename), 'utf8');
  var paths = extractPathsFromLines(text.split('\n'));
  var stem = filename.replace(/-run-\d+-\d+\.txt$/, '');
  return { stem: stem, tmpdir: paths.tmpdir, jsonlPath: paths.jsonlPath };
}

function findPyFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  if (!fs.statSync(dirPath).isDirectory()) {
    return [];
  }
  return fs.readdirSync(dirPath).filter(function(f) {
    return f.endsWith('.py') && f !== 'conftest.py';
  });
}

// Append diff entries for a single mismatched line pair.
function appendDiffEntry(diff, el, al, lineNum) {
  if (el !== undefined) {
    diff.push('- L' + lineNum + ': ' + el.substring(0, 80));
  }
  if (al !== undefined) {
    diff.push('+ L' + lineNum + ': ' + al.substring(0, 80));
  }
}

// Collect diff entries between two line arrays, up to limit entries.
function collectDiffEntries(el, al, limit) {
  var diff = [];
  var mx = Math.max(el.length, al.length);
  for (var i = 0; i < mx; i++) {
    if (el[i] !== al[i]) {
      appendDiffEntry(diff, el[i], al[i], i + 1);
      if (diff.length >= limit) {
        diff.push('  ... (truncated)');
        return diff;
      }
    }
  }
  return diff;
}

function simpleDiff(expected, actual, maxLines) {
  return collectDiffEntries(expected.split('\n'), actual.split('\n'), maxLines || 10);
}

// ─── Main ───────────────────────────────────────────────────────────────────

var executedFiles = findExecutedFiles();
var results = [];

for (var fi = 0; fi < executedFiles.length; fi++) {
  var info = parseExecutedFile(executedFiles[fi]);

  if (!info.jsonlPath || !fs.existsSync(info.jsonlPath)) {
    results.push({ stem: info.stem, error: 'JSONL not found' });
    continue;
  }

  var filesDir = path.join(execDir, info.stem);
  var pyFiles = findPyFiles(filesDir);

  if (pyFiles.length === 0) {
    results.push({ stem: info.stem, error: 'no .py files on disk', note: 'expected for delete/redirect/no-post-edit scenarios' });
    continue;
  }

  var jsonlText = fs.readFileSync(info.jsonlPath, 'utf8');
  var allEdits = extractEditsFromJSONL(jsonlText);
  var classification = classifyModule.analyzeJSONL(jsonlText);

  // Build kept/ignored lookup.
  var statusByLine = {};
  for (var ci = 0; ci < classification.edits.length; ci++) {
    statusByLine[classification.edits[ci].line] = classification.edits[ci].status;
  }

  for (var pi = 0; pi < pyFiles.length; pi++) {
    var py = pyFiles[pi];
    var editsForFile = allEdits.filter(function(e) { return e.file === py; });

    if (editsForFile.length === 0) {
      results.push({ stem: info.stem, py: py, error: 'no edits found for file' });
      continue;
    }

    // Filter to kept edits only.
    var keptEdits = [];
    var ignoredCount = 0;
    for (var ei = 0; ei < editsForFile.length; ei++) {
      var lineOneBased = editsForFile[ei].line + 1;
      if (statusByLine[lineOneBased] === 'ignored') {
        ignoredCount++;
      } else {
        keptEdits.push(editsForFile[ei]);
      }
    }

    var onDisk = fs.readFileSync(path.join(filesDir, py), 'utf8');
    var replayed = replayEdits(keptEdits);
    var match = replayed === onDisk;

    var result = {
      stem: info.stem,
      py: py,
      match: match,
      totalEdits: editsForFile.length,
      kept: keptEdits.length,
      ignored: ignoredCount,
      replayLen: replayed.length,
      diskLen: onDisk.length
    };

    if (!match) {
      result.diff = simpleDiff(onDisk, replayed, 10);
    }

    results.push(result);
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

var matches = results.filter(function(r) { return r.match === true; });
var mismatches = results.filter(function(r) { return r.match === false; });
var errors = results.filter(function(r) { return r.error; });

console.log('=== RESULTS ===');
console.log('MATCH:    ' + matches.length);
console.log('MISMATCH: ' + mismatches.length);
console.log('SKIPPED:  ' + errors.length);
console.log();

if (mismatches.length > 0) {
  console.log('--- MISMATCHES ---');
  for (var mi = 0; mi < mismatches.length; mi++) {
    var m = mismatches[mi];
    console.log(m.stem + '/' + m.py + '  (total=' + m.totalEdits + ' kept=' + m.kept + ' ignored=' + m.ignored + ' replay=' + m.replayLen + ' disk=' + m.diskLen + ')');
    if (m.diff) {
      for (var di = 0; di < m.diff.length; di++) {
        console.log('  ' + m.diff[di]);
      }
    }
    console.log();
  }
}

if (errors.length > 0) {
  console.log('--- SKIPPED ---');
  for (var si = 0; si < errors.length; si++) {
    var s = errors[si];
    console.log(s.stem + (s.py ? '/' + s.py : '') + ': ' + s.error + (s.note ? ' (' + s.note + ')' : ''));
  }
  console.log();
}

if (matches.length > 0) {
  console.log('--- MATCHES ---');
  for (var i = 0; i < matches.length; i++) {
    console.log(matches[i].stem + '/' + matches[i].py + '  (kept=' + matches[i].kept + ' ignored=' + matches[i].ignored + ')');
  }
}

process.exit(mismatches.length > 0 ? 1 : 0);
