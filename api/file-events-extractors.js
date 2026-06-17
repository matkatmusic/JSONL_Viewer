// file-events-extractors: per-file event extraction with timestamps (the
// sidecar event representation). Turns ONE transcript into schema-shaped events:
//   { jsonl, jsonlLine, unixMs, timestamp } plus EXACTLY ONE non-null kind
//   sub-object: snapshot | fileAbsent | write | edit | readFull | readChunk | cat.
// The non-null sub-object IS the kind — there is no separate kind string.
// Moved (Phase 4) from tools/extract-file-events.js; the observation extractors
// it composes now live in api/file-event-observations.js and
// api/split-read-assembly.js. extractEditsFromJSONL comes from
// api/edit-stream-extraction (Phase 5 home).

var fs = require('fs');
var extractEditsFromJSONL = require('./edit-stream-extraction').extractEditsFromJSONL;
var analyzeJSONL = require('./rewind-classification').analyzeJSONL;
var extractBashCatEdits = require('./file-event-observations').extractBashCatEdits;
var extractReadEvents = require('./split-read-assembly').extractReadEvents;
var editBelongsToFile = require('./file-historical-lineage').editBelongsToFile;
var fileEventKinds = require('./file-event-kinds');
var createKindEvent = fileEventKinds.createKindEvent;
var snapshotEvents = require('./snapshot-events');
var snapshotEventsForFile = snapshotEvents.snapshotEventsForFile;
var defaultSnapshotsBase = snapshotEvents.defaultSnapshotsBase;
var bashOpEventsForFile = require('./bash-op-events').bashOpEventsForFile;
var patchContextEventsFromEdits = require('./structured-patch-events').patchContextEventsFromEdits;
var bashReadEventsForFile = require('./bash-read-events').bashReadEventsForFile;
var grepMatchEventsForFile = require('./grep-tool-events').grepMatchEventsForFile;
var extractSessionMetadata = require('./transcript-parsers').extractSessionMetadata;
var resolveAgainstCwd = require('./file-historical-lineage').resolveAgainstCwd;

// The harness caps an offset/limit-less Read at 2000 lines, so a result of
// exactly 2000 lines proves NOTHING about the tail (the EOF lesson: a
// gap-free read can still be a truncated prefix).
var DEFAULT_READ_LINE_CAP = 2000;

// ─── Transcript parsing ─────────────────────────────────────────────────────

function tryParseJson(line) {
  try { return JSON.parse(line); } catch (e) { return null; }
}

// Parse non-empty JSONL lines once; parsed[i] pairs with jsonlLine i+1.
function parseRecords(lines) {
  var parsed = [];
  for (var i = 0; i < lines.length; i++) { parsed.push(tryParseJson(lines[i])); }
  return parsed;
}

// The first sessionId any record carries, or '' (subagent transcripts have
// no snapshots, so a missing sessionId only disables blob resolution).
function findSessionId(parsed) {
  for (var i = 0; i < parsed.length; i++) {
    if (!parsed[i]) { continue; }
    if (parsed[i].sessionId) { return parsed[i].sessionId; }
  }
  return '';
}

// ISO timestamp of the record at a parsed index, or null. An event whose
// record carries no timestamp cannot join a time-keyed timeline — excluded.
function recordTimestampAt(parsed, index) {
  var record = parsed[index];
  if (!record) { return null; }
  return record.timestamp ? record.timestamp : null;
}

// ─── Authored events (write / edit) ─────────────────────────────────────────

// statusByLine map (1-based line -> status) from analyzeJSONL's edits.
function buildStatusByLine(classifiedEdits) {
  var statusByLine = {};
  for (var i = 0; i < classifiedEdits.length; i++) {
    statusByLine[classifiedEdits[i].line] = classifiedEdits[i].status;
  }
  return statusByLine;
}

// 'write' | 'edit' for an authored edit, null for observations (read/cat/
// snapshot sourced) and bash-op records.
function authoredKindForEdit(edit) {
  if (edit.source) { return null; }
  if (edit.type === 'create') { return 'write'; }
  if (edit.type === 'update') { return 'write'; }
  if (edit.type === 'edit') { return 'edit'; }
  return null;
}

