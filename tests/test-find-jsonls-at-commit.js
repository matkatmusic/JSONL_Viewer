var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var t = require('../tools/find-jsonls-at-commit');

run('test_parseRenameHistory_extractsOldAndNewNamesFromRenameLines', function () {
  // Behavior: parseRenameHistory(stdout) → { pairs:[{old,new}] newest-first, names:Set }.
  // Step: parse one rename line plus an unrelated modify line.
  var out = t.parseRenameHistory('R100\tsrc/old.js\tsrc/new.js\nM\tsrc/new.js\n');
  // Step: assert both the old and new repo-relative names are captured.
  assert.ok(out.names.has('src/old.js'));
  assert.ok(out.names.has('src/new.js'));
});

run('test_pickCurrentPath_returnsMostRecentRenameTarget', function () {
  // Behavior: `git log --follow` is newest-first, so the first rename's `new` is today's name.
  // Step: history shows b→c (most recent) then a→b (older).
  var hist = t.parseRenameHistory('R100\tb.js\tc.js\nR100\ta.js\tb.js\n');
  // Step: assert the current name is c.js.
  assert.strictEqual(t.pickCurrentPath(hist, 'a.js'), 'c.js');
});

run('test_pickCurrentPath_fallsBackToInputPathWhenNoRenames', function () {
  // Behavior: with no rename in history, the current name is just the input path.
  // Step: history with only a modify line.
  var hist = t.parseRenameHistory('M\ta.js\n');
  // Step: assert the input path is returned unchanged.
  assert.strictEqual(t.pickCurrentPath(hist, 'a.js'), 'a.js');
});

runWithContext('test_computeOnDisk_returnsTrueForExistingPath', function (ctx) {
  // Behavior: computeOnDisk(absPath) is true when the file exists.
  var fs = require('fs'), path = require('path');
  // Step: create a real temp file in an auto-cleaned dir.
  var dir = ctx.tempDir('rev2-');
  var present = path.join(dir, 'here.js');
  fs.writeFileSync(present, 'x');
  // Step: assert it reports on-disk.
  assert.strictEqual(t.computeOnDisk(present), true);
});

runWithContext('test_computeOnDisk_returnsFalseForMissingPath', function (ctx) {
  // Behavior: computeOnDisk(absPath) is false when the file does not exist.
  var path = require('path');
  // Step: point at a path inside an auto-cleaned dir that was never created.
  var dir = ctx.tempDir('rev3-');
  // Step: assert it reports removed.
  assert.strictEqual(t.computeOnDisk(path.join(dir, 'gone.js')), false);
});

run('test_gitFollowHistory_returnsEmptyStringOnNonRepo', function () {
  // Behavior: the git wrapper degrades gracefully (returns '' rather than throwing) on a bad repo.
  // Step: call against a nonexistent repo path.
  // Step: assert empty string, not an exception.
  assert.strictEqual(t.gitFollowHistory('/nonexistent-repo', 'x.js'), '');
});

runWithContext('test_gitFollowHistory_discoversGitMvHistoryOnRealRepo', function (ctx) {
  // Behavior (INTEGRATION, guarded like test-git-file-state.js's jot guard): a real `git mv` is
  // visible in --follow history. Skips cleanly if git is unavailable.
  var cp = require('child_process'), fs = require('fs'), path = require('path');
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
  var parsed = t.parseRenameHistory(t.gitFollowHistory(repo, 'b.js'));
  assert.ok(parsed.names.has('a.js'), 'old name a.js should appear in --follow history');
});

h.summary();
