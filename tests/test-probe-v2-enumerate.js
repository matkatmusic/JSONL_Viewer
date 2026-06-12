// Tests for tools/probe-projects-v2.js — Phase A (once-per-run scan) and
// Phase B (file-identity enumeration).

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;

var v2 = require('../tools/probe-projects-v2');

// ─── Phase A: scanProjectsFolderOnce ─────────────────────────────────────────

runWithContext('test_scanProjectsFolderOnce_returnsSharedLookupStructures', function (ctx) {
  // Behavior: ONE scan of the projects folder yields every shared structure the
  // per-file loop needs: the loaded JSONL data, the rename graph, the
  // path-history index, and the decoded project roots.
  var fs = require('fs'), path = require('path');
  // Step: a projects folder with one project ("-repo" decodes to /repo) holding
  // one transcript that creates /repo/a.js.
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 's.jsonl'), [
    h.makeSystemLine('s', 'main', '/repo'),
    h.makeCreateLine('/repo/a.js', 'x')
  ].join('\n'));
  // Step: scan once and assert each structure is present and populated.
  var scan = v2.scanProjectsFolderOnce(dir);
  assert.strictEqual(scan.allJsonlFiles.length, 1);
  assert.ok(scan.samePathGraph && typeof scan.samePathGraph === 'object');
  assert.ok(Array.isArray(scan.pathHistoryIndex.touchesByPath['/repo/a.js']));
  assert.deepStrictEqual(scan.projectRoots, ['/repo']);
});

// ─── Phase B: enumerateFileIdentities ────────────────────────────────────────

runWithContext('test_enumerateFileIdentities_samePathAcrossTwoTranscriptsIsOneIdentity', function (ctx) {
  // Behavior: the same absolute path authored in TWO transcripts is ONE file
  // identity, not two.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo'); fs.mkdirSync(proj);
  // Step: two transcripts both write /repo/a.js.
  fs.writeFileSync(path.join(proj, 's1.jsonl'),
    [h.makeSystemLine('s1', 'main', '/repo'), h.makeCreateLine('/repo/a.js', 'x')].join('\n'));
  fs.writeFileSync(path.join(proj, 's2.jsonl'),
    [h.makeSystemLine('s2', 'main', '/repo'), h.makeEditLine('/repo/a.js', 'x', 'y')].join('\n'));
  // Step: exactly one identity, keyed by the path.
  var scan = v2.scanProjectsFolderOnce(dir);
  var identities = v2.enumerateFileIdentities(scan.allJsonlFiles, scan.samePathGraph);
  assert.strictEqual(identities.length, 1);
  assert.strictEqual(identities[0].identityKey, '/repo/a.js');
});

runWithContext('test_enumerateFileIdentities_recordedMvSpansBothPathsAsOneIdentity', function (ctx) {
  // Behavior: a recorded `mv old new` makes the old and new paths ONE identity
  // whose aliasPaths contains both.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo'); fs.mkdirSync(proj);
  // Step: one transcript creates old.js and renames it; another edits new.js.
  fs.writeFileSync(path.join(proj, 's1.jsonl'), [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/old.js', 'x'),
    h.makeBashCommandLine('t1', 'mv /repo/old.js /repo/new.js')
  ].join('\n'));
  fs.writeFileSync(path.join(proj, 's2.jsonl'),
    [h.makeSystemLine('s2', 'main', '/repo'), h.makeEditLine('/repo/new.js', 'x', 'y')].join('\n'));
  // Step: ONE identity spanning both paths, keyed by the smallest alias path.
  var scan = v2.scanProjectsFolderOnce(dir);
  var identities = v2.enumerateFileIdentities(scan.allJsonlFiles, scan.samePathGraph);
  assert.strictEqual(identities.length, 1);
  assert.deepStrictEqual(identities[0].aliasPaths, ['/repo/new.js', '/repo/old.js']);
  assert.strictEqual(identities[0].identityKey, '/repo/new.js');
});

runWithContext('test_enumerateFileIdentities_readOnlyPathIsNotATarget', function (ctx) {
  // Behavior: a path the sessions only ever READ has nothing to replay and is
  // NOT enumerated as a target identity.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo'); fs.mkdirSync(proj);
  // Step: one transcript writes /repo/a.js and only reads /repo/lib.js.
  fs.writeFileSync(path.join(proj, 's1.jsonl'), [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/a.js', 'x'),
    h.makeReadToolUse('t1', '/repo/lib.js'),
    h.makeReadToolResult('t1', '1\tlib\n')
  ].join('\n'));
  // Step: only the written file is an identity.
  var scan = v2.scanProjectsFolderOnce(dir);
  var identities = v2.enumerateFileIdentities(scan.allJsonlFiles, scan.samePathGraph);
  assert.deepStrictEqual(identities.map(function (i) { return i.identityKey; }), ['/repo/a.js']);
});

runWithContext('test_enumerateFileIdentities_catOnlyPathIsNotATarget', function (ctx) {
  // Behavior: a file the sessions only ever `cat`-ed (observed, never authored)
  // is NOT enumerated — same rule as Read-tool-only files.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo'); fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 's1.jsonl'), [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/a.js', 'x'),
    h.makeBashCatToolUse('t1', '/repo/observed.js'),
    h.makeBashCatToolResult('t1', '1\tfoo\n')
  ].join('\n'));
  var scan = v2.scanProjectsFolderOnce(dir);
  var identities = v2.enumerateFileIdentities(scan.allJsonlFiles, scan.samePathGraph);
  assert.deepStrictEqual(identities.map(function (i) { return i.identityKey; }), ['/repo/a.js']);
});

// ─── Phase B: buildPerTranscriptEdits ────────────────────────────────────────

runWithContext('test_buildPerTranscriptEdits_computesEditsAndKeptStatusOncePerTranscript', function (ctx) {
  // Behavior: every transcript gets its full edit list and kept/ignored status
  // lookup computed exactly once, keyed by transcript path, reusable across all
  // file identities.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo'); fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 's1.jsonl'),
    [h.makeSystemLine('s1', 'main', '/repo'), h.makeCreateLine('/repo/a.js', 'x')].join('\n'));
  // Step: one entry per transcript with edits and a statusByLine lookup.
  var scan = v2.scanProjectsFolderOnce(dir);
  var perTranscript = v2.buildPerTranscriptEdits(scan.allJsonlFiles);
  var transcriptPath = path.join(proj, 's1.jsonl');
  assert.ok(perTranscript[transcriptPath]);
  assert.strictEqual(perTranscript[transcriptPath].edits.length, 1);
  assert.strictEqual(perTranscript[transcriptPath].edits[0].filePath, '/repo/a.js');
  assert.ok(typeof perTranscript[transcriptPath].statusByLine === 'object');
});

h.summary();
