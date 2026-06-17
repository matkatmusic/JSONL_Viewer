// snapshot-events: the snapshot/fileAbsent beacon extractor for the sidecar
// event representation. A file-history-snapshot record's trackedFileBackups
// entry becomes a Tier-1 beacon — a live on-disk blob -> 'snapshot'; a null
// backupFileName -> 'fileAbsent' (positive evidence the file did not exist then).
// Extracted from file-events-extractors (roadmap item 1) so the orchestrator
// lands under the 250-line cap. Builds events through file-event-kinds
// .createKindEvent (the shared home -> no file-events-extractors require cycle).

var fs = require('fs');
var path = require('path');
var os = require('os');
var createKindEvent = require('./file-event-kinds').createKindEvent;
var editBelongsToFile = require('./file-historical-lineage').editBelongsToFile;

// The default file-history snapshot blob root (~/.claude/file-history).
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

module.exports = {
  defaultSnapshotsBase: defaultSnapshotsBase,
  buildBackupKindEvent: buildBackupKindEvent,
  appendSnapshotRecordEvents: appendSnapshotRecordEvents,
  snapshotDedupKey: snapshotDedupKey,
  snapshotEventsForFile: snapshotEventsForFile
};