// One authored event from one extracted edit, or null when it is not an
// authored kept edit of this file. Only success-confirmed writes exist as
// toolUseResult records at all, so reaching here IS the success confirmation.
function buildAuthoredEvent(jsonlPath, parsed, edit, statusByLine, aliasSet, aliasPaths) {
  var kind = authoredKindForEdit(edit);
  if (!kind) { return null; }
  if (!editBelongsToFile(edit, aliasSet, aliasPaths)) { return null; }
  if (statusByLine[edit.line + 1] === 'ignored') { return null; }
  var isoTimestamp = recordTimestampAt(parsed, edit.line);
  if (!isoTimestamp) { return null; }
  // floating starts false; the TRACKER flips it when old_string cannot be
  // located in currently known content.
  var kindFields = kind === 'edit' ? { floating: false } : {};
  return createKindEvent(jsonlPath, edit.line + 1, isoTimestamp, kind, kindFields);
}

// Write/edit events for the kept (non-rewound) edits of this file.
function authoredEventsFromKeptEdits(jsonlPath, parsed, edits, statusByLine, aliasPaths) {
  var aliasSet = new Set(aliasPaths);
  var events = [];
  for (var i = 0; i < edits.length; i++) {
    var event = buildAuthoredEvent(jsonlPath, parsed, edits[i], statusByLine, aliasSet, aliasPaths);
    if (event) { events.push(event); }
  }
  return events;
}

// ─── originalFile events (whole-file pre-edit observation) ───────────────────

// One originalFile observation from one extracted edit, or null. The edit
// carries the ENTIRE pre-edit file in .originalFile; surfacing it as a
// whole-file observation at the edit's instant pins belief and exposes drift.
// Kind fields are {} — content is sourced via refs at materialization.
function buildOriginalFileEvent(jsonlPath, parsed, edit, statusByLine, aliasSet, aliasPaths) {
  if (edit.type !== 'edit') { return null; }
  if (typeof edit.originalFile !== 'string') { return null; }
  if (edit.originalFile === '') { return null; }
  if (!editBelongsToFile(edit, aliasSet, aliasPaths)) { return null; }
  if (statusByLine[edit.line + 1] === 'ignored') { return null; }
  var isoTimestamp = recordTimestampAt(parsed, edit.line);
  if (!isoTimestamp) { return null; }
  return createKindEvent(jsonlPath, edit.line + 1, isoTimestamp, 'originalFile', {});
}

// originalFile events for the kept edits of this file that carry pre-edit content.
function originalFileEventsFromEdits(jsonlPath, parsed, edits, statusByLine, aliasPaths) {
  var aliasSet = new Set(aliasPaths);
  var events = [];
  for (var i = 0; i < edits.length; i++) {
    var event = buildOriginalFileEvent(jsonlPath, parsed, edits[i], statusByLine, aliasSet, aliasPaths);
    if (event) { events.push(event); }
  }
  return events;
}

// ─── Read events (readFull / readChunk) ─────────────────────────────────────

// True when the read PROVED it saw end-of-file: it returned fewer lines than
// it asked for (or than the harness default cap when it asked for nothing).
function readProvedEof(lineCount, requestedLimit) {
  if (requestedLimit === null) { return lineCount < DEFAULT_READ_LINE_CAP; }
  return lineCount < requestedLimit;
}

// readFull only for a read that started at line 1 AND proved EOF; anything
// weaker is a readChunk overlay with explicit geometry.
function buildReadKindEvent(jsonlPath, readEvent) {
  var lineCount = readEvent.contentLines.length;
  var provedEof = readProvedEof(lineCount, readEvent.requestedLimit);
  if (readEvent.firstLineNumber === 1) {
    if (provedEof) {
      return createKindEvent(jsonlPath, readEvent.jsonlLine, readEvent.timestamp, 'readFull', {});
    }
  }
  var chunk = { firstLine: readEvent.firstLineNumber, lineCount: lineCount, hitEof: provedEof };
  return createKindEvent(jsonlPath, readEvent.jsonlLine, readEvent.timestamp, 'readChunk', chunk);
}

