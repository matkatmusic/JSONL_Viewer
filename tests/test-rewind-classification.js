// Tests for api/rewind-classification.js — which edits survived
// code-restoration rewinds. Granular coverage for the snapshot-window helpers,
// rewind detection signals, and the kept/ignored classification that every
// reconstruction consumer depends on.

var assert = require('assert');
var h = require('./test-helpers');
var rw = require('../api/rewind-classification');

console.log('\nsnapshot/write neighborhood queries:');

h.run('test_findLastSnapBefore_picksNearestEarlierSnapshot', function () {
  var snaps = [{ line: 2 }, { line: 5 }, { line: 9 }];
  assert.strictEqual(rw.findLastSnapBefore(snaps, 6).line, 5);
  assert.strictEqual(rw.findLastSnapBefore(snaps, 2), null);
});

h.run('test_findFirstSnapAfter_picksSnapshotAtOrAfterLine', function () {
  var snaps = [{ line: 2 }, { line: 5 }, { line: 9 }];
  assert.strictEqual(rw.findFirstSnapAfter(snaps, 6).line, 9);
  assert.strictEqual(rw.findFirstSnapAfter(snaps, 5).line, 5);
  assert.strictEqual(rw.findFirstSnapAfter(snaps, 10), null);
});

h.run('test_hasWriteBetween_isStrictlyBetween', function () {
  var writes = [{ line: 4 }];
  assert.strictEqual(rw.hasWriteBetween(writes, 2, 6), true);
  assert.strictEqual(rw.hasWriteBetween(writes, 4, 6), false);
  assert.strictEqual(rw.hasWriteBetween(writes, 2, 4), false);
});

console.log('\nfindBackwardJump:');

h.run('test_findBackwardJump_walksParentChainToEarlyLine', function () {
  var parsed = [
    { uuid: 'u0' },
    { uuid: 'u1', parentUuid: 'u0' },
    { uuid: 'u2', parentUuid: 'u1' },
    { uuid: 'u3', parentUuid: 'u2' },
    { uuid: 'u4', parentUuid: 'u5' },
    { uuid: 'u5', parentUuid: 'u1' }
  ];
  var uuidToIdx = {};
  for (var i = 0; i < parsed.length; i++) { uuidToIdx[parsed[i].uuid] = i; }
  assert.strictEqual(rw.findBackwardJump(parsed, uuidToIdx, 5), 1);
});

h.run('test_findBackwardJump_returnsMinusOneWithoutBackwardLink', function () {
  var parsed = [
    { uuid: 'u0' },
    { uuid: 'u1', parentUuid: 'u0' },
    { uuid: 'u2', parentUuid: 'u1' },
    { uuid: 'u3', parentUuid: 'u2' }
  ];
  var uuidToIdx = {};
  for (var i = 0; i < parsed.length; i++) { uuidToIdx[parsed[i].uuid] = i; }
  assert.strictEqual(rw.findBackwardJump(parsed, uuidToIdx, 3), -1);
});

console.log('\nclassifyRewindType:');

h.run('test_classifyRewindType_backupVersionSignalMeansCodeRestoration', function () {
  var snaps = [{ line: 2, files: { 'f.js': { version: 2, backup: null } } }];
  var r = rw.classifyRewindType(snaps, [], 5);
  assert.strictEqual(r.classification, 'code-restoration');
  assert.strictEqual(r.snapBefore.line, 2);
});

h.run('test_classifyRewindType_noSignalsMeansConversationOnly', function () {
  var snaps = [{ line: 2, files: { 'f.js': { version: 1, backup: 'bk' } } }];
  var r = rw.classifyRewindType(snaps, [], 5);
  assert.strictEqual(r.classification, 'conversation-only');
});

h.run('test_classifyRewindType_snapshotChangeWithoutWriteMeansCodeRestoration', function () {
  var snaps = [
    { line: 1, files: { 'f.js': { version: 1, backup: 'bk' } } },
    { line: 4, files: { 'f.js': { version: 2, backup: 'bk2' } } }
  ];
  var r = rw.classifyRewindType(snaps, [], 6);
  assert.strictEqual(r.classification, 'code-restoration');
});

h.run('test_classifyRewindType_snapshotChangeExplainedByWriteIsConversationOnly', function () {
  var snaps = [
    { line: 1, files: { 'f.js': { version: 1, backup: 'bk' } } },
    { line: 4, files: { 'f.js': { version: 2, backup: 'bk2' } } }
  ];
  var writes = [{ line: 3 }];
  var r = rw.classifyRewindType(snaps, writes, 6);
  assert.strictEqual(r.classification, 'conversation-only');
});

