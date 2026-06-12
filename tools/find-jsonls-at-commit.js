#!/usr/bin/env node
// Tool 2: find JSONL transcripts that touched a file identified by a git
// repo + commit + repo-relative path-at-that-commit, following rename/move/copy
// lineage. Also reports whether the file still exists on disk (onDisk) and its
// current name after any renames (currentPath).
//
// Rename discovery = git --follow history UNIONED with JSONL bash-op lineage.
// Output (JSON to stdout):
//   { filename, currentPath, onDisk, referencedIn:[<jsonl abs path>, ...] }

var fs, path, os, cp, resolveRepoRootWalkingUp, findReferencingJsonls;
if (typeof module !== 'undefined' && typeof require === 'function') {
  fs = require('fs');
  path = require('path');
  os = require('os');
  cp = require('child_process');
  resolveRepoRootWalkingUp = require('../common/git-file-state').resolveRepoRootWalkingUp;
  findReferencingJsonls = require('../common/collect-touches').findReferencingJsonls;
}

// ─── Pure parsing / decision logic (unit-tested without fixtures) ────────────

// True when a git --name-status code marks a rename (R) or copy (C).
function isRenameOrCopy(status) {
  if (!status) { return false; }
  if (status.charAt(0) === 'R') { return true; }
  if (status.charAt(0) === 'C') { return true; }
  return false;
}

// True when a status code marks a single-path change (add/modify/delete).
function isSinglePathStatus(status) {
  if (!status) { return false; }
  var c = status.charAt(0);
  if (c === 'A') { return true; }
  if (c === 'M') { return true; }
  if (c === 'D') { return true; }
  return false;
}

// Record a rename/copy line's old+new names into pairs and the names set.
function addRenamePair(fields, pairs, names) {
  if (fields.length < 3) { return; }
  pairs.push({ old: fields[1], new: fields[2] });
  names.add(fields[1]);
  names.add(fields[2]);
}

// Classify one --name-status line, mutating pairs/names accordingly.
function classifyHistoryLine(line, pairs, names) {
  var fields = line.split('\t');
  var status = fields[0];
  if (isRenameOrCopy(status)) { addRenamePair(fields, pairs, names); return; }
  if (fields.length < 2) { return; }
  if (!isSinglePathStatus(status)) { return; }
  names.add(fields[1]);
}

// Parse `git log --follow --name-status` stdout into rename history.
// Returns { pairs:[{old,new}] newest-first, names:Set<repo-relative path> }.
function parseRenameHistory(stdout) {
  var pairs = [];
  var names = new Set();
  var lines = (stdout || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    classifyHistoryLine(lines[i], pairs, names);
  }
  return { pairs: pairs, names: names };
}

// The file's current (newest) name: the most-recent rename target, or — when
// there were no renames — the input path unchanged. History is newest-first.
function pickCurrentPath(hist, inputRelPath) {
  if (hist.pairs.length === 0) { return inputRelPath; }
  return hist.pairs[0].new;
}

// ─── Impure I/O wrappers (isolated) ─────────────────────────────────────────

// Run `git log --all --follow --name-status` for relPath, returning raw stdout.
// execFileSync (not a shell string) so odd path characters cannot inject.
// Returns '' on any failure (e.g. not a repo) rather than throwing.
function gitFollowHistory(repoRoot, relPath) {
  try {
    return cp.execFileSync(
      'git',
      ['-C', repoRoot, 'log', '--all', '--follow', '--name-status', '--format=%H', '--', relPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (e) {
    return '';
  }
}

// True when absPath currently exists on disk.
function computeOnDisk(absPath) {
  return fs.existsSync(absPath);
}

// Validate that a commit resolves in the repo. Returns true/false.
function validateCommit(repoRoot, commit) {
  try {
    cp.execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', commit], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Orchestration ──────────────────────────────────────────────────────────

// Build the seed alias paths: the absolute path-at-hash unioned with every
// git-history rename variant mapped to absolute. Deduplicated.
function buildSeeds(hist, repoRoot, absAtHash) {
  var seeds = [absAtHash];
  var names = Array.from(hist.names);
  for (var i = 0; i < names.length; i++) {
    var abs = path.join(repoRoot, names[i]);
    if (seeds.indexOf(abs) < 0) { seeds.push(abs); }
  }
  return seeds;
}

// Default Claude projects directory (~/.claude/projects).
function defaultProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Compute the full Tool 2 result object for the given inputs.
function computeResult(repoRoot, relPath, projectsDir) {
  var absAtHash = path.join(repoRoot, relPath);
  var hist = parseRenameHistory(gitFollowHistory(repoRoot, relPath));
  var seeds = buildSeeds(hist, repoRoot, absAtHash);
  var currentPath = path.join(repoRoot, pickCurrentPath(hist, relPath));
  return {
    filename: relPath,
    currentPath: currentPath,
    onDisk: computeOnDisk(currentPath),
    referencedIn: findReferencingJsonls(seeds, projectsDir)
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

var ARG_MAP = { '--repo': 'repo', '--commit': 'commit', '--path': 'path', '--projects-dir': 'projectsDir' };

// Apply one CLI argument to the options object; return the advanced index.
function applyArg(opts, argv, i) {
  var key = ARG_MAP[argv[i]];
  if (!key) { return i; }
  if (i + 1 >= argv.length) { return i; }
  opts[key] = argv[i + 1];
  return i + 1;
}

// Parse argv into { repo, commit, path, projectsDir }.
function parseArgs(argv) {
  var opts = { repo: '', commit: '', path: '', projectsDir: '' };
  for (var i = 0; i < argv.length; i++) {
    i = applyArg(opts, argv, i);
  }
  return opts;
}

// Print an error to stderr and exit non-zero.
function fail(message) {
  console.error('Error: ' + message);
  console.error('Usage: find-jsonls-at-commit.js --repo <dir> --commit <hash> --path <repo-relative-path> [--projects-dir <dir>]');
  process.exit(1);
}

// CLI entry point.
function main() {
  var opts = parseArgs(process.argv.slice(2));
  if (!opts.repo) { return fail('missing --repo'); }
  if (!opts.commit) { return fail('missing --commit'); }
  if (!opts.path) { return fail('missing --path'); }
  var repoRoot = resolveRepoRootWalkingUp(opts.repo);
  if (!repoRoot) { return fail('not a git repository: ' + opts.repo); }
  if (!validateCommit(repoRoot, opts.commit)) { return fail('bad commit: ' + opts.commit); }
  var projectsDir = opts.projectsDir || defaultProjectsDir();
  console.log(JSON.stringify(computeResult(repoRoot, opts.path, projectsDir), null, 2));
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseRenameHistory: parseRenameHistory,
    pickCurrentPath: pickCurrentPath,
    gitFollowHistory: gitFollowHistory,
    computeOnDisk: computeOnDisk
  };
}
