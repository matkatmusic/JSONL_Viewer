// Tests for tools/probe-projects-v2.js — the per-file record produced by
// probeOneFileIdentity (spec's "record" tests): shape, kept-count consistency,
// and the NOT_FOUND path when no reference source exists.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;

var v2 = require('../tools/probe-projects-v2');

// Stage a projects folder with one transcript and return the pieces the
// per-file probe needs. targetPath's create-content is 'hello'.
function stageSingleCreateFixture(ctx, targetPath) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 's1.jsonl'),
    [h.makeSystemLine('s1', '', '/repo'), h.makeCreateLine(targetPath, 'hello')].join('\n'));
  var scan = v2.scanProjectsFolderOnce(dir);
  return { dir: dir, scan: scan, perTranscriptEdits: v2.buildPerTranscriptEdits(scan.allJsonlFiles) };
}

runWithContext('test_probeOneFileIdentity_passesAgainstOnDiskFileWithFullProvenance', function (ctx) {
  // Behavior: a file whose replay matches its on-disk content yields a PASS
  // record carrying identity, path history, replay stats, and provenance.
  var fs = require('fs'), path = require('path');
  // Step: the target file REALLY exists on disk with the replayed content.
  var realDir = ctx.tempDir('rev-target-');
  var targetPath = path.join(realDir, 'real.js');
  fs.writeFileSync(targetPath, 'hello');
  var fixture = stageSingleCreateFixture(ctx, targetPath);
  // Step: probe the identity directly.
  var identity = { identityKey: targetPath, aliasPaths: [targetPath] };
  var record = v2.probeOneFileIdentity(identity, fixture.scan, fixture.perTranscriptEdits, fixture.dir, null);
  // Step: PASS via on-disk at the file's current path.
  assert.strictEqual(record.status, 'PASS');
  assert.strictEqual(record.comparedVia, 'on-disk');
  assert.strictEqual(record.lastSeenFullPath, targetPath);
  assert.strictEqual(record.referencePath, targetPath);
  // Step: replay stats are populated and consistent.
  assert.strictEqual(record.totalKeptEdits, 1);
  assert.strictEqual(record.replayedChars, 'hello'.length);
  assert.strictEqual(record.dataSources.onDisk.used, true);
  assert.strictEqual(record.snapshotBlob, null);
  assert.strictEqual(record.gitRef, null);
});

runWithContext('test_probeOneFileIdentity_transcriptsUsedKeptCountsSumToTotalKeptEdits', function (ctx) {
  // Behavior: the per-transcript kept counts add up to totalKeptEdits.
  var fs = require('fs'), path = require('path');
  var realDir = ctx.tempDir('rev-target-');
  var targetPath = path.join(realDir, 'real.js');
  fs.writeFileSync(targetPath, 'hello');
  var fixture = stageSingleCreateFixture(ctx, targetPath);
  var identity = { identityKey: targetPath, aliasPaths: [targetPath] };
  var record = v2.probeOneFileIdentity(identity, fixture.scan, fixture.perTranscriptEdits, fixture.dir, null);
  var keptSum = record.transcriptsUsed.reduce(function (sum, t) { return sum + t.kept; }, 0);
  assert.strictEqual(keptSum, record.totalKeptEdits);
  assert.ok(record.transcriptsUsed.length > 0);
});

runWithContext('test_probeOneFileIdentity_noReferenceAnywhereIsNotFound', function (ctx) {
  // Behavior: a deleted file with no snapshot and no git reference yields
  // NOT_FOUND / comparedVia none with a null referencePath.
  var fixture = stageSingleCreateFixture(ctx, '/nope/gone.js');
  var identity = { identityKey: '/nope/gone.js', aliasPaths: ['/nope/gone.js'] };
  var record = v2.probeOneFileIdentity(identity, fixture.scan, fixture.perTranscriptEdits, fixture.dir, null);
  assert.strictEqual(record.status, 'NOT_FOUND');
  assert.strictEqual(record.comparedVia, 'none');
  assert.strictEqual(record.referencePath, null);
  assert.strictEqual(record.lastSeenFullPath, '');
});