// readFull/readChunk events for every Read of this file with a timestamp.
function readEventsForFile(jsonlPath, jsonlText, aliasSet) {
  var readEvents = extractReadEvents(jsonlText);
  var events = [];
  for (var i = 0; i < readEvents.length; i++) {
    if (!aliasSet.has(readEvents[i].filePath)) { continue; }
    if (!readEvents[i].timestamp) { continue; }
    events.push(buildReadKindEvent(jsonlPath, readEvents[i]));
  }
  return events;
}

// ─── Cat events ─────────────────────────────────────────────────────────────

// cat events for every Bash cat capture of this file. The raw cat path may be relative, so
// resolve it against the session cwd before the alias test (File-path-handling convention).
function catEventsForFile(jsonlPath, jsonlText, parsed, aliasSet) {
  var cwd = extractSessionMetadata(jsonlText).cwd;
  var catEdits = extractBashCatEdits(jsonlText.split('\n'), parsed);
  var events = [];
  for (var i = 0; i < catEdits.length; i++) {
    var resolved = resolveAgainstCwd(cwd, catEdits[i].filePath);
    if (!aliasSet.has(resolved)) { continue; }
    var isoTimestamp = recordTimestampAt(parsed, catEdits[i].line);
    if (!isoTimestamp) { continue; }
    events.push(createKindEvent(jsonlPath, catEdits[i].line + 1, isoTimestamp, 'cat', {}));
  }
  return events;
}

// ─── Public API ─────────────────────────────────────────────────────────────

function compareByJsonlLine(a, b) {
  return a.jsonlLine - b.jsonlLine;
}

// All events of one transcript that touch the file (any alias path), in
// transcript order. jsonlPath is the label stamped on each event's `jsonl`.
function extractFileEventsFromText(jsonlText, jsonlPath, aliasPaths, snapshotsDir) {
  var lines = jsonlText.split('\n').filter(Boolean);
  var parsed = parseRecords(lines);
  var aliasSet = new Set(aliasPaths);
  var statusByLine = buildStatusByLine(analyzeJSONL(jsonlText).edits);
  var edits = extractEditsFromJSONL(jsonlText);
  var events = authoredEventsFromKeptEdits(jsonlPath, parsed, edits, statusByLine, aliasPaths);
  Array.prototype.push.apply(events, originalFileEventsFromEdits(jsonlPath, parsed, edits, statusByLine, aliasPaths));
  Array.prototype.push.apply(events, patchContextEventsFromEdits(jsonlPath, parsed, edits, statusByLine, aliasPaths));
  Array.prototype.push.apply(events, bashOpEventsForFile(jsonlPath, jsonlText, parsed, aliasSet));
  Array.prototype.push.apply(events, bashReadEventsForFile(jsonlPath, jsonlText, parsed, aliasSet));
  Array.prototype.push.apply(events, grepMatchEventsForFile(jsonlPath, jsonlText, parsed, aliasSet));
  Array.prototype.push.apply(events, readEventsForFile(jsonlPath, jsonlText, aliasSet));
  Array.prototype.push.apply(events, catEventsForFile(jsonlPath, jsonlText, parsed, aliasSet));
  var snapshotContext = {
    aliasSet: aliasSet,
    aliasPaths: aliasPaths,
    sessionId: findSessionId(parsed),
    snapshotsBase: snapshotsDir ? snapshotsDir : defaultSnapshotsBase()
  };
  Array.prototype.push.apply(events, snapshotEventsForFile(jsonlPath, parsed, snapshotContext));
  events.sort(compareByJsonlLine);
  return events;
}

function extractFileEvents(jsonlPath, aliasPaths, snapshotsDir) {
  var jsonlText = fs.readFileSync(jsonlPath, 'utf8');
  return extractFileEventsFromText(jsonlText, jsonlPath, aliasPaths, snapshotsDir);
}

module.exports = {
  extractFileEvents: extractFileEvents,
  extractFileEventsFromText: extractFileEventsFromText,
  authoredEventsFromKeptEdits: authoredEventsFromKeptEdits,
  originalFileEventsFromEdits: originalFileEventsFromEdits,
  catEventsForFile: catEventsForFile,
  readProvedEof: readProvedEof
};
