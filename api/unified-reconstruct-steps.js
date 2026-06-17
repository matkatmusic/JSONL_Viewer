// Unified reconstruction: step extraction from JSONL transcripts.
// Moved (Phase 5) from common/unified-reconstruct-steps.js, unchanged except
// the two api imports (stripCatLineNumbers, extractBashFileOps) drop the ../api/ prefix.

var fs, path, extractBashFileOps;
if (typeof module !== 'undefined' && typeof require === 'function') {
  fs = require('fs');
  path = require('path');
  stripCatLineNumbers = require('./file-event-observations').stripCatLineNumbers;
  extractBashFileOps = require('./extract-bash-file-ops').extractBashFileOps;
}

var CAT_CMD_PATTERN = /^cat\s+(?:-[a-zA-Z]+\s+)*(\S+)\s*$/;

// ─── Step factory and helpers ─────────────────────────────────────────────────

function makeStep(line, timestamp, sourceFile, fields) {
  return {
    line: line,
    timestamp: timestamp,
    sourceFile: sourceFile,
    snapshot: fields.snapshot || null,
    originalFile: fields.originalFile || null,
    readResult: fields.readResult || null,
    bashReadResult: fields.bashReadResult || null,
    structuredPatch: fields.structuredPatch || null,
    edit: fields.edit || null,
    bashFileOp: fields.bashFileOp || null
  };
}

function tryParseUnified(line) {
  try { return JSON.parse(line); }
  catch (e) { return null; }
}

function matchesTargetFile(filePath, targetFile, basename) {
  return filePath === targetFile || filePath.endsWith('/' + basename);
}

function getMessageContentArray(obj) {
  var msg = obj.message;
  if (!msg) { return null; }
  var content = msg.content;
  if (!Array.isArray(content)) { return null; }
  return content;
}

function isValidReadOutput(content) {
  if (!content) { return false; }
  var lines = content.split('\n');
  if (lines.length < 2) { return false; }
  var firstLine = lines[0].trim();
  if (/^\d+\t/.test(firstLine)) { return true; }
  return false;
}

function parseJsonlLines(lines) {
  var parsed = [];
  for (var i = 0; i < lines.length; i++) {
    parsed.push(tryParseUnified(lines[i]));
  }
  return parsed;
}

function extractSessionId(parsed) {
  for (var i = 0; i < parsed.length; i++) {
    if (!parsed[i]) { continue; }
    if (parsed[i].sessionId) { return parsed[i].sessionId; }
  }
  return null;
}

function readSnapshotBackup(backupFileName, sessionId) {
  if (!fs || !path) { return null; }
  var home = process.env.HOME || '';
  var backupPath = path.join(home, '.claude', 'file-history', sessionId || '', backupFileName);
  try { return fs.readFileSync(backupPath, 'utf8'); }
  catch (e) { return null; }
}

function getSnapshotContentForFile(snapshotObj, targetFile, basename, sessionId) {
  if (!snapshotObj) { return null; }
  var files = snapshotObj.trackedFileBackups || snapshotObj.files;
  if (!files) { return null; }
  var keys = Object.keys(files);
  for (var k = 0; k < keys.length; k++) {
    if (!matchesTargetFile(keys[k], targetFile, basename)) { continue; }
    var entry = files[keys[k]];
    if (entry.content !== undefined) { return entry.content; }
    if (entry.backupFileName) {
      var backup = readSnapshotBackup(entry.backupFileName, sessionId);
      if (backup !== null) { return backup; }
    }
  }
  return null;
}

// ─── Edit step extraction ─────────────────────────────────────────────────────

function buildEditObject(tr) {
  return {
    type: tr.type || 'edit', content: tr.content,
    oldString: tr.oldString !== undefined ? tr.oldString : tr.old_string,
    newString: tr.newString !== undefined ? tr.newString : tr.new_string,
    replaceAll: tr.replaceAll || tr.replace_all || false,
    originalFile: tr.originalFile || null
  };
}

