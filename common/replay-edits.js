#!/usr/bin/env node
// Replay kept file edits from a Claude Code JSONL transcript and verify
// the result matches the actual on-disk file.
//
// Usage: node replay-edits.js --jsonl-dir <path> --files-dir <path>

var fs, path, analyzeJSONL, stripCatLineNumbers, extractBashCatEdits;
var extractReadEdits, extractSnapshotEdits, findLastSnapshotContent, gitState;
var extractBashFileOps;
if (typeof module !== 'undefined' && typeof require === 'function') {
  fs = require('fs');
  path = require('path');
  analyzeJSONL = require('./classify-edits').analyzeJSONL;
  var fileState = require('./extract-file-state');
  gitState = require('./git-file-state');
  stripCatLineNumbers = fileState.stripCatLineNumbers;
  extractBashCatEdits = fileState.extractBashCatEdits;
  extractReadEdits = fileState.extractReadEdits;
  extractSnapshotEdits = fileState.extractSnapshotEdits;
  findLastSnapshotContent = fileState.findLastSnapshotContent;
  extractBashFileOps = require('./extract-bash-file-ops').extractBashFileOps;
}

// ─── Helpers for extractEditsFromJSONL ─────────────────────────────────────

// Safely parse a single JSON line, returning the object or null.
function replayTryParse(line) {
  try { return JSON.parse(line); } catch (e) { return null; }
}

// Parse JSONL lines into objects array and extract session ID.
function replayParseLines(lines) {
  var parsed = [];
  var sessionId = '';
  for (var i = 0; i < lines.length; i++) {
    var obj = replayTryParse(lines[i]);
    parsed.push(obj);
    if (!sessionId && obj && obj.sessionId) { sessionId = obj.sessionId; }
  }
  return { parsed: parsed, sessionId: sessionId };
}

// Build a create or update edit object.
function buildCreateOrUpdateEdit(i, filePath, file, tr) {
  return { line: i, filePath: filePath, file: file, type: tr.type, content: tr.content };
}

// Build an edit-type (oldString/newString) edit object.
function buildReplaceEdit(i, filePath, file, tr) {
  return {
    line: i, filePath: filePath, file: file, type: 'edit',
    oldString: tr.oldString !== undefined ? tr.oldString : tr.old_string,
    newString: tr.newString !== undefined ? tr.newString : tr.new_string,
    replaceAll: tr.replaceAll || tr.replace_all || false,
    originalFile: tr.originalFile || null
  };
}

// Check if a toolUseResult is an edit-relevant operation.
function classifyToolUseResult(tr) {
  var isCreate = tr.type === 'create';
  var isUpdate = tr.type === 'update';
  var isEdit = tr.oldString !== undefined || tr.old_string !== undefined;
  return { isCreate: isCreate, isUpdate: isUpdate, isEdit: isEdit };
}

// Process a single parsed object into an edit, or return null.
function buildEditFromToolUseResult(i, tr) {
  var c = classifyToolUseResult(tr);
  if (!c.isCreate && !c.isUpdate && !c.isEdit) { return null; }
  var filePath = tr.filePath || '';
  var file = filePath.split('/').pop();
  if (c.isCreate || c.isUpdate) { return buildCreateOrUpdateEdit(i, filePath, file, tr); }
  return buildReplaceEdit(i, filePath, file, tr);
}

// Extract create/update/edit operations from parsed JSONL objects.
function extractToolUseEdits(parsed) {
  var edits = [];
  for (var i = 0; i < parsed.length; i++) {
    if (!parsed[i] || !parsed[i].toolUseResult) { continue; }
    var edit = buildEditFromToolUseResult(i, parsed[i].toolUseResult);
    if (edit) { edits.push(edit); }
  }
  return edits;
}

// Collect the set of filenames that have Write/Edit (create or edit) entries.
function collectWrittenFileNames(edits) {
  var writtenFiles = {};
  for (var i = 0; i < edits.length; i++) {
    var etype = edits[i].type;
    if (etype === 'create' || etype === 'edit') { writtenFiles[edits[i].file] = true; }
  }
  return writtenFiles;
}

