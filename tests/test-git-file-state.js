#!/usr/bin/env node
// Tests for git-file-state — git-related file resolution for JSONL replay.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;

console.log('\nextractSessionMetadata:');

run('test_extractSessionMetadata_findsGitBranchAndCwdFromSystemRecord', function() {
  // Behavior: given JSONL text with a system record, extract gitBranch and cwd.
  var git = require('../common/git-file-state');
  var jsonl = [
    h.makeNonEditLine(),
    h.makeSystemLine('sess-123', 'feature/login', '/Users/dev/myrepo'),
    h.makeNonEditLine()
  ].join('\n');
  var meta = git.extractSessionMetadata(jsonl);
  assert.strictEqual(meta.gitBranch, 'feature/login');
  assert.strictEqual(meta.cwd, '/Users/dev/myrepo');
  assert.strictEqual(meta.sessionId, 'sess-123');
});

run('test_extractSessionMetadata_returnsNullsWhenNoSystemRecord', function() {
  // Behavior: JSONL with no system record returns nulls.
  var git = require('../common/git-file-state');
  var jsonl = [h.makeNonEditLine(), h.makeNonEditLine()].join('\n');
  var meta = git.extractSessionMetadata(jsonl);
  assert.strictEqual(meta.gitBranch, null);
  assert.strictEqual(meta.cwd, null);
  assert.strictEqual(meta.sessionId, null);
});

console.log('\ncomputeRepoRelativePath:');

run('test_computeRepoRelativePath_stripsRepoRoot', function() {
  // Behavior: strips the repo root prefix from an absolute file path.
  var git = require('../common/git-file-state');
  var result = git.computeRepoRelativePath('/Users/dev/myrepo/src/app.py', '/Users/dev/myrepo');
  assert.strictEqual(result, 'src/app.py');
});

run('test_computeRepoRelativePath_handlesDockerPaths', function() {
  // Behavior: handles /home/user/repo/ Docker-origin paths.
  var git = require('../common/git-file-state');
  var result = git.computeRepoRelativePath('/home/user/repo/src/main.py', '/home/user/repo');
  assert.strictEqual(result, 'src/main.py');
});

run('test_computeRepoRelativePath_returnsNullForOutsidePaths', function() {
  // Behavior: returns null when the file is not under the repo root.
  var git = require('../common/git-file-state');
  var result = git.computeRepoRelativePath('/tmp/other/file.py', '/Users/dev/myrepo');
  assert.strictEqual(result, null);
});

run('test_computeRepoRelativePath_handlesTrailingSlashOnRoot', function() {
  // Behavior: handles repo root with trailing slash.
  var git = require('../common/git-file-state');
  var result = git.computeRepoRelativePath('/Users/dev/repo/lib/x.js', '/Users/dev/repo/');
  assert.strictEqual(result, 'lib/x.js');
});

console.log('\nbuildFilePathMap:');

run('test_buildFilePathMap_mapsBasenameToFirstSeenPath', function() {
  // Behavior: builds a map from basename to the first absolute path seen.
  var git = require('../common/git-file-state');
  var edits = [
    { file: 'app.py', filePath: '/Users/dev/repo/src/app.py' },
    { file: 'app.py', filePath: '/Users/dev/repo/v2/app.py' },
    { file: 'config.json', filePath: '/Users/dev/repo/config.json' }
  ];
  var map = git.buildFilePathMap(edits);
  assert.strictEqual(map['app.py'], '/Users/dev/repo/src/app.py');
  assert.strictEqual(map['config.json'], '/Users/dev/repo/config.json');
});

console.log('\ngitShowFile:');

run('test_gitShowFile_returnsNullOnError', function() {
  // Behavior: returns null when git command fails (bad ref, missing file, not a repo).
  var git = require('../common/git-file-state');
  var result = git.gitShowFile('/nonexistent-repo', 'main', 'nofile.txt');
  assert.strictEqual(result, null);
});

console.log('\nresolveGitContent:');

run('test_resolveGitContent_returnsNullWhenNoBranch', function() {
  // Behavior: returns null when gitBranch is null/empty.
  var git = require('../common/git-file-state');
  var map = { 'f.py': '/Users/dev/repo/src/f.py' };
  var result = git.resolveGitContent('f.py', map, '/Users/dev/repo', null);
  assert.strictEqual(result, null);
});

run('test_resolveGitContent_returnsNullWhenFileNotInMap', function() {
  // Behavior: returns null when the basename is not in the file path map.
  var git = require('../common/git-file-state');
  var result = git.resolveGitContent('missing.py', {}, '/Users/dev/repo', 'main');
  assert.strictEqual(result, null);
});

