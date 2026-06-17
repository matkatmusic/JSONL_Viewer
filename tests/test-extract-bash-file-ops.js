// Tests for Bash file operation detection: cp, mv, git mv, rm, redirect.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var summary = h.summary;

var ops = require('../api/extract-bash-file-ops');

console.log('\nunquotePath:');

run('test_unquotePath_stripsDoubleQuotes', function() {
  assert.strictEqual(ops.unquotePath('"foo bar.py"'), 'foo bar.py');
});

run('test_unquotePath_stripsSingleQuotes', function() {
  assert.strictEqual(ops.unquotePath("'foo bar.py'"), 'foo bar.py');
});

run('test_unquotePath_leavesUnquotedAlone', function() {
  assert.strictEqual(ops.unquotePath('foo.py'), 'foo.py');
});

run('test_unquotePath_handlesEmptyString', function() {
  assert.strictEqual(ops.unquotePath(''), '');
});

console.log('\nparseBashCpCommand:');

run('test_parseBashCpCommand_simpleCopy', function() {
  var r = ops.parseBashCpCommand('cp src.py dst.py');
  assert.strictEqual(r.type, 'cp');
  assert.strictEqual(r.src, 'src.py');
  assert.strictEqual(r.dst, 'dst.py');
});

run('test_parseBashCpCommand_withFlags', function() {
  var r = ops.parseBashCpCommand('cp -r src/ dst/');
  assert.strictEqual(r.type, 'cp');
  assert.strictEqual(r.src, 'src/');
  assert.strictEqual(r.dst, 'dst/');
});

run('test_parseBashCpCommand_withMultipleFlags', function() {
  var r = ops.parseBashCpCommand('cp -a -f src.py dst.py');
  assert.strictEqual(r.src, 'src.py');
  assert.strictEqual(r.dst, 'dst.py');
});

run('test_parseBashCpCommand_quotedPaths', function() {
  var r = ops.parseBashCpCommand('cp "src file.py" "dst file.py"');
  assert.strictEqual(r.src, 'src file.py');
  assert.strictEqual(r.dst, 'dst file.py');
});

run('test_parseBashCpCommand_returnsNullForNonCp', function() {
  assert.strictEqual(ops.parseBashCpCommand('mv src.py dst.py'), null);
  assert.strictEqual(ops.parseBashCpCommand('cat file.py'), null);
  assert.strictEqual(ops.parseBashCpCommand('echo hello'), null);
});

run('test_parseBashCpCommand_returnsNullForCpWithoutArgs', function() {
  assert.strictEqual(ops.parseBashCpCommand('cp'), null);
  assert.strictEqual(ops.parseBashCpCommand('cp src.py'), null);
});

console.log('\nparseBashMvCommand:');

run('test_parseBashMvCommand_simpleMv', function() {
  var r = ops.parseBashMvCommand('mv old.py new.py');
  assert.strictEqual(r.type, 'mv');
  assert.strictEqual(r.src, 'old.py');
  assert.strictEqual(r.dst, 'new.py');
});

run('test_parseBashMvCommand_withFlags', function() {
  var r = ops.parseBashMvCommand('mv -f old.py new.py');
  assert.strictEqual(r.src, 'old.py');
  assert.strictEqual(r.dst, 'new.py');
});

run('test_parseBashMvCommand_returnsNullForNonMv', function() {
  assert.strictEqual(ops.parseBashMvCommand('cp a b'), null);
});

console.log('\nparseBashGitMvCommand:');

run('test_parseBashGitMvCommand_simpleGitMv', function() {
  var r = ops.parseBashGitMvCommand('git mv old.py new.py');
  assert.strictEqual(r.type, 'git-mv');
  assert.strictEqual(r.src, 'old.py');
  assert.strictEqual(r.dst, 'new.py');
});

run('test_parseBashGitMvCommand_withFlags', function() {
  var r = ops.parseBashGitMvCommand('git mv -f old.py new.py');
  assert.strictEqual(r.src, 'old.py');
});

run('test_parseBashGitMvCommand_returnsNullForNonGitMv', function() {
  assert.strictEqual(ops.parseBashGitMvCommand('git add file.py'), null);
  assert.strictEqual(ops.parseBashGitMvCommand('mv a b'), null);
});

