// Extract file state from various JSONL sources:
// - Bash cat commands (cat tool output)
// - Read tool results
// - file-history-snapshot backups from ~/.claude/file-history/

var fs, path;
if (typeof module !== 'undefined' && typeof require === 'function') {
  fs = require('fs');
  path = require('path');
}

// ─── Shared constants ──────────────────────────────────────────────────────
var LINE_NUMBER_PATTERN = /^\s*\d+\s*(?:│ ?|\t)/;
var CAT_COMMAND_PATTERN = /^cat\s+(?:-[a-zA-Z]+\s+)*(\S+)\s*$/;

// ─── Shared helpers ────────────────────────────────────────────────────────

// Return the first non-empty line from an array of strings, or ''.
function findFirstNonEmptyLine(lines) {
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      return lines[i];
    }
  }
  return '';
}

// Strip the line-number prefix from every line in an array.
function stripPrefixFromLines(lines) {
  var stripped = [];
  for (var i = 0; i < lines.length; i++) {
    stripped.push(lines[i].replace(LINE_NUMBER_PATTERN, ''));
  }
  return stripped;
}

// Return obj.message.content when it is a valid array, otherwise null.
function getMessageContent(obj) {
  if (!obj) {
    return null;
  }
  if (!obj.message) {
    return null;
  }
  var content = obj.message.content;
  if (!Array.isArray(content)) {
    return null;
  }
  return content;
}

// Build an edit record from a file path, line index, content, and optional source tag.
function buildEditRecord(lineIndex, filePath, content, source) {
  var edit = {
    line: lineIndex,
    filePath: filePath,
    file: filePath.split('/').pop(),
    type: 'update',
    content: content
  };
  if (source) {
    edit.source = source;
  }
  return edit;
}

// Register a tool_use item into pendingMap if it matches toolName.
function registerToolUse(item, toolName, pendingMap, onToolUse, lineIndex) {
  if (item.type !== 'tool_use') {
    return;
  }
  if (item.name !== toolName) {
    return;
  }
  var pending = onToolUse(item, lineIndex);
  if (pending) {
    pendingMap[item.id] = pending;
  }
}

// Confirm a tool_result item against pendingMap, returning an edit or null.
function confirmToolResult(item, obj, pendingMap, onToolResult, edits, lineIndex) {
  if (item.type !== 'tool_result') {
    return;
  }
  if (!pendingMap[item.tool_use_id]) {
    return;
  }
  var edit = onToolResult(item, obj, pendingMap[item.tool_use_id], lineIndex);
  if (edit) {
    edits.push(edit);
  }
  delete pendingMap[item.tool_use_id];
}

// Iterate parsed JSONL objects and run tool_use/tool_result callbacks.
// onToolUse(item, lineIndex) should return a pending entry or null.
// onToolResult(item, obj, pending, lineIndex) should return an edit or null.
function scanToolUseResults(parsed, toolName, onToolUse, onToolResult) {
  var pendingMap = {};
  var edits = [];
  for (var i = 0; i < parsed.length; i++) {
    var content = getMessageContent(parsed[i]);
    if (!content) {
      continue;
    }
    for (var c = 0; c < content.length; c++) {
      registerToolUse(content[c], toolName, pendingMap, onToolUse, i);
      confirmToolResult(content[c], parsed[i], pendingMap, onToolResult, edits, i);
    }
  }
  return edits;
}

// Return true when Read content looks like a valid file (not an error message).
function isValidReadContent(fileContent) {
  if (!fileContent) {
    return false;
  }
  if (fileContent.indexOf('Wasted call') === 0) {
    return false;
  }
  if (fileContent.indexOf('Error') === 0) {
    return false;
  }
  if (fileContent.indexOf('File does not exist') === 0) {
    return false;
  }
  return true;
}

// The default file-history root when no override is supplied: ~/.claude/file-history.
function defaultBaseHistoryDir() {
  return path.join(require('os').homedir(), '.claude', 'file-history');
}

// Resolve the file-history directory for a given sessionId, under baseHistoryDir
// (defaults to ~/.claude/file-history). Returns null if missing. baseHistoryDir
// lets callers point at a relocated snapshot store (e.g. recovered data whose
// file-history lives beside its projects dir).
function resolveHistoryDir(sessionId, baseHistoryDir) {
  if (!sessionId) { return null; }
  if (typeof require === 'undefined' || !fs || !path) { return null; }
  var base = baseHistoryDir || defaultBaseHistoryDir();
  var historyDir = path.join(base, sessionId);
  if (!fs.existsSync(historyDir)) { return null; }
  return historyDir;
}

