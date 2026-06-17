#!/usr/bin/env node
// Tests for api/git-file-state — git-related file resolution for JSONL replay,
// plus the git-rename lineage helpers (parseRenameHistory / pickCurrentPath /
// gitFollowHistory / computeOnDisk) merged in (Phase 5) from
// tools/find-jsonls-at-commit.js (their tests moved here with them).

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;

// extractSessionMetadata moved to api/transcript-parsers.js; its tests live in
// tests/test-transcript-parsers.js now.

console.log('\ncomputeRepoRelativePath:');

run('test_computeRepoRelativePath_stripsRepoRoot', function() {
  // Behavior: strips the repo root prefix from an absolute file path.
  var git = require('../api/git-file-state');
  var result = git.computeRepoRelativePath('/Users/dev/myrepo/src/app.py', '/Users/dev/myrepo');
  assert.strictEqual(result, 'src/app.py');
});

run('test_computeRepoRelativePath_handlesDockerPaths', function() {
  // Behavior: handles /home/user/repo/ Docker-origin paths.
  var git = require('../api/git-file-state');
  var result = git.computeRepoRelativePath('/home/user/repo/src/main.py', '/home/user/repo');
  assert.strictEqual(result, 'src/main.py');
});

run('test_computeRepoRelativePath_returnsNullForOutsidePaths', function() {
  // Behavior: returns null when the file is not under the repo root.
  var git = require('../api/git-file-state');
  var result = git.computeRepoRelativePath('/tmp/other/file.py', '/Users/dev/myrepo');
  assert.strictEqual(result, null);
});

run('test_computeRepoRelativePath_handlesTrailingSlashOnRoot', function() {
  // Behavior: handles repo root with trailing slash.
  var git = require('../api/git-file-state');
  var result = git.computeRepoRelativePath('/Users/dev/repo/lib/x.js', '/Users/dev/repo/');
  assert.strictEqual(result, 'lib/x.js');
});

console.log('\nbuildFilePathMap:');

run('test_buildFilePathMap_mapsBasenameToFirstSeenPath', function() {
  // Behavior: builds a map from basename to the first absolute path seen.
  var git = require('../api/git-file-state');
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
  var git = require('../api/git-file-state');
  var result = git.gitShowFile('/nonexistent-repo', 'main', 'nofile.txt');
  assert.strictEqual(result, null);
});

console.log('\nresolveGitContent:');

run('test_resolveGitContent_returnsNullWhenNoBranch', function() {
  // Behavior: returns null when gitBranch is null/empty.
  var git = require('../api/git-file-state');
  var map = { 'f.py': '/Users/dev/repo/src/f.py' };
  var result = git.resolveGitContent('f.py', map, '/Users/dev/repo', null);
  assert.strictEqual(result, null);
});

run('test_resolveGitContent_returnsNullWhenFileNotInMap', function() {
  // Behavior: returns null when the basename is not in the file path map.
  var git = require('../api/git-file-state');
  var result = git.resolveGitContent('missing.py', {}, '/Users/dev/repo', 'main');
  assert.strictEqual(result, null);
});

run('test_resolveGitContent_returnsNullWhenPathOutsideRepo', function() {
  // Behavior: returns null when the file path is outside the repo root.
  var git = require('../api/git-file-state');
  var map = { 'f.py': '/tmp/other/f.py' };
  var result = git.resolveGitContent('f.py', map, '/Users/dev/repo', 'main');
  assert.strictEqual(result, null);
});

console.log('\nresolveGitContentMultiRef:');

run('test_resolveGitContentMultiRef_triesRefsInOrder', function() {
  // Behavior: tries each ref in order, returns content from the first that works.
  // We can't mock git, but we can verify it returns null for bad refs
  // and that it accepts the refs array parameter correctly.
  var git = require('../api/git-file-state');
  var map = { 'f.py': '/nonexistent/repo/f.py' };
  var result = git.resolveGitContentMultiRef('f.py', map, '/nonexistent/repo', ['badref1', 'badref2']);
  assert.strictEqual(result, null);
});

