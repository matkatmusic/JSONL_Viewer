// Tests for api/file-historical-lineage.js — one file's identity across
// renames/copies/moves: touch collection, the lineage graph, alias resolution,
// and edit↔alias-path membership (editBelongsToFile).

var assert = require('assert');
var os = require('os');
var path = require('path');
var h = require('./test-helpers');
var f = require('./track-line-states-fixtures');
var run = h.run;
var lineage = require('../api/file-historical-lineage');

// ─── Touch collection (moved from tests/test-collect-touches.js) ─────────────

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
  var paths = lineage.collectTouches(jsonl).touches.map(function (t) { return t.path; });
  assert.ok(paths.indexOf('/repo/only-read.js') >= 0);
});

run('test_collectTouches_capturesCreateAbsolutePath', function () {
  // Behavior: a Write/create operation records a touch at the file's absolute path.
  // Step: a session that creates /repo/a.js.
  var jsonl = [h.makeSystemLine('s1', 'main', '/repo'), h.makeCreateLine('/repo/a.js', 'x')].join('\n');
  // Step: assert the created path appears in touches.
  assert.ok(lineage.collectTouches(jsonl).touches.some(function (t) { return t.path === '/repo/a.js'; }));
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
  assert.ok(lineage.collectTouches(jsonl).touches.some(function (t) { return t.path === '/repo/c.js'; }));
});

run('test_collectTouches_resolvesRelativeMvAgainstSessionCwd', function () {
  // Behavior: a bash `mv` with relative args is resolved to absolute paths using the session cwd.
  // Step: session cwd is /repo/sub and it runs `mv old.js new.js`.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo/sub'),
    h.makeBashCommandLine('t1', 'mv old.js new.js')
  ].join('\n');
  // Step: assert the op's src and dst were joined onto the cwd.
  var op = lineage.collectTouches(jsonl).ops[0];
  assert.strictEqual(op.type, 'mv');
  assert.strictEqual(op.src, '/repo/sub/old.js');
  assert.strictEqual(op.dst, '/repo/sub/new.js');
});

run('test_collectTouches_catOnlyFileTouchKindIsRead', function () {
  // Behavior: `cat file` observes content, it does not author it — its touch
  // kind must be 'read', never 'write'. (v2 enumerates ONLY authored files;
  // a cat-only file showing kind 'write' would wrongly become a probe target.)
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCatToolUse('t1', '/repo/only-cat.js'),
    h.makeBashCatToolResult('t1', '1\tfoo\n')
  ].join('\n');
  var touches = lineage.collectTouches(jsonl).touches.filter(function (t) { return t.path === '/repo/only-cat.js'; });
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
  var touches = lineage.collectTouches(jsonl).touches.filter(function (t) { return t.path === '/repo/written.js'; });
  var kinds = touches.map(function (t) { return t.kind; }).sort();
  // One authored write (the create) and read observations — never a second 'write'.
  assert.strictEqual(kinds.filter(function (k) { return k === 'write'; }).length, 1);
});

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
  var touches = lineage.collectTouches(jsonl).touches.filter(function (t) { return t.path === '/repo/a.js'; });
  assert.ok(touches.length > 0);
  assert.strictEqual(touches[0].timestamp, '2026-01-01T00:00:00.000Z');
});

run('test_collectTouches_records_a_resolved_grep_touch_per_matched_file', function () {
  // Behavior: a native Grep (output_mode content, -n) match for a file adds a 'grep' touch
  // at that file's RESOLVED absolute path, so findReferencingJsonls discovers a grepped-only
  // transcript. The grep result carries a timestamp (timestampless results are dropped).
  // Step: a session at cwd /repo that greps and matches relative a.js.
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeGrepToolUse('g1', 'foo'),
    f.withTimestamp(h.makeGrepToolResult('g1', 'a.js:3:foo here', 1, 1), f.TS1)
  ].join('\n');
  var touches = lineage.collectTouches(jsonl).touches.filter(function (t) { return t.kind === 'grep'; });
  // Step: exactly one 'grep' touch at the resolved absolute path.
  assert.strictEqual(touches.length, 1);
  assert.strictEqual(touches[0].path, '/repo/a.js');
  // Step: the touch carries the grep result's timestamp (proving the 0-based line index).
  assert.strictEqual(touches[0].timestamp, f.TS1);
});

// ─── Path resolution (resolveAgainstCwd had no direct coverage before) ───────

run('test_resolveAgainstCwd_returnsAbsolutePathUnchanged', function () {
  // Behavior: an already-absolute path passes through untouched, ignoring cwd.
  assert.strictEqual(lineage.resolveAgainstCwd('/somewhere/else', '/repo/a.js'), '/repo/a.js');
});

run('test_resolveAgainstCwd_joinsRelativePathOntoCwd', function () {
  // Behavior: a relative path resolves against the session cwd.
  assert.strictEqual(lineage.resolveAgainstCwd('/repo/sub', 'lib/a.js'), '/repo/sub/lib/a.js');
});

run('test_resolveAgainstCwd_expandsLeadingTildeToHome', function () {
  // Behavior: a leading "~" expands to the home directory before resolution.
  assert.strictEqual(lineage.resolveAgainstCwd('/repo', '~/a.js'), path.join(os.homedir(), 'a.js'));
});

// ─── Lineage graph (moved from tests/test-collect-touches.js) ────────────────

run('test_buildLineageGraph_mvCreatesBidirectionalEdge', function () {
  // Behavior: a `mv` op links src and dst as the SAME identity in both directions.
  // Step: build a graph from one mv op.
  var g = lineage.buildLineageGraph([{ type: 'mv', src: '/a', dst: '/b' }]);
  // Step: assert both directions are present.
  assert.ok(g['/a'].has('/b'));
  assert.ok(g['/b'].has('/a'));
});

