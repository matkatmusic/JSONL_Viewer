// edit-splice: apply an old_string -> new_string edit to a line belief.
// Locate the old text in a CONTIGUOUS known run -> splice in place, author
// the changed lines, shift everything below by the line delta. Unlocatable
// -> the edit landed somewhere unknowable (floating): the unknown region's
// length becomes uncertain and numbering below it is no longer trusted —
// the honest version of what whole-content replay does silently and wrongly.

var lb = require('./line-belief');

// Where oldString sits in the known runs: {run} or null.
function locateInRuns(runs, oldString) {
  for (var i = 0; i < runs.length; i++) {
    if (runs[i].texts.join('\n').indexOf(oldString) >= 0) { return { run: runs[i] }; }
  }
  return null;
}

// The run's text after the splice.
function splicedRunText(runText, splice) {
  if (splice.replaceAll) { return runText.split(splice.oldString).join(splice.newString); }
  var idx = runText.indexOf(splice.oldString);
  return runText.slice(0, idx) + splice.newString + runText.slice(idx + splice.oldString.length);
}

// Count of equal lines at the start of both arrays.
function equalPrefixCount(oldLines, newLines) {
  var max = Math.min(oldLines.length, newLines.length);
  var p = 0;
  while (p < max) {
    if (oldLines[p] !== newLines[p]) { break; }
    p++;
  }
  return p;
}

// Count of equal lines at the end of both arrays, beyond the prefix.
function equalSuffixCount(oldLines, newLines, prefixCount) {
  var max = Math.min(oldLines.length, newLines.length) - prefixCount;
  var s = 0;
  while (s < max) {
    if (oldLines[oldLines.length - 1 - s] !== newLines[newLines.length - 1 - s]) { break; }
    s++;
  }
  return s;
}

// Highest line number present in the entries dict (0 when empty).
function maxLineNum(entries) {
  var lineNums = Object.keys(entries).map(Number);
  var max = 0;
  for (var i = 0; i < lineNums.length; i++) {
    if (lineNums[i] > max) { max = lineNums[i]; }
  }
  return max;
}

// Rebuild belief entries around a located splice: keep the unchanged prefix,
// shift everything at/after the unchanged suffix by delta, drop the replaced
// region, and author the new lines.
function rebuildEntriesForSplice(belief, geometry, newLines, unixMs, refForLine) {
  var shiftFrom = geometry.startLine + geometry.oldCount - geometry.suffixCount;
  var newEntries = {};
  var lineNums = Object.keys(belief.entries).map(Number);
  for (var i = 0; i < lineNums.length; i++) {
    if (lineNums[i] < geometry.startLine + geometry.prefixCount) {
      newEntries[lineNums[i]] = belief.entries[lineNums[i]];
      continue;
    }
    if (lineNums[i] >= shiftFrom) {
      newEntries[lineNums[i] + geometry.delta] = belief.entries[lineNums[i]];
    }
  }
  for (var n = geometry.prefixCount; n < newLines.length - geometry.suffixCount; n++) {
    var entry = lb.makeClaimEntry('authored', unixMs, refForLine(newLines[n]), newLines[n]);
    newEntries[geometry.startLine + n] = entry;
  }
  belief.entries = newEntries;
  belief.lastLine = maxLineNum(newEntries);
}

// Apply a located splice to the belief.
function applyLocatedSplice(belief, run, splice, unixMs, refForLine) {
  var newLines = splicedRunText(run.texts.join('\n'), splice).split('\n');
  var prefixCount = equalPrefixCount(run.texts, newLines);
  var geometry = {
    startLine: run.startLine,
    oldCount: run.texts.length,
    prefixCount: prefixCount,
    suffixCount: equalSuffixCount(run.texts, newLines, prefixCount),
    delta: newLines.length - run.texts.length
  };
  rebuildEntriesForSplice(belief, geometry, newLines, unixMs, refForLine);
}

// First line of the first observation gap: the smallest unknown line, or the
// line after the believed extent when EOF was never proved, or null when the
// region is fully known.
function firstGapLine(belief) {
  var lineNums = Object.keys(belief.entries).map(Number).sort(function (a, b) { return a - b; });
  for (var i = 0; i < lineNums.length; i++) {
    if (belief.entries[lineNums[i]].state === 'unknown') { return lineNums[i]; }
  }
  if (!belief.eofConfirmed) { return belief.lastLine + 1; }
  return null;
}

// Unanchor numbering for every line strictly below (greater than) gapLine;
// null gapLine unanchors EVERYTHING (no gap to hide in — belief is provably
// wrong somewhere, the plan's open question — flagged for Phase 4).
function applyFloating(belief, gapLine) {
  var lineNums = Object.keys(belief.entries).map(Number);
  for (var i = 0; i < lineNums.length; i++) {
    if (gapLine === null) { belief.entries[lineNums[i]].numberingCertain = false; continue; }
    if (lineNums[i] > gapLine) { belief.entries[lineNums[i]].numberingCertain = false; }
  }
  belief.eofConfirmed = false;
}

// Apply one edit's splice to the belief. refForLine(lineText) supplies the
// evidenceRef for each authored line (structuredPatch/newString locator).
// Returns {floating, floatingOverKnownRegion}.
function applyEditToBelief(belief, splice, unixMs, refForLine) {
  var location = locateInRuns(lb.knownRuns(belief), splice.oldString);
  if (location) {
    applyLocatedSplice(belief, location.run, splice, unixMs, refForLine);
    return { floating: false, floatingOverKnownRegion: false };
  }
  var gapLine = firstGapLine(belief);
  applyFloating(belief, gapLine);
  return { floating: true, floatingOverKnownRegion: gapLine === null };
}

module.exports = {
  applyEditToBelief: applyEditToBelief
};