run('test_resolveGitContentMultiRef_returnsNullForEmptyRefs', function() {
  // Behavior: returns null when refs array is empty.
  var git = require('../api/git-file-state');
  var map = { 'f.py': '/Users/dev/repo/f.py' };
  var result = git.resolveGitContentMultiRef('f.py', map, '/Users/dev/repo', []);
  assert.strictEqual(result, null);
});

run('test_resolveGitContentMultiRef_returnsNullWhenFileNotInMap', function() {
  // Behavior: returns null when basename is not in the file path map.
  var git = require('../api/git-file-state');
  var result = git.resolveGitContentMultiRef('missing.py', {}, '/Users/dev/repo', ['main']);
  assert.strictEqual(result, null);
});

console.log('\nbuildMultiRefs:');

run('test_buildMultiRefs_includesBranchAndOriginAndFallbacks', function() {
  // Behavior: given a session branch, produces a list of refs to try:
  // the branch itself, origin/<branch>, HEAD, main, master.
  var git = require('../api/git-file-state');
  var refs = git.buildMultiRefs('feature/login');
  assert.strictEqual(refs[0], 'feature/login');
  assert.strictEqual(refs[1], 'origin/feature/login');
  assert.ok(refs.indexOf('HEAD') >= 0);
  assert.ok(refs.indexOf('main') >= 0);
  assert.ok(refs.indexOf('master') >= 0);
});

run('test_buildMultiRefs_deduplicatesMainBranch', function() {
  // Behavior: when the session branch IS 'main', don't list 'main' twice.
  var git = require('../api/git-file-state');
  var refs = git.buildMultiRefs('main');
  var mainCount = refs.filter(function(r) { return r === 'main'; }).length;
  assert.strictEqual(mainCount, 1);
});

run('test_buildMultiRefs_returnsNullBranchFallbacks', function() {
  // Behavior: when branch is null, still returns fallback refs (HEAD, main, master).
  var git = require('../api/git-file-state');
  var refs = git.buildMultiRefs(null);
  assert.ok(refs.length >= 3);
  assert.ok(refs.indexOf('HEAD') >= 0);
  assert.ok(refs.indexOf('main') >= 0);
  assert.ok(refs.indexOf('master') >= 0);
});

console.log('\nresolveRepoRootWalkingUp:');

run('test_resolveRepoRootWalkingUp_returnsNullForNonexistentPath', function() {
  // Behavior: returns null when no parent directory is a git repo.
  var git = require('../api/git-file-state');
  var result = git.resolveRepoRootWalkingUp('/nonexistent/deeply/nested/path');
  assert.strictEqual(result, null);
});

run('test_resolveRepoRootWalkingUp_returnsNullForNull', function() {
  // Behavior: returns null for null input.
  var git = require('../api/git-file-state');
  var result = git.resolveRepoRootWalkingUp(null);
  assert.strictEqual(result, null);
});

run('test_resolveRepoRootWalkingUp_findsParentGitRepo', function() {
  // Behavior: walks up from a nonexistent child path and finds the nearest git repo.
  // Use the actual jot repo as a known-good test case.
  var fs = require('fs');
  var git = require('../api/git-file-state');
  var jotPath = '/Users/matkatmusicllc/Programming/jot';
  if (!fs.existsSync(jotPath)) {
    console.log('    (skipped: jot repo not present)');
    return;
  }
  var result = git.resolveRepoRootWalkingUp(jotPath + '/nonexistent-subdir/deep/path');
  assert.ok(result !== null, 'should find a repo root');
  assert.ok(result.indexOf('jot') >= 0, 'should be the jot repo');
});

// ─── git-rename lineage helpers (merged from find-jsonls-at-commit, Phase 5) ──

console.log('\nparseRenameHistory:');

run('test_parseRenameHistory_extractsOldAndNewNamesFromRenameLines', function () {
  // Behavior: parseRenameHistory(stdout) → { pairs:[{old,new}] newest-first, names:Set }.
  // Step: parse one rename line plus an unrelated modify line.
  var git = require('../api/git-file-state');
  var out = git.parseRenameHistory('R100\tsrc/old.js\tsrc/new.js\nM\tsrc/new.js\n');
  // Step: assert both the old and new repo-relative names are captured.
  assert.ok(out.names.has('src/old.js'));
  assert.ok(out.names.has('src/new.js'));
});

