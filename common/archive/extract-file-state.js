// TOMBSTONE (Phase 5 of the tool-suite migration). All of this module's code
// has moved to the api/ layer; nothing live remains here. The file is kept in
// place ONLY because the jfred / unified / diff viewer pages still <script src>
// it; phase 7 repoints those tags and archives this file. Full prior content is
// on develop-baseline (git diff develop-baseline -- common/extract-file-state.js).
//
// Moved to:
//   findLastSnapshotContent, findLastSnapshotBlob (+ their parse/scan helpers)
//     → api/reconstruction-reference-sources.js
//   defaultBaseHistoryDir, resolveHistoryDir, readBackupFile, getSnapshotBackups
//     → api/snapshot-store-io.js
//   stripCatLineNumbers, extractBashCatEdits, extractReadEdits, extractSnapshotEdits
//     → api/file-event-observations.js (already moved in Phase 4)
