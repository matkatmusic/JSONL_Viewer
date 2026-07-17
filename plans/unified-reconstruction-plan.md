# Plan: Unified Reconstruction Algorithm Implementation

## Context

The current replay engine (`replay-edits.js`) treats all sources equally — snapshots, originalFile, Read, cat, and edits are merged into one array sorted by line number and replayed sequentially. This misses user edits between turns and doesn't leverage snapshots as ground-truth reset points.

The unified algorithm uses a confidence-ranked source cascade at each step: snapshot > originalFile > Read > cat > structuredPatch. Any drift between the engine's computed state and a higher-confidence source is recorded as a user edit. See `plans/unified-reconstruction-algorithm.md` for the full algorithm spec.

## File Structure

```
RevEng/
├── unified-reconstruct.js     NEW — the algorithm (~300 lines)
├── test-unified-reconstruct.js NEW — tests
└── plans/
    └── unified-reconstruction-algorithm.md  (the spec)
```

## Step Object Shape

Each step bundles all available sources for one point in time:

```js
{
  line: 42,
  timestamp: '2026-06-05T...',
  sourceFile: 'session-abc.jsonl',
  snapshot: 'full file content' or null,
  originalFile: 'full file content' or null,
  readResult: 'full file content' or null,
  bashReadResult: 'full file content' or null,
  structuredPatch: [{ oldStart, oldLines, newStart, newLines, lines }] or null,
  edit: { type: 'create'|'update'|'edit', oldString, newString, content } or null
}
```

## Implementation

### 1. extractStepsFromJSONLs(jsonlTexts, targetFile)

Merges events from multiple JSONL files into one sorted step array.

```js
function extractStepsFromJSONLs(jsonlTexts, targetFile) {
  var allSteps = [];
  for (var j = 0; j < jsonlTexts.length; j++) {
    var steps = extractStepsFromSingleJSONL(jsonlTexts[j].text, targetFile, jsonlTexts[j].path);
    for (var s = 0; s < steps.length; s++) { allSteps.push(steps[s]); }
  }
  allSteps.sort(function(a, b) {
    if (a.timestamp !== b.timestamp) { return a.timestamp < b.timestamp ? -1 : 1; }
    return a.line - b.line;
  });
  return allSteps;
}
```

### 2. extractStepsFromSingleJSONL(jsonlText, targetFile, sourcePath)

Parses one JSONL file and extracts all events relevant to `targetFile`. Each event becomes a step with its available sources populated.

Events to extract:
- **SNAPSHOT**: `type === 'file-history-snapshot'` → extract content from `snapshot.trackedFileBackups` for targetFile
- **EDIT**: `toolUseResult` with `type create/update` or `oldString/newString` → populate `edit`, `originalFile`, `structuredPatch`
- **READ**: `tool_use name="Read"` with matching file path → pair with tool_result to get content
- **CAT**: `tool_use name="Bash"` with `cat <targetFile>` command → pair with tool_result stdout

```js
function extractStepsFromSingleJSONL(jsonlText, targetFile, sourcePath) {
  var lines = jsonlText.split('\n');
  var parsed = parseAllLines(lines);
  var steps = [];
  var basename = targetFile.split('/').pop();

  for (var i = 0; i < parsed.length; i++) {
    var obj = parsed[i];
    if (!obj) { continue; }
    var step = buildStepFromRecord(obj, i, parsed, targetFile, basename, sourcePath);
    if (step) { steps.push(step); }
  }
  return steps;
}
```

### 3. buildStepFromRecord(obj, lineIdx, parsed, targetFile, basename, sourcePath)

Examines a single JSONL record and returns a step object if it's relevant, or null if not.

```js
function buildStepFromRecord(obj, lineIdx, parsed, targetFile, basename, sourcePath) {
  var timestamp = obj.timestamp || '';

  // SNAPSHOT
  if (obj.type === 'file-history-snapshot') {
    var content = getSnapshotContentForFile(obj.snapshot, targetFile, basename);
    if (content === null) { return null; }
    return makeStep(lineIdx, timestamp, sourcePath, { snapshot: content });
  }

  // EDIT (toolUseResult)
  if (obj.toolUseResult) {
    return buildEditStep(obj.toolUseResult, lineIdx, timestamp, targetFile, basename, sourcePath);
  }

  // READ and CAT are extracted by scanning tool_use/tool_result pairs
  // (handled separately via extractReadSteps / extractCatSteps)
  return null;
}
```

### 4. makeStep(line, timestamp, sourceFile, fields)

Factory for step objects with defaults.

```js
function makeStep(line, timestamp, sourceFile, fields) {
  return {
    line: line,
    timestamp: timestamp,
    sourceFile: sourceFile,
    snapshot: fields.snapshot || null,
    originalFile: fields.originalFile || null,
    readResult: fields.readResult || null,
    bashReadResult: fields.bashReadResult || null,
    structuredPatch: fields.structuredPatch || null,
    edit: fields.edit || null
  };
}
```

