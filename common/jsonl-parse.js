// Shared JSONL parsing helpers used by classify-edits.js and detect-rewinds.js.

// Extract the first text string from a message content value.
// Returns the text or '' if none found.
function extractTextFromContent(c) {
  if (typeof c === 'string') {
    return c;
  }
  if (Array.isArray(c)) {
    for (var j = 0; j < c.length; j++) {
      if (c[j].type === 'text' && c[j].text) {
        return c[j].text;
      }
    }
  }
  return '';
}

// Check if text looks like a CLI command artifact.
function isCommandArtifact(txt) {
  return /^<(command-name|local-command|command-message)/.test(txt);
}

// Identify conversational user prompts — messages where the user typed something.
// Excludes tool_result messages (system-generated responses to tool_use calls)
// and CLI command artifacts (/exit, /clear, etc.) which generate internal
// message sequences with backward parentUuid jumps that look like rewinds.
function isUserPrompt(obj) {
  if (!obj || obj.type !== 'user' || !obj.message) {
    return false;
  }
  var c = obj.message.content;
  if (Array.isArray(c) && c.length > 0 && c[0].type === 'tool_result') {
    return false;
  }
  if (isCommandArtifact(extractTextFromContent(c))) {
    return false;
  }
  return true;
}

// Extract the user's text from a user message object.
function extractUserText(obj) {
  return extractTextFromContent(obj.message.content);
}

// Find the last snapshot with .line strictly before lineIdx, or null.
function findLastSnapBefore(snapshots, lineIdx) {
  var result = null;
  for (var s = 0; s < snapshots.length; s++) {
    if (snapshots[s].line < lineIdx) {
      result = snapshots[s];
    } else {
      break;
    }
  }
  return result;
}

// Find the first snapshot with .line at or after lineIdx, or null.
function findFirstSnapAfter(snapshots, lineIdx) {
  for (var s = 0; s < snapshots.length; s++) {
    if (snapshots[s].line >= lineIdx) {
      return snapshots[s];
    }
  }
  return null;
}

// Check if any write in fileWrites has .line strictly between startLine and endLine.
function hasWriteBetween(fileWrites, startLine, endLine) {
  for (var w = 0; w < fileWrites.length; w++) {
    if (fileWrites[w].line > startLine && fileWrites[w].line < endLine) {
      return true;
    }
  }
  return false;
}

// Walk the parent chain from cur, collecting visited lines.
// Returns the first target line that is before threshold, or -1.
function walkParentChain(parsed, uuidToIdx, cur, threshold) {
  var visited = {};
  while (cur && cur.parentUuid) {
    var pLine = uuidToIdx[cur.parentUuid];
    if (pLine === undefined || visited[pLine]) {
      break;
    }
    visited[pLine] = true;
    if (pLine < threshold) {
      return pLine;
    }
    cur = parsed[pLine];
  }
  return -1;
}

// Walk the parent chain from lineIdx backward, looking for a link that
// jumps to a line significantly earlier in the file.
// Returns the target line index or -1 if no backward jump found.
function findBackwardJump(parsed, uuidToIdx, lineIdx) {
  return walkParentChain(parsed, uuidToIdx, parsed[lineIdx], lineIdx - 3);
}

// Build a single prompt entry from a parsed object at index i.
function buildPromptEntry(parsed, uuidToIdx, i) {
  var parentLine = parsed[i].parentUuid ? uuidToIdx[parsed[i].parentUuid] : -1;
  return {
    line: i,
    parentLine: parentLine !== undefined ? parentLine : -1,
    text: extractUserText(parsed[i]),
    uuid: parsed[i].uuid,
    parentUuid: parsed[i].parentUuid
  };
}

// Collect all user prompts with resolved parent line indices.
function collectUserPrompts(parsed, uuidToIdx) {
  var prompts = [];
  for (var i = 0; i < parsed.length; i++) {
    if (isUserPrompt(parsed[i])) {
      prompts.push(buildPromptEntry(parsed, uuidToIdx, i));
    }
  }
  return prompts;
}