console.log('\ndetectRewinds:');

h.run('test_detectRewinds_flagsPromptWhoseParentIsFarBehindHighWater', function () {
  var prompts = [
    { line: 8, parentLine: 7, text: 'normal', uuid: 'p1', parentUuid: 'a7' },
    { line: 10, parentLine: 2, text: 'rewind', uuid: 'p2', parentUuid: 'a2' }
  ];
  var rewinds = rw.detectRewinds(prompts, [], {}, [], []);
  assert.strictEqual(rewinds.length, 1);
  assert.strictEqual(rewinds[0].landingLine, 10);
  assert.strictEqual(rewinds[0].parentLine, 2);
  assert.strictEqual(rewinds[0].classification, 'conversation-only');
});

h.run('test_detectRewinds_forwardOnlyConversationHasNoRewinds', function () {
  var prompts = [
    { line: 2, parentLine: 1, text: 'a', uuid: 'p1', parentUuid: 'a1' },
    { line: 5, parentLine: 4, text: 'b', uuid: 'p2', parentUuid: 'a4' }
  ];
  var rewinds = rw.detectRewinds(prompts, [], {}, [], []);
  assert.strictEqual(rewinds.length, 0);
});

console.log('\nanalyzeJSONL / classifyEdits:');

// Transcript shape: prompt A, create edit, prompt C (forward), snapshot with a
// backup-version code-restoration signal, rewind prompt B back to A, re-create.
function buildRewindTranscript(snapshotFiles) {
  return [
    JSON.stringify({ uuid: 'pa', type: 'user', message: { content: 'start' } }),
    JSON.stringify({ uuid: 'a1', type: 'assistant' }),
    JSON.stringify({
      uuid: 'e1', type: 'assistant',
      toolUseResult: { type: 'create', filePath: '/tmp/f.js', content: 'one' }
    }),
    JSON.stringify({ uuid: 'a2', type: 'assistant' }),
    JSON.stringify({ uuid: 'a3', type: 'assistant' }),
    JSON.stringify({ uuid: 'pc', type: 'user', parentUuid: 'a3', message: { content: 'go on' } }),
    JSON.stringify({
      uuid: 's1', type: 'file-history-snapshot',
      snapshot: { messageId: 'm1', trackedFileBackups: snapshotFiles }
    }),
    JSON.stringify({ uuid: 'a4', type: 'assistant' }),
    JSON.stringify({ uuid: 'pb', type: 'user', parentUuid: 'pa', message: { content: 'rewind' } }),
    JSON.stringify({
      uuid: 'e2', type: 'assistant',
      toolUseResult: { type: 'create', filePath: '/tmp/f.js', content: 'two' }
    })
  ].join('\n');
}

h.run('test_analyzeJSONL_codeRestorationRewindIgnoresEarlierEdit', function () {
  var text = buildRewindTranscript({ 'f.js': { version: 2 } });
  var result = rw.analyzeJSONL(text);
  assert.strictEqual(result.rewinds.length, 1);
  assert.strictEqual(result.rewinds[0].classification, 'code-restoration');
  assert.strictEqual(result.rewinds[0].landingLine, 8);
  assert.strictEqual(result.edits.length, 2);
  assert.strictEqual(result.edits[0].line, 3);
  assert.strictEqual(result.edits[0].status, 'ignored');
  assert.strictEqual(result.edits[1].line, 10);
  assert.strictEqual(result.edits[1].status, 'kept');
});

h.run('test_analyzeJSONL_conversationOnlyRewindKeepsAllEdits', function () {
  var text = buildRewindTranscript({ 'f.js': { version: 1, backupFileName: 'bk' } });
  var result = rw.analyzeJSONL(text);
  assert.strictEqual(result.rewinds.length, 1);
  assert.strictEqual(result.rewinds[0].classification, 'conversation-only');
  assert.strictEqual(result.edits[0].status, 'kept');
  assert.strictEqual(result.edits[1].status, 'kept');
});

h.run('test_classifyEdits_formatsOneLinePerFileModifyingEvent', function () {
  var text = buildRewindTranscript({ 'f.js': { version: 2 } });
  var out = rw.classifyEdits(text);
  assert.strictEqual(out, '3: ignored create f.js\n10: kept create f.js');
});

h.summary();
