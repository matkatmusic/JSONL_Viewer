// Unified reconstruction: structured patch operations.

function extractOldLines(hunk) {
  var result = [];
  for (var i = 0; i < hunk.lines.length; i++) {
    if (hunk.lines[i][0] === ' ' || hunk.lines[i][0] === '-') {
      result.push(hunk.lines[i].slice(1));
    }
  }
  return result;
}

function extractNewLines(hunk) {
  var result = [];
  for (var i = 0; i < hunk.lines.length; i++) {
    if (hunk.lines[i][0] === ' ' || hunk.lines[i][0] === '+') {
      result.push(hunk.lines[i].slice(1));
    }
  }
  return result;
}

function regionMatches(stateLines, offset, targetLines) {
  if (offset < 0) { return false; }
  if (offset + targetLines.length > stateLines.length) { return false; }
  for (var i = 0; i < targetLines.length; i++) {
    if (stateLines[offset + i] !== targetLines[i]) { return false; }
  }
  return true;
}

function spliceArray(arr, start, deleteCount, items) {
  var args = [start, deleteCount];
  for (var i = 0; i < items.length; i++) { args.push(items[i]); }
  Array.prototype.splice.apply(arr, args);
}

function findHunkOffset(stateLines, hunk, oldLines) {
  var stated = hunk.oldStart - 1;
  if (regionMatches(stateLines, stated, oldLines)) { return stated; }
  for (var delta = 1; delta <= 20; delta++) {
    if (regionMatches(stateLines, stated - delta, oldLines)) { return stated - delta; }
    if (regionMatches(stateLines, stated + delta, oldLines)) { return stated + delta; }
  }
  return stated;
}

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractOldLines: extractOldLines,
    extractNewLines: extractNewLines,
    regionMatches: regionMatches,
    findHunkOffset: findHunkOffset,
    diffAgainstPatch: diffAgainstPatch,
    applyPatchToState: applyPatchToState
  };
}
