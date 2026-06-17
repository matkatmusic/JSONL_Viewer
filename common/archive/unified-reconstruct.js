// TOMBSTONE (Phase 5 of the tool-suite migration). All of this module's code
// has moved to api/unified-reconstruct.js (drift detection, source application,
// rewind handling, reconstructFromJSONLTexts/reconstructFromFolder); the CLI
// moved to tools/unified-reconstruct.js. Nothing live remains here. The file is
// kept in place ONLY because the unified / diff viewer pages still <script src>
// it; phase 7 repoints those tags and archives this file. Full prior content is
// on develop-baseline (git diff develop-baseline -- common/unified-reconstruct.js).
