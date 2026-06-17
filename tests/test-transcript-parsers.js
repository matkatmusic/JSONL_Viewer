// Tests for api/transcript-parsers.js — raw JSONL text → parsed records and
// session facts. Ported from the jsonl-parse/git-file-state coverage plus new
// granular assertions for the parsing entry points.

var assert = require('assert');
var h = require('./test-helpers');
var parsers = require('../api/transcript-parsers');

console.log('\nparseJSONLLines:');

h.run('test_parseJSONLLines_indexesUuidsSnapshotsAndFileWrites', function () {
  var lines = [
    JSON.stringify({ uuid: 'u1', type: 'assistant' }),
    JSON.stringify({
      uuid: 'u2',
      type: 'file-history-snapshot',
      snapshot: {
        messageId: 'm1',
        trackedFileBackups: { 'a.js': { version: 2, backupFileName: 'bk-1' } }
      }
    }),
    JSON.stringify({
      uuid: 'u3',
      type: 'assistant',
      toolUseResult: { type: 'create', filePath: '/tmp/a.js', content: 'x' }
    })
  ];
  var p = parsers.parseJSONLLines(lines.join('\n'));
  assert.strictEqual(p.parsed.length, 3);
  assert.strictEqual(p.uuidToIdx['u2'], 1);
  assert.strictEqual(p.snapshots.length, 1);
  assert.strictEqual(p.snapshots[0].line, 1);
  assert.strictEqual(p.snapshots[0].msgId, 'm1');
  assert.strictEqual(p.snapshots[0].files['a.js'].version, 2);
  assert.strictEqual(p.snapshots[0].files['a.js'].backup, 'bk-1');
  assert.strictEqual(p.fileWrites.length, 1);
  assert.strictEqual(p.fileWrites[0].line, 2);
  assert.strictEqual(p.fileWrites[0].file, 'a.js');
  assert.strictEqual(p.fileWrites[0].type, 'create');
});

h.run('test_parseJSONLLines_keepsNullForUnparseableLines', function () {
  var text = 'not json at all\n' + JSON.stringify({ uuid: 'u1' });
  var p = parsers.parseJSONLLines(text);
  assert.strictEqual(p.parsed.length, 2);
  assert.strictEqual(p.parsed[0], null);
  assert.strictEqual(p.uuidToIdx['u1'], 1);
});

h.run('test_parseJSONLLines_skipsEmptyLines', function () {
  var text = '\n' + JSON.stringify({ uuid: 'u1' }) + '\n\n';
  var p = parsers.parseJSONLLines(text);
  assert.strictEqual(p.parsed.length, 1);
  assert.strictEqual(p.uuidToIdx['u1'], 0);
});

h.run('test_parseJSONLLines_treatsEditShapedToolUseResultAsFileWrite', function () {
  var line = JSON.stringify({
    uuid: 'u1',
    type: 'assistant',
    toolUseResult: { filePath: '/tmp/b.js', oldString: 'a', newString: 'b' }
  });
  var p = parsers.parseJSONLLines(line);
  assert.strictEqual(p.fileWrites.length, 1);
  assert.strictEqual(p.fileWrites[0].type, 'edit');
  assert.strictEqual(p.fileWrites[0].file, 'b.js');
});

console.log('\nisUserPrompt / extractUserText:');

h.run('test_isUserPrompt_trueForTypedUserMessage', function () {
  var obj = { type: 'user', message: { content: 'hello there' } };
  assert.strictEqual(parsers.isUserPrompt(obj), true);
});

h.run('test_isUserPrompt_falseForToolResultMessage', function () {
  var obj = {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'out' }] }
  };
  assert.strictEqual(parsers.isUserPrompt(obj), false);
});

h.run('test_isUserPrompt_falseForCommandArtifact', function () {
  var obj = { type: 'user', message: { content: '<command-name>/clear</command-name>' } };
  assert.strictEqual(parsers.isUserPrompt(obj), false);
});

h.run('test_isUserPrompt_falseForNonUserType', function () {
  var obj = { type: 'assistant', message: { content: 'hi' } };
  assert.strictEqual(parsers.isUserPrompt(obj), false);
});

h.run('test_extractUserText_readsStringAndArrayContent', function () {
  assert.strictEqual(parsers.extractUserText({ message: { content: 'plain' } }), 'plain');
  var arr = { message: { content: [{ type: 'text', text: 'from array' }] } };
  assert.strictEqual(parsers.extractUserText(arr), 'from array');
});

console.log('\ncollectUserPrompts:');

h.run('test_collectUserPrompts_resolvesParentLines', function () {
  var lines = [
    JSON.stringify({ uuid: 'p1', type: 'user', message: { content: 'first' } }),
    JSON.stringify({ uuid: 'a1', type: 'assistant' }),
    JSON.stringify({ uuid: 'p2', type: 'user', parentUuid: 'a1', message: { content: 'second' } })
  ];
  var p = parsers.parseJSONLLines(lines.join('\n'));
  var prompts = parsers.collectUserPrompts(p.parsed, p.uuidToIdx);
  assert.strictEqual(prompts.length, 2);
  assert.strictEqual(prompts[0].line, 0);
  assert.strictEqual(prompts[0].parentLine, -1);
  assert.strictEqual(prompts[0].text, 'first');
  assert.strictEqual(prompts[1].line, 2);
  assert.strictEqual(prompts[1].parentLine, 1);
  assert.strictEqual(prompts[1].uuid, 'p2');
  assert.strictEqual(prompts[1].parentUuid, 'a1');
});

console.log('\nextractSessionMetadata:');

h.run('test_extractSessionMetadata_findsGitBranchAndCwdFromSystemRecord', function () {
  var jsonl = [
    h.makeNonEditLine(),
    h.makeSystemLine('sess-1', 'feature-x', '/work/repo')
  ].join('\n');
  var meta = parsers.extractSessionMetadata(jsonl);
  assert.strictEqual(meta.gitBranch, 'feature-x');
  assert.strictEqual(meta.cwd, '/work/repo');
  assert.strictEqual(meta.sessionId, 'sess-1');
});

h.run('test_extractSessionMetadata_returnsNullsWhenNoSystemRecord', function () {
  var jsonl = h.makeNonEditLine();
  var meta = parsers.extractSessionMetadata(jsonl);
  assert.strictEqual(meta.gitBranch, null);
  assert.strictEqual(meta.cwd, null);
  assert.strictEqual(meta.sessionId, null);
});

h.summary();