runWithContext('test_probeOneFileIdentity_retriesWithoutLossyTrailingCatObservation', function (ctx) {
  // Behavior: a trailing `cat` observation can be lossy (piped/truncated). When
  // the full replay matches NO source but the replay without the trailing
  // observation matches one, the file PASSes and the record says which replay
  // variant verified it.
  var fs = require('fs'), path = require('path');
  // Step: on disk the file holds the AUTHORED content.
  var realDir = ctx.tempDir('rev-target-');
  var targetPath = path.join(realDir, 'real.js');
  fs.writeFileSync(targetPath, 'hello');
  // Step: the transcript authors "hello", then a piped cat captured only "hel".
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 's1.jsonl'), [
    h.makeSystemLine('s1', '', '/repo'),
    h.makeCreateLine(targetPath, 'hello'),
    h.makeBashCatToolUse('t1', targetPath),
    h.makeBashCatToolResult('t1', 'hel')
  ].join('\n'));
  var scan = v2.scanProjectsFolderOnce(dir);
  var perTranscriptEdits = v2.buildPerTranscriptEdits(scan.allJsonlFiles);
  var identity = { identityKey: targetPath, aliasPaths: [targetPath] };
  var record = v2.probeOneFileIdentity(identity, scan, perTranscriptEdits, dir, null);
  assert.strictEqual(record.status, 'PASS');
  assert.strictEqual(record.replayVariant, 'trailing-observations-trimmed');
});

runWithContext('test_probeOneFileIdentity_restoresTrailingNewlineLostByCatCapture', function (ctx) {
  // Behavior: recorded Bash stdout trims a file'\''s final newline, so a cat
  // observation that is the replay'\''s final authority comes up one byte short
  // against the real file. When neither the full nor the trimmed replay
  // matches, retry with the trailing newline restored and record the variant.
  var fs = require('fs'), path = require('path');
  // Step: on disk the file ends WITH a newline.
  var realDir = ctx.tempDir('rev-target-');
  var targetPath = path.join(realDir, 'real.js');
  fs.writeFileSync(targetPath, 'hello\n');
  // Step: the transcript authors "hi" (stale), then cat captured "hello"
  // (current content, newline trimmed by the harness).
  var dir = ctx.tempDir('rev-');
  var proj = path.join(dir, '-repo');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 's1.jsonl'), [
    h.makeSystemLine('s1', '', '/repo'),
    h.makeCreateLine(targetPath, 'hi'),
    h.makeBashCatToolUse('t1', targetPath),
    h.makeBashCatToolResult('t1', 'hello')
  ].join('\n'));
  var scan = v2.scanProjectsFolderOnce(dir);
  var perTranscriptEdits = v2.buildPerTranscriptEdits(scan.allJsonlFiles);
  var identity = { identityKey: targetPath, aliasPaths: [targetPath] };
  var record = v2.probeOneFileIdentity(identity, scan, perTranscriptEdits, dir, null);
  assert.strictEqual(record.status, 'PASS');
  assert.strictEqual(record.replayVariant, 'trailing-newline-restored');
});

runWithContext('test_probeOneFileIdentity_noNewlineRetryWhenFinalEditIsAuthored', function (ctx) {
  // Behavior: the newline retry exists ONLY for observation-final replays (the
  // known lossy capture). When the last edit is AUTHORED and the on-disk file
  // differs by a trailing newline, the file genuinely changed — MISMATCH stands.
  var fs = require('fs'), path = require('path');
  var realDir = ctx.tempDir('rev-target-');
  var targetPath = path.join(realDir, 'real.js');
  fs.writeFileSync(targetPath, 'hello\n');
  var fixture = stageSingleCreateFixture(ctx, targetPath); // authors "hello", no newline
  var identity = { identityKey: targetPath, aliasPaths: [targetPath] };
  var record = v2.probeOneFileIdentity(identity, fixture.scan, fixture.perTranscriptEdits, fixture.dir, null);
  assert.strictEqual(record.status, 'MISMATCH');
  assert.strictEqual(record.replayVariant, 'full');
});

runWithContext('test_probeOneFileIdentity_fullReplayVariantWhenItMatchesDirectly', function (ctx) {
  // Behavior: when the full replay already matches, the variant stays 'full'.
  var fs = require('fs'), path = require('path');
  var realDir = ctx.tempDir('rev-target-');
  var targetPath = path.join(realDir, 'real.js');
  fs.writeFileSync(targetPath, 'hello');
  var fixture = stageSingleCreateFixture(ctx, targetPath);
  var identity = { identityKey: targetPath, aliasPaths: [targetPath] };
  var record = v2.probeOneFileIdentity(identity, fixture.scan, fixture.perTranscriptEdits, fixture.dir, null);
  assert.strictEqual(record.status, 'PASS');
  assert.strictEqual(record.replayVariant, 'full');
});