function buildEditStep(tr, lineIdx, timestamp, targetFile, basename, sourcePath) {
  var relevant = tr.type === 'create' || tr.type === 'update' || tr.oldString !== undefined || tr.old_string !== undefined;
  if (!relevant) { return null; }
  var filePath = tr.filePath || '';
  if (!matchesTargetFile(filePath, targetFile, basename)) { return null; }
  var origFile = (tr.originalFile && tr.originalFile.length > 0) ? tr.originalFile : null;
  var patch = (tr.structuredPatch && tr.structuredPatch.length > 0) ? tr.structuredPatch : null;
  return makeStep(lineIdx, timestamp, sourcePath, {
    edit: buildEditObject(tr),
    originalFile: origFile,
    structuredPatch: patch
  });
}

// ─── Read step extraction ─────────────────────────────────────────────────────

function checkReadToolUse(item, lineIdx, targetFile, basename, pending) {
  if (item.type !== 'tool_use') { return; }
  if (item.name !== 'Read') { return; }
  if (!item.input) { return; }
  var fp = item.input.file_path || '';
  if (!matchesTargetFile(fp, targetFile, basename)) { return; }
  pending[item.id] = { line: lineIdx };
}

function resolveReadContent(item) {
  var content = '';
  if (typeof item.content === 'string') { content = item.content; }
  if (!isValidReadOutput(content)) { return null; }
  return stripCatLineNumbers(content);
}

function checkReadToolResult(item, obj, lineIdx, ts, sourcePath, pending, steps) {
  if (item.type !== 'tool_result') { return; }
  if (!pending[item.tool_use_id]) { return; }
  var stripped = resolveReadContent(item);
  if (stripped === null) { delete pending[item.tool_use_id]; return; }
  steps.push(makeStep(lineIdx, ts, sourcePath, { readResult: stripped }));
  delete pending[item.tool_use_id];
}

// ─── Cat step extraction ──────────────────────────────────────────────────────

function checkCatToolUse(item, lineIdx, targetFile, basename, pending) {
  if (item.type !== 'tool_use') { return; }
  if (item.name !== 'Bash') { return; }
  if (!item.input) { return; }
  var cmd = item.input.command || '';
  var match = CAT_CMD_PATTERN.exec(cmd);
  if (!match) { return; }
  if (!matchesTargetFile(match[1], targetFile, basename)) { return; }
  pending[item.id] = { line: lineIdx };
}

function resolveCatContent(item, obj) {
  var stdout = '';
  if (typeof item.content === 'string') { stdout = item.content; }
  if (!stdout && obj.toolUseResult) { stdout = obj.toolUseResult.stdout || ''; }
  return stripCatLineNumbers(stdout);
}

function checkCatToolResult(item, obj, lineIdx, ts, sourcePath, pending, steps) {
  if (item.type !== 'tool_result') { return; }
  if (!pending[item.tool_use_id]) { return; }
  var stripped = resolveCatContent(item, obj);
  steps.push(makeStep(lineIdx, ts, sourcePath, { bashReadResult: stripped }));
  delete pending[item.tool_use_id];
}

// ─── Step extraction orchestration ────────────────────────────────────────────

function getSnapshotTimestamp(record) {
  return record.timestamp || (record.snapshot && record.snapshot.timestamp) || '';
}

function appendSnapshotSteps(parsed, targetFile, basename, sourcePath, steps) {
  var sessionId = extractSessionId(parsed);
  for (var i = 0; i < parsed.length; i++) {
    if (!parsed[i]) { continue; }
    if (parsed[i].type !== 'file-history-snapshot') { continue; }
    var content = getSnapshotContentForFile(parsed[i].snapshot, targetFile, basename, sessionId);
    if (content !== null) {
      steps.push(makeStep(i, getSnapshotTimestamp(parsed[i]), sourcePath, { snapshot: content }));
    }
  }
}