// Read a backup file and return its content, or null if missing.
function readBackupFile(historyDir, backupFileName) {
  var backupPath = path.join(historyDir, backupFileName);
  if (!fs.existsSync(backupPath)) {
    return null;
  }
  return fs.readFileSync(backupPath, 'utf8');
}

// ─── Strip line-number prefixes from cat -n output ─────────────────────────
// Handles both " 1 │ content" (unicode box) and "  1\tcontent" (tab) formats.
// If the first non-empty line doesn't match a line-number pattern, returns unchanged.
function stripCatLineNumbers(stdout) {
  if (!stdout) {
    return '';
  }
  var lines = stdout.split('\n');
  var firstNonEmpty = findFirstNonEmptyLine(lines);
  if (!LINE_NUMBER_PATTERN.test(firstNonEmpty)) {
    return stdout;
  }
  return stripPrefixFromLines(lines).join('\n');
}

// ─── Bash cat tool_use pending-entry builder ───────────────────────────────
function buildCatPending(item, lineIndex) {
  if (!item.input) {
    return null;
  }
  var cmd = item.input.command || '';
  var match = CAT_COMMAND_PATTERN.exec(cmd);
  if (!match) {
    return null;
  }
  return { filePath: match[1], line: lineIndex };
}

// ─── Bash cat tool_result handler ──────────────────────────────────────────
function confirmCatResult(item, obj, pending, lineIndex) {
  var stdout = '';
  if (typeof item.content === 'string') {
    stdout = item.content;
  }
  if (!stdout && obj.toolUseResult) {
    stdout = obj.toolUseResult.stdout || '';
  }
  var strippedContent = stripCatLineNumbers(stdout);
  // 'cat' tags this as an observation (a read), not authored content; replay
  // treats it like any other content checkpoint.
  return buildEditRecord(lineIndex, pending.filePath, strippedContent, 'cat');
}

// ─── Extract Bash cat snapshots from JSONL ─────────────────────────────────
// Finds Bash tool_use lines with cat commands, links to their tool_result,
// and returns implicit "update" edits with the stripped stdout content.
function extractBashCatEdits(lines, parsed) {
  return scanToolUseResults(parsed, 'Bash', buildCatPending, confirmCatResult);
}

// ─── Read tool_use pending-entry builder ───────────────────────────────────
function buildReadPending(item, lineIndex) {
  if (!item.input) {
    return null;
  }
  var fp = item.input.file_path || '';
  if (!fp) {
    return null;
  }
  return { filePath: fp, line: lineIndex };
}

// ─── Read tool_result handler ──────────────────────────────────────────────
function confirmReadResult(item, obj, pending, lineIndex) {
  var fileContent = '';
  if (typeof item.content === 'string') {
    fileContent = item.content;
  }
  if (!isValidReadContent(fileContent)) {
    return null;
  }
  var strippedContent = stripCatLineNumbers(fileContent);
  return buildEditRecord(lineIndex, pending.filePath, strippedContent, 'read');
}

// ─── Extract Read tool result snapshots from JSONL ─────────────────────────
// Finds Read tool_use lines, links to their tool_result, strips line numbers,
// and returns implicit "update" edits with the file content.
function extractReadEdits(lines, parsed) {
  return scanToolUseResults(parsed, 'Read', buildReadPending, confirmReadResult);
}

// Try to build a snapshot edit from a single backup entry. Returns edit or null.
function buildSnapshotEdit(filePath, entry, historyDir, lineIndex) {
  if (!entry) {
    return null;
  }
  if (!entry.backupFileName) {
    return null;
  }
  var backupContent = readBackupFile(historyDir, entry.backupFileName);
  if (backupContent === null) {
    return null;
  }
  return buildEditRecord(lineIndex, filePath, backupContent, 'snapshot');
}

// Collect edits from a single snapshot's trackedFileBackups.
function collectSnapshotBackupEdits(backups, historyDir, lineIndex) {
  var edits = [];
  var files = Object.keys(backups);
  for (var f = 0; f < files.length; f++) {
    var edit = buildSnapshotEdit(files[f], backups[files[f]], historyDir, lineIndex);
    if (edit) {
      edits.push(edit);
    }
  }
  return edits;
}