console.log('\npickCurrentPath:');

run('test_pickCurrentPath_returnsMostRecentRenameTarget', function () {
  // Behavior: `git log --follow` is newest-first, so the first rename's `new` is today's name.
  // Step: history shows b→c (most recent) then a→b (older).
  var git = require('../api/git-file-state');
  var hist = git.parseRenameHistory('R100\tb.js\tc.js\nR100\ta.js\tb.js\n');
  // Step: assert the current name is c.js.
  assert.strictEqual(git.pickCurrentPath(hist, 'a.js'), 'c.js');
});

run('test_pickCurrentPath_fallsBackToInputPathWhenNoRenames', function () {
  // Behavior: with no rename in history, the current name is just the input path.
  // Step: history with only a modify line.
  var git = require('../api/git-file-state');
  var hist = git.parseRenameHistory('M\ta.js\n');
  // Step: assert the input path is returned unchanged.
  assert.strictEqual(git.pickCurrentPath(hist, 'a.js'), 'a.js');
});

console.log('\ncomputeOnDisk:');

runWithContext('test_computeOnDisk_returnsTrueForExistingPath', function (ctx) {
  // Behavior: computeOnDisk(absPath) is true when the file exists.
  var fs = require('fs'), path = require('path');
  var git = require('../api/git-file-state');
  // Step: create a real temp file in an auto-cleaned dir.
  var dir = ctx.tempDir('rev2-');
  var present = path.join(dir, 'here.js');
  fs.writeFileSync(present, 'x');
  // Step: assert it reports on-disk.
  assert.strictEqual(git.computeOnDisk(present), true);
});

runWithContext('test_computeOnDisk_returnsFalseForMissingPath', function (ctx) {
  // Behavior: computeOnDisk(absPath) is false when the file does not exist.
  var path = require('path');
  var git = require('../api/git-file-state');
  // Step: point at a path inside an auto-cleaned dir that was never created.
  var dir = ctx.tempDir('rev3-');
  // Step: assert it reports removed.
  assert.strictEqual(git.computeOnDisk(path.join(dir, 'gone.js')), false);
});

console.log('\ngitFollowHistory:');

run('test_gitFollowHistory_returnsEmptyStringOnNonRepo', function () {
  // Behavior: the git wrapper degrades gracefully (returns '' rather than throwing) on a bad repo.
  // Step: call against a nonexistent repo path; assert empty string, not an exception.
  var git = require('../api/git-file-state');
  assert.strictEqual(git.gitFollowHistory('/nonexistent-repo', 'x.js'), '');
});

runWithContext('test_gitFollowHistory_discoversGitMvHistoryOnRealRepo', function (ctx) {
  // Behavior (INTEGRATION, guarded like the jot guard above): a real `git mv` is
  // visible in --follow history. Skips cleanly if git is unavailable.
  var cp = require('child_process'), fs = require('fs'), path = require('path');
  var git = require('../api/git-file-state');
  // Step: skip when git is not installed (before creating any temp dir).
  try { cp.execSync('git --version', { stdio: 'ignore' }); } catch (e) { console.log('    (skipped: git unavailable)'); return; }
  // Step: build a temp repo (auto-cleaned), commit a.js, then `git mv a.js b.js` and commit.
  var repo = ctx.tempDir('rev-git-');
  var q = function (c) { cp.execSync(c, { cwd: repo, stdio: 'ignore' }); };
  q('git init');
  q('git config user.email t@t');
  q('git config user.name t');
  fs.writeFileSync(path.join(repo, 'a.js'), 'x');
  q('git add a.js');
  q('git commit -m one');
  q('git mv a.js b.js');
  q('git commit -m two');
  // Step: follow history of the NEW name and assert the OLD name a.js is discovered.
  var parsed = git.parseRenameHistory(git.gitFollowHistory(repo, 'b.js'));
  assert.ok(parsed.names.has('a.js'), 'old name a.js should appear in --follow history');
});

h.summary();