function appendEditSteps(parsed, targetFile, basename, sourcePath, steps) {
  for (var i = 0; i < parsed.length; i++) {
    if (!parsed[i]) { continue; }
    if (!parsed[i].toolUseResult) { continue; }
    var ts = parsed[i].timestamp || '';
    var step = buildEditStep(parsed[i].toolUseResult, i, ts, targetFile, basename, sourcePath);
    if (step) { steps.push(step); }
  }
}

function appendReadSteps(parsed, targetFile, basename, sourcePath, steps) {
  var pending = {};
  for (var i = 0; i < parsed.length; i++) {
    if (!parsed[i]) { continue; }
    var content = getMessageContentArray(parsed[i]);
    if (!content) { continue; }
    var ts = parsed[i].timestamp || '';
    for (var c = 0; c < content.length; c++) {
      checkReadToolUse(content[c], i, targetFile, basename, pending);
      checkReadToolResult(content[c], parsed[i], i, ts, sourcePath, pending, steps);
    }
  }
}

function appendCatSteps(parsed, targetFile, basename, sourcePath, steps) {
  var pending = {};
  for (var i = 0; i < parsed.length; i++) {
    if (!parsed[i]) { continue; }
    var content = getMessageContentArray(parsed[i]);
    if (!content) { continue; }
    var ts = parsed[i].timestamp || '';
    for (var c = 0; c < content.length; c++) {
      checkCatToolUse(content[c], i, targetFile, basename, pending);
      checkCatToolResult(content[c], parsed[i], i, ts, sourcePath, pending, steps);
    }
  }
}

// Append steps for Bash file operations (cp, mv, git mv, rm, redirect).
function appendBashFileOpSteps(parsed, sourcePath, steps) {
  if (!extractBashFileOps) { return; }
  var ops = extractBashFileOps(parsed);
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var ts = (parsed[op.line] && parsed[op.line].timestamp) || '';
    steps.push(makeStep(op.line, ts, sourcePath, { bashFileOp: op }));
  }
}

function extractStepsFromSingleJSONL(jsonlText, targetFile, sourcePath) {
  var lines = jsonlText.split('\n').filter(Boolean);
  var parsed = parseJsonlLines(lines);
  var basename = targetFile.split('/').pop();
  var steps = [];
  appendSnapshotSteps(parsed, targetFile, basename, sourcePath, steps);
  appendEditSteps(parsed, targetFile, basename, sourcePath, steps);
  appendReadSteps(parsed, targetFile, basename, sourcePath, steps);
  appendCatSteps(parsed, targetFile, basename, sourcePath, steps);
  appendBashFileOpSteps(parsed, sourcePath, steps);
  steps.sort(function(a, b) { return a.line - b.line; });
  return steps;
}

function extractStepsFromJSONLs(jsonlTexts, targetFile) {
  var allSteps = [];
  for (var j = 0; j < jsonlTexts.length; j++) {
    var steps = extractStepsFromSingleJSONL(jsonlTexts[j].text, targetFile, jsonlTexts[j].path);
    for (var s = 0; s < steps.length; s++) { allSteps.push(steps[s]); }
  }
  allSteps.sort(function(a, b) {
    if (a.timestamp !== b.timestamp) { return a.timestamp < b.timestamp ? -1 : 1; }
    return a.line - b.line;
  });
  return allSteps;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    makeStep: makeStep,
    tryParseUnified: tryParseUnified,
    matchesTargetFile: matchesTargetFile,
    getMessageContentArray: getMessageContentArray,
    isValidReadOutput: isValidReadOutput,
    getSnapshotContentForFile: getSnapshotContentForFile,
    buildEditObject: buildEditObject,
    buildEditStep: buildEditStep,
    extractStepsFromSingleJSONL: extractStepsFromSingleJSONL,
    extractStepsFromJSONLs: extractStepsFromJSONLs
  };
}