// Append read edits that correspond to written files.
function appendFilteredReadEdits(edits, lines, parsed, writtenFiles) {
  var readEdits = extractReadEdits(lines, parsed);
  for (var r = 0; r < readEdits.length; r++) {
    if (writtenFiles[readEdits[r].file]) { edits.push(readEdits[r]); }
  }
}

// Merge cat, read, and snapshot edits into the main edit array.
function mergeExternalEdits(edits, lines, parsed, sessionId, writtenFiles) {
  var catEdits = extractBashCatEdits(lines, parsed);
  for (var c = 0; c < catEdits.length; c++) { edits.push(catEdits[c]); }
  appendFilteredReadEdits(edits, lines, parsed, writtenFiles);
  var snapshotEdits = extractSnapshotEdits(lines, parsed, sessionId);
  for (var s = 0; s < snapshotEdits.length; s++) { edits.push(snapshotEdits[s]); }
  if (extractBashFileOps) {
    var fileOps = extractBashFileOps(parsed);
    for (var f = 0; f < fileOps.length; f++) { edits.push(fileOps[f]); }
  }
}

// Extract edit operations from JSONL text. Returns an ordered array of edit objects.
function extractEditsFromJSONL(jsonlText) {
  var lines = jsonlText.split('\n').filter(Boolean);
  var result = replayParseLines(lines);
  var edits = extractToolUseEdits(result.parsed);
  var writtenFiles = collectWrittenFileNames(edits);
  mergeExternalEdits(edits, lines, result.parsed, result.sessionId, writtenFiles);
  edits.sort(function (a, b) { return a.line - b.line; });
  return edits;
}

// ─── Helpers for replayEdits ────────────────────────────────────────────────

// Apply a create or update edit, returning updated content.
function applyCreateOrUpdate(edit, content) {
  if (edit.source === 'read' || edit.source === 'snapshot') {
    return edit.content !== content ? edit.content : content;
  }
  return edit.content;
}

// Apply a string-replacement edit, returning updated content.
function applyReplaceOp(edit, content) {
  if (edit.originalFile) { content = edit.originalFile; }
  if (edit.replaceAll) { return content.split(edit.oldString).join(edit.newString); }
  var idx = content.indexOf(edit.oldString);
  if (idx >= 0) {
    return content.substring(0, idx) + edit.newString + content.substring(idx + edit.oldString.length);
  }
  return content;
}

// Apply a single edit to content, dispatching by type.
function applySingleEdit(edit, content) {
  if (edit.type === 'create' || edit.type === 'update') { return applyCreateOrUpdate(edit, content); }
  if (edit.type === 'edit') { return applyReplaceOp(edit, content); }
  return content;
}

// Replay edits in memory. Applies edits in order starting from empty string.
function replayEdits(edits) {
  var content = '';
  for (var i = 0; i < edits.length; i++) { content = applySingleEdit(edits[i], content); }
  return content;
}

// ─── Helpers for computeDiff ────────────────────────────────────────────────

// Build diff entries for a single line index, returning array of diff strings.
function buildDiffForLine(expLines, actLines, i) {
  var e = i < expLines.length ? expLines[i] : undefined;
  var a = i < actLines.length ? actLines[i] : undefined;
  var parts = [];
  if (e !== a) {
    if (e !== undefined) { parts.push('- L' + (i + 1) + ': ' + e); }
    if (a !== undefined) { parts.push('+ L' + (i + 1) + ': ' + a); }
  }
  return parts;
}

// Collect all diff parts across all line indices.
function collectDiffParts(expLines, actLines) {
  var diff = [];
  var max = Math.max(expLines.length, actLines.length);
  for (var i = 0; i < max; i++) {
    var parts = buildDiffForLine(expLines, actLines, i);
    for (var p = 0; p < parts.length; p++) { diff.push(parts[p]); }
  }
  return diff;
}

// Simple line diff between expected and actual strings.
function computeDiff(expected, actual) {
  return collectDiffParts(expected.split('\n'), actual.split('\n')).join('\n');
}

// ─── Helpers for filterKeptEdits ────────────────────────────────────────────

