// JFReD Diff: Base state resolution — cascading: snapshot → Read → first-step → empty.

import { state } from '../web-shared/jfred-state.js';

function findSnapshotMatch(snapshotObj, targetFile, basename) {
  var snapFiles = Object.keys(snapshotObj.files);
  for (var s = 0; s < snapFiles.length; s++) {
    if (snapFiles[s] !== targetFile && snapFiles[s].indexOf(basename) === -1) { continue; }
    var entry = snapshotObj.files[snapFiles[s]];
    if (entry && entry.backup) { return entry.backup; }
  }
  return null;
}

function extractBlockText(block) {
  if (typeof block.content === 'string') { return block.content; }
  if (!Array.isArray(block.content)) { return ''; }
  var text = '';
  for (var c = 0; c < block.content.length; c++) {
    if (block.content[c].type === 'text') { text += block.content[c].text; }
  }
  return text;
}

// Find the tool_use name for a given tool_use_id by scanning assistant messages.
function findToolUseInMessage(messageContent, toolUseId) {
  if (!Array.isArray(messageContent)) { return null; }
  for (var c = 0; c < messageContent.length; c++) {
    if (messageContent[c].type === 'tool_use' && messageContent[c].id === toolUseId) {
      return messageContent[c];
    }
  }
  return null;
}

function findToolName(parsedLines, toolUseId) {
  if (!toolUseId) { return ''; }
  for (var i = 0; i < parsedLines.length; i++) {
    var obj = parsedLines[i];
    if (!obj || obj.type !== 'assistant' || !obj.message) { continue; }
    var tu = findToolUseInMessage(obj.message.content, toolUseId);
    if (tu) { return (tu.name || '').toLowerCase(); }
  }
  return '';
}

var READ_TOOLS = { 'read': 1, 'readfile': 1, 'bash': 1 };

function isWriteConfirmation(text) {
  return /^File created successfully|^The file .* has been updated|^File .* has been/.test(text);
}

// Find earliest Read tool result that contains actual file content for the target.
function findEarliestReadContent(parsedLines, targetFile, basename) {
  for (var r = 0; r < parsedLines.length; r++) {
    var obj = parsedLines[r];
    if (!obj || !obj.message || !Array.isArray(obj.message.content)) { continue; }
    var content = obj.message.content;
    for (var i = 0; i < content.length; i++) {
      var block = content[i];
      if (block.type !== 'tool_result') { continue; }
      var text = extractBlockText(block);
      if (!text) { continue; }
      if (text.indexOf(basename) === -1 && text.indexOf(targetFile) === -1) { continue; }
      if (isWriteConfirmation(text)) { continue; }
      var toolName = findToolName(parsedLines, block.tool_use_id);
      if (toolName && !READ_TOOLS[toolName]) { continue; }
      return text;
    }
  }
  return null;
}

export function resolveBaseState(parsedLines, targetFile) {
  var basename = targetFile.split('/').pop();
  for (var i = 0; i < parsedLines.length; i++) {
    var obj = parsedLines[i];
    if (!obj || obj.type !== 'file-history-snapshot' || !obj.files) { continue; }
    var backup = findSnapshotMatch(obj, targetFile, basename);
    if (backup) { return { content: '(snapshot ref: ' + backup + ')', source: 'snapshot' }; }
  }
  var readContent = findEarliestReadContent(parsedLines, targetFile, basename);
  if (readContent !== null) { return { content: readContent, source: 'read' }; }
  if (state.steps.length > 0 && state.steps[0].expectedState) {
    return { content: state.steps[0].expectedState, source: 'first-step' };
  }
  return { content: '', source: 'empty' };
}
