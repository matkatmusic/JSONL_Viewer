// line-state-evidence: evidence-reference construction + event materialization
// for the per-line state tracker. Every claim the tracker makes must point at
// a JSONL line (or blob) — these helpers compute the per-line text the tracker
// works on IN MEMORY, paired with the evidenceRef that proves it:
//   { jsonl, jsonlLine, textProperty|structuredPatch|blobFile (exactly one) }.

var fs = require('fs');
var path = require('path');

// Numbered Read-result content line: "N\tcontent".
var READ_NUMBER_PATTERN = /^(\d+)\t/;
// cat -n style prefixes: " 1 │ content" or "  1\tcontent".
var CAT_NUMBER_PATTERN = /^\s*(\d+)\s*(?:│ ?|\t)/;

// ─── Content line splitting ─────────────────────────────────────────────────

// File content as lines: a trailing newline is a terminator, not an extra
// empty line; interior blank lines survive; '' is a zero-line file.
function splitContentLines(text) {
  if (text === '') { return []; }
  var parts = text.split('\n');
  if (text.endsWith('\n')) { parts.pop(); }
  return parts;
}

// Substring bounds of each splitContentLines line within text (end exclusive).
function contentLineSpans(text) {
  var lines = splitContentLines(text);
  var spans = [];
  var offset = 0;
  for (var i = 0; i < lines.length; i++) {
    spans.push({ startIndex: offset, endIndex: offset + lines[i].length });
    offset += lines[i].length + 1;
  }
  return spans;
}

// ─── Numbered result parsing ────────────────────────────────────────────────

// One {lineNum, text, startIndex, endIndex} entry from a numbered raw line;
// the span covers content AFTER the prefix (the text, not its decoration).
function buildNumberedEntry(match, rawLine, offset) {
  return {
    lineNum: parseInt(match[1], 10),
    text: rawLine.slice(match[0].length),
    startIndex: offset + match[0].length,
    endIndex: offset + rawLine.length
  };
}

// Entries for every prefix-matching line of rawText, with global offsets.
// Non-matching lines (reminders, notices) are not file content — skipped.
function numberedEntries(rawText, pattern) {
  var rawLines = rawText.split('\n');
  var entries = [];
  var offset = 0;
  for (var i = 0; i < rawLines.length; i++) {
    var match = pattern.exec(rawLines[i]);
    if (match) { entries.push(buildNumberedEntry(match, rawLines[i], offset)); }
    offset += rawLines[i].length + 1;
  }
  return entries;
}

// Read results carry ABSOLUTE file line numbers in their prefixes.
function numberedLineEntries(rawText) {
  return numberedEntries(rawText, READ_NUMBER_PATTERN);
}

// Entries for plain (un-numbered) whole-file text, numbered from 1.
function plainLineEntries(rawText) {
  var lines = splitContentLines(rawText);
  return contentLineSpans(rawText).map(function (span, i) {
    return { lineNum: i + 1, text: lines[i], startIndex: span.startIndex, endIndex: span.endIndex };
  });
}

// First non-empty line of a string, or ''.
function firstNonEmptyLine(rawText) {
  var lines = rawText.split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) { return lines[i]; }
  }
  return '';
}

// cat stdout: numbered when cat -n prefixes are present, else whole from 1.
function catLineEntries(rawText) {
  if (CAT_NUMBER_PATTERN.test(firstNonEmptyLine(rawText))) { return numberedEntries(rawText, CAT_NUMBER_PATTERN); }
  return plainLineEntries(rawText);
}

// ─── evidenceRef builders ───────────────────────────────────────────────────

// An evidenceRef has exactly one non-null locator sub-object.
function buildRefWithLocator(jsonl, jsonlLine, locatorName, locator) {
  var ref = { jsonl: jsonl, jsonlLine: jsonlLine, textProperty: null, structuredPatch: null, blobFile: null };
  ref[locatorName] = locator;
  return ref;
}

function buildTextPropertyRef(jsonl, jsonlLine, property, startIndex, endIndex) {
  return buildRefWithLocator(jsonl, jsonlLine, 'textProperty', { property: property, startIndex: startIndex, endIndex: endIndex });
}

function buildStructuredPatchRef(jsonl, jsonlLine, property, hunkIndex, lineIndex) {
  return buildRefWithLocator(jsonl, jsonlLine, 'structuredPatch', { property: property, hunkIndex: hunkIndex, lineIndex: lineIndex });
}