run('test_buildLineageGraph_cpEdgePointsDestToSourceOnly', function () {
  // Behavior: a `cp` op is directional (copy→source): from dst you reach src, but not src→dst.
  // Step: build a graph from one cp op.
  var g = lineage.buildLineageGraph([{ type: 'cp', src: '/a', dst: '/b' }]);
  // Step: assert dst reaches source.
  assert.ok(g['/b'].has('/a'));
  // Step: assert source does NOT reach dst.
  assert.ok(!g['/a'] || !g['/a'].has('/b'));
});

run('test_resolveAliases_followsThreeHopRenameChain', function () {
  // Behavior: querying the newest name reaches every prior name through transitive mv links.
  // Step: build a chain A→B→C.
  var g = lineage.buildLineageGraph([
    { type: 'mv', src: '/A', dst: '/B' },
    { type: 'mv', src: '/B', dst: '/C' }
  ]);
  // Step: resolve aliases seeded from /C and assert all three names are included.
  var aliases = lineage.resolveAliases(['/C'], g);
  assert.ok(aliases.has('/A'));
  assert.ok(aliases.has('/B'));
  assert.ok(aliases.has('/C'));
});

run('test_gatherAllOps_concatenatesOpsAcrossCacheEntries', function () {
  // Behavior: every cached transcript's lineage ops flatten into one array, in
  // cache order. (gatherAllOps had no direct coverage before this suite.)
  var cache = [
    { file: '/p/one.jsonl', touches: [], ops: [{ type: 'mv', src: '/a', dst: '/b' }] },
    { file: '/p/two.jsonl', touches: [], ops: [] },
    { file: '/p/three.jsonl', touches: [], ops: [{ type: 'cp', src: '/c', dst: '/d' }] }
  ];
  var all = lineage.gatherAllOps(cache);
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all[0].src, '/a');
  assert.strictEqual(all[1].type, 'cp');
});

// ─── Edit↔alias-path membership (moved from tests/test-probe-v2-assembly.js) ─

run('test_editBelongsToFile_snapshotEditMatchesByFullPathSuffixNeverBasename', function () {
  // Behavior: snapshot-sourced edits record REPO-RELATIVE paths, so they match
  // by full path-suffix against the alias paths — never by mere basename.
  var aliasPaths = ['/repo/scripts/t.py'];
  var aliasSet = new Set(aliasPaths);
  // Step: a snapshot-sourced edit with a shortened key matches by path suffix.
  var shortened = { filePath: 'scripts/t.py', source: 'snapshot' };
  assert.strictEqual(lineage.editBelongsToFile(shortened, aliasSet, aliasPaths), true);
  // Step: a same-basename key under a DIFFERENT directory does not match.
  var collision = { filePath: 'foo/t.py', source: 'snapshot' };
  assert.strictEqual(lineage.editBelongsToFile(collision, aliasSet, aliasPaths), false);
});

run('test_editBelongsToFile_matchesNonSnapshotEditByExactAbsolutePathOnly', function () {
  // Behavior: a non-snapshot edit belongs only when its FULL absolute path is in
  // the alias set — the suffix fallback is reserved for snapshot-sourced edits.
  var aliasPaths = ['/work/repo/t.py'];
  var aliasSet = new Set(aliasPaths);
  // Step: exact absolute-path membership matches.
  assert.strictEqual(lineage.editBelongsToFile({ filePath: '/work/repo/t.py', source: 'write' }, aliasSet, aliasPaths), true);
  // Step: a relative path that would suffix-match is rejected for non-snapshot sources.
  assert.strictEqual(lineage.editBelongsToFile({ filePath: 'repo/t.py', source: 'write' }, aliasSet, aliasPaths), false);
});

run('test_collectTouches_resolves_a_relative_cat_touch_to_an_absolute_path', function () {
  // Behavior: collectTouches records a cat of a RELATIVE path as a 'read' touch whose path is
  // resolved against the transcript's session cwd (so discovery matches the absolute alias).
  var jsonl = [
    h.makeSystemLine('s1', 'main', '/abs/proj'),
    h.makeBashCatToolUse('t1', 'sub/f.py'),
    h.makeBashCatToolResult('t1', '1\talpha\n')
  ].join('\n');
  var touches = lineage.collectTouches(jsonl).touches;
  var resolved = touches.filter(function (t) { return t.path === '/abs/proj/sub/f.py'; });
  // Step: the resolved absolute path appears (kind 'read'); the raw relative one does not.
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].kind, 'read');
  assert.ok(!touches.some(function (t) { return t.path === 'sub/f.py'; }));
});

run('test_editBelongsToFile_rejectsAliasPathEqualToSuffix', function () {
  // Behavior (spec rule): the matching alias path must be STRICTLY LONGER than
  // '/'+key. An alias exactly equal to the suffix has no leading directory to
  // anchor it, so it is rejected.
  var aliasPaths = ['/repo/t.py'];
  var aliasSet = new Set(aliasPaths);
  // Step: key 'repo/t.py' makes suffix '/repo/t.py' — same length as the alias → no match.
  assert.strictEqual(lineage.editBelongsToFile({ filePath: 'repo/t.py', source: 'snapshot' }, aliasSet, aliasPaths), false);
  // Step: a longer alias /work/repo/t.py anchors the same key → match.
  var longer = ['/work/repo/t.py'];
  assert.strictEqual(lineage.editBelongsToFile({ filePath: 'repo/t.py', source: 'snapshot' }, new Set(longer), longer), true);
});

h.summary();
