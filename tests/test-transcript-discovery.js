var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var td = require('../api/transcript-discovery');

// ─── Project discovery ────────────────────────────────────────────────────────

runWithContext('test_discoverProjects_returnsOnlyDirectoriesContainingJsonlFiles', function (ctx) {
  // Behavior: a "project" is a subdirectory of the projects folder that holds at
  // least one .jsonl file; empty dirs and loose files are not projects.
  var fs = require('fs'), path = require('path');
  // Step: a projects dir with one real project, one jsonl-less dir, one loose file.
  var dir = ctx.tempDir('rev-');
  var projA = path.join(dir, 'projA');
  fs.mkdirSync(projA);
  fs.writeFileSync(path.join(projA, 'a.jsonl'), h.makeSystemLine('a', 'main', '/repo'));
  fs.mkdirSync(path.join(dir, 'projB'));
  fs.writeFileSync(path.join(dir, 'loose.txt'), 'not a project');
  // Step: only projA is discovered, with its dir and jsonl count.
  var projects = td.discoverProjects(dir);
  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].name, 'projA');
  assert.strictEqual(projects[0].dir, projA);
  assert.strictEqual(projects[0].jsonlCount, 1);
});

run('test_cwdFromFolderName_decodesFolderNameToOriginalPath', function () {
  // Behavior: a Claude projects folder name decodes back to the original
  // filesystem path (leading - becomes /, every other - becomes /).
  var result = td.cwdFromFolderName('-Users-matkatmusicllc-Programming-jot');
  assert.strictEqual(result, '/Users/matkatmusicllc/Programming/jot');
});

// ─── JSONL enumeration + loading ─────────────────────────────────────────────

runWithContext('test_enumerateJsonlFiles_listsJsonlsAcrossAllProjectFolders', function (ctx) {
  // Behavior: a flat list of absolute .jsonl paths under every project folder;
  // non-jsonl files are skipped.
  var fs = require('fs'), path = require('path');
  // Step: two projects with one transcript each, plus a non-jsonl file.
  var dir = ctx.tempDir('rev-');
  var projA = path.join(dir, 'projA');
  var projB = path.join(dir, 'projB');
  fs.mkdirSync(projA);
  fs.mkdirSync(projB);
  fs.writeFileSync(path.join(projA, 'a.jsonl'), h.makeSystemLine('a', 'main', '/repo'));
  fs.writeFileSync(path.join(projA, 'notes.txt'), 'skip me');
  fs.writeFileSync(path.join(projB, 'b.jsonl'), h.makeSystemLine('b', 'main', '/repo'));
  // Step: exactly the two transcripts come back, as absolute paths.
  var files = td.enumerateJsonlFiles(dir).sort();
  assert.deepStrictEqual(files, [path.join(projA, 'a.jsonl'), path.join(projB, 'b.jsonl')]);
});

runWithContext('test_collectAllJsonls_returnsOneEntryPerExplicitPath', function (ctx) {
  // Behavior: collectAllJsonls loads an EXPLICIT path list (no enumeration),
  // returning one {file, touches, ops} entry per path.
  var fs = require('fs'), path = require('path');
  // Step: two transcripts written at explicit paths.
  var dir = ctx.tempDir('rev-');
  var fileA = path.join(dir, 'a.jsonl');
  var fileB = path.join(dir, 'b.jsonl');
  fs.writeFileSync(fileA,
    [h.makeSystemLine('a', 'main', '/repo'), h.makeCreateLine('/repo/a.js', 'x')].join('\n'));
  fs.writeFileSync(fileB,
    [h.makeSystemLine('b', 'main', '/repo'), h.makeCreateLine('/repo/b.js', 'y')].join('\n'));
  // Step: each entry carries its source path and that transcript's touches.
  var cache = td.collectAllJsonls([fileA, fileB]);
  assert.strictEqual(cache.length, 2);
  assert.strictEqual(cache[0].file, fileA);
  assert.ok(cache[0].touches.some(function (t) { return t.path === '/repo/a.js'; }));
});