function buildBlobFileRef(jsonl, jsonlLine, property, blobPath, startIndex, endIndex) {
  return buildRefWithLocator(jsonl, jsonlLine, 'blobFile', { property: property, path: blobPath, startIndex: startIndex, endIndex: endIndex });
}

// ─── Record loading (cached per transcript) ─────────────────────────────────

var transcriptLinesCache = new Map();

// The parsed record at a 1-based non-empty-line index of a transcript.
function loadParsedRecord(jsonlPath, jsonlLine) {
  if (!transcriptLinesCache.has(jsonlPath)) {
    var text = fs.readFileSync(jsonlPath, 'utf8');
    transcriptLinesCache.set(jsonlPath, text.split('\n').filter(Boolean));
  }
  var line = transcriptLinesCache.get(jsonlPath)[jsonlLine - 1];
  if (line === undefined) { return null; }
  try { return JSON.parse(line); } catch (e) { return null; }
}

// {property, text} from a tool_result whose content is a text-block array.
function textBlockResult(item, itemIndex) {
  for (var t = 0; t < item.content.length; t++) {
    if (item.content[t].type === 'text') {
      return { property: 'message.content[' + itemIndex + '].content[' + t + '].text', text: item.content[t].text };
    }
  }
  return null;
}

// {property, text} of one tool_result item, by its content's shape.
function toolResultTextOfItem(item, itemIndex) {
  if (typeof item.content === 'string') {
    return { property: 'message.content[' + itemIndex + '].content', text: item.content };
  }
  if (Array.isArray(item.content)) { return textBlockResult(item, itemIndex); }
  return null;
}

// {property, text} of the first tool_result in a record, or null.
function findToolResultText(record) {
  if (!record) { return null; }
  if (!record.message) { return null; }
  var content = record.message.content;
  if (!Array.isArray(content)) { return null; }
  for (var c = 0; c < content.length; c++) {
    if (content[c].type !== 'tool_result') { continue; }
    var found = toolResultTextOfItem(content[c], c);
    if (found) { return found; }
  }
  return null;
}

// {hunkIndex, lineIndex} of lineText inside one hunk's lines ('+' added or
// ' ' context only — '-' lines are not result content), or null.
function findLineInHunk(hunk, hunkIndex, lineText) {
  var lines = Array.isArray(hunk.lines) ? hunk.lines : [];
  for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lines[lineIndex].charAt(0) === '-') { continue; }
    if (lines[lineIndex].slice(1) === lineText) { return { hunkIndex: hunkIndex, lineIndex: lineIndex }; }
  }
  return null;
}

// {hunkIndex, lineIndex} of a result line in toolUseResult.structuredPatch.
function findStructuredPatchLine(record, lineText) {
  if (!record) { return null; }
  if (!record.toolUseResult) { return null; }
  var hunks = record.toolUseResult.structuredPatch;
  if (!Array.isArray(hunks)) { return null; }
  for (var hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
    var found = findLineInHunk(hunks[hunkIndex], hunkIndex, lineText);
    if (found) { return found; }
  }
  return null;
}

// ─── Per-kind materialization ───────────────────────────────────────────────

// Per-line {text, ref} pairs for whole-content text; makeRefForSpan builds
// the kind-appropriate evidenceRef from each line's span.
function pairContentLines(text, makeRefForSpan) {
  var lines = splitContentLines(text);
  return contentLineSpans(text).map(function (span, i) {
    return { text: lines[i], ref: makeRefForSpan(span) };
  });
}

// byLine entries {lineNum, text, ref} from numbered/plain entries.
function pairEntriesWithRefs(event, property, entries) {
  return entries.map(function (entry) {
    var ref = buildTextPropertyRef(event.jsonl, event.jsonlLine, property, entry.startIndex, entry.endIndex);
    return { lineNum: entry.lineNum, text: entry.text, ref: ref };
  });
}

function materializeWrite(event) {
  var record = loadParsedRecord(event.jsonl, event.jsonlLine);
  var lines = pairContentLines(record.toolUseResult.content, function (span) {
    return buildTextPropertyRef(event.jsonl, event.jsonlLine, 'toolUseResult.content', span.startIndex, span.endIndex);
  });
  return { kind: 'write', lines: lines };
}