// ─── Extract file-history-snapshot backups from JSONL ──────────────────────
// When a file-history-snapshot has a non-null backupFileName for a tracked file,
// the actual file content lives at ~/.claude/file-history/<sessionId>/<backupFileName>.
// We read these and inject them as implicit "update" edits with source='snapshot'.
// Return the trackedFileBackups map from a snapshot object, or null if not applicable.
function getSnapshotBackups(obj) {
  if (!obj) {
    return null;
  }
  if (obj.type !== 'file-history-snapshot') {
    return null;
  }
  var snap = obj.snapshot || {};
  return snap.trackedFileBackups || {};
}

function extractSnapshotEdits(lines, parsed, sessionId, baseHistoryDir) {
  var historyDir = resolveHistoryDir(sessionId, baseHistoryDir);
  if (!historyDir) {
    return [];
  }
  var edits = [];
  for (var i = 0; i < parsed.length; i++) {
    var backups = getSnapshotBackups(parsed[i]);
    if (!backups) {
      continue;
    }
    Array.prototype.push.apply(edits, collectSnapshotBackupEdits(backups, historyDir, i));
  }
  return edits;
}

// Safely parse a single JSON line. Returns the object or null.
function tryParseJson(line) {
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}

// Parse JSONL text into an array of objects and extract sessionId.
function parseJsonlWithSession(jsonlText) {
  var lines = jsonlText.split('\n').filter(Boolean);
  var sessionId = '';
  var parsed = [];
  for (var i = 0; i < lines.length; i++) {
    var obj = tryParseJson(lines[i]);
    if (obj && !sessionId && obj.sessionId) {
      sessionId = obj.sessionId;
    }
    parsed.push(obj);
  }
  return { parsed: parsed, sessionId: sessionId };
}

// Search a backups map for a key whose basename matches targetFile.
// Returns the backupFileName or null.
function findBackupByBasename(backups, targetFile) {
  var found = null;
  var keys = Object.keys(backups);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].split('/').pop() === targetFile) {
      var entry = backups[keys[k]];
      if (entry && entry.backupFileName) {
        found = entry.backupFileName;
      }
    }
  }
  return found;
}

// Search snapshot backups for the last matching targetFile.
function findLastBackupFileName(parsed, targetFile) {
  var lastBackupFileName = null;
  for (var i = 0; i < parsed.length; i++) {
    var backups = getSnapshotBackups(parsed[i]);
    if (!backups) {
      continue;
    }
    var match = findBackupByBasename(backups, targetFile);
    if (match) {
      lastBackupFileName = match;
    }
  }
  return lastBackupFileName;
}

// ─── Find last snapshot for a file from JSONL ───────────────────────────────

// Locate the last file-history snapshot of targetFile in this transcript and
// report exactly which blob holds it: {sessionId, backupFileName, content}.
// null when no snapshot is recorded or the blob file is missing on disk.
function findLastSnapshotBlob(jsonlText, targetFile, baseHistoryDir) {
  var result = parseJsonlWithSession(jsonlText);
  var lastBackupFileName = findLastBackupFileName(result.parsed, targetFile);
  if (!result.sessionId || !lastBackupFileName) { return null; }
  if (typeof require === 'undefined' || !fs || !path) { return null; }
  var base = baseHistoryDir || defaultBaseHistoryDir();
  var backupPath = path.join(base, result.sessionId, lastBackupFileName);
  if (!fs.existsSync(backupPath)) { return null; }
  return {
    sessionId: result.sessionId,
    backupFileName: lastBackupFileName,
    content: fs.readFileSync(backupPath, 'utf8')
  };
}

// Content-only convenience over findLastSnapshotBlob (original API).
function findLastSnapshotContent(jsonlText, targetFile, baseHistoryDir) {
  var blob = findLastSnapshotBlob(jsonlText, targetFile, baseHistoryDir);
  return blob === null ? null : blob.content;
}

// ─── Exports ───────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    stripCatLineNumbers: stripCatLineNumbers,
    extractBashCatEdits: extractBashCatEdits,
    extractReadEdits: extractReadEdits,
    extractSnapshotEdits: extractSnapshotEdits,
    findLastSnapshotContent: findLastSnapshotContent,
    findLastSnapshotBlob: findLastSnapshotBlob
  };
}
