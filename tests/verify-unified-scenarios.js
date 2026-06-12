#!/usr/bin/env node
// Verify unified-reconstruct.js against all 30 scenario JSONL files.
// Compares reconstructFromJSONLTexts output against on-disk .py files.

var fs = require('fs');
var path = require('path');
var unified = require('../common/unified-reconstruct');

var execDir = path.join(__dirname, '..', 'plans', 'scenarios', 'executed');

function findExecutedFiles() {
  return fs.readdirSync(execDir).filter(function(f) {
    return f.endsWith('.txt') && f.indexOf('-run-') >= 0;
  }).sort();
}

function extractPathsFromLines(lines) {
  var tmpdir = '';
  var jsonlPath = '';
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('tmpdir: ') === 0) {
      tmpdir = lines[i].substring(8).trim();
    }
    var jm = lines[i].match(/jsonl_path":\s*"([^"]+)"/);
    if (jm) { jsonlPath = jm[1]; }
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
  if (!fs.existsSync(dirPath)) { return []; }
  if (!fs.statSync(dirPath).isDirectory()) { return []; }
  return fs.readdirSync(dirPath).filter(function(f) {
    return f.endsWith('.py') && f !== 'conftest.py';
  });
}

function collectDiffLines(expected, actual, limit) {
  var el = expected.split('\n');
  var al = actual.split('\n');
  var diff = [];
  var mx = Math.max(el.length, al.length);
  for (var i = 0; i < mx; i++) {
    if (el[i] !== al[i]) {
      if (el[i] !== undefined) { diff.push('- L' + (i + 1) + ': ' + (el[i] || '').substring(0, 80)); }
      if (al[i] !== undefined) { diff.push('+ L' + (i + 1) + ': ' + (al[i] || '').substring(0, 80)); }
      if (diff.length >= limit) { diff.push('  ... (truncated)'); return diff; }
    }
  }
  return diff;
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
    results.push({ stem: info.stem, error: 'no .py files on disk' });
    continue;
  }

  var jsonlText = fs.readFileSync(info.jsonlPath, 'utf8');
  var jsonlTexts = [{ text: jsonlText, path: info.jsonlPath }];

  for (var pi = 0; pi < pyFiles.length; pi++) {
    var py = pyFiles[pi];
    var onDisk = fs.readFileSync(path.join(filesDir, py), 'utf8');
    var state = unified.reconstructFromJSONLTexts(jsonlTexts, py);
    var match = state.content === onDisk;
    var userEdits = state.patches.filter(function(p) { return p.type === 'UserEdit'; });
    var agentEdits = state.patches.filter(function(p) { return p.type === 'AgentEdit'; });

    var result = {
      stem: info.stem, py: py, match: match,
      patches: state.patches.length,
      userEdits: userEdits.length, agentEdits: agentEdits.length,
      replayLen: state.content.length, diskLen: onDisk.length
    };

    if (!match) {
      result.diff = collectDiffLines(onDisk, state.content, 10);
    }
    results.push(result);
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

var matches = results.filter(function(r) { return r.match === true; });
var mismatches = results.filter(function(r) { return r.match === false; });
var errors = results.filter(function(r) { return r.error; });

console.log('=== UNIFIED RECONSTRUCTION RESULTS ===');
console.log('MATCH:    ' + matches.length);
console.log('MISMATCH: ' + mismatches.length);
console.log('SKIPPED:  ' + errors.length);
console.log();

if (mismatches.length > 0) {
  console.log('--- MISMATCHES ---');
  for (var mi = 0; mi < mismatches.length; mi++) {
    var m = mismatches[mi];
    console.log(m.stem + '/' + m.py + '  (patches=' + m.patches + ' user=' + m.userEdits + ' agent=' + m.agentEdits + ' replay=' + m.replayLen + ' disk=' + m.diskLen + ')');
    if (m.diff) {
      for (var di = 0; di < m.diff.length; di++) { console.log('  ' + m.diff[di]); }
    }
    console.log();
  }
}

if (matches.length > 0) {
  console.log('--- MATCHES ---');
  for (var i = 0; i < matches.length; i++) {
    var r = matches[i];
    console.log(r.stem + '/' + r.py + '  (patches=' + r.patches + ' user=' + r.userEdits + ' agent=' + r.agentEdits + ')');
  }
}

process.exit(mismatches.length > 0 ? 1 : 0);
