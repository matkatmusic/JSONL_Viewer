// file-event-wishlists: the two wish-list selectors over a transcript's file
// events — readsForFile (read observations) and editsForFile (authored
// modifications). Relocated VERBATIM from file-events-extractors (roadmap item 3,
// Phase 0) so that orchestrator stays under the 250-line write cap once item 3's
// emission wiring lands. Sole callers are the wish-list tests; one canonical
// home — importers point here directly (no re-export shim on the old module).

var extractFileEvents = require('./file-events-extractors').extractFileEvents;
var eventHasAnyKind = require('./file-event-kinds').eventHasAnyKind;

// The read-ish observation kinds and the authored-modification kinds — the two
// partitions readsForFile / editsForFile select (snapshot/fileAbsent are neither).
var READ_EVENT_KINDS = ['readFull', 'readChunk', 'cat'];
var AUTHORED_EVENT_KINDS = ['write', 'edit'];

// Read observations (readFull/readChunk/cat) for the file — wish-list item 2.
function readsForFile(jsonlPath, aliasPaths, snapshotsDir) {
  return extractFileEvents(jsonlPath, aliasPaths, snapshotsDir).filter(function (event) {
    return eventHasAnyKind(event, READ_EVENT_KINDS);
  });
}

// Authored modifications (write/edit) for the file — wish-list item 3.
function editsForFile(jsonlPath, aliasPaths, snapshotsDir) {
  return extractFileEvents(jsonlPath, aliasPaths, snapshotsDir).filter(function (event) {
    return eventHasAnyKind(event, AUTHORED_EVENT_KINDS);
  });
}

module.exports = {
  readsForFile: readsForFile,
  editsForFile: editsForFile
};
