// ARCHIVED (Phase 4): the whole module moved to api/file-events-extractors.js
// (extractFileEvents, extractFileEventsFromText, authoredEventsFromKeptEdits,
// readProvedEof + internals). Callers import the api home directly. The
// original body is preserved below, commented out.
/*
// extract-file-events: per-file event extraction with timestamps (per-line
// sidecar Phase 2). Turns ONE transcript into schema-shaped events:
//   { jsonl, jsonlLine, unixMs, timestamp } plus EXACTLY ONE non-null kind
//   sub-object: snapshot | fileAbsent | write | edit | readFull | readChunk | cat.
// The non-null sub-object IS the kind — there is no separate kind string.
// Reuses: replay.extractEditsFromJSONL + classify.analyzeJSONL (kept edits
// only), assemble-split-reads' extractReadEvents (chunk geometry), and
// file-historical-lineage's editBelongsToFile (full-path/suffix matching).
// Snapshot beacon semantics extract-file-state discards are handled HERE
// (that module is frozen at its size-exception): isSnapshotUpdate kept,
// fileAbsent (backupFileName null) kept, resume-copies deduped by
// (messageId, snapshot.timestamp), beacon time = snapshot.timestamp.

var fs = require('fs');
var path = require('path');
var os = require('os');
var extractEditsFromJSONL = require('../common/replay-edits').extractEditsFromJSONL;
var analyzeJSONL = require('../api/rewind-classification').analyzeJSONL;
var extractBashCatEdits = require('../common/extract-file-state').extractBashCatEdits;
var extractReadEvents = require('./assemble-split-reads').extractReadEvents;
var editBelongsToFile = require('../api/file-historical-lineage').editBelongsToFile;

var KIND_NAMES = ['snapshot', 'fileAbsent', 'write', 'edit', 'readFull', 'readChunk', 'cat'];

// The harness caps an offset/limit-less Read at 2000 lines, so a result of
// exactly 2000 lines proves NOTHING about the tail (the EOF lesson: a
// gap-free read can still be a truncated prefix).
var DEFAULT_READ_LINE_CAP = 2000;

// ─── Event construction ─────────────────────────────────────────────────────

// An event with all seven kind sub-objects null except kindName.
function createKindEvent(jsonlPath, jsonlLine, isoTimestamp, kindName, kindFields) {
  var event = {
    jsonl: jsonlPath,
    jsonlLine: jsonlLine,
    unixMs: Date.parse(isoTimestamp),
    timestamp: isoTimestamp
  };
  for (var i = 0; i < KIND_NAMES.length; i++) { event[KIND_NAMES[i]] = null; }
  event[kindName] = kindFields;
  return event;
}

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

// cat events for every Bash cat capture of this file with a timestamp.
function catEventsForFile(jsonlPath, lines, parsed, aliasSet) {
  var catEdits = extractBashCatEdits(lines, parsed);
  var events = [];
  for (var i = 0; i < catEdits.length; i++) {
    if (!aliasSet.has(catEdits[i].filePath)) { continue; }
    var isoTimestamp = recordTimestampAt(parsed, catEdits[i].line);
    if (!isoTimestamp) { continue; }
    events.push(createKindEvent(jsonlPath, catEdits[i].line + 1, isoTimestamp, 'cat', {}));
  }
  return events;
}

// ─── Snapshot events (snapshot / fileAbsent) ────────────────────────────────

function defaultSnapshotsBase() {
  return path.join(os.homedir(), '.claude', 'file-history');
}

// One beacon event from one tracked-backup entry, or null. backupFileName
// null is the absence beacon; a non-null name must resolve to a LIVE blob
// (record -> blob chain broken = no beacon).
function buildBackupKindEvent(jsonlPath, jsonlLine, record, entry, sessionId, snapshotsBase) {
  if (!entry) { return null; }
  var isoTimestamp = record.snapshot.timestamp;
  if (!isoTimestamp) { return null; }
  if (!entry.backupFileName) {
    return createKindEvent(jsonlPath, jsonlLine, isoTimestamp, 'fileAbsent', {});
  }
  if (!sessionId) { return null; }
  var blobPath = path.join(snapshotsBase, sessionId, entry.backupFileName);
  if (!fs.existsSync(blobPath)) { return null; }
  var kindFields = { blob: blobPath, isSnapshotUpdate: record.isSnapshotUpdate === true };
  return createKindEvent(jsonlPath, jsonlLine, isoTimestamp, 'snapshot', kindFields);
}

// Append the events of one snapshot record's matching backups.
function appendSnapshotRecordEvents(events, jsonlPath, jsonlLine, record, ctxt) {
  var backups = record.snapshot.trackedFileBackups ? record.snapshot.trackedFileBackups : {};
  var keys = Object.keys(backups);
  for (var k = 0; k < keys.length; k++) {
    if (!editBelongsToFile({ filePath: keys[k], source: 'snapshot' }, ctxt.aliasSet, ctxt.aliasPaths)) { continue; }
    var event = buildBackupKindEvent(jsonlPath, jsonlLine, record, backups[keys[k]], ctxt.sessionId, ctxt.snapshotsBase);
    if (event) { events.push(event); }
  }
}

// Resume-copied snapshots repeat the previous session's entry with its OLD
// embedded snapshot.timestamp — dedup by (messageId, snapshot.timestamp).
function snapshotDedupKey(record) {
  return record.messageId + '|' + record.snapshot.timestamp;
}

// snapshot/fileAbsent beacon events for this file across the transcript.
function snapshotEventsForFile(jsonlPath, parsed, ctxt) {
  var seen = new Set();
  var events = [];
  for (var i = 0; i < parsed.length; i++) {
    var record = parsed[i];
    if (!record) { continue; }
    if (record.type !== 'file-history-snapshot') { continue; }
    if (!record.snapshot) { continue; }
    var dedupKey = snapshotDedupKey(record);
    if (seen.has(dedupKey)) { continue; }
    seen.add(dedupKey);
    appendSnapshotRecordEvents(events, jsonlPath, i + 1, record, ctxt);
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
  var events = authoredEventsFromKeptEdits(jsonlPath, parsed, extractEditsFromJSONL(jsonlText), statusByLine, aliasPaths);
  Array.prototype.push.apply(events, readEventsForFile(jsonlPath, jsonlText, aliasSet));
  Array.prototype.push.apply(events, catEventsForFile(jsonlPath, lines, parsed, aliasSet));
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
  readProvedEof: readProvedEof
};
*/