// Build a map of line number -> status from classified edits.
function buildStatusByLineMap(classifiedEdits) {
  var statusByLine = {};
  for (var c = 0; c < classifiedEdits.length; c++) {
    statusByLine[classifiedEdits[c].line] = classifiedEdits[c].status;
  }
  return statusByLine;
}

// Separate kept edits from ignored edits using classification results.
function filterKeptEdits(allEdits, classifiedEdits) {
  var statusByLine = buildStatusByLineMap(classifiedEdits);
  var keptEdits = [];
  var ignoredCount = 0;
  for (var i = 0; i < allEdits.length; i++) {
    if (statusByLine[allEdits[i].line + 1] === 'ignored') { ignoredCount++; }
    else { keptEdits.push(allEdits[i]); }
  }
  return { keptEdits: keptEdits, ignoredCount: ignoredCount };
}

// ─── Helpers for replayAndVerify ────────────────────────────────────────────

// Build the verification result object.
function buildVerifyResult(filename, fileEdits, filtered, replayedContent, onDiskContent) {
  var match = replayedContent === onDiskContent;
  return {
    filename: filename, totalEdits: fileEdits.length,
    kept: filtered.keptEdits.length, ignored: filtered.ignoredCount,
    match: match, replayedContent: replayedContent,
    diff: match ? '' : computeDiff(onDiskContent, replayedContent)
  };
}

// Filter edits to a target file if specified.
function filterEditsToFile(allEdits, targetFile) {
  if (!targetFile) { return allEdits; }
  return allEdits.filter(function(e) { return e.file === targetFile; });
}

// Replay and verify a single JSONL against on-disk content.
function replayAndVerify(jsonlText, onDiskContent, targetFile) {
  var allEdits = extractEditsFromJSONL(jsonlText);
  var classification = analyzeJSONL(jsonlText);
  var fileEdits = filterEditsToFile(allEdits, targetFile);
  var filtered = filterKeptEdits(fileEdits, classification.edits);
  var replayedContent = replayEdits(filtered.keptEdits);
  var filename = fileEdits.length > 0 ? fileEdits[0].file : '';
  return buildVerifyResult(filename, fileEdits, filtered, replayedContent, onDiskContent);
}

// ─── Cumulative multi-session replay ──────────────────────────────────────

// Return indices of sessions (in jsonlTexts array) that contain edits for targetFile.
function collectSessionsForFile(jsonlTexts, targetFile) {
  var indices = [];
  for (var i = 0; i < jsonlTexts.length; i++) {
    var edits = extractEditsFromJSONL(jsonlTexts[i]);
    var fileEdits = filterEditsToFile(edits, targetFile);
    if (fileEdits.length > 0) { indices.push(i); }
  }
  return indices;
}

// Extract kept edits for targetFile from a single JSONL text.
function extractKeptEditsForFile(jsonlText, targetFile) {
  var allEdits = extractEditsFromJSONL(jsonlText);
  var classification = analyzeJSONL(jsonlText);
  var fileEdits = filterEditsToFile(allEdits, targetFile);
  var filtered = filterKeptEdits(fileEdits, classification.edits);
  return filtered.keptEdits;
}

// Replay edits from multiple JSONL sessions and verify against on-disk content.
function replayAndVerifyCumulative(jsonlTexts, onDiskContent, targetFile) {
  var allKept = [];
  for (var i = 0; i < jsonlTexts.length; i++) {
    var kept = extractKeptEditsForFile(jsonlTexts[i], targetFile);
    for (var j = 0; j < kept.length; j++) { allKept.push(kept[j]); }
  }
  var replayedContent = replayEdits(allKept);
  var match = replayedContent === onDiskContent;
  return {
    filename: targetFile, totalEdits: allKept.length,
    kept: allKept.length, ignored: 0, match: match,
    replayedContent: replayedContent,
    diff: match ? '' : computeDiff(onDiskContent, replayedContent)
  };
}

// ─── Helpers for batchVerify ────────────────────────────────────────────────