// Check prev-to-before window for code-restoration signal.
function checkPrevWindow(snapPrev, snapBefore, fileWrites) {
  if (snapPrev && snapBefore) {
    var changed = JSON.stringify(snapPrev.files) !== JSON.stringify(snapBefore.files);
    if (changed && !hasWriteBetween(fileWrites, snapPrev.line, snapBefore.line)) {
      return true;
    }
  }
  return false;
}

// Check before-to-after window for code-restoration signal.
function checkBeforeAfterWindow(snapBefore, snapAfter, fileWrites) {
  if (snapBefore && snapAfter && snapBefore.line !== snapAfter.line) {
    var changed = JSON.stringify(snapBefore.files) !== JSON.stringify(snapAfter.files);
    if (changed && !hasWriteBetween(fileWrites, snapBefore.line, snapAfter.line)) {
      return true;
    }
  }
  return false;
}

// Check if any file in snapBefore has version > 1 with null backup.
function checkBackupVersions(snapBefore) {
  if (!snapBefore) {
    return false;
  }
  var fnames = Object.keys(snapBefore.files);
  for (var fi = 0; fi < fnames.length; fi++) {
    var fv = snapBefore.files[fnames[fi]];
    if (fv.version > 1 && fv.backup === null) {
      return true;
    }
  }
  return false;
}

// Run the 3-window heuristic to classify a rewind.
function classifyByWindows(snapPrev, snapBefore, snapAfter, fileWrites) {
  if (checkPrevWindow(snapPrev, snapBefore, fileWrites)) {
    return 'code-restoration';
  }
  if (checkBeforeAfterWindow(snapBefore, snapAfter, fileWrites)) {
    return 'code-restoration';
  }
  if (checkBackupVersions(snapBefore)) {
    return 'code-restoration';
  }
  return 'conversation-only';
}

// Classify a rewind landing as code-restoration or conversation-only using 3-window heuristic.
function classifyRewindType(snapshots, fileWrites, landingLine) {
  var snapBefore = findLastSnapBefore(snapshots, landingLine);
  var snapAfter = findFirstSnapAfter(snapshots, landingLine);
  var snapPrev = snapBefore ? findLastSnapBefore(snapshots, snapBefore.line) : null;
  var classification = classifyByWindows(snapPrev, snapBefore, snapAfter, fileWrites);
  return { classification: classification, snapBefore: snapBefore, snapAfter: snapAfter };
}

// Check sibling signal: parentUuid seen before.
// Mutates p.parentLine if needed. Returns true if sibling detected.
function checkSiblingSignal(p, seenParents, uuidToIdx) {
  if (p.parentUuid && seenParents[p.parentUuid] !== undefined) {
    if (p.parentLine < 0) {
      p.parentLine = uuidToIdx[p.parentUuid] || 0;
    }
    return true;
  }
  return false;
}

// Check the 3 rewind signals: backward jump, indirect jump, sibling detection.
// Returns true if prompt p is a rewind, and mutates p.parentLine if needed.
function checkRewindSignals(p, highWater, seenParents, parsed, uuidToIdx) {
  if (p.parentLine >= 0 && p.parentLine < highWater - 3) {
    return true;
  }
  var bjt = findBackwardJump(parsed, uuidToIdx, p.line);
  if (bjt >= 0 && bjt < highWater - 3) {
    p.parentLine = bjt;
    return true;
  }
  return checkSiblingSignal(p, seenParents, uuidToIdx);
}

// Build a rewind record from a prompt and classification result.
function buildRewindEntry(p, classResult) {
  return {
    landingLine: p.line,
    parentLine: p.parentLine,
    text: p.text || '',
    classification: classResult.classification,
    snapBefore: classResult.snapBefore,
    snapAfter: classResult.snapAfter
  };
}

