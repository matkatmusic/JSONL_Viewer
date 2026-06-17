// Unified file reconstruction: drift detection, rewind handling, and reconstruction.
// Moved (Phase 5) from common/unified-reconstruct.js, unchanged except the api
// imports drop the ../api/ prefix and applySingleEdit now comes from ./edit-replay.
// CLI behavior moves to tools/unified-reconstruct.js.

var fs, path;
if (typeof module !== 'undefined' && typeof require === 'function') {
  fs = require('fs');
  path = require('path');
  analyzeJSONL = require('./rewind-classification').analyzeJSONL;
  applySingleEdit = require('./edit-replay').applySingleEdit;
  var patchMod = require('./unified-reconstruct-patch');
  diffAgainstPatch = patchMod.diffAgainstPatch;
  applyPatchToState = patchMod.applyPatchToState;
  var stepsMod = require('./unified-reconstruct-steps');
  makeStep = stepsMod.makeStep;
  tryParseUnified = stepsMod.tryParseUnified;
  matchesTargetFile = stepsMod.matchesTargetFile;
  extractStepsFromJSONLs = stepsMod.extractStepsFromJSONLs;
}

// ─── Drift detection and source application ───────────────────────────────────

function detectFullContentDrift(stateContent, sourceContent) {
  return stateContent === sourceContent ? null : { before: stateContent, after: sourceContent };
}

function detectDrift(state, step) {
  if (step.snapshot) { return detectFullContentDrift(state.content, step.snapshot); }
  if (step.originalFile) { return detectFullContentDrift(state.content, step.originalFile); }
  if (step.readResult) { return detectFullContentDrift(state.content, step.readResult); }
  if (step.bashReadResult) { return detectFullContentDrift(state.content, step.bashReadResult); }
  if (step.structuredPatch) { return diffAgainstPatch(state.content, step.structuredPatch); }
  return null;
}

function applySourceToState(state, step) {
  if (step.snapshot) { state.content = step.snapshot; return; }
  if (step.originalFile) { state.content = applySingleEdit(step.edit, step.originalFile); return; }
  if (step.readResult) { state.content = step.readResult; return; }
  if (step.bashReadResult) { state.content = step.bashReadResult; return; }
  if (step.structuredPatch) { state.content = applyPatchToState(state.content, step.structuredPatch); return; }
  if (step.edit) { state.content = applySingleEdit(step.edit, state.content); return; }
}

// ─── Patch recording and core algorithm ───────────────────────────────────────

function classifySourceType(step) {
  if (step.snapshot) { return 'snapshot'; }
  if (step.originalFile) { return 'originalFile'; }
  if (step.readResult) { return 'readResult'; }
  if (step.bashReadResult) { return 'bashReadResult'; }
  if (step.structuredPatch) { return 'structuredPatch'; }
  return 'edit';
}

function recordPatch(state, patchDiff, type, step) {
  state.patches.push({
    type: type,
    diff: patchDiff,
    line: step.line,
    timestamp: step.timestamp,
    sourceType: classifySourceType(step)
  });
}

function applyAndAccountForDrift(state, step) {
  var driftDiff = detectDrift(state, step);
  if (driftDiff !== null) {
    recordPatch(state, driftDiff, 'UserEdit', step);
  }
  var oldContent = state.content;
  applySourceToState(state, step);
  if (state.content !== oldContent) {
    recordPatch(state, { before: oldContent, after: state.content }, 'AgentEdit', step);
  }
}

// ─── Rewind handling ──────────────────────────────────────────────────────────

function isLineIgnoredByRewind(lineNum, rewinds) {
  for (var r = 0; r < rewinds.length; r++) {
    if (rewinds[r].landingLine <= lineNum) { continue; }
    if (rewinds[r].classification !== 'code-restoration') { continue; }
    if (rewinds[r].parentLine >= lineNum) { continue; }
    return true;
  }
  return false;
}

function makeObservationOnly(step) {
  return makeStep(step.line, step.timestamp, step.sourceFile, {
    snapshot: step.snapshot,
    readResult: step.readResult,
    bashReadResult: step.bashReadResult
  });
}

function hasObservation(step) {
  return step.snapshot !== null || step.readResult !== null || step.bashReadResult !== null;
}

// ─── Entry points ─────────────────────────────────────────────────────────────

function getRewindsBySource(jsonlTexts) {
  var rewindsBySource = {};
  for (var j = 0; j < jsonlTexts.length; j++) {
    var analysis = analyzeJSONL(jsonlTexts[j].text);
    rewindsBySource[jsonlTexts[j].path] = analysis.rewinds;
  }
  return rewindsBySource;
}

function processStepWithRewind(state, step, rewinds) {
  if (isLineIgnoredByRewind(step.line, rewinds)) { return; }
  applyAndAccountForDrift(state, step);
}

function reconstructFromJSONLTexts(jsonlTexts, targetFile) {
  var state = { content: '', patches: [] };
  var steps = extractStepsFromJSONLs(jsonlTexts, targetFile);
  var rewindsBySource = getRewindsBySource(jsonlTexts);
  for (var i = 0; i < steps.length; i++) {
    var rewinds = rewindsBySource[steps[i].sourceFile] || [];
    processStepWithRewind(state, steps[i], rewinds);
  }
  return state;
}

// ─── Filesystem entry point (Node-only) ───────────────────────────────────────

function mentionsFile(text, targetFile, basename) {
  return text.indexOf(targetFile) !== -1 || text.indexOf(basename) !== -1;
}

function extractSessionStart(text) {
  var lines = text.split('\n');
  for (var i = 0; i < Math.min(lines.length, 5); i++) {
    var obj = tryParseUnified(lines[i]);
    if (obj && obj.timestamp) { return obj.timestamp; }
  }
  return '';
}

function isJsonlFile(f) { return f.endsWith('.jsonl'); }

function sortBySessionStart(a, b) {
  return extractSessionStart(a.text) < extractSessionStart(b.text) ? -1 : 1;
}

function getJsonlFilesForFile(folder, targetFile) {
  var allJsonls = fs.readdirSync(folder).filter(isJsonlFile);
  var basename = targetFile.split('/').pop();
  var matching = [];
  for (var i = 0; i < allJsonls.length; i++) {
    var text = fs.readFileSync(path.join(folder, allJsonls[i]), 'utf8');
    if (mentionsFile(text, targetFile, basename)) {
      matching.push({ path: allJsonls[i], text: text });
    }
  }
  matching.sort(sortBySessionStart);
  return matching;
}

function reconstructFromFolder(folder, targetFile) {
  var jsonls = getJsonlFilesForFile(folder, targetFile);
  return reconstructFromJSONLTexts(jsonls, targetFile);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  var _p = require('./unified-reconstruct-patch');
  var _s = require('./unified-reconstruct-steps');
  var _local = {
    detectFullContentDrift: detectFullContentDrift,
    detectDrift: detectDrift, applySourceToState: applySourceToState,
    classifySourceType: classifySourceType, recordPatch: recordPatch,
    applyAndAccountForDrift: applyAndAccountForDrift,
    isLineIgnoredByRewind: isLineIgnoredByRewind,
    makeObservationOnly: makeObservationOnly, hasObservation: hasObservation,
    reconstructFromJSONLTexts: reconstructFromJSONLTexts,
    reconstructFromFolder: reconstructFromFolder
  };
  var _all = {}, _k;
  for (_k in _p) { _all[_k] = _p[_k]; }
  for (_k in _s) { _all[_k] = _s[_k]; }
  for (_k in _local) { _all[_k] = _local[_k]; }
  module.exports = _all;
}