runWithContext('test_loadAllJsonlFilesInProjectsFolder_returnsOneEntryPerTranscript', function (ctx) {
  // Behavior: loadAllJsonlFilesInProjectsFolder does the one-and-only disk read
  // of all transcripts, returning the per-transcript cache collectAllJsonls builds.
  var fs = require('fs'), path = require('path');
  // Step: a projects dir with one project holding two transcripts.
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 'a.jsonl'),
    [h.makeSystemLine('a', 'main', '/repo'), h.makeCreateLine('/repo/a.js', 'x')].join('\n'));
  fs.writeFileSync(path.join(proj, 'b.jsonl'),
    [h.makeSystemLine('b', 'main', '/repo'), h.makeCreateLine('/repo/b.js', 'y')].join('\n'));
  // Step: the cache has one entry per transcript, each with its touches.
  var cache = td.loadAllJsonlFilesInProjectsFolder(dir);
  assert.strictEqual(cache.length, 2);
  assert.ok(cache[0].touches.length > 0);
});

// ─── Reference lookup ────────────────────────────────────────────────────────

runWithContext('test_findReferencingJsonls_returnsSessionThatTouchedPreRenameName', function (ctx) {
  // Behavior (END-TO-END): a session that only ever saw the OLD name is returned when the
  // caller queries the NEW name, because a separate session recorded the rename.
  var fs = require('fs'), path = require('path');
  // Step: create a temp projects dir (auto-cleaned) with two sessions.
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj');
  fs.mkdirSync(proj);
  // Step: session A only creates /repo/old.js (never sees the new name).
  fs.writeFileSync(path.join(proj, 'sess_old.jsonl'),
    [h.makeSystemLine('o', 'main', '/repo'), h.makeCreateLine('/repo/old.js', 'x')].join('\n'));
  // Step: session B records the rename old.js → new.js.
  fs.writeFileSync(path.join(proj, 'sess_rename.jsonl'),
    [h.makeSystemLine('r', 'main', '/repo'), h.makeBashCommandLine('t1', 'mv /repo/old.js /repo/new.js')].join('\n'));
  // Step: query the NEW name and assert the pre-rename session is in the result.
  var out = td.findReferencingJsonls(['/repo/new.js'], dir);
  assert.ok(out.some(function (p) { return p.indexOf('sess_old.jsonl') >= 0; }));
});

runWithContext('test_findReferencingJsonls_withCacheMatchesWithoutCache', function (ctx) {
  // Behavior: passing a pre-built cache to findReferencingJsonls returns the SAME
  // result as the 2-arg form — the cache only skips the repeated disk read.
  var fs = require('fs'), path = require('path');
  // Step: a projects dir where one session creates a file and another renames it.
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, 'proj');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 'sess_old.jsonl'),
    [h.makeSystemLine('o', 'main', '/repo'), h.makeCreateLine('/repo/old.js', 'x')].join('\n'));
  fs.writeFileSync(path.join(proj, 'sess_rename.jsonl'),
    [h.makeSystemLine('r', 'main', '/repo'), h.makeBashCommandLine('t1', 'mv /repo/old.js /repo/new.js')].join('\n'));
  // Step: both call forms return identical transcript lists.
  var withoutCache = td.findReferencingJsonls(['/repo/new.js'], dir);
  var withCache = td.findReferencingJsonls(['/repo/new.js'], dir, td.loadAllJsonlFilesInProjectsFolder(dir));
  assert.deepStrictEqual(withCache, withoutCache);
  assert.ok(withCache.length > 0);
});

// ─── Folder grouping ─────────────────────────────────────────────────────────

run('test_groupFilesByFolder_groupsByDirname', function () {
  // Behavior: loaded transcripts group by their containing project folder.
  var grouped = td.groupFilesByFolder([
    { file: '/projects/-repo/a.jsonl' },
    { file: '/projects/-repo/b.jsonl' },
    { file: '/projects/-other/c.jsonl' }
  ]);
  assert.deepStrictEqual(grouped, {
    '/projects/-repo': ['/projects/-repo/a.jsonl', '/projects/-repo/b.jsonl'],
    '/projects/-other': ['/projects/-other/c.jsonl']
  });
});

h.summary();