run('test_resolveGitContent_returnsNullWhenPathOutsideRepo', function() {
  // Behavior: returns null when the file path is outside the repo root.
  var git = require('../common/git-file-state');
  var map = { 'f.py': '/tmp/other/f.py' };
  var result = git.resolveGitContent('f.py', map, '/Users/dev/repo', 'main');
  assert.strictEqual(result, null);
});

console.log('\nresolveGitContentMultiRef:');

run('test_resolveGitContentMultiRef_triesRefsInOrder', function() {
  // Behavior: tries each ref in order, returns content from the first that works.
  // We can't mock git, but we can verify it returns null for bad refs
  // and that it accepts the refs array parameter correctly.
  var git = require('../common/git-file-state');
  var map = { 'f.py': '/nonexistent/repo/f.py' };
  var result = git.resolveGitContentMultiRef('f.py', map, '/nonexistent/repo', ['badref1', 'badref2']);
  assert.strictEqual(result, null);
});

run('test_resolveGitContentMultiRef_returnsNullForEmptyRefs', function() {
  // Behavior: returns null when refs array is empty.
  var git = require('../common/git-file-state');
  var map = { 'f.py': '/Users/dev/repo/f.py' };
  var result = git.resolveGitContentMultiRef('f.py', map, '/Users/dev/repo', []);
  assert.strictEqual(result, null);
});

run('test_resolveGitContentMultiRef_returnsNullWhenFileNotInMap', function() {
  // Behavior: returns null when basename is not in the file path map.
  var git = require('../common/git-file-state');
  var result = git.resolveGitContentMultiRef('missing.py', {}, '/Users/dev/repo', ['main']);
  assert.strictEqual(result, null);
});

console.log('\nbuildMultiRefs:');

run('test_buildMultiRefs_includesBranchAndOriginAndFallbacks', function() {
  // Behavior: given a session branch, produces a list of refs to try:
  // the branch itself, origin/<branch>, HEAD, main, master.
  var git = require('../common/git-file-state');
  var refs = git.buildMultiRefs('feature/login');
  assert.strictEqual(refs[0], 'feature/login');
  assert.strictEqual(refs[1], 'origin/feature/login');
  assert.ok(refs.indexOf('HEAD') >= 0);
  assert.ok(refs.indexOf('main') >= 0);
  assert.ok(refs.indexOf('master') >= 0);
});

run('test_buildMultiRefs_deduplicatesMainBranch', function() {
  // Behavior: when the session branch IS 'main', don't list 'main' twice.
  var git = require('../common/git-file-state');
  var refs = git.buildMultiRefs('main');
  var mainCount = refs.filter(function(r) { return r === 'main'; }).length;
  assert.strictEqual(mainCount, 1);
});

run('test_buildMultiRefs_returnsNullBranchFallbacks', function() {
  // Behavior: when branch is null, still returns fallback refs (HEAD, main, master).
  var git = require('../common/git-file-state');
  var refs = git.buildMultiRefs(null);
  assert.ok(refs.length >= 3);
  assert.ok(refs.indexOf('HEAD') >= 0);
  assert.ok(refs.indexOf('main') >= 0);
  assert.ok(refs.indexOf('master') >= 0);
});

console.log('\nresolveRepoRootWalkingUp:');

run('test_resolveRepoRootWalkingUp_returnsNullForNonexistentPath', function() {
  // Behavior: returns null when no parent directory is a git repo.
  var git = require('../common/git-file-state');
  var result = git.resolveRepoRootWalkingUp('/nonexistent/deeply/nested/path');
  assert.strictEqual(result, null);
});

run('test_resolveRepoRootWalkingUp_returnsNullForNull', function() {
  // Behavior: returns null for null input.
  var git = require('../common/git-file-state');
  var result = git.resolveRepoRootWalkingUp(null);
  assert.strictEqual(result, null);
});

run('test_resolveRepoRootWalkingUp_findsParentGitRepo', function() {
  // Behavior: walks up from a nonexistent child path and finds the nearest git repo.
  // Use the actual jot repo as a known-good test case.
  var fs = require('fs');
  var git = require('../common/git-file-state');
  var jotPath = '/Users/matkatmusicllc/Programming/jot';
  if (!fs.existsSync(jotPath)) {
    console.log('    (skipped: jot repo not present)');
    return;
  }
  var result = git.resolveRepoRootWalkingUp(jotPath + '/nonexistent-subdir/deep/path');
  assert.ok(result !== null, 'should find a repo root');
  assert.ok(result.indexOf('jot') >= 0, 'should be the jot repo');
});

h.summary();