console.log('\nparseBashRmCommand:');

run('test_parseBashRmCommand_singleFile', function() {
  var r = ops.parseBashRmCommand('rm file.py');
  assert.strictEqual(r.type, 'rm');
  assert.deepStrictEqual(r.paths, ['file.py']);
});

run('test_parseBashRmCommand_multipleFiles', function() {
  var r = ops.parseBashRmCommand('rm a.py b.py c.py');
  assert.deepStrictEqual(r.paths, ['a.py', 'b.py', 'c.py']);
});

run('test_parseBashRmCommand_withFlags', function() {
  var r = ops.parseBashRmCommand('rm -rf dir/');
  assert.deepStrictEqual(r.paths, ['dir/']);
});

run('test_parseBashRmCommand_returnsNullForNonRm', function() {
  assert.strictEqual(ops.parseBashRmCommand('cp a b'), null);
});

console.log('\nparseBashRedirectCommand:');

run('test_parseBashRedirectCommand_echoOverwrite', function() {
  var r = ops.parseBashRedirectCommand('echo "hello" > out.txt');
  assert.strictEqual(r.type, 'redirect');
  assert.strictEqual(r.path, 'out.txt');
  assert.strictEqual(r.mode, '>');
});

run('test_parseBashRedirectCommand_echoAppend', function() {
  var r = ops.parseBashRedirectCommand('echo "hello" >> out.txt');
  assert.strictEqual(r.type, 'redirect');
  assert.strictEqual(r.path, 'out.txt');
  assert.strictEqual(r.mode, '>>');
});

run('test_parseBashRedirectCommand_catRedirect', function() {
  var r = ops.parseBashRedirectCommand('cat src.py > copy.py');
  assert.strictEqual(r.type, 'redirect');
  assert.strictEqual(r.path, 'copy.py');
});

run('test_parseBashRedirectCommand_returnsNullForNoRedirect', function() {
  assert.strictEqual(ops.parseBashRedirectCommand('echo hello'), null);
  assert.strictEqual(ops.parseBashRedirectCommand('cat file.py'), null);
});

console.log('\nextractBashFileOps:');

run('test_extractBashFileOps_findsAllOpsInJSONL', function() {
  // Scenario: a JSONL with a cp, mv, and rm command produces 3 file ops.
  var lines = [
    h.makeSystemLine('sess-1', 'main', '/repo'),
    makeBashToolUse('tu-1', 'cp src.py dst.py'),
    makeBashToolResult('tu-1'),
    makeBashToolUse('tu-2', 'mv old.py new.py'),
    makeBashToolResult('tu-2'),
    makeBashToolUse('tu-3', 'rm dead.py'),
    makeBashToolResult('tu-3')
  ];
  var parsed = lines.map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } });
  var result = ops.extractBashFileOps(parsed);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].type, 'cp');
  assert.strictEqual(result[1].type, 'mv');
  assert.strictEqual(result[2].type, 'rm');
});

run('test_extractBashFileOps_ignoresCatCommands', function() {
  // Scenario: cat commands are already handled elsewhere, should not appear here.
  var lines = [
    makeBashToolUse('tu-1', 'cat file.py'),
    makeBashToolResult('tu-1')
  ];
  var parsed = lines.map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } });
  var result = ops.extractBashFileOps(parsed);
  assert.strictEqual(result.length, 0);
});

run('test_extractBashFileOps_handlesNonBashToolUse', function() {
  // Scenario: tool_use for Read/Write should be ignored.
  var lines = [
    h.makeCreateLine('/repo/foo.py', 'hello'),
    h.makeReadToolUse('tu-1', '/repo/foo.py'),
    h.makeReadToolResult('tu-1', 'hello')
  ];
  var parsed = lines.map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } });
  var result = ops.extractBashFileOps(parsed);
  assert.strictEqual(result.length, 0);
});

// ─── Test helpers for Bash tool_use/result ────────────────────────────────

function makeBashToolUse(toolUseId, command) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    message: {
      content: [{
        type: 'tool_use',
        id: toolUseId,
        name: 'Bash',
        input: { command: command }
      }]
    }
  });
}

function makeBashToolResult(toolUseId) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'user',
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: ''
      }]
    }
  });
}

summary();
