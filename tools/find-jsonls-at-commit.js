#!/usr/bin/env node
// Tool 2: find JSONL transcripts that touched a file identified by a git
// repo + commit + repo-relative path-at-that-commit, following rename/move/copy
// lineage. Also reports whether the file still exists on disk (onDisk) and its
// current name after any renames (currentPath).
//
// Rename discovery = git --follow history UNIONED with JSONL bash-op lineage.
// Output (JSON to stdout):
//   { filename, currentPath, onDisk, referencedIn:[<jsonl abs path>, ...] }

// The git-rename lineage helpers (parseRenameHistory, pickCurrentPath,
// gitFollowHistory, computeOnDisk + their classifiers) and resolveRepoRootWalkingUp
// moved to api/git-file-state.js (Phase 5); imported here. This file is now a
// thin CLI that orchestrates them with findReferencingJsonls.
var path, os, cp, findReferencingJsonls;
var parseRenameHistory, pickCurrentPath, gitFollowHistory, computeOnDisk, resolveRepoRootWalkingUp;
if (typeof module !== 'undefined' && typeof require === 'function') {
  path = require('path');
  os = require('os');
  cp = require('child_process');
  var gfs = require('../api/git-file-state');
  parseRenameHistory = gfs.parseRenameHistory;
  pickCurrentPath = gfs.pickCurrentPath;
  gitFollowHistory = gfs.gitFollowHistory;
  computeOnDisk = gfs.computeOnDisk;
  resolveRepoRootWalkingUp = gfs.resolveRepoRootWalkingUp;
  findReferencingJsonls = require('../api/transcript-discovery').findReferencingJsonls;
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

// No exports: the git-rename lineage helpers' canonical home is
// api/git-file-state.js (Phase 5). This file is a thin CLI (no re-export).
