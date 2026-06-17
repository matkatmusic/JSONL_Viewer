#!/usr/bin/env node
// Detect rewinds in a Claude Code JSONL transcript and classify them
// as code-restoration or conversation-only.
//
// A "rewind" is when the user uses Claude Code's rewind feature to go back
// to an earlier point in the conversation. This creates a fork — the new
// user message's parentUuid points to an ancestor earlier in the file.
//
// Rewinds come in two flavors:
//   - conversation-only: the conversation rewinds but files on disk are untouched
//   - code-restoration: the conversation rewinds AND files are restored to their
//     state at the rewind target
//
// The algorithm detects rewinds by finding "backward jumps" in parentUuid chains,
// then classifies them by checking whether file-history-snapshot version numbers
// changed without a corresponding file-write toolUseResult to explain the change.
//
// Usage: node detect-rewinds.js <path-to-jsonl>

var fs = require('fs');
var parsers = require('../api/transcript-parsers');
var parseJSONLLines = parsers.parseJSONLLines;
var collectUserPrompts = parsers.collectUserPrompts;
var detectRewinds = require('../api/rewind-classification').detectRewinds;

// Build a lookup from line number to rewind classification.
function buildRewindLineMap(rewinds) {
  var map = {};
  for (var r = 0; r < rewinds.length; r++) {
    map[rewinds[r].landingLine] = rewinds[r].classification;
  }
  return map;
}

// Build a single conversation step entry from a prompt.
function buildStepEntry(stepNum, p, rewindByLine) {
  var isLanding = rewindByLine[p.line] !== undefined;
  return {
    step: stepNum,
    line: p.line + 1,
    text: (p.text || '').slice(0, 80),
    isRewindLanding: isLanding,
    rewindType: isLanding ? rewindByLine[p.line] : null,
    parentLine: p.parentLine >= 0 ? p.parentLine + 1 : null
  };
}

// Build conversation steps from prompts, marking rewind landings.
function buildConversationSteps(prompts, rewinds) {
  var rewindByLine = buildRewindLineMap(rewinds);
  var steps = [];
  for (var i = 0; i < prompts.length; i++) {
    steps.push(buildStepEntry(steps.length + 1, prompts[i], rewindByLine));
  }
  return steps;
}

// Convert a single 0-based rewind to 1-based output format.
function convertRewindToOneBased(rw) {
  return {
    landingLine: rw.landingLine + 1,
    parentLine: rw.parentLine + 1,
    text: rw.text.slice(0, 80),
    classification: rw.classification,
    snapBefore: rw.snapBefore ? { line: rw.snapBefore.line + 1, files: rw.snapBefore.files } : null,
    snapAfter: rw.snapAfter ? { line: rw.snapAfter.line + 1, files: rw.snapAfter.files } : null
  };
}

// ─── Core analysis function ─────────────────────────────────────────────────
// Takes raw JSONL text, returns { rewinds, conversationSteps }
function analyzeRewinds(text) {
  var p = parseJSONLLines(text);
  var prompts = collectUserPrompts(p.parsed, p.uuidToIdx);
  var rawRewinds = detectRewinds(prompts, p.parsed, p.uuidToIdx, p.snapshots, p.fileWrites);

  var rewinds = [];
  for (var r = 0; r < rawRewinds.length; r++) {
    rewinds.push(convertRewindToOneBased(rawRewinds[r]));
  }

  var conversationSteps = buildConversationSteps(prompts, rawRewinds);
  return { rewinds: rewinds, conversationSteps: conversationSteps };
}

// Format a single step line for the conversation flow tree.
function formatFlowStep(step, indent) {
  var pad = Array(indent * 4 + 1).join(' ');
  var lines = [];
  if (step.isRewindLanding) {
    lines.push('');
    lines.push(pad + '[REWIND to L' + step.parentLine + ' — ' + step.rewindType + ']');
  }
  var marker = step.isRewindLanding ? '\\-> ' : '    ';
  lines.push(pad + marker + 'Step ' + step.step + ' (L' + step.line + '): ' + step.text);
  return lines;
}

// Format conversation flow as indented tree string.
function formatConversationFlow(conversationSteps) {
  var lines = ['=== CONVERSATION FLOW ===', ''];
  var indent = 0;
  for (var s = 0; s < conversationSteps.length; s++) {
    if (conversationSteps[s].isRewindLanding) {
      indent++;
    }
    var stepLines = formatFlowStep(conversationSteps[s], indent);
    for (var j = 0; j < stepLines.length; j++) {
      lines.push(stepLines[j]);
    }
  }
  return lines.join('\n');
}

// Format a single rewind entry as lines for the summary.
function formatSingleRewind(rw, index) {
  var lines = [];
  lines.push('');
  lines.push('Rewind ' + (index + 1) + ':');
  lines.push('  Landing: L' + rw.landingLine + ' — ' + rw.text);
  lines.push('  Rewound to: L' + rw.parentLine);
  lines.push('  Classification: ' + rw.classification);
  if (rw.snapBefore) {
    lines.push('  Snapshot before: L' + rw.snapBefore.line + ' ' + JSON.stringify(rw.snapBefore.files));
  }
  if (rw.snapAfter) {
    lines.push('  Snapshot after:  L' + rw.snapAfter.line + ' ' + JSON.stringify(rw.snapAfter.files));
  }
  return lines;
}

// Format rewind summary as string.
function formatRewindSummary(rewinds) {
  var lines = ['', '=== REWIND SUMMARY ===', '', 'Total rewinds detected: ' + rewinds.length];
  for (var r = 0; r < rewinds.length; r++) {
    var entryLines = formatSingleRewind(rewinds[r], r);
    for (var j = 0; j < entryLines.length; j++) {
      lines.push(entryLines[j]);
    }
  }
  return lines.join('\n');
}

// ─── CLI entry point ────────────────────────────────────────────────────────

function main() {
  var filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node detect-rewinds.js <path-to-jsonl>');
    process.exit(1);
  }

  var text = fs.readFileSync(filePath, 'utf8');
  var result = analyzeRewinds(text);
  console.log(formatConversationFlow(result.conversationSteps));
  console.log(formatRewindSummary(result.rewinds));
}

if (require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = { analyzeRewinds: analyzeRewinds };
