#!/usr/bin/env node
// Analyze agentic turns in a Claude Code JSONL transcript.
// Splits the transcript into turns, classifies each as file-modifying or not,
// and checks for file-history-snapshot presence.
//
// Usage: node turn-analyzer.js <path-to-jsonl>

var fs = require('fs');
var isUserPrompt = require('../api/transcript-parsers').isUserPrompt;

function tryParse(line) {
  try { return JSON.parse(line); } catch (e) { return null; }
}

function parseAllLines(text) {
  var lines = text.split('\n');
  var parsed = [];
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) { continue; }
    parsed.push({ idx: parsed.length, obj: tryParse(lines[i]) });
  }
  return parsed;
}

function findTurnBoundaries(parsed) {
  var boundaries = [];
  for (var i = 0; i < parsed.length; i++) {
    if (isUserPrompt(parsed[i].obj)) { boundaries.push(i); }
  }
  return boundaries;
}

function buildTurns(parsed, boundaries) {
  var turns = [];
  for (var b = 0; b < boundaries.length; b++) {
    var start = boundaries[b];
    var end = b + 1 < boundaries.length ? boundaries[b + 1] : parsed.length;
    turns.push({ startLine: start, endLine: end - 1, lines: parsed.slice(start, end) });
  }
  if (boundaries.length > 0 && boundaries[0] > 0) {
    turns.unshift({ startLine: 0, endLine: boundaries[0] - 1, lines: parsed.slice(0, boundaries[0]), isPreamble: true });
  }
  return turns;
}

function hasFileModification(turnLines) {
  for (var i = 0; i < turnLines.length; i++) {
    var obj = turnLines[i].obj;
    if (!obj || !obj.toolUseResult) { continue; }
    var tr = obj.toolUseResult;
    if (tr.type === 'create' || tr.type === 'update') { return true; }
    if (tr.oldString !== undefined || tr.old_string !== undefined) { return true; }
  }
  return false;
}

function hasSnapshot(turnLines) {
  for (var i = 0; i < turnLines.length; i++) {
    var obj = turnLines[i].obj;
    if (obj && obj.type === 'file-history-snapshot') { return true; }
  }
  return false;
}

function getModifiedFiles(turnLines) {
  var files = {};
  for (var i = 0; i < turnLines.length; i++) {
    var obj = turnLines[i].obj;
    if (!obj || !obj.toolUseResult) { continue; }
    var tr = obj.toolUseResult;
    if (tr.filePath) { files[tr.filePath.split('/').pop()] = true; }
  }
  return Object.keys(files);
}

function extractFirstText(contentArray) {
  for (var j = 0; j < contentArray.length; j++) {
    if (contentArray[j].type === 'text' && contentArray[j].text) { return contentArray[j].text; }
  }
  return '';
}

function getUserPromptPreview(turnLines) {
  for (var i = 0; i < turnLines.length; i++) {
    var obj = turnLines[i].obj;
    if (!isUserPrompt(obj)) { continue; }
    var c = obj.message && obj.message.content;
    var text = typeof c === 'string' ? c : extractFirstText(c || []);
    return text.replace(/\n/g, ' ').slice(0, 60);
  }
  return '(preamble)';
}

function analyzeTurns(text) {
  var parsed = parseAllLines(text);
  var boundaries = findTurnBoundaries(parsed);
  var turns = buildTurns(parsed, boundaries);
  var results = [];
  for (var t = 0; t < turns.length; t++) {
    var turn = turns[t];
    results.push({
      turnIndex: t,
      startLine: turn.startLine,
      endLine: turn.endLine,
      lineCount: turn.lines.length,
      modifiesFiles: hasFileModification(turn.lines),
      hasSnapshot: hasSnapshot(turn.lines),
      modifiedFiles: getModifiedFiles(turn.lines),
      prompt: getUserPromptPreview(turn.lines),
      isPreamble: turn.isPreamble || false
    });
  }
  return results;
}

function formatResults(results) {
  var lines = [];
  var missingSnapshots = 0;
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var status = '';
    if (r.isPreamble) { status = 'PREAMBLE'; }
    else if (r.modifiesFiles && r.hasSnapshot) { status = 'OK'; }
    else if (r.modifiesFiles && !r.hasSnapshot) { status = 'MISSING_SNAPSHOT'; missingSnapshots++; }
    else { status = 'no-writes'; }
    var fileList = r.modifiedFiles.length > 0 ? ' [' + r.modifiedFiles.join(', ') + ']' : '';
    lines.push(
      'Turn ' + r.turnIndex + ' (L' + r.startLine + '-' + r.endLine + ') '
      + status + fileList + ' "' + r.prompt + '"'
    );
  }
  lines.push('');
  lines.push('--- Summary ---');
  lines.push('Total turns: ' + results.length);
  lines.push('File-modifying turns: ' + results.filter(function(r) { return r.modifiesFiles; }).length);
  lines.push('With snapshot: ' + results.filter(function(r) { return r.modifiesFiles && r.hasSnapshot; }).length);
  lines.push('Missing snapshot: ' + missingSnapshots);
  return lines.join('\n');
}

function extractTurn(text, turnIndex) {
  var parsed = parseAllLines(text);
  var boundaries = findTurnBoundaries(parsed);
  var turns = buildTurns(parsed, boundaries);
  if (turnIndex < 0 || turnIndex >= turns.length) { return null; }
  var turn = turns[turnIndex];
  var output = [];
  for (var i = 0; i < turn.lines.length; i++) {
    output.push(JSON.stringify(turn.lines[i].obj));
  }
  return output.join('\n');
}

function main() {
  var args = process.argv.slice(2);
  var jsonlPath = '';
  var turnIndex = -1;
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--turn' && i + 1 < args.length) { turnIndex = parseInt(args[i + 1], 10); i++; }
    else { jsonlPath = args[i]; }
  }
  if (!jsonlPath) {
    console.log('Usage: node turn-analyzer.js <path-to-jsonl> [--turn N]');
    console.log('  Without --turn: prints turn summary');
    console.log('  With --turn N: extracts all lines from turn N');
    process.exit(1);
  }
  var text = fs.readFileSync(jsonlPath, 'utf8');
  if (turnIndex >= 0) {
    var extracted = extractTurn(text, turnIndex);
    if (extracted === null) { console.error('Turn ' + turnIndex + ' not found'); process.exit(1); }
    console.log(extracted);
  } else {
    var results = analyzeTurns(text);
    console.log(formatResults(results));
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analyzeTurns: analyzeTurns, extractTurn: extractTurn };
}
