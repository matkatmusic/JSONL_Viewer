#!/usr/bin/env node
// assemble-split-reads CLI: thin wrapper over api/split-read-assembly.js.
// The library logic moved to api/split-read-assembly.js in Phase 4; this file
// keeps only the command-line interface.
// Usage: node assemble-split-reads.js --jsonl <path> [--write-dir <dir>]

var fs = require('fs');
var path = require('path');
var sra = require('../api/split-read-assembly');
var extractReadEvents = sra.extractReadEvents;
var assembleSplitReads = sra.assembleSplitReads;

/* ─── MOVED to api/split-read-assembly.js (Phase 4) ──────────────────────────
// extractReadEvents, assembleSplitReads, and their helpers (parseJsonLine,
// messageContent, toolResultText, parseNumberedContent, registerReadUse,
// confirmReadResult, computeGaps, eofConfirmedAt, assembleOneFile) now live in
// api/split-read-assembly.js. Commented-out originals preserved below.

var NUMBERED_LINE_PATTERN = /^(\d+)\t/;

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (parseError) {
    return null;
  }
}

function messageContent(record) {
  if (!record) { return null; }
  if (!record.message) { return null; }
  if (!Array.isArray(record.message.content)) { return null; }
  return record.message.content;
}

function toolResultText(item) {
  if (typeof item.content === 'string') { return item.content; }
  if (!Array.isArray(item.content)) { return ''; }
  var texts = item.content.filter(function (c) { return c.type === 'text'; });
  return texts.map(function (c) { return c.text; }).join('\n');
}

function parseNumberedContent(resultText) {
  var rawLines = resultText.split('\n');
  var firstLineNumber = null;
  var contentLines = [];
  for (var i = 0; i < rawLines.length; i++) {
    var match = NUMBERED_LINE_PATTERN.exec(rawLines[i]);
    if (!match) { continue; }
    if (firstLineNumber === null) { firstLineNumber = parseInt(match[1], 10); }
    contentLines.push(rawLines[i].slice(match[0].length));
  }
  if (firstLineNumber === null) { return null; }
  return { firstLineNumber: firstLineNumber, contentLines: contentLines };
}

function registerReadUse(item, pendingByToolUseId) {
  if (item.type !== 'tool_use') { return; }
  if (item.name !== 'Read') { return; }
  if (!item.input) { return; }
  if (!item.input.file_path) { return; }
  pendingByToolUseId[item.id] = { filePath: item.input.file_path, limit: item.input.limit || null };
}

function confirmReadResult(item, record, pendingByToolUseId, events, lineIndex) {
  if (item.type !== 'tool_result') { return; }
  var pending = pendingByToolUseId[item.tool_use_id];
  if (!pending) { return; }
  delete pendingByToolUseId[item.tool_use_id];
  var parsed = parseNumberedContent(toolResultText(item));
  if (parsed === null) { return; }
  events.push({
    filePath: pending.filePath,
    firstLineNumber: parsed.firstLineNumber,
    contentLines: parsed.contentLines,
    requestedLimit: pending.limit,
    timestamp: record.timestamp || null,
    jsonlLine: lineIndex + 1
  });
}

function extractReadEvents(jsonlText) {
  var lines = jsonlText.split('\n').filter(Boolean);
  var pendingByToolUseId = {};
  var events = [];
  for (var i = 0; i < lines.length; i++) {
    var record = parseJsonLine(lines[i]);
    var content = messageContent(record);
    if (!content) { continue; }
    for (var c = 0; c < content.length; c++) {
      registerReadUse(content[c], pendingByToolUseId);
      confirmReadResult(content[c], record, pendingByToolUseId, events, i);
    }
  }
  return events;
}

function computeGaps(sortedLineNumbers) {
  var gaps = [];
  if (sortedLineNumbers.length === 0) { return gaps; }
  if (sortedLineNumbers[0] > 1) { gaps.push({ from: 1, to: sortedLineNumbers[0] - 1 }); }
  for (var i = 1; i < sortedLineNumbers.length; i++) {
    var expected = sortedLineNumbers[i - 1] + 1;
    if (sortedLineNumbers[i] > expected) { gaps.push({ from: expected, to: sortedLineNumbers[i] - 1 }); }
  }
  return gaps;
}

function eofConfirmedAt(lastLine, fileEvents) {
  for (var i = 0; i < fileEvents.length; i++) {
    var e = fileEvents[i];
    if (e.firstLineNumber + e.contentLines.length - 1 !== lastLine) { continue; }
    if (e.requestedLimit === null) { return true; }
    if (e.contentLines.length < e.requestedLimit) { return true; }
  }
  return false;
}

function assembleOneFile(filePath, fileEvents) {
  var lineByNumber = {};
  for (var i = 0; i < fileEvents.length; i++) {
    var event = fileEvents[i];
    for (var l = 0; l < event.contentLines.length; l++) {
      lineByNumber[event.firstLineNumber + l] = event.contentLines[l];
    }
  }
  var numbers = Object.keys(lineByNumber).map(Number).sort(function (a, b) { return a - b; });
  var gaps = computeGaps(numbers);
  var complete = gaps.length === 0;
  var lastLine = numbers[numbers.length - 1];
  return {
    filePath: filePath,
    complete: complete,
    content: complete ? numbers.map(function (n) { return lineByNumber[n]; }).join('\n') : null,
    gaps: gaps,
    firstLine: numbers[0],
    lastLine: lastLine,
    assembledLineCount: numbers.length,
    readCount: fileEvents.length,
    eofConfirmed: eofConfirmedAt(lastLine, fileEvents),
    timestamp: fileEvents[fileEvents.length - 1].timestamp
  };
}

function assembleSplitReads(events) {
  var eventsByFile = {};
  var fileOrder = [];
  for (var i = 0; i < events.length; i++) {
    if (!eventsByFile[events[i].filePath]) {
      eventsByFile[events[i].filePath] = [];
      fileOrder.push(events[i].filePath);
    }
    eventsByFile[events[i].filePath].push(events[i]);
  }
  return fileOrder.map(function (filePath) {
    return assembleOneFile(filePath, eventsByFile[filePath]);
  });
}
─── end MOVED ────────────────────────────────────────────────────────────── */