// Build a unique-files map from edits with create/edit type.
function buildUniqueFilesMap(edits) {
  var uniqueFiles = {};
  for (var i = 0; i < edits.length; i++) {
    if (edits[i].file && (edits[i].type === 'create' || edits[i].type === 'edit')) {
      uniqueFiles[edits[i].file] = true;
    }
  }
  return uniqueFiles;
}

// Collect unique target filenames from create/edit operations.
function collectTargetFiles(edits) {
  var targetFiles = Object.keys(buildUniqueFilesMap(edits));
  if (targetFiles.length === 0 && edits.length > 0) { targetFiles = [edits[0].file]; }
  return targetFiles;
}

// Build a "not found" result entry for a missing file.
function buildNotFoundResult(jsonlFile, targetFile, edits) {
  return {
    jsonlFile: jsonlFile, filename: targetFile, totalEdits: edits.length,
    kept: 0, ignored: 0, match: false, replayedContent: '',
    diff: targetFile + ' not found on disk or in file-history', error: 'file not found'
  };
}

// Verify via snapshot when the file is not on disk.
function verifyViaSnapshot(jsonlText, jsonlFile, targetFile) {
  var r = replayAndVerify(jsonlText, findLastSnapshotContent(jsonlText, targetFile), targetFile);
  r.jsonlFile = jsonlFile;
  r.note = 'compared against file-history snapshot (file not on disk)';
  return r;
}

// Build git options from CLI args and JSONL metadata.
function buildGitOpts(jsonlText, edits, cliGitRepo, cliGitBranch) {
  var meta = gitState.extractSessionMetadata(jsonlText);
  var repo = cliGitRepo || meta.cwd || null;
  var branch = cliGitBranch || meta.gitBranch || null;
  if (!repo || !branch) { return null; }
  return { repoRoot: repo, gitBranch: branch, filePathMap: gitState.buildFilePathMap(edits) };
}

// Try git fallback: resolve content from git, replay and verify.
function tryGitFallback(jsonlText, jsonlFile, targetFile, gitOpts) {
  if (!gitOpts) { return null; }
  var content = gitState.resolveGitContent(targetFile, gitOpts.filePathMap, gitOpts.repoRoot, gitOpts.gitBranch);
  if (content === null) { return null; }
  var r = replayAndVerify(jsonlText, content, targetFile);
  r.jsonlFile = jsonlFile;
  r.note = 'compared against git show ' + gitOpts.gitBranch;
  return r;
}

// Handle verification when the target file does not exist on disk.
function verifyMissingFile(jsonlText, jsonlFile, edits, targetFile, results, gitOpts) {
  var snapshotContent = findLastSnapshotContent(jsonlText, targetFile);
  if (snapshotContent !== null) {
    results.push(verifyViaSnapshot(jsonlText, jsonlFile, targetFile));
    return;
  }
  var gitResult = tryGitFallback(jsonlText, jsonlFile, targetFile, gitOpts);
  if (gitResult) { results.push(gitResult); return; }
  results.push(buildNotFoundResult(jsonlFile, targetFile, edits));
}

// Try snapshot fallback when on-disk comparison yields a mismatch.
function trySnapshotFallback(jsonlText, jsonlFile, targetFile, result) {
  var fallbackContent = findLastSnapshotContent(jsonlText, targetFile);
  if (fallbackContent !== null) {
    var fb = replayAndVerify(jsonlText, fallbackContent, targetFile);
    if (fb.match) {
      fb.jsonlFile = jsonlFile;
      fb.note = 'compared against file-history snapshot (on-disk file stale)';
      return fb;
    }
  }
  return result;
}

// Verify a single target file that exists on disk.
function verifyOnDiskFile(jsonlText, jsonlFile, targetFile, onDiskPath, results, gitOpts) {
  var onDiskContent = fs.readFileSync(onDiskPath, 'utf8');
  var result = replayAndVerify(jsonlText, onDiskContent, targetFile);
  result.jsonlFile = jsonlFile;
  if (!result.match) { result = trySnapshotFallback(jsonlText, jsonlFile, targetFile, result); }
  if (!result.match) {
    var gr = tryGitFallback(jsonlText, jsonlFile, targetFile, gitOpts);
    if (gr && gr.match) { result = gr; }
  }
  results.push(result);
}

