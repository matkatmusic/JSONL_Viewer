var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var ct = require('../common/collect-touches');

run('test_collectTouches_includesReadOnlyFileNeverWritten', function () {
  // Behavior: a file the session only READ (never created/edited) still counts as a touch.
  // This is the regression guard against the extractEditsFromJSONL reads-filter gotcha.
  // Step: build a session that reads /repo/only-read.js and nothing else.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeReadToolUse('t1', '/repo/only-read.js'),
    h.makeReadToolResult('t1', '1\thello\n')
  ].join('\n');
  // Step: collect touches and assert the read path is present.
  var paths = ct.collectTouches(jsonl).touches.map(function (t) { return t.path; });
  assert.ok(paths.indexOf('/repo/only-read.js') >= 0);
});

run('test_collectTouches_capturesCreateAbsolutePath', function () {
  // Behavior: a Write/create operation records a touch at the file's absolute path.
  // Step: a session that creates /repo/a.js.
  var jsonl = [h.makeSystemLine('s1', 'main', '/repo'), h.makeCreateLine('/repo/a.js', 'x')].join('\n');
  // Step: assert the created path appears in touches.
  assert.ok(ct.collectTouches(jsonl).touches.some(function (t) { return t.path === '/repo/a.js'; }));
});

run('test_collectTouches_capturesCatReadWhenFileNeverWritten', function () {
  // Behavior: a `cat file` read is a touch even with no Write (cat is unfiltered, unlike Read tool).
  // Step: a session that only cats /repo/c.js.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCatToolUse('t1', '/repo/c.js'),
    h.makeBashCatToolResult('t1', '1\tfoo\n')
  ].join('\n');
  // Step: assert the cat'd path appears in touches.
  assert.ok(ct.collectTouches(jsonl).touches.some(function (t) { return t.path === '/repo/c.js'; }));
});

run('test_collectTouches_resolvesRelativeMvAgainstSessionCwd', function () {
  // Behavior: a bash `mv` with relative args is resolved to absolute paths using the session cwd.
  // Step: session cwd is /repo/sub and it runs `mv old.js new.js`.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo/sub'),
    h.makeBashCommandLine('t1', 'mv old.js new.js')
  ].join('\n');
  // Step: assert the op's src and dst were joined onto the cwd.
  var op = ct.collectTouches(jsonl).ops[0];
  assert.strictEqual(op.type, 'mv');
  assert.strictEqual(op.src, '/repo/sub/old.js');
  assert.strictEqual(op.dst, '/repo/sub/new.js');
});

run('test_buildLineageGraph_mvCreatesBidirectionalEdge', function () {
  // Behavior: a `mv` op links src and dst as the SAME identity in both directions.
  // Step: build a graph from one mv op.
  var g = ct.buildLineageGraph([{ type: 'mv', src: '/a', dst: '/b' }]);
  // Step: assert both directions are present.
  assert.ok(g['/a'].has('/b'));
  assert.ok(g['/b'].has('/a'));
});

run('test_buildLineageGraph_cpEdgePointsDestToSourceOnly', function () {
  // Behavior: a `cp` op is directional (copy→source): from dst you reach src, but not src→dst.
  // Step: build a graph from one cp op.
  var g = ct.buildLineageGraph([{ type: 'cp', src: '/a', dst: '/b' }]);
  // Step: assert dst reaches source.
  assert.ok(g['/b'].has('/a'));
  // Step: assert source does NOT reach dst.
  assert.ok(!g['/a'] || !g['/a'].has('/b'));
});

run('test_resolveAliases_followsThreeHopRenameChain', function () {
  // Behavior: querying the newest name reaches every prior name through transitive mv links.
  // Step: build a chain A→B→C.
  var g = ct.buildLineageGraph([
    { type: 'mv', src: '/A', dst: '/B' },
    { type: 'mv', src: '/B', dst: '/C' }
  ]);
  // Step: resolve aliases seeded from /C and assert all three names are included.
  var aliases = ct.resolveAliases(['/C'], g);
  assert.ok(aliases.has('/A'));
  assert.ok(aliases.has('/B'));
  assert.ok(aliases.has('/C'));
});

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
  var out = ct.findReferencingJsonls(['/repo/new.js'], dir);
  assert.ok(out.some(function (p) { return p.indexOf('sess_old.jsonl') >= 0; }));
});

// ─── loadAllJsonlFilesInProjectsFolder + optional cache param (v2 refactor R2) ─

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
  var cache = ct.loadAllJsonlFilesInProjectsFolder(dir);
  assert.strictEqual(cache.length, 2);
  assert.ok(cache[0].touches.length > 0);
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
  var withoutCache = ct.findReferencingJsonls(['/repo/new.js'], dir);
  var withCache = ct.findReferencingJsonls(['/repo/new.js'], dir, ct.loadAllJsonlFilesInProjectsFolder(dir));
  assert.deepStrictEqual(withCache, withoutCache);
  assert.ok(withCache.length > 0);
});

// ─── Read vs write touch kinds (v2 target enumeration depends on these) ──────

run('test_collectTouches_catOnlyFileTouchKindIsRead', function () {
  // Behavior: `cat file` observes content, it does not author it — its touch
  // kind must be 'read', never 'write'. (v2 enumerates ONLY authored files;
  // a cat-only file showing kind 'write' would wrongly become a probe target.)
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCatToolUse('t1', '/repo/only-cat.js'),
    h.makeBashCatToolResult('t1', '1\tfoo\n')
  ].join('\n');
  var touches = ct.collectTouches(jsonl).touches.filter(function (t) { return t.path === '/repo/only-cat.js'; });
  assert.ok(touches.length > 0);
  touches.forEach(function (t) { assert.strictEqual(t.kind, 'read'); });
});

run('test_collectTouches_readSourcedUpdateEditTouchKindIsRead', function () {
  // Behavior: the Read tool's content checkpoint (an 'update' edit with
  // source:'read') is an observation, not authorship — kind 'read'.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/written.js', 'x'),
    h.makeReadToolUse('t1', '/repo/written.js'),
    h.makeReadToolResult('t1', '1\tx\n')
  ].join('\n');
  var touches = ct.collectTouches(jsonl).touches.filter(function (t) { return t.path === '/repo/written.js'; });
  var kinds = touches.map(function (t) { return t.kind; }).sort();
  // One authored write (the create) and read observations — never a second 'write'.
  assert.strictEqual(kinds.filter(function (k) { return k === 'write'; }).length, 1);
});

// ─── Timestamp-carrying touches (foundation for global ordering) ─────────────

run('test_collectTouches_carriesRecordTimestampOnTouch', function () {
  // Behavior: each touch carries the ISO timestamp of its JSONL record, so touches
  // can be ordered GLOBALLY across transcripts (not just by line within one file).
  // Step: a create record that carries a top-level timestamp (as real transcripts do).
  var createWithTs = JSON.stringify({
    uuid: 'u1', type: 'assistant', timestamp: '2026-01-01T00:00:00.000Z',
    toolUseResult: { type: 'create', filePath: '/repo/a.js', content: 'x', structuredPatch: [], originalFile: null, userModified: false }
  });
  var jsonl = [h.makeSystemLine('s1', 'main', '/repo'), createWithTs].join('\n');
  // Step: the touch for /repo/a.js carries that exact timestamp.
  var touches = ct.collectTouches(jsonl).touches.filter(function (t) { return t.path === '/repo/a.js'; });
  assert.ok(touches.length > 0);
  assert.strictEqual(touches[0].timestamp, '2026-01-01T00:00:00.000Z');
});

h.summary();
