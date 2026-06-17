// Tests for api/file-path-history.js — the per-run path-history index and the
// earliest/current-path resolvers that back the probe's earliestSeenFullPath
// (first-known path) and lastSeenFullPath (current on-disk path) fields.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var fph = require('../api/file-path-history');

runWithContext('test_buildFilePathHistoryIndex_returnsGraphAndTouchesByPath', function (ctx) {
  // Behavior: the once-per-run index exposes a rename graph and a path→touches map.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj'); fs.mkdirSync(proj);
  // Step: one session creates /repo/a.js.
  fs.writeFileSync(path.join(proj, 's.jsonl'),
    [h.makeSystemLine('s', 'main', '/repo'), h.makeCreateLine('/repo/a.js', 'x')].join('\n'));
  // Step: build the index and assert its shape.
  var index = fph.buildFilePathHistoryIndex(dir);
  assert.ok(index.samePathGraph && typeof index.samePathGraph === 'object');
  assert.ok(index.touchesByPath && Array.isArray(index.touchesByPath['/repo/a.js']));
});

runWithContext('test_findEarliestFilePath_followsRenameToOldestPath', function (ctx) {
  // Behavior: among a file's whole path history (across renames), the earliest-seen
  // absolute path is returned — even when the query uses the file's NEWEST name.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj'); fs.mkdirSync(proj);
  // Step: a session creates /repo/old.js (earliest) then renames it to /repo/new.js.
  fs.writeFileSync(path.join(proj, 's.jsonl'), [
    h.makeSystemLine('s', 'main', '/repo'),
    h.makeCreateLine('/repo/old.js', 'x'),
    h.makeBashCommandLine('t1', 'mv /repo/old.js /repo/new.js')
  ].join('\n'));
  // Step: querying the NEW name resolves back to the original earliest path.
  var index = fph.buildFilePathHistoryIndex(dir);
  assert.strictEqual(fph.findEarliestFilePath(['/repo/new.js'], index), '/repo/old.js');
});

runWithContext('test_findCurrentOnDiskPath_resolvesThroughMvToDestOnDisk', function (ctx) {
  // Behavior: the current on-disk path is found by following renames/moves to wherever
  // the file ACTUALLY exists now — not the original recorded path.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj'); fs.mkdirSync(proj);
  // Step: create a REAL on-disk destination; the source path does not exist on disk.
  var src = path.join(dir, 'src.js');
  var dst = path.join(dir, 'dst.js');
  fs.writeFileSync(dst, 'moved');
  // Step: a session records creating src.js then moving it to dst.js.
  fs.writeFileSync(path.join(proj, 's.jsonl'), [
    h.makeSystemLine('s', 'main', dir),
    h.makeCreateLine(src, 'moved'),
    h.makeBashCommandLine('t1', 'mv ' + src + ' ' + dst)
  ].join('\n'));
  // Step: querying the original src resolves to the on-disk dst.
  var index = fph.buildFilePathHistoryIndex(dir);
  assert.strictEqual(fph.findCurrentOnDiskPath([src], index), dst);
});

runWithContext('test_findCurrentOnDiskPath_returnsEmptyWhenNoAliasOnDisk', function (ctx) {
  // Behavior: when NONE of the file's paths exist on disk (deleted), return "".
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj'); fs.mkdirSync(proj);
  // Step: a session creates a file that is never written to the real filesystem.
  fs.writeFileSync(path.join(proj, 's.jsonl'),
    [h.makeSystemLine('s', 'main', dir), h.makeCreateLine('/nope/gone.js', 'x')].join('\n'));
  // Step: no alias exists on disk ⇒ "".
  var index = fph.buildFilePathHistoryIndex(dir);
  assert.strictEqual(fph.findCurrentOnDiskPath(['/nope/gone.js'], index), '');
});

runWithContext('test_buildFilePathHistoryIndex_acceptsPreloadedJsonlCache', function (ctx) {
  // Behavior (v2 refactor R3): passing the pre-loaded all-JSONL-files cache
  // yields the SAME index as letting the function scan the folder itself —
  // the cache only skips the repeated disk read.
  var fs = require('fs'), path = require('path');
  var td = require('../api/transcript-discovery');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj'); fs.mkdirSync(proj);
  // Step: a session creates a file and renames it, so the index has both a
  // rename edge and touches.
  fs.writeFileSync(path.join(proj, 's.jsonl'), [
    h.makeSystemLine('s', 'main', '/repo'),
    h.makeCreateLine('/repo/old.js', 'x'),
    h.makeBashCommandLine('t1', 'mv /repo/old.js /repo/new.js')
  ].join('\n'));
  // Step: both call forms resolve the same earliest path and same touch map.
  var withoutCache = fph.buildFilePathHistoryIndex(dir);
  var withCache = fph.buildFilePathHistoryIndex(dir, td.loadAllJsonlFilesInProjectsFolder(dir));
  assert.deepStrictEqual(Object.keys(withCache.touchesByPath), Object.keys(withoutCache.touchesByPath));
  assert.strictEqual(
    fph.findEarliestFilePath(['/repo/new.js'], withCache),
    fph.findEarliestFilePath(['/repo/new.js'], withoutCache)
  );
  // Step: PROOF the cache is used, not re-scanned — an EMPTY projects folder
  // plus the populated cache still yields the populated index.
  var emptyDir = ctx.tempDir('rev-empty-');
  var fromCacheOnly = fph.buildFilePathHistoryIndex(emptyDir, td.loadAllJsonlFilesInProjectsFolder(dir));
  assert.ok(Array.isArray(fromCacheOnly.touchesByPath['/repo/old.js']));
});

h.summary();
