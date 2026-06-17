// TOMBSTONE (Phase 7, tool-suite migration). The browser-only live bodies kept
// here since Phase 1 (for the viewer <script> tags) are now superseded; the
// viewers load the api/ homes directly:
//   parseJSONLLines / isUserPrompt / extractUserText / collectUserPrompts
//     → api/transcript-parsers.js
//   detectRewinds / classifyRewindType / findBackwardJump /
//   findLastSnapBefore / findFirstSnapAfter / hasWriteBetween
//     → api/rewind-classification.js
// Nothing live remains. Full prior content: git (develop-baseline).