// Stage one project folder (folderName) holding the given jsonl files
// ({name: [lines]}) inside a fresh projects dir; returns the projects dir.
function stageProjectFolder(ctx, projectsDir, folderName, jsonlFilesByName) {
  var fs = require('fs'), path = require('path');
  var proj = path.join(projectsDir, folderName);
  fs.mkdirSync(proj);
  Object.keys(jsonlFilesByName).forEach(function (name) {
    fs.writeFileSync(path.join(proj, name), jsonlFilesByName[name].join('\n'));
  });
  return projectsDir;
}

runWithContext('test_scanProjectsFolderOnce_derivesProjectRootFromSessionCwdNotFolderName', function (ctx) {
  // Behavior: the project root comes from the transcripts' session cwd —
  // exact, no decoding. The dash-to-slash folder-name decode corrupts roots
  // whose real path contains dashes (or spaces); the session cwd does not.
  var dir = ctx.tempDir('rev-roots-');
  stageProjectFolder(ctx, dir, '-Users-x-my-app', {
    's1.jsonl': [h.makeSystemLine('s1', '', '/Users/x/my-app'), h.makeCreateLine('/Users/x/my-app/a.js', 'hello')]
  });
  var scan = v2.scanProjectsFolderOnce(dir);
  assert.deepStrictEqual(scan.projectRoots, ['/Users/x/my-app']);
});

runWithContext('test_scanProjectsFolderOnce_fallsBackToFolderNameWhenNoTranscriptHasCwd', function (ctx) {
  // Behavior: a project whose transcripts carry no session cwd still gets a
  // root — the decoded folder name, as before.
  var dir = ctx.tempDir('rev-roots-');
  stageProjectFolder(ctx, dir, '-repo', {
    's1.jsonl': [h.makeCreateLine('/repo/a.js', 'hello')]
  });
  var scan = v2.scanProjectsFolderOnce(dir);
  assert.deepStrictEqual(scan.projectRoots, ['/repo']);
});

runWithContext('test_scanProjectsFolderOnce_skipsTranscriptsWithoutCwdUntilOneYieldsIt', function (ctx) {
  // Behavior: transcripts are tried in sorted order; the first non-null cwd
  // wins even when earlier transcripts lack a system record.
  var dir = ctx.tempDir('rev-roots-');
  stageProjectFolder(ctx, dir, '-Users-x-real-root', {
    'a.jsonl': [h.makeCreateLine('/Users/x/real root/a.js', 'hello')],
    'b.jsonl': [h.makeSystemLine('s2', '', '/Users/x/real root'), h.makeCreateLine('/Users/x/real root/b.js', 'hi')]
  });
  var scan = v2.scanProjectsFolderOnce(dir);
  assert.deepStrictEqual(scan.projectRoots, ['/Users/x/real root']);
});

runWithContext('test_scanProjectsFolderOnce_dedupesRootsAcrossFolders', function (ctx) {
  // Behavior: two project folders declaring the same session cwd produce ONE
  // root — isInProject scans the root list per record, so no duplicates.
  var dir = ctx.tempDir('rev-roots-');
  stageProjectFolder(ctx, dir, '-repo', {
    's1.jsonl': [h.makeSystemLine('s1', '', '/repo'), h.makeCreateLine('/repo/a.js', 'hello')]
  });
  stageProjectFolder(ctx, dir, '-repo-old', {
    's2.jsonl': [h.makeSystemLine('s2', '', '/repo'), h.makeCreateLine('/repo/b.js', 'hi')]
  });
  var scan = v2.scanProjectsFolderOnce(dir);
  assert.deepStrictEqual(scan.projectRoots, ['/repo']);
});

runWithContext('test_readExistingMismatches_missingFileYieldsEmptyList', function (ctx) {
  // Behavior: a first run (no mismatches file yet) merges against nothing.
  var path = require('path');
  var missingPath = path.join(ctx.tempDir('rev-mm-'), 'probe-mismatches-v2.json');
  assert.deepStrictEqual(v2.readExistingMismatches(missingPath), []);
});

runWithContext('test_readExistingMismatches_corruptOrNonArrayJsonYieldsEmptyList', function (ctx) {
  // Behavior: unparseable or wrong-shaped content never aborts a probe run —
  // the merge just starts from scratch.
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-mm-');
  var corruptPath = path.join(dir, 'corrupt.json');
  fs.writeFileSync(corruptPath, '{nope');
  assert.deepStrictEqual(v2.readExistingMismatches(corruptPath), []);
  var nonArrayPath = path.join(dir, 'non-array.json');
  fs.writeFileSync(nonArrayPath, '{"a":1}');
  assert.deepStrictEqual(v2.readExistingMismatches(nonArrayPath), []);
});

h.summary();
