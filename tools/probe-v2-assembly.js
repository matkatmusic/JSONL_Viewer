// Transcript ordering + kept-edit assembly for probe-projects-v2 (Phase C).
// Transcripts feeding a file's replay are ordered by the file's earliest touch
// timestamp per transcript; edits are filtered by FULL absolute path (the
// alias set), which is what kills the basename-collision bug.

var fph = require('../api/file-path-history');
var editBelongsToFile = require('../api/file-historical-lineage').editBelongsToFile;

// ─── Transcript ordering ─────────────────────────────────────────────────────

// The earliest touch of any alias path within one transcript's touches, by
// (timestamp, line). Returns null when the transcript never touched the file.
function earliestTouchOfFile(touches, aliasSet) {
  var earliest = null;
  for (var i = 0; i < touches.length; i++) {
    if (!aliasSet.has(touches[i].path)) { continue; }
    if (earliest === null) { earliest = touches[i]; continue; }
    if (fph.compareTouchOrder(touches[i], earliest) < 0) { earliest = touches[i]; }
  }
  return earliest;
}

// Order the transcripts that feed a file's replay by when each FIRST touched
// the file (earliest touch of any alias path, by timestamp then line) — not by
// input or filename order. Returns [{transcriptPath, earliestTimestamp}].
function orderTranscriptsByFirstTouch(transcriptPaths, allJsonlFiles, aliasSet) {
  var touchesByTranscript = {};
  for (var i = 0; i < allJsonlFiles.length; i++) {
    touchesByTranscript[allJsonlFiles[i].file] = allJsonlFiles[i].touches;
  }
  var entries = [];
  for (var t = 0; t < transcriptPaths.length; t++) {
    var touch = earliestTouchOfFile(touchesByTranscript[transcriptPaths[t]] || [], aliasSet);
    if (touch === null) { continue; }
    entries.push({ transcriptPath: transcriptPaths[t], earliestTimestamp: touch.timestamp, firstTouch: touch });
  }
  entries.sort(function (a, b) { return fph.compareTouchOrder(a.firstTouch, b.firstTouch); });
  return entries.map(function (e) {
    return { transcriptPath: e.transcriptPath, earliestTimestamp: e.earliestTimestamp };
  });
}

// ─── Kept-edit assembly ──────────────────────────────────────────────────────
// editBelongsToFile / anyAliasPathEndsWith MOVED to api/file-historical-lineage.js (phase 3).

// // True when some alias path ends with "/<relativePath>" — the full relative
// // path must match, so a mere shared basename is rejected.
// function anyAliasPathEndsWith(aliasPaths, relativePath) {
//   var suffix = '/' + relativePath;
//   for (var i = 0; i < aliasPaths.length; i++) {
//     if (aliasPaths[i].length <= suffix.length) { continue; }
//     if (aliasPaths[i].lastIndexOf(suffix) === aliasPaths[i].length - suffix.length) { return true; }
//   }
//   return false;
// }

// // True when an edit belongs to this file: its FULL absolute path is in the
// // alias set. Basename matching is exactly the collision bug v2 exists to kill.
// // One exception: snapshot-sourced edits record REPO-RELATIVE paths, so they
// // match by full path-suffix against the alias paths instead.
// function editBelongsToFile(edit, aliasSet, aliasPaths) {
//   if (!edit.filePath) { return false; }
//   if (aliasSet.has(edit.filePath)) { return true; }
//   if (edit.source !== 'snapshot') { return false; }
//   return anyAliasPathEndsWith(aliasPaths, edit.filePath);
// }

// True when the classification kept this edit (classification lines are
// 1-indexed, so edit.line+1 keys the lookup).
function editWasKept(edit, statusByLine) {
  return statusByLine[edit.line + 1] !== 'ignored';
}

// Count an edit toward a transcript's kept/ignored summary and collect kept
// ones. An edit of another file counts toward neither.
function appendTranscriptEdits(keptEdits, counts, transcriptEdits, aliasSet, aliasPaths) {
  for (var i = 0; i < transcriptEdits.edits.length; i++) {
    var edit = transcriptEdits.edits[i];
    if (!editBelongsToFile(edit, aliasSet, aliasPaths)) { continue; }
    if (editWasKept(edit, transcriptEdits.statusByLine)) {
      keptEdits.push(edit);
      counts.kept++;
    } else {
      counts.ignored++;
    }
  }
}

// Assemble one file's kept edits across its ordered transcripts.
// Returns { keptEdits, transcriptsUsed:[{jsonl, kept, ignored, total, earliestTimestamp}] }.
function assembleKeptEdits(aliasPaths, perTranscriptEdits, orderedTranscripts) {
  var aliasSet = new Set(aliasPaths);
  var keptEdits = [];
  var transcriptsUsed = [];
  for (var t = 0; t < orderedTranscripts.length; t++) {
    var entry = perTranscriptEdits[orderedTranscripts[t].transcriptPath];
    if (!entry) { continue; }
    var counts = { kept: 0, ignored: 0 };
    appendTranscriptEdits(keptEdits, counts, entry, aliasSet, aliasPaths);
    transcriptsUsed.push({
      jsonl: orderedTranscripts[t].transcriptPath,
      kept: counts.kept,
      ignored: counts.ignored,
      total: counts.kept + counts.ignored,
      earliestTimestamp: orderedTranscripts[t].earliestTimestamp
    });
  }
  return { keptEdits: keptEdits, transcriptsUsed: transcriptsUsed };
}

// ─── Trailing-observation trim ───────────────────────────────────────────────

// Observation edits record what a session SAW (Read tool / cat), not what it
// authored. cat output in particular can be lossy (piped, truncated).
function isObservationEdit(edit) {
  if (edit.source === 'read') { return true; }
  return edit.source === 'cat';
}

// Drop the trailing run of observation edits so the replay can be retried
// ending at the last AUTHORED state. Mid-stream observations stay — they
// re-seed content between authored edits.
function dropTrailingObservationEdits(keptEdits) {
  var end = keptEdits.length;
  while (end > 0) {
    if (!isObservationEdit(keptEdits[end - 1])) { break; }
    end--;
  }
  return { edits: keptEdits.slice(0, end), droppedCount: keptEdits.length - end };
}

module.exports = {
  orderTranscriptsByFirstTouch: orderTranscriptsByFirstTouch,
  assembleKeptEdits: assembleKeptEdits,
  dropTrailingObservationEdits: dropTrailingObservationEdits,
  isObservationEdit: isObservationEdit
};