// The trackedFileBackups key naming this blob (record -> blob provenance).
function findBackupKeyForBlob(record, blobPath) {
  var backups = record.snapshot.trackedFileBackups;
  var keys = Object.keys(backups);
  for (var k = 0; k < keys.length; k++) {
    if (!backups[keys[k]]) { continue; }
    if (backups[keys[k]].backupFileName === path.basename(blobPath)) { return keys[k]; }
  }
  return null;
}

function materializeSnapshot(event) {
  var record = loadParsedRecord(event.jsonl, event.jsonlLine);
  var blobPath = event.snapshot.blob;
  var property = "snapshot.trackedFileBackups['" + findBackupKeyForBlob(record, blobPath) + "']";
  var lines = pairContentLines(fs.readFileSync(blobPath, 'utf8'), function (span) {
    return buildBlobFileRef(event.jsonl, event.jsonlLine, property, blobPath, span.startIndex, span.endIndex);
  });
  return { kind: 'snapshot', lines: lines };
}

// Splice inputs of an edit record (snake/camel both seen in the wild).
function materializeEdit(event) {
  var tr = loadParsedRecord(event.jsonl, event.jsonlLine).toolUseResult;
  var oldString = tr.oldString !== undefined ? tr.oldString : tr.old_string;
  var newString = tr.newString !== undefined ? tr.newString : tr.new_string;
  var replaceAll = tr.replaceAll ? true : Boolean(tr.replace_all);
  return { kind: 'edit', oldString: oldString, newString: newString, replaceAll: replaceAll, floating: event.edit.floating };
}

// byLine entries with refs for read results / cat captures.
function materializeByLineKind(event, kindName, entriesFromText) {
  var result = findToolResultText(loadParsedRecord(event.jsonl, event.jsonlLine));
  return { kind: kindName, byLine: pairEntriesWithRefs(event, result.property, entriesFromText(result.text)) };
}

// In-memory text + refs for one event, by its non-null kind sub-object.
function materializeEvent(event) {
  if (event.write) { return materializeWrite(event); }
  if (event.snapshot) { return materializeSnapshot(event); }
  if (event.fileAbsent) { return { kind: 'fileAbsent' }; }
  if (event.edit) { return materializeEdit(event); }
  if (event.readFull) { return materializeByLineKind(event, 'readFull', numberedLineEntries); }
  if (event.readChunk) { return materializeByLineKind(event, 'readChunk', numberedLineEntries); }
  if (event.cat) { return materializeByLineKind(event, 'cat', catLineEntries); }
  return null;
}

// Evidence for a line AUTHORED by an edit: its structuredPatch location when
// the patch holds it verbatim; else a substring span into newString (boundary
// lines merge edit bytes with pre-existing bytes and may only partially
// match); null when neither locates it.
function refForAuthoredEditLine(event, lineText) {
  var record = loadParsedRecord(event.jsonl, event.jsonlLine);
  var patchLocation = findStructuredPatchLine(record, lineText);
  if (patchLocation) {
    return buildStructuredPatchRef(event.jsonl, event.jsonlLine, 'toolUseResult.structuredPatch', patchLocation.hunkIndex, patchLocation.lineIndex);
  }
  var tr = record.toolUseResult;
  var newString = tr.newString !== undefined ? tr.newString : tr.new_string;
  if (typeof newString !== 'string') { return null; }
  var idx = newString.indexOf(lineText);
  if (idx < 0) { return null; }
  return buildTextPropertyRef(event.jsonl, event.jsonlLine, 'toolUseResult.newString', idx, idx + lineText.length);
}

// Short human-readable rendering of a line for report excerpts.
function makeExcerpt(text) {
  if (typeof text !== 'string') { return null; }
  if (text.length <= 80) { return text; }
  return text.slice(0, 77) + '...';
}

module.exports = {
  splitContentLines: splitContentLines,
  contentLineSpans: contentLineSpans,
  numberedLineEntries: numberedLineEntries,
  catLineEntries: catLineEntries,
  buildTextPropertyRef: buildTextPropertyRef,
  buildStructuredPatchRef: buildStructuredPatchRef,
  buildBlobFileRef: buildBlobFileRef,
  loadParsedRecord: loadParsedRecord,
  findStructuredPatchLine: findStructuredPatchLine,
  materializeEvent: materializeEvent,
  refForAuthoredEditLine: refForAuthoredEditLine,
  makeExcerpt: makeExcerpt
};