### 5. applyAndAccountForDrift(state, modificationSource)

Mirrors the pseudocode: diff, record drift, apply, record result. Every step produces a patch entry — user edits AND agent edits — so `state.patches` is the definitive chain of diffs that transforms the empty file into its final state.

```js
function applyAndAccountForDrift(state, modificationSource) {
  var diffOfState = diff(state, modificationSource);
  if (diffOfState !== null) {
    record(state, diffOfState, 'UserEdit', modificationSource);
  }
  var oldContent = state.content;
  applySourceToState(state, modificationSource);
  if (state.content !== oldContent) {
    var editDiff = { before: oldContent, after: state.content };
    record(state, editDiff, 'AgentEdit', modificationSource);
  }
}
```

### 6. diff(state, modificationSource)

Compares current state against the source's pre-edit content. Returns null if identical.

For full-content sources (snapshot, originalFile, readResult, bashReadResult): standard string comparison of `state.content` against the source content.

For structuredPatch: compares `state.content` lines at the patch's target line ranges against the patch's old-lines. Uses context lines as anchors to locate the correct region if line numbers have drifted.

```js
function diff(state, modificationSource) {
  if (modificationSource.structuredPatch) {
    return diffAgainstPatch(state.content, modificationSource.structuredPatch);
  }
  var sourceContent = modificationSource.snapshot
    || modificationSource.originalFile
    || modificationSource.readResult
    || modificationSource.bashReadResult;
  if (state.content === sourceContent) { return null; }
  return { before: state.content, after: sourceContent };
}
```

### 7. applySourceToState(state, modificationSource)

Advances state through the source. For observations (snapshot, read, cat), sets state to the observed content. For originalFile, sets pre-edit state then applies the accompanying edit. For structuredPatch, splices old-lines with new-lines.

```js
function applySourceToState(state, modificationSource) {
  if (modificationSource.snapshot) {
    state.content = modificationSource.snapshot;
    return;
  }
  if (modificationSource.originalFile) {
    state.content = applySingleEdit(modificationSource.edit, modificationSource.originalFile);
    return;
  }
  if (modificationSource.readResult) {
    state.content = modificationSource.readResult;
    return;
  }
  if (modificationSource.bashReadResult) {
    state.content = modificationSource.bashReadResult;
    return;
  }
  if (modificationSource.structuredPatch) {
    state.content = applyPatchToState(state.content, modificationSource.structuredPatch);
    return;
  }
}
```

### 8. diffAgainstPatch(stateContent, hunks)

Compares state lines against a structuredPatch's old-lines at each hunk's target region.

```js
function diffAgainstPatch(stateContent, hunks) {
  var stateLines = stateContent.split('\n');
  for (var h = 0; h < hunks.length; h++) {
    var oldLines = extractOldLines(hunks[h]);
    var offset = findHunkOffset(stateLines, hunks[h], oldLines);
    var actual = stateLines.slice(offset, offset + oldLines.length);
    if (actual.join('\n') !== oldLines.join('\n')) {
      return { hunkIndex: h, expected: oldLines, actual: actual };
    }
  }
  return null;
}
```

### 9. applyPatchToState(stateContent, hunks)

Splices new-lines into state at each hunk's location. Processes hunks in reverse order so line numbers stay valid after each splice.

```js
function applyPatchToState(stateContent, hunks) {
  var stateLines = stateContent.split('\n');
  for (var h = hunks.length - 1; h >= 0; h--) {
    var oldLines = extractOldLines(hunks[h]);
    var newLines = extractNewLines(hunks[h]);
    var offset = findHunkOffset(stateLines, hunks[h], oldLines);
    spliceArray(stateLines, offset, oldLines.length, newLines);
  }
  return stateLines.join('\n');
}
```

### 10. extractOldLines(hunk) / extractNewLines(hunk)

Parse a structuredPatch hunk into its old and new line arrays.

```js
function extractOldLines(hunk) {
  var result = [];
  for (var i = 0; i < hunk.lines.length; i++) {
    var line = hunk.lines[i];
    if (line[0] === ' ' || line[0] === '-') { result.push(line.slice(1)); }
  }
  return result;
}

function extractNewLines(hunk) {
  var result = [];
  for (var i = 0; i < hunk.lines.length; i++) {
    var line = hunk.lines[i];
    if (line[0] === ' ' || line[0] === '+') { result.push(line.slice(1)); }
  }
  return result;
}
```

### 11. findHunkOffset(stateLines, hunk, oldLines)

Locate where the hunk applies in stateLines. Start with the hunk's stated line number, fall back to context-line search if drifted.