// Update tracking state (seenParents, highWater) after processing a prompt.
// Returns the new highWater value.
function updateRewindTracking(p, seenParents, highWater) {
  if (p.parentUuid && seenParents[p.parentUuid] === undefined) {
    seenParents[p.parentUuid] = p.line;
  }
  return p.line > highWater ? p.line : highWater;
}

// Detect rewinds using 3 signals: backward jump, indirect jump, sibling detection.
// Returns 0-based line numbers.
function detectRewinds(prompts, parsed, uuidToIdx, snapshots, fileWrites) {
  var rewinds = [];
  var highWater = 0;
  var seenParents = {};
  for (var u = 0; u < prompts.length; u++) {
    var p = prompts[u];
    if (checkRewindSignals(p, highWater, seenParents, parsed, uuidToIdx)) {
      var r = classifyRewindType(snapshots, fileWrites, p.line);
      rewinds.push(buildRewindEntry(p, r));
    }
    highWater = updateRewindTracking(p, seenParents, highWater);
  }
  return rewinds;
}

// Extract version info from a file-history-snapshot object.
function extractSnapshot(obj, lineIdx) {
  var snap = obj.snapshot || {};
  var backups = snap.trackedFileBackups || {};
  var fileVersions = {};
  Object.keys(backups).forEach(function (f) {
    var b = backups[f];
    if (b && typeof b === 'object') {
      fileVersions[f] = { version: b.version, backup: b.backupFileName || null };
    }
  });
  return { line: lineIdx, msgId: snap.messageId, files: fileVersions };
}

// Check if a toolUseResult represents a file write.
function isFileWrite(tr) {
  return tr && (tr.type === 'create' || tr.type === 'update' || tr.type === 'edit'
    || tr.originalFile !== undefined || tr.oldString !== undefined
    || tr.old_string !== undefined || tr.newString !== undefined
    || tr.new_string !== undefined);
}

// Build a file-write entry from a parsed object at index i.
function buildFileWriteEntry(obj, i) {
  var tr = obj.toolUseResult;
  var file = (tr.filePath || '').split('/').pop();
  return { line: i, file: file, type: tr.type || 'edit' };
}

// Index a single parsed line into the data structures.
function indexParsedLine(obj, i, uuidToIdx, snapshots, fileWrites) {
  if (obj.uuid) {
    uuidToIdx[obj.uuid] = i;
  }
  if (obj.type === 'file-history-snapshot') {
    snapshots.push(extractSnapshot(obj, i));
  }
  if (isFileWrite(obj.toolUseResult)) {
    fileWrites.push(buildFileWriteEntry(obj, i));
  }
}

// Try to parse a single JSON line, returning the object or null.
function parseSingleLine(line) {
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}

// Parse JSONL text into indexed data structures.
function parseJSONLLines(text) {
  var lines = text.split('\n').filter(Boolean);
  var parsed = [];
  var uuidToIdx = {};
  var snapshots = [];
  var fileWrites = [];
  for (var i = 0; i < lines.length; i++) {
    var obj = parseSingleLine(lines[i]);
    parsed.push(obj);
    if (obj) {
      indexParsedLine(obj, i, uuidToIdx, snapshots, fileWrites);
    }
  }
  return { parsed: parsed, uuidToIdx: uuidToIdx, snapshots: snapshots, fileWrites: fileWrites };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isUserPrompt: isUserPrompt,
    extractUserText: extractUserText,
    findLastSnapBefore: findLastSnapBefore,
    findFirstSnapAfter: findFirstSnapAfter,
    hasWriteBetween: hasWriteBetween,
    findBackwardJump: findBackwardJump,
    parseJSONLLines: parseJSONLLines,
    collectUserPrompts: collectUserPrompts,
    classifyRewindType: classifyRewindType,
    detectRewinds: detectRewinds
  };
}
