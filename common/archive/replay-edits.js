// TOMBSTONE (Phase 5 of the tool-suite migration). All of this module's code
// moved to the api/ layer; nothing live remains here. The file is kept in place
// ONLY because the jfred / unified / diff viewer pages still <script src> it;
// phase 7 repoints those tags and archives this file. Full prior content is on
// the develop-baseline branch (git diff develop-baseline -- common/replay-edits.js).
//
// Moved to:
//   extractEditsFromJSONL, extractKeptEditsForFile, fileModifyingEventsInTranscript
//     → api/edit-stream-extraction.js
//   replayEdits, applySingleEdit
//     → api/edit-replay.js
//   replayAndVerify, replayAndVerifyCumulative, batchVerify, formatResults,
//   collectSessionsForFile
//     → api/replay-verification.js
//   CLI (node replay-edits.js ...) → tools/replay-edits.js
// (The four observation-extractor re-exports F1 named were already removed in Phase 4.)