// ─── CLI ─────────────────────────────────────────────────────────────────────

function describeAssembly(a) {
  var status = a.complete ? 'COMPLETE' : 'incomplete';
  var eof = a.eofConfirmed ? 'EOF confirmed' : 'EOF NOT confirmed';
  console.log(status + '  ' + a.filePath);
  console.log('  reads: ' + a.readCount + '  lines ' + a.firstLine + '-' + a.lastLine +
    ' (' + a.assembledLineCount + ' assembled)  ' + eof + '  at ' + a.timestamp);
  if (a.gaps.length > 0) {
    console.log('  gaps: ' + a.gaps.map(function (g) { return g.from + '-' + g.to; }).join(', '));
  }
}

function flattenedOutputName(filePath) {
  return filePath.replace(/\//g, '-').replace(/^-/, '');
}

function writeCompleteAssemblies(assemblies, writeDir) {
  fs.mkdirSync(writeDir, { recursive: true });
  assemblies.forEach(function (a) {
    if (!a.complete) { return; }
    var outPath = path.join(writeDir, flattenedOutputName(a.filePath));
    fs.writeFileSync(outPath, a.content + '\n');
    console.log('Wrote ' + outPath);
  });
}

function parseArgs(argv) {
  var opts = { jsonl: null, writeDir: null };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--jsonl') { opts.jsonl = argv[i + 1]; }
    if (argv[i] === '--write-dir') { opts.writeDir = argv[i + 1]; }
  }
  return opts;
}

function main() {
  var opts = parseArgs(process.argv.slice(2));
  if (!opts.jsonl) {
    console.error('Usage: node assemble-split-reads.js --jsonl <transcript.jsonl> [--write-dir <dir>]');
    process.exit(1);
  }
  var assemblies = assembleSplitReads(extractReadEvents(fs.readFileSync(opts.jsonl, 'utf8')));
  if (assemblies.length === 0) {
    console.log('No Read events with numbered content found.');
    return;
  }
  assemblies.forEach(describeAssembly);
  if (opts.writeDir) { writeCompleteAssemblies(assemblies, opts.writeDir); }
}

if (require.main === module) { main(); }
