#!/usr/bin/env node
// Reconstruct a file by replaying kept edits from multiple JSONL transcripts.
//
// Usage:
//   node reconstruct.js --jsonl a.jsonl --jsonl b.jsonl --file <filename> [--output <path>] [--verify <path>] [--json]
//
// Transcripts are processed in the order given. The first transcript must
// contain a "create" or "update" edit that seeds the file content; subsequent
// transcripts apply their kept "edit" operations on top.

var fs = require('fs');
var replay = require('../common/replay-edits');
var classify = require('../common/classify-edits');

// Map of flags that take a value to their opts property name.
var VALUE_FLAGS = { '--file': 'file', '--output': 'output', '--verify': 'verify' };

// Apply a single --flag value pair to opts. Returns new index or -1.
function applyValueFlag(argv, i, opts) {
  if (i + 1 >= argv.length) {
    return -1;
  }
  if (argv[i] === '--jsonl') {
    opts.jsonlFiles.push(argv[i + 1]);
    return i + 1;
  }
  var prop = VALUE_FLAGS[argv[i]];
  if (prop) {
    opts[prop] = argv[i + 1];
    return i + 1;
  }
  return -1;
}

// Parse a single flag from argv at position i. Returns new index or -1.
function parseFlag(argv, i, opts) {
  if (argv[i] === '--json') {
    opts.json = true;
    return i;
  }
  return applyValueFlag(argv, i, opts);
}

function parseArgs(argv) {
  var opts = { jsonlFiles: [], file: '', output: '', verify: '', json: false };
  for (var i = 0; i < argv.length; i++) {
    var next = parseFlag(argv, i, opts);
    if (next >= 0) {
      i = next;
    }
  }
  return opts;
}

// Build a status lookup from classification edits.
function buildStatusLookup(classification) {
  var statusByLine = {};
  for (var c = 0; c < classification.edits.length; c++) {
    statusByLine[classification.edits[c].line] = classification.edits[c].status;
  }
  return statusByLine;
}

// Filter edits for a target file into kept/ignored buckets.
function filterEditsForFile(allEdits, statusByLine, targetFile) {
  var kept = [];
  var ignored = 0;
  for (var i = 0; i < allEdits.length; i++) {
    if (allEdits[i].file !== targetFile) {
      continue;
    }
    if (statusByLine[allEdits[i].line + 1] === 'ignored') {
      ignored++;
    } else {
      kept.push(allEdits[i]);
    }
  }
  return { kept: kept, ignored: ignored, total: kept.length + ignored };
}

function extractKeptEditsForFile(jsonlPath, targetFile) {
  var text = fs.readFileSync(jsonlPath, 'utf8');
  var allEdits = replay.extractEditsFromJSONL(text);
  var classification = classify.analyzeJSONL(text);
  var statusByLine = buildStatusLookup(classification);
  return filterEditsForFile(allEdits, statusByLine, targetFile);
}

// Collect kept edits and summaries across all JSONL files.
function collectEditsFromTranscripts(jsonlFiles, targetFile) {
  var allKept = [];
  var summary = [];
  for (var i = 0; i < jsonlFiles.length; i++) {
    var result = extractKeptEditsForFile(jsonlFiles[i], targetFile);
    allKept = allKept.concat(result.kept);
    summary.push({
      jsonl: jsonlFiles[i],
      total: result.total,
      kept: result.kept.length,
      ignored: result.ignored
    });
  }
  return { allKept: allKept, summary: summary };
}

// Output JSON format result.
function outputJson(opts, content, summary, allKept, lines) {
  var out = { file: opts.file, transcripts: summary, totalKeptEdits: allKept.length, chars: content.length, lines: lines };
  if (opts.verify) {
    var disk = fs.readFileSync(opts.verify, 'utf8');
    out.match = content === disk;
  }
  out.content = content;
  console.log(JSON.stringify(out, null, 2));
}

// Verify replayed content against on-disk file.
function verifyContent(content, verifyPath) {
  var disk = fs.readFileSync(verifyPath, 'utf8');
  var match = content === disk;
  console.error('Verify: ' + (match ? 'MATCH' : 'MISMATCH'));
  if (!match) {
    process.exit(1);
  }
}

// Write output file with diff reporting.
function writeOutputFile(content, outputPath, lines) {
  if (fs.existsSync(outputPath)) {
    var existing = fs.readFileSync(outputPath, 'utf8');
    if (existing === content) {
      console.error('Diff: IDENTICAL to existing ' + outputPath);
    } else {
      var existingLines = existing.split('\n').length;
      console.error('Diff: CHANGED vs existing ' + outputPath + ' (' + existingLines + ' lines -> ' + lines + ' lines)');
    }
  }
  fs.writeFileSync(outputPath, content);
  console.error('Wrote ' + outputPath);
}

// Print transcript summaries to stderr.
function printSummary(summary, totalKept, content, lines) {
  for (var s = 0; s < summary.length; s++) {
    var t = summary[s];
    console.error(t.jsonl + ': ' + t.kept + ' kept, ' + t.ignored + ' ignored');
  }
  console.error(totalKept + ' total kept edits -> ' + content.length + ' chars, ' + lines + ' lines');
}

// Output text format result.
function outputText(opts, content, summary, allKept, lines) {
  printSummary(summary, allKept.length, content, lines);
  if (opts.verify) {
    verifyContent(content, opts.verify);
  }
  if (opts.output) {
    writeOutputFile(content, opts.output, lines);
  } else if (!opts.verify) {
    process.stdout.write(content);
  }
}

// Validate parsed args or exit with usage message.
function validateArgs(opts) {
  if (opts.jsonlFiles.length === 0 || !opts.file) {
    console.error('Usage:');
    console.error('  node reconstruct.js --jsonl <file> [--jsonl <file> ...] --file <filename> [--output <path>] [--verify <path>] [--json]');
    process.exit(1);
  }
}

function main() {
  var opts = parseArgs(process.argv.slice(2));
  validateArgs(opts);
  var collected = collectEditsFromTranscripts(opts.jsonlFiles, opts.file);
  var content = replay.replayEdits(collected.allKept);
  var lines = content.split('\n').length;
  if (opts.json) {
    outputJson(opts, content, collected.summary, collected.allKept, lines);
  } else {
    outputText(opts, content, collected.summary, collected.allKept, lines);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractKeptEditsForFile: extractKeptEditsForFile };
