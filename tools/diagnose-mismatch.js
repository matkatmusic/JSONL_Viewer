#!/usr/bin/env node
// Diagnose MISMATCH failures from probe-results.json.
// Shows per-file: edit count, comparison source, content length delta,
// and whether the unified engine produces a different result.
//
// Usage: node diagnose-mismatch.js [--limit N]

var fs = require('fs');
var path = require('path');

function parseArgs(argv) {
  var opts = { limit: 20 };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && i + 1 < argv.length) { opts.limit = parseInt(argv[++i], 10); }
  }
  return opts;
}

function loadProbeResults() {
  var p = path.join(__dirname, 'probe-results.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectMismatches(data) {
  var mismatches = [];
  for (var i = 0; i < data.projects.length; i++) {
    var proj = data.projects[i];
    if (!proj.files) { continue; }
    for (var j = 0; j < proj.files.length; j++) {
      var f = proj.files[j];
      if (f.status === 'MISMATCH') {
        mismatches.push({
          project: proj.project, filename: f.filename, jsonlFile: f.jsonlFile,
          totalEdits: f.totalEdits, kept: f.kept, ignored: f.ignored,
          comparedVia: f.comparedVia, reason: f.reason
        });
      }
    }
  }
  return mismatches;
}

function summarizeByDimension(mismatches, key) {
  var counts = {};
  for (var i = 0; i < mismatches.length; i++) {
    var val = mismatches[i][key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

function formatCounts(label, counts) {
  var parts = [];
  var keys = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
  for (var i = 0; i < keys.length; i++) {
    parts.push(keys[i] + '=' + counts[i]);
  }
  return label + ': ' + parts.join(', ');
}

function main() {
  var opts = parseArgs(process.argv.slice(2));
  var data = loadProbeResults();
  var mismatches = collectMismatches(data);

  console.log('Total MISMATCH: ' + mismatches.length);
  console.log('');

  var byVia = summarizeByDimension(mismatches, 'comparedVia');
  console.log('By comparison source:');
  var viaKeys = Object.keys(byVia).sort(function(a, b) { return byVia[b] - byVia[a]; });
  for (var i = 0; i < viaKeys.length; i++) {
    console.log('  ' + viaKeys[i] + ': ' + byVia[viaKeys[i]]);
  }
  console.log('');

  var byProject = summarizeByDimension(mismatches, 'project');
  console.log('By project:');
  var projKeys = Object.keys(byProject).sort(function(a, b) { return byProject[b] - byProject[a]; });
  for (var j = 0; j < projKeys.length; j++) {
    var name = projKeys[j].replace(/-Users-matkatmusicllc-/, '').replace(/-/g, '/');
    console.log('  ' + name + ': ' + byProject[projKeys[j]]);
  }
  console.log('');

  console.log('Details (first ' + opts.limit + '):');
  for (var k = 0; k < Math.min(opts.limit, mismatches.length); k++) {
    var m = mismatches[k];
    var proj = m.project.replace(/-Users-matkatmusicllc-/, '').replace(/-/g, '/');
    console.log('  ' + proj + '/' + m.filename + '  edits=' + m.totalEdits + ' kept=' + m.kept + ' ign=' + m.ignored + ' via=' + m.comparedVia);
  }
}

if (require.main === module) { main(); }
