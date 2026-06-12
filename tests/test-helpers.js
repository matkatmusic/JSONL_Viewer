// Shared test helpers for replay-edits test suite.
// Provides JSONL line builders and a simple test runner.

var assert = require('assert');

var passed = 0;
var failed = 0;

function run(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL: ' + name);
    console.log('    ' + e.message);
  }
}

function summary() {
  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) {
    process.exit(1);
  }
}

// New — gives the test a per-test ctx whose fixtures auto-clean in a finally.
// cleanups is LOCAL per call (no module global). run() records pass/fail; the
// finally here always runs afterward to tear resources down.
function runWithContext(name, fn) {
  var cleanups = [];
  var ctx = {
    // pytest-style fixture: make a temp dir and auto-register its removal.
    tempDir: function (prefix) {
      var fs = require('fs'), os = require('os'), path = require('path');
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'rev-'));
      cleanups.push(function () { fs.rmSync(dir, { recursive: true, force: true }); });  // Node 14.14+
      return dir;
    }
  };
  try { run(name, function () { fn(ctx); }); }
  finally {
    // LIFO teardown; swallow per-cleanup errors so one failure can't mask the others.
    for (var i = cleanups.length - 1; i >= 0; i--) {
      try { cleanups[i](); } catch (ce) {}
    }
  }
}

// ─── JSONL line builders ────────────────────────────────────────────────────

function makeCreateLine(filePath, content) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    toolUseResult: {
      type: 'create',
      filePath: filePath,
      content: content,
      structuredPatch: [],
      originalFile: null,
      userModified: false
    }
  });
}

function makeEditLine(filePath, oldString, newString, replaceAll, originalFile) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    toolUseResult: {
      filePath: filePath,
      oldString: oldString,
      newString: newString,
      replaceAll: replaceAll || false,
      originalFile: originalFile !== undefined ? originalFile : '',
      structuredPatch: [],
      userModified: false
    }
  });
}

function makeUpdateLine(filePath, content) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    toolUseResult: {
      type: 'update',
      filePath: filePath,
      content: content,
      structuredPatch: [],
      originalFile: '',
      userModified: false
    }
  });
}

function makeNonEditLine() {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'user',
    message: { content: 'hello' }
  });
}

function makeBashCatToolUse(toolUseId, filePath) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    message: {
      content: [{
        type: 'tool_use',
        id: toolUseId,
        name: 'Bash',
        input: { command: 'cat -n ' + filePath }
      }]
    }
  });
}

function makeBashCatToolResult(toolUseId, stdout) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'user',
    toolUseResult: { stdout: stdout, stderr: '' },
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: stdout
      }]
    }
  });
}

function makeBashPipedCatToolUse(toolUseId, filePath) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    message: {
      content: [{
        type: 'tool_use',
        id: toolUseId,
        name: 'Bash',
        input: { command: 'cat ' + filePath + ' | grep hello' }
      }]
    }
  });
}

// Read tool_use: assistant asks to read a file.
function makeReadToolUse(toolUseId, filePath) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    message: {
      content: [{
        type: 'tool_use',
        id: toolUseId,
        name: 'Read',
        input: { file_path: filePath }
      }]
    }
  });
}

// Read tool_result: file content with tab-separated line numbers.
// Format matches Claude's Read output: "1\tline1\n2\tline2\n"
function makeReadToolResult(toolUseId, content) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'user',
    toolUseResult: { type: 'file', file: content },
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: content
      }]
    }
  });
}

// System record with session metadata (gitBranch, cwd).
function makeSystemLine(sessionId, gitBranch, cwd) {
  return JSON.stringify({
    type: 'system',
    sessionId: sessionId,
    gitBranch: gitBranch || '',
    cwd: cwd || ''
  });
}

// General Bash tool_use line (for mv/cp/rm/redirect commands).
function makeBashCommandLine(toolUseId, command) {
  return JSON.stringify({
    uuid: 'uuid-' + Math.random().toString(36).slice(2, 8),
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: toolUseId, name: 'Bash', input: { command: command } }] }
  });
}

module.exports = {
  run: run,
  runWithContext: runWithContext,
  makeBashCommandLine: makeBashCommandLine,
  summary: summary,
  makeCreateLine: makeCreateLine,
  makeEditLine: makeEditLine,
  makeUpdateLine: makeUpdateLine,
  makeNonEditLine: makeNonEditLine,
  makeBashCatToolUse: makeBashCatToolUse,
  makeBashCatToolResult: makeBashCatToolResult,
  makeBashPipedCatToolUse: makeBashPipedCatToolUse,
  makeReadToolUse: makeReadToolUse,
  makeReadToolResult: makeReadToolResult,
  makeSystemLine: makeSystemLine
};
