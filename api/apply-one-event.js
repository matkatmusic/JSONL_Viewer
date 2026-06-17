// apply-one-event: the per-event belief mutation for the line-state tracker.
// Extracted from track-line-states (which reached the 250-line write cap as new
// kinds landed). Materializes one event and applies its kind to the in-memory
// belief, returning raw conflict infos. The non-null kind sub-object selects the
// branch; beacons set truth, observations overlay/corroborate, edits splice.

var lb = require('./line-belief');
var es = require('./edit-splice');
var evidence = require('./line-state-evidence');

function maxByLineNum(byLine) {
  var max = 0;
  for (var i = 0; i < byLine.length; i++) {
    if (byLine[i].lineNum > max) { max = byLine[i].lineNum; }
  }
  return max;
}

// byLine with every lineNum shifted up by offset (apply-time append placement).
function shiftByLine(byLine, offset) {
  return byLine.map(function (entry) {
    return { lineNum: entry.lineNum + offset, text: entry.text, ref: entry.ref };
  });
}

function applyEditEvent(belief, event, materialized) {
  var refForLine = function (lineText) { return evidence.refForAuthoredEditLine(event, lineText); };
  var result = es.applyEditToBelief(belief, materialized, event.unixMs, refForLine);
  // The tracker is what KNOWS the edit could not be located — record it on
  // the event so the persisted timeline carries the honest flag.
  if (result.floating) { event.edit.floating = true; }
  return [];
}

// Apply one event to the belief; returns raw conflict infos.
function applyOneEvent(belief, event) {
  var m = evidence.materializeEvent(event);
  if (m.kind === 'write') { lb.applyWrite(belief, m.lines, event.unixMs); return []; }
  if (m.kind === 'snapshot') { return lb.applySnapshotVerify(belief, m.lines, event.unixMs); }
  if (m.kind === 'fileAbsent') { lb.applyFileAbsent(belief, event.unixMs); return []; }
  if (m.kind === 'bashRm') { return lb.applyAbsenceObservation(belief, event.unixMs, m.ref); }
  if (m.kind === 'edit') { return applyEditEvent(belief, event, m); }
  if (m.kind === 'readChunk') {
    var chunkConflicts = lb.applyOverlayLines(belief, m.byLine, event.unixMs);
    lb.finishChunk(belief, event.readChunk.hitEof, maxByLineNum(m.byLine));
    return chunkConflicts;
  }
  if (m.kind === 'originalFile') {
    // Whole-file pre-edit observation: the SAME overlay as readFull/cat, made
    // explicit so its dispatch is intentional (not a silent fallthrough) and the
    // ordering tie with its own edit is handled deliberately (see compareEvents).
    var overlayConflicts = lb.applyOverlayLines(belief, m.byLine, event.unixMs);
    lb.finishWholeOverlay(belief, maxByLineNum(m.byLine));
    return overlayConflicts;
  }
  if (m.kind === 'bashTruncate') {
    // `>` truncate-write: the file IS the redirected content. Overlay pins the
    // new lines (conflicts where belief differed) and finishWholeOverlay drops
    // the old tail — same whole-file overlay shape as originalFile.
    var truncConflicts = lb.applyOverlayLines(belief, m.byLine, event.unixMs);
    lb.finishWholeOverlay(belief, maxByLineNum(m.byLine));
    return truncConflicts;
  }
  if (m.kind === 'bashAppend') {
    // `>>` append: apply-time stateful — the new lines land AFTER the current
    // extent. Offset each by belief.lastLine, overlay (new lines never conflict),
    // then fix the extent at offset + count. Empty belief (offset 0) degrades to
    // a truncate-from-line-1.
    var offset = belief.lastLine;
    var appendConflicts = lb.applyOverlayLines(belief, shiftByLine(m.byLine, offset), event.unixMs);
    lb.finishWholeOverlay(belief, offset + maxByLineNum(m.byLine));
    return appendConflicts;
  }
  if (m.kind === 'patchContext') {
    // SPARSE overlay: an edit hunk's unchanged context lines corroborate the
    // post-splice state. applyOverlayLines pins each witnessed line (conflict
    // where belief differs) and bumps lastLine only to the highest observed
    // line — NO finishWholeOverlay: context lines never witness the extent, so
    // they must not claim EOF or truncate the tail beyond them.
    return lb.applyOverlayLines(belief, m.byLine, event.unixMs);
  }
  if (m.kind === 'bashReadChunk') {
    // Partial-content Bash read (head/sed/tail): SPARSE overlay only (like
    // patchContext) — corroborate each witnessed line WITHOUT finishChunk. Unlike
    // the Read tool, the Bash harness strips stdout's trailing newline, so a
    // chunk's line count is a LOWER BOUND and CANNOT prove EOF; claiming it would
    // truncate a real tail (same hazard as wc -l). hitEof is carried as provenance
    // but DELIBERATELY not consumed — do not re-add finishChunk here.
    return lb.applyOverlayLines(belief, m.byLine, event.unixMs);
  }
  if (m.kind === 'bashExtent') {
    // wc -l is a LOWER BOUND (counts newlines; a missing trailing newline
    // undercounts by one). Extend-only — imply 1..N and raise lastLine, NEVER
    // eofConfirmed; a too-low count must not drop a real last line. No conflicts.
    lb.ensureImpliedLines(belief, m.lineCount);
    return [];
  }
  if (m.kind === 'bashGrep') {
    // grep -n: SPARSE overlay only. grep witnesses explicit per-line matches but
    // NEVER the extent, so corroborate the witnessed lines and never finishChunk
    // (identical to patchContext).
    return lb.applyOverlayLines(belief, m.byLine, event.unixMs);
  }
  if (m.kind === 'grepMatches') {
    // Native Grep tool (output_mode content, -n): SPARSE overlay only, same tier as
    // bashGrep. grep witnesses explicit per-line matches as FULL observations (overwrite
    // belief, record conflicts) but NEVER the file extent — corroborate the witnessed
    // lines and never finishWholeOverlay/finishChunk. grep is not a beacon.
    return lb.applyOverlayLines(belief, m.byLine, event.unixMs);
  }
  // readFull / cat: whole-file overlay, extent witnessed.
  var conflicts = lb.applyOverlayLines(belief, m.byLine, event.unixMs);
  lb.finishWholeOverlay(belief, maxByLineNum(m.byLine));
  return conflicts;
}

module.exports = {
  applyOneEvent: applyOneEvent
};
