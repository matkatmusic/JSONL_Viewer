#!/usr/bin/env node
// Summarize branch structure of a JSONL file for a target file.
// Shows which edits land in which branch and what survives.
//
// Usage: node branch-summary.js <jsonl-path> [target-file]
//   If target-file omitted, lists all edited files and summarizes each.

var fs = require('fs');
var path = require('path');
var extractEditsFromJSONL = require('../api/edit-stream-extraction').extractEditsFromJSONL;
var classify = require('../api/rewind-classification');
var unified = require('../api/unified-reconstruct');

function getEditLabel(edit) {
  var basename = (edit.filePath || edit.file || '').split('/').pop();
  var type = edit.type || 'edit';
  return type.charAt(0).toUpperCase() + type.slice(1) + ':' + basename;
}

function findRewindAfterEdit(editLine, rwSorted) {
  for (var r = 0; r < rwSorted.length; r++) {
    if (rwSorted[r].landingLine > editLine && rwSorted[r].parentLine < editLine) {
      return rwSorted[r];
    }
  }
  return null;
}

function buildBranches(jsonlText, targetFile) {
  var analysis = classify.analyzeJSONL(jsonlText);
  var rewinds = analysis.rewinds;
  var allEdits = extractEditsFromJSONL(jsonlText);
  var edits = allEdits.filter(function(e) {
    var fp = e.filePath || e.file || '';
    var bn = fp.split('/').pop();
    return fp === targetFile || bn === targetFile || fp.endsWith('/' + targetFile);
  });

  if (edits.length === 0) { return null; }

  var sorted = edits.slice().sort(function(a, b) { return a.line - b.line; });
  var rwSorted = rewinds.slice().sort(function(a, b) { return a.landingLine - b.landingLine; });

  var branches = [];
  var current = { edits: [], rewindNote: null };

  for (var i = 0; i < sorted.length; i++) {
    var edit = sorted[i];
    var rewindAfter = findRewindAfterEdit(edit.line, rwSorted);
    current.edits.push(edit);
    if (rewindAfter) {
      current.rewindNote = rewindAfter;
      branches.push(current);
      current = { edits: [], rewindNote: null };
    }
  }
  if (current.edits.length > 0) { branches.push(current); }

  var kept = [];
  for (var b = 0; b < branches.length; b++) {
    for (var e = 0; e < branches[b].edits.length; e++) {
      var ed = branches[b].edits[e];
      if (!unified.isLineIgnoredByRewind(ed.line, rewinds)) { kept.push(ed); }
    }
  }

  return { branches: branches, kept: kept, rewinds: rewinds, total: sorted.length };
}

function formatBranch(branch, idx) {
  var parts = [];
  for (var i = 0; i < branch.edits.length; i++) {
    var e = branch.edits[i];
    parts.push(getEditLabel(e) + ' (L' + e.line + ')');
  }
  var line = '  branch ' + (idx + 1) + ': ' + parts.join(', ');
  if (branch.rewindNote) {
    var cls = branch.rewindNote.classification;
    line += ' → rewind (' + cls + ') to L' + branch.rewindNote.parentLine;
  }
  return line;
}

function formatSummary(result, targetFile) {
  var lines = [];
  lines.push('=== ' + targetFile + ' ===');
  lines.push('detected ' + result.branches.length + ' branch segment(s), ' + result.rewinds.length + ' rewind(s):');
  lines.push('');
  for (var b = 0; b < result.branches.length; b++) {
    lines.push(formatBranch(result.branches[b], b));
  }
  lines.push('');
  var keptLabels = result.kept.map(function(e) { return getEditLabel(e) + '(L' + e.line + ')'; });
  lines.push('File summation (' + result.kept.length + '/' + result.total + ' kept):');
  lines.push('  ' + keptLabels.join(' + '));
  return lines.join('\n');
}

function listTargets(jsonlText) {
  var edits = extractEditsFromJSONL(jsonlText);
  var seen = {};
  for (var i = 0; i < edits.length; i++) {
    var fp = edits[i].filePath || edits[i].file || '';
    if (fp) { seen[fp] = true; }
  }
  return Object.keys(seen);
}

function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node branch-summary.js <jsonl-path> [target-file]');
    process.exit(1);
  }
  var jsonlText = fs.readFileSync(args[0], 'utf8');
  var targets = args[1] ? [args[1]] : listTargets(jsonlText);

  for (var t = 0; t < targets.length; t++) {
    var result = buildBranches(jsonlText, targets[t]);
    if (!result) { continue; }
    console.log(formatSummary(result, targets[t]));
    console.log('');
  }
}

if (require.main === module) { main(); }
module.exports = { buildBranches: buildBranches, formatSummary: formatSummary };
