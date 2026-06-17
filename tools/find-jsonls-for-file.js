#!/usr/bin/env node
// Tool 1: find JSONL transcripts that touched a given on-disk file path,
// following rename/move/copy lineage so the answer survives renames.
// Includes subagent transcripts (<project>/<sessionDir>/subagents/agent-*.jsonl);
// a parent session's main jsonl and its subagents sort adjacently.
//
// The input path is only a lineage key — it need not still exist on disk.
// Output (JSON to stdout):
//   { filename: <input path>, referencedIn:[<jsonl abs path>, ...] }

var path, os, findReferencingJsonlsIncludingSubagents;
if (typeof module !== 'undefined' && typeof require === 'function') {
  path = require('path');
  os = require('os');
  findReferencingJsonlsIncludingSubagents =
    require('../api/subagent-transcript-discovery').findReferencingJsonlsIncludingSubagents;
}

var ARG_MAP = { '--path': 'path', '--projects-dir': 'projectsDir' };

// Apply one CLI argument to the options object; return the advanced index.
function applyArg(opts, argv, i) {
  var key = ARG_MAP[argv[i]];
  if (!key) { return i; }
  if (i + 1 >= argv.length) { return i; }
  opts[key] = argv[i + 1];
  return i + 1;
}

// Parse argv into { path, projectsDir }.
function parseArgs(argv) {
  var opts = { path: '', projectsDir: '' };
  for (var i = 0; i < argv.length; i++) {
    i = applyArg(opts, argv, i);
  }
  return opts;
}

// Default Claude projects directory (~/.claude/projects).
function defaultProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Print an error to stderr and exit non-zero.
function fail(message) {
  console.error('Error: ' + message);
  console.error('Usage: find-jsonls-for-file.js --path <abs-path> [--projects-dir <dir>]');
  process.exit(1);
}

// CLI entry point.
function main() {
  var opts = parseArgs(process.argv.slice(2));
  if (!opts.path) { return fail('missing --path'); }
  var target = path.resolve(opts.path);
  var projectsDir = opts.projectsDir || defaultProjectsDir();
  var referencedIn = findReferencingJsonlsIncludingSubagents([target], projectsDir);
  console.log(JSON.stringify({ filename: opts.path, referencedIn: referencedIn }, null, 2));
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseArgs: parseArgs };
}