// Process all target files for a single JSONL file.
function processJsonlTargets(jsonlText, jsonlFile, edits, filesDir, results, gitOpts) {
  var targetFiles = collectTargetFiles(edits);
  for (var tf = 0; tf < targetFiles.length; tf++) {
    var onDiskPath = path.join(filesDir, targetFiles[tf]);
    if (!fs.existsSync(onDiskPath)) {
      verifyMissingFile(jsonlText, jsonlFile, edits, targetFiles[tf], results, gitOpts);
    } else {
      verifyOnDiskFile(jsonlText, jsonlFile, targetFiles[tf], onDiskPath, results, gitOpts);
    }
  }
}

// Process a single JSONL file during batch verification.
function processSingleJsonlFile(jsonlDir, jsonlFile, filesDir, results, cliGitRepo, cliGitBranch) {
  var jsonlText = fs.readFileSync(path.join(jsonlDir, jsonlFile), 'utf8');
  var edits = extractEditsFromJSONL(jsonlText);
  if (edits.length === 0) { return; }
  var gitOpts = buildGitOpts(jsonlText, edits, cliGitRepo, cliGitBranch);
  processJsonlTargets(jsonlText, jsonlFile, edits, filesDir, results, gitOpts);
}

// Batch verify a directory pair.
function batchVerify(jsonlDir, filesDir, cliGitRepo, cliGitBranch) {
  var jsonlFiles = fs.readdirSync(jsonlDir).filter(function (f) { return f.endsWith('.jsonl'); });
  var results = [];
  for (var i = 0; i < jsonlFiles.length; i++) {
    processSingleJsonlFile(jsonlDir, jsonlFiles[i], filesDir, results, cliGitRepo, cliGitBranch);
  }
  return results;
}

// ─── Format helpers ─────────────────────────────────────────────────────────

// Format a single result entry into report lines.
function formatSingleResult(r) {
  var lines = [];
  lines.push((r.jsonlFile || '?') + ' -> ' + r.filename);
  lines.push('  Edits: ' + r.totalEdits + ' total, ' + r.kept + ' kept, ' + r.ignored + ' ignored');
  lines.push('  Replay: ' + (r.match ? 'MATCH' : 'MISMATCH'));
  if (!r.match && r.diff) { lines.push('  ' + r.diff.split('\n').join('\n  ')); }
  lines.push('');
  return lines;
}

// Format batch results as a report string.
function formatResults(results) {
  var lines = [];
  for (var i = 0; i < results.length; i++) {
    var entry = formatSingleResult(results[i]);
    for (var j = 0; j < entry.length; j++) { lines.push(entry[j]); }
  }
  return lines.join('\n');
}

// ─── CLI helpers ────────────────────────────────────────────────────────────

// Map of CLI flag names to their corresponding opts key.
var cliArgMap = { '--jsonl-dir': 'jsonlDir', '--files-dir': 'filesDir', '--jsonl': 'jsonlFile', '--verify': 'verifyFile', '--output': 'outputFile', '--git-repo': 'gitRepo', '--git-branch': 'gitBranch' };

// Apply a single CLI argument to the options object. Returns updated index.
function applyCliArg(opts, argv, i) {
  var key = cliArgMap[argv[i]];
  if (key && i + 1 < argv.length) { opts[key] = argv[++i]; }
  else if (argv[i] === '--json') { opts.jsonFlag = true; }
  return i;
}

// Parse CLI arguments into an options object.
function parseCliArgs(argv) {
  var opts = { jsonlDir: '', filesDir: '', jsonlFile: '', verifyFile: '', outputFile: '', jsonFlag: false, gitRepo: '', gitBranch: '' };
  for (var i = 0; i < argv.length; i++) { i = applyCliArg(opts, argv, i); }
  return opts;
}

