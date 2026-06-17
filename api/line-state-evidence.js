// line-state-evidence: evidence-reference construction + event materialization
// for the per-line state tracker. Every claim the tracker makes must point at
// a JSONL line (or blob) — these helpers compute the per-line text the tracker
// works on IN MEMORY, paired with the evidenceRef that proves it:
//   { jsonl, jsonlLine, textProperty|structuredPatch|blobFile (exactly one) }.

var fs = require('fs');
var path = require('path');
var recordAccess = require('./evidence-record-access');
var loadParsedRecord = recordAccess.loadParsedRecord;
var findToolResultText = recordAccess.findToolResultText;
var findStructuredPatchLine = recordAccess.findStructuredPatchLine;

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

// Whole-file pre-edit observation: derefs toolUseResult.originalFile into
// per-line entries numbered from 1, each ref a span into that property.
function materializeOriginalFile(event) {
  var text = loadParsedRecord(event.jsonl, event.jsonlLine).toolUseResult.originalFile;
  return { kind: 'originalFile', byLine: pairEntriesWithRefs(event, 'toolUseResult.originalFile', plainLineEntries(text)) };
}

// In-memory text + refs for one event, by its non-null kind sub-object. The
// bash-op materializers live in a sibling module that reuses helpers from here,
// so we require it at CALL time to break the load-time cycle (see bash-op-evidence).
function materializeEvent(event) {
  if (event.write) { return materializeWrite(event); }
  if (event.snapshot) { return materializeSnapshot(event); }
  if (event.fileAbsent) { return { kind: 'fileAbsent' }; }
  if (event.edit) { return materializeEdit(event); }
  if (event.readFull) { return materializeByLineKind(event, 'readFull', numberedLineEntries); }
  if (event.readChunk) { return materializeByLineKind(event, 'readChunk', numberedLineEntries); }
  if (event.cat) { return materializeByLineKind(event, 'cat', catLineEntries); }
  if (event.originalFile) { return materializeOriginalFile(event); }
  if (event.bashRm) { return require('./bash-op-evidence').materializeBashRm(event); }
  if (event.bashTruncate) { return require('./bash-op-evidence').materializeBashTruncate(event); }
  if (event.bashAppend) { return require('./bash-op-evidence').materializeBashAppend(event); }
  if (event.patchContext) { return require('./structured-patch-evidence').materializePatchContext(event); }
  if (event.bashReadChunk) { return require('./bash-read-evidence').materializeBashReadChunk(event); }
  if (event.bashExtent) { return require('./bash-read-evidence').materializeBashExtent(event); }
  if (event.bashGrep) { return require('./bash-read-evidence').materializeBashGrep(event); }
  if (event.grepMatches) { return require('./grep-tool-evidence').materializeGrepMatches(event); }
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
  plainLineEntries: plainLineEntries,
  pairEntriesWithRefs: pairEntriesWithRefs,
  catLineEntries: catLineEntries,
  buildTextPropertyRef: buildTextPropertyRef,
  buildStructuredPatchRef: buildStructuredPatchRef,
  buildBlobFileRef: buildBlobFileRef,
  materializeEvent: materializeEvent,
  refForAuthoredEditLine: refForAuthoredEditLine,
  makeExcerpt: makeExcerpt
};
