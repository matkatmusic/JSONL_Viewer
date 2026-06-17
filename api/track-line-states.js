// track-line-states (api): the per-line file-state tracking sidecar engine.
// Applies extracted file events (api/file-events-extractors) to an in-memory
// line belief (line-belief + edit-splice, via api/apply-one-event), emitting the
// timestamp-keyed tracking object: beacons anchor truth and collapse entries to
// lines:"ALL"; observations corroborate or contradict belief (contradictions
// become conflict records localized to an inter-beacon window); the finalVerdict
// compares final belief per line against the best available reference. Runs
// BESIDE the existing reconstruction pipeline — it never changes PASS/MISMATCH.
// tools/track-line-states.js is the thin CLI that drives this engine.

var lb = require('./line-belief');
var flv = require('./final-line-verdict');
var evidence = require('./line-state-evidence');
var applyOneEvent = require('./apply-one-event').applyOneEvent;

// ─── Event ordering ─────────────────────────────────────────────────────────

// originalFile (0) sorts before its own edit (1) so the whole-file overlay pins
// belief BEFORE the splice authors the changed line. Everything else (2) is
// safe: snapshots/writes live in different records (different jsonlLine), so
// they never reach this tie against an edit — only an originalFile and the edit
// it accompanies share a full (unixMs, jsonl, jsonlLine) coordinate.
function kindRank(event) {
  if (event.originalFile) { return 0; }
  if (event.edit) { return 1; }
  return 2;
}

// Deterministic order: time, then transcript path, then line, then kind — reruns
// reproduce the same timeline exactly.
function compareEvents(a, b) {
  if (a.unixMs !== b.unixMs) { return a.unixMs - b.unixMs; }
  if (a.jsonl < b.jsonl) { return -1; }
  if (a.jsonl > b.jsonl) { return 1; }
  if (a.jsonlLine !== b.jsonlLine) { return a.jsonlLine - b.jsonlLine; }
  return kindRank(a) - kindRank(b);
}

// Events sharing a millisecond share one timeline entry.
function groupEventsByMs(events) {
  var sorted = events.slice().sort(compareEvents);
  var groups = [];
  var current = null;
  for (var i = 0; i < sorted.length; i++) {
    var startsNewGroup = current === null ? true : current.unixMs !== sorted[i].unixMs;
    if (startsNewGroup) {
      current = { unixMs: sorted[i].unixMs, events: [] };
      groups.push(current);
    }
    current.events.push(sorted[i]);
  }
  return groups;
}

// Tier-1 beacons: snapshot, absence, success-confirmed write.
function isBeaconEvent(event) {
  if (event.snapshot) { return true; }
  if (event.fileAbsent) { return true; }
  return event.write !== null;
}

// ─── Conflict + timeline records ────────────────────────────────────────────

// Schema conflict record: the observation won the line; this preserves what
// was displaced and where both sides' proof lives, localized to the window
// between the last beacon and this moment of discovery.
function buildConflictRecord(info, unixMs, fromBeaconMs) {
  return {
    timestampOfContradictingRecord: unixMs,
    line: info.line,
    presumed: info.presumedEvidence,
    observed: info.observedRef,
    excerpt: {
      presumedText: evidence.makeExcerpt(info.presumedText),
      observedText: evidence.makeExcerpt(info.observedText)
    },
    window: { fromBeaconMs: fromBeaconMs, toBeaconMs: unixMs }
  };
}

// Lines whose entry was established/verified at this exact instant.
function touchedLinesAt(belief, unixMs) {
  var touched = new Set();
  var lineNums = Object.keys(belief.entries).map(Number);
  for (var i = 0; i < lineNums.length; i++) {
    if (belief.entries[lineNums[i]].confirmedAtMs === unixMs) { touched.add(lineNums[i]); }
  }
  return touched;
}

// Belief AFTER this instant's events: beacons collapse to "ALL" (one
// reference covers every line); otherwise the per-line evidence map.
function buildTimelineEntry(group, belief, groupIsBeacon) {
  return {
    timestamp: group.events[0].timestamp,
    isBeacon: groupIsBeacon,
    events: group.events,
    lines: groupIsBeacon ? 'ALL' : lb.cloneEntriesForTimeline(belief),
    summary: lb.summarizeBelief(belief)
  };
}

// ─── The tracker ────────────────────────────────────────────────────────────

function appendConflictRecords(conflicts, infos, unixMs, fromBeaconMs) {
  for (var c = 0; c < infos.length; c++) {
    conflicts.push(buildConflictRecord(infos[c], unixMs, fromBeaconMs));
  }
}

// Apply one instant's events in order; returns whether any was a beacon.
// Conflicts are windowed against the beacon that PRECEDED this instant.
function applyEventGroup(belief, group, conflicts) {
  var groupIsBeacon = false;
  for (var e = 0; e < group.events.length; e++) {
    var infos = applyOneEvent(belief, group.events[e]);
    appendConflictRecords(conflicts, infos, group.unixMs, belief.lastBeaconMs);
    if (isBeaconEvent(group.events[e])) {
      belief.lastBeaconMs = group.unixMs;
      groupIsBeacon = true;
    }
  }
  return groupIsBeacon;
}

// Replay every event in deterministic order, anchoring at beacons and
// accumulating/verifying between them. options: {filePath, aliasPaths,
// jsonlsScanned, reference:{via, content}}.
function trackLineStates(events, options) {
  var opts = options ? options : {};
  var belief = lb.createBelief();
  var timeline = {};
  var conflicts = [];
  var groups = groupEventsByMs(events);
  for (var g = 0; g < groups.length; g++) {
    var groupIsBeacon = applyEventGroup(belief, groups[g], conflicts);
    lb.degradeUntouchedToPresumed(belief, touchedLinesAt(belief, groups[g].unixMs));
    timeline[String(groups[g].unixMs)] = buildTimelineEntry(groups[g], belief, groupIsBeacon);
  }
  var reference = opts.reference ? opts.reference : { via: 'none', content: null };
  return {
    filePath: opts.filePath ? opts.filePath : null,
    aliasPaths: opts.aliasPaths ? opts.aliasPaths : [],
    jsonlsScanned: opts.jsonlsScanned ? opts.jsonlsScanned : [],
    timeline: timeline,
    conflicts: conflicts,
    finalVerdict: flv.buildFinalVerdict(belief, reference)
  };
}

module.exports = {
  trackLineStates: trackLineStates
};