```js
function findHunkOffset(stateLines, hunk, oldLines) {
  var stated = hunk.oldStart - 1; // 1-based to 0-based
  // Try stated position first
  if (regionMatches(stateLines, stated, oldLines)) { return stated; }
  // Search nearby (drift window)
  for (var delta = 1; delta <= 20; delta++) {
    if (regionMatches(stateLines, stated - delta, oldLines)) { return stated - delta; }
    if (regionMatches(stateLines, stated + delta, oldLines)) { return stated + delta; }
  }
  // Fallback: return stated position anyway (best effort)
  return stated;
}
```

### 12. record(state, patchDiff, type, modificationSource)

Appends a patch entry to the state's patch log. Every change to state.content — whether from a user edit (drift) or an agent edit (tool operation) — gets an entry. The full patch log is the definitive sequence of diffs that reconstructs the file from empty to final state.

```js
function record(state, patchDiff, type, modificationSource) {
  state.patches.push({
    type: type,
    diff: patchDiff,
    line: modificationSource.line,
    timestamp: modificationSource.timestamp,
    sourceType: modificationSource.snapshot ? 'snapshot'
      : modificationSource.originalFile ? 'originalFile'
      : modificationSource.readResult ? 'readResult'
      : modificationSource.bashReadResult ? 'bashReadResult'
      : 'structuredPatch'
  });
}
```

### 13. reconstructFile(jsonlSourceFolder, targetFile)

Top-level entry point. Matches the pseudocode's `reconstructFile`.

```js
function reconstructFile(jsonlSourceFolder, targetFile) {
  var jsonls = getJsonlFilesForFile(jsonlSourceFolder, targetFile);
  var state = { content: '', patches: [] };
  var steps = extractStepsFromJSONLs(jsonls, targetFile);
  for (var i = 0; i < steps.length; i++) {
    applyAndAccountForDrift(state, steps[i]);
  }
  return state;
}
```

### 14. algorithm(jsonls, state)

The inner loop from the pseudocode. Called by `reconstructFile` with the source cascade.

```js
function algorithm(jsonls, state, targetFile) {
  var steps = extractStepsFromJSONLs(jsonls, targetFile);
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (step.snapshot !== null) {
      applyAndAccountForDrift(state, step);
    } else if (step.originalFile !== null) {
      applyAndAccountForDrift(state, step);
    } else if (step.readResult !== null) {
      applyAndAccountForDrift(state, step);
    } else if (step.bashReadResult !== null) {
      applyAndAccountForDrift(state, step);
    } else if (step.structuredPatch !== null) {
      applyAndAccountForDrift(state, step);
    }
  }
  return state;
}
```

## Rewind Integration

Before processing steps, classify rewinds using the existing `analyzeJSONL` from `classify-edits.js`. Steps within ignored (rewound) ranges skip their edit but still process their snapshot/read/cat observations:

```js
for (var i = 0; i < steps.length; i++) {
  if (isIgnoredByRewind(steps[i].line, rewinds)) {
    // Still process observations (snapshot, read, cat)
    if (steps[i].snapshot !== null || steps[i].readResult !== null || steps[i].bashReadResult !== null) {
      applyAndAccountForDrift(state, observationOnly(steps[i]));
    }
    continue;
  }
  applyAndAccountForDrift(state, steps[i]);
}
```

## getJsonlFilesForFile(folder, targetFile)

Scans a Claude projects folder for all JSONL files that contain edits to the target file.

```js
function getJsonlFilesForFile(folder, targetFile) {
  var allJsonls = fs.readdirSync(folder).filter(function(f) { return f.endsWith('.jsonl'); });
  var basename = targetFile.split('/').pop();
  var matching = [];
  for (var i = 0; i < allJsonls.length; i++) {
    var text = fs.readFileSync(path.join(folder, allJsonls[i]), 'utf8');
    if (mentionsFile(text, targetFile, basename)) {
      matching.push({ path: allJsonls[i], text: text });
    }
  }
  matching.sort(function(a, b) { return extractSessionStart(a.text) < extractSessionStart(b.text) ? -1 : 1; });
  return matching;
}
```

## Testing Strategy

1. Run against all 30 existing scenarios — must match or exceed current engine's 29/29 rate
2. Run against snapshot-reconstruction.js results — must match its 28/28 on scenarios with snapshots
3. Run against the probe-projects real-world JSONL files — measure improvement over current 52% pass rate
4. Test divergence recording: use scenarios with known user edits (s18-s23) and verify divergence records capture the edits correctly

## Constraints

- Functions ≤15 lines, ES5 var style for Node compatibility
- File ≤500 lines (split if needed)
- No npm dependencies
- Must work in both Node (require) and browser (script tag) via the existing guards
