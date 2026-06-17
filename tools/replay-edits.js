#!/usr/bin/env node
// CLI for the replay/reconstruction engine. The library logic moved (Phase 5) to
// api/edit-stream-extraction.js, api/edit-replay.js, and api/replay-verification.js
// (common/replay-edits.js is now a tombstone, kept only for its viewer script tag
// until phase 7). This file is a thin CLI over api/replay-verification.
//
// Usage:
//   node replay-edits.js --jsonl <file> [--verify <file>] [--output <path>] [--json]
//   node replay-edits.js --jsonl-dir <path> --files-dir <path>

var fs = require('fs');
var rv = require('../api/replay-verification');

// Map of CLI flag names to their corresponding opts key.
var cliArgMap = { '--jsonl-dir': 'jsonlDir', '--files-dir': 'filesDir', '--jsonl': 'jsonlFile', '--verify': 'verifyFile', '--output': 'outputFile', '--git-repo': 'gitRepo', '--git-branch': 'gitBranch' };

// Apply a single CLI argument to the options object. Returns updated index.
function applyCliArg(opts, argv, i) {
  var key = cliArgMap[argv[i]];
  if (key && i + 1 < argv.length) { opts[key] = argv[++i]; }
  else if (argv[i] === '--json') { opts.jsonFlag = true; }
  return i;
}

// Parse CLI arguments into an options object.
function parseCliArgs(argv) {
  var opts = { jsonlDir: '', filesDir: '', jsonlFile: '', verifyFile: '', outputFile: '', jsonFlag: false, gitRepo: '', gitBranch: '' };
  for (var i = 0; i < argv.length; i++) { i = applyCliArg(opts, argv, i); }
  return opts;
}

// Print verify results in text format to stdout.
function printVerifyText(r) {
  console.log(r.filename + ': ' + (r.match ? 'MATCH' : 'MISMATCH'));
  console.log('  Edits: ' + r.totalEdits + ' total, ' + r.kept + ' kept, ' + r.ignored + ' ignored');
  if (!r.match && r.diff) { console.log(r.diff); }
}

// Run verify mode: replay one transcript and compare against an on-disk file.
function runVerifyMode(jsonlFile, verifyFile, jsonFlag) {
  var jsonlText = fs.readFileSync(jsonlFile, 'utf8');
  var onDiskContent = fs.readFileSync(verifyFile, 'utf8');
  var r = rv.replayAndVerify(jsonlText, onDiskContent, undefined);
  if (jsonFlag) {
    console.log(JSON.stringify({ filename: r.filename, totalEdits: r.totalEdits, kept: r.kept, ignored: r.ignored, match: r.match, replayedContent: r.replayedContent, diff: r.diff }, null, 2));
  } else { printVerifyText(r); }
  process.exit(r.match ? 0 : 1);
}

// Run replay-only mode: replay one transcript and output the content.
function runReplayOnlyMode(jsonlFile, outputFile, jsonFlag) {
  var jsonlText = fs.readFileSync(jsonlFile, 'utf8');
  var r = rv.replayAndVerify(jsonlText, '', undefined);
  if (jsonFlag) {
    console.log(JSON.stringify({ filename: r.filename, totalEdits: r.totalEdits, kept: r.kept, ignored: r.ignored, replayedContent: r.replayedContent }, null, 2));
  } else if (outputFile) {
    fs.writeFileSync(outputFile, r.replayedContent);
    console.log('Wrote ' + r.replayedContent.length + ' bytes to ' + outputFile);
  } else { process.stdout.write(r.replayedContent); }
}

// Run single-file mode: replay and optionally verify.
function runSingleFileMode(opts) {
  if (opts.verifyFile) { runVerifyMode(opts.jsonlFile, opts.verifyFile, opts.jsonFlag); }
  else { runReplayOnlyMode(opts.jsonlFile, opts.outputFile, opts.jsonFlag); }
}

// Run batch mode: verify all JSONL files in a directory against a files dir.
function runBatchMode(opts) {
  var results = rv.batchVerify(opts.jsonlDir, opts.filesDir, opts.gitRepo, opts.gitBranch);
  console.log(rv.formatResults(results));
  var mismatches = results.filter(function (r) { return !r.match; });
  if (mismatches.length > 0) {
    console.log(mismatches.length + ' MISMATCH(ES) found.');
    process.exit(1);
  } else { console.log('All ' + results.length + ' files MATCH.'); }
}

// Print CLI usage message.
function printUsage() {
  console.error('Usage:');
  console.error('  node replay-edits.js --jsonl <file> [--verify <file>] [--output <path>] [--json]');
  console.error('  node replay-edits.js --jsonl-dir <path> --files-dir <path>');
  process.exit(1);
}

// CLI entry point.
function main() {
  var opts = parseCliArgs(process.argv.slice(2));
  if (opts.jsonlFile) { runSingleFileMode(opts); }
  else if (opts.jsonlDir && opts.filesDir) { runBatchMode(opts); }
  else { printUsage(); }
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}
