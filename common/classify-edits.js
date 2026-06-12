#!/usr/bin/env node
// Classify file-modifying events in a Claude Code JSONL transcript as "kept" or "ignored".
//
// A file edit is "ignored" if a later code-restoration rewind targets a point
// before that edit, meaning the rewind reverted the file past the edit.
// Otherwise the edit is "kept" (survived all subsequent rewinds).
//
// Usage: node classify-edits.js <path-to-jsonl>
//
// Output: one line per file-modifying event:
//   <1-based line number>: <kept|ignored> <operation> <filename>
//
// The classifyEdits() function returns a string that can be consumed by other code.

var fs;
if (typeof module !== 'undefined' && typeof require === 'function') {
  fs = require('fs');
  var jsonlParse = require('./jsonl-parse');
  parseJSONLLines = jsonlParse.parseJSONLLines;
  collectUserPrompts = jsonlParse.collectUserPrompts;
  detectRewinds = jsonlParse.detectRewinds;
}

// Check if a file write is ignored by any code-restoration rewind.
function isIgnoredByRewind(fwLine, rewinds) {
  for (var r = 0; r < rewinds.length; r++) {
    if (rewinds[r].landingLine > fwLine) {
      if (rewinds[r].classification === 'code-restoration') {
        if (rewinds[r].parentLine < fwLine) {
          return true;
        }
      }
    }
  }
  return false;
}

// Mark each file write as kept or ignored based on code-restoration rewinds.
function classifyFileWrites(fileWrites, rewinds) {
  var results = [];
  for (var w = 0; w < fileWrites.length; w++) {
    var fw = fileWrites[w];
    var ignored = isIgnoredByRewind(fw.line, rewinds);
    results.push({
      line: fw.line + 1,
      status: ignored ? 'ignored' : 'kept',
      type: fw.type,
      file: fw.file
    });
  }
  return results;
}

// Orchestrate parsing, rewind detection, and edit classification.
function analyzeJSONL(text) {
  var p = parseJSONLLines(text);
  var prompts = collectUserPrompts(p.parsed, p.uuidToIdx);
  var rewinds = detectRewinds(prompts, p.parsed, p.uuidToIdx, p.snapshots, p.fileWrites);
  var edits = classifyFileWrites(p.fileWrites, rewinds);
  return { edits: edits, rewinds: rewinds, fileWrites: p.fileWrites };
}

// ─── Format output ───────────────────────────────────────────────────────────
// Returns a string with one line per file-modifying event.
function classifyEdits(jsonlText) {
  var result = analyzeJSONL(jsonlText);
  var lines = [];
  for (var i = 0; i < result.edits.length; i++) {
    var e = result.edits[i];
    lines.push(e.line + ': ' + e.status + ' ' + e.type + ' ' + e.file);
  }
  return lines.join('\n');
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

function main() {
  var filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node classify-edits.js <path-to-jsonl>');
    process.exit(1);
  }
  var text = fs.readFileSync(filePath, 'utf8');
  console.log(classifyEdits(text));
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}

// ─── Exports for use by other modules ────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classifyEdits: classifyEdits, analyzeJSONL: analyzeJSONL };
}