// Replay edits from a JSONL file path, returning replay result.
function replayFromFile(jsonlFile) {
  var jsonlText = fs.readFileSync(jsonlFile, 'utf8');
  var allEdits = extractEditsFromJSONL(jsonlText);
  var classification = analyzeJSONL(jsonlText);
  var filtered = filterKeptEdits(allEdits, classification.edits);
  var replayedContent = replayEdits(filtered.keptEdits);
  var filename = allEdits.length > 0 ? allEdits[0].file : '';
  return { filename: filename, totalEdits: allEdits.length, kept: filtered.keptEdits.length, ignored: filtered.ignoredCount, replayedContent: replayedContent };
}

// Print verify results in text format to stdout.
function printVerifyText(replay, match, diff) {
  console.log(replay.filename + ': ' + (match ? 'MATCH' : 'MISMATCH'));
  console.log('  Edits: ' + replay.totalEdits + ' total, ' + replay.kept + ' kept, ' + replay.ignored + ' ignored');
  if (!match && diff) { console.log(diff); }
}

// Run verify mode: compare replayed content against on-disk file.
function runVerifyMode(replay, verifyFile, jsonFlag) {
  var onDiskContent = fs.readFileSync(verifyFile, 'utf8');
  var match = replay.replayedContent === onDiskContent;
  var diff = match ? '' : computeDiff(onDiskContent, replay.replayedContent);
  if (jsonFlag) {
    console.log(JSON.stringify({ filename: replay.filename, totalEdits: replay.totalEdits, kept: replay.kept, ignored: replay.ignored, match: match, replayedContent: replay.replayedContent, diff: diff }, null, 2));
  } else { printVerifyText(replay, match, diff); }
  process.exit(match ? 0 : 1);
}

// Run replay-only mode: output replayed content.
function runReplayOnlyMode(replay, outputFile, jsonFlag) {
  if (jsonFlag) {
    console.log(JSON.stringify({ filename: replay.filename, totalEdits: replay.totalEdits, kept: replay.kept, ignored: replay.ignored, replayedContent: replay.replayedContent }, null, 2));
  } else if (outputFile) {
    fs.writeFileSync(outputFile, replay.replayedContent);
    console.log('Wrote ' + replay.replayedContent.length + ' bytes to ' + outputFile);
  } else { process.stdout.write(replay.replayedContent); }
}

// Run single-file mode: replay and optionally verify.
function runSingleFileMode(opts) {
  var replay = replayFromFile(opts.jsonlFile);
  if (opts.verifyFile) { runVerifyMode(replay, opts.verifyFile, opts.jsonFlag); }
  else { runReplayOnlyMode(replay, opts.outputFile, opts.jsonFlag); }
}

// Run batch mode: verify all JSONL files in a directory.
function runBatchMode(opts) {
  var results = batchVerify(opts.jsonlDir, opts.filesDir, opts.gitRepo, opts.gitBranch);
  console.log(formatResults(results));
  var mismatches = results.filter(function (r) { return !r.match; });
  if (mismatches.length > 0) {
    console.log(mismatches.length + ' MISMATCH(ES) found.');
    process.exit(1);
  } else { console.log('All ' + results.length + ' files MATCH.'); }
}

// Print CLI usage message.
function printUsage() {
  console.error('Usage:');
  console.error('  node replay-edits.js --jsonl <file> [--verify <file>] [--output <path>] [--json]');
  console.error('  node replay-edits.js --jsonl-dir <path> --files-dir <path>');
  process.exit(1);
}

// CLI entry point.
function main() {
  var opts = parseCliArgs(process.argv.slice(2));
  if (opts.jsonlFile) { runSingleFileMode(opts); }
  else if (opts.jsonlDir && opts.filesDir) { runBatchMode(opts); }
  else { printUsage(); }
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractEditsFromJSONL: extractEditsFromJSONL,
    replayEdits: replayEdits,
    replayAndVerify: replayAndVerify,
    batchVerify: batchVerify,
    formatResults: formatResults,
    stripCatLineNumbers: stripCatLineNumbers,
    extractBashCatEdits: extractBashCatEdits,
    extractReadEdits: extractReadEdits,
    extractSnapshotEdits: extractSnapshotEdits,
    applySingleEdit: applySingleEdit,
    collectSessionsForFile: collectSessionsForFile,
    replayAndVerifyCumulative: replayAndVerifyCumulative
  };
}
