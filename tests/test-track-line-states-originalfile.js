// Tracker behavior for the originalFile event kind (roadmap item 1): the
// whole-file pre-edit observation. Kept in its own suite — the core tracker
// suite (test-track-line-states.js) is at the 250-line write cap. Covers the
// overlay, the overlay-before-splice ordering tie, and the end-to-end payoff.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var efe = require('../api/file-events-extractors');
var tls = require('../api/track-line-states');

var TS1 = '2026-05-22T03:00:00.000Z';
var TS2 = '2026-05-22T03:10:00.000Z';
var TS3 = '2026-05-22T03:20:00.000Z';
var MS2 = Date.parse(TS2);
var MS3 = Date.parse(TS3);

function withTimestamp(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

// Write a transcript, extract events, run the tracker. Optional eventFilter
// trims the stream (e.g. drop the edit event to isolate the overlay).
function trackFixture(ctx, lines, reference, eventFilter) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-tlsof-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  if (eventFilter) { events = events.filter(eventFilter); }
  var options = {
    filePath: '/repo/t.py', aliasPaths: ['/repo/t.py'], jsonlsScanned: [jsonlPath],
    reference: reference ? reference : { via: 'none', content: null }
  };
  return tls.trackLineStates(events, options);
}

runWithContext('test_trackLineStates_originalFileOverlayPinsWholeFileAndConflictsOnDisagreement', function (ctx) {
  // Behavior: an originalFile event applies as a whole-file overlay — it pins
  // every line as observed at the edit instant (eofConfirmed true, lastLine =
  // file length) and a line disagreeing with carried belief becomes a conflict.
  // The edit event from the same record is dropped here to isolate the overlay.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeReadToolUse('r1', '/repo/t.py'),
    withTimestamp(h.makeReadToolResult('r1', '1\ta\n2\tb\n'), TS1),
    withTimestamp(h.makeEditLine('/repo/t.py', 'b', 'Z', false, 'a\nX\n'), TS2)
  ], null, function (e) { return e.edit === null; });
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.isBeacon, false);
  assert.strictEqual(entry.summary.eofConfirmed, true);
  assert.strictEqual(entry.summary.lastLine, 2);
  assert.strictEqual(entry.lines['1'].state, 'observed');
  assert.strictEqual(entry.lines['1'].confirmedAtMs, MS2);
  assert.strictEqual(entry.lines['2'].state, 'observed');
  assert.strictEqual(entry.lines['2'].confirmedAtMs, MS2);
  // Step: line 2 disagreed with carried belief ('b' vs 'X') -> exactly one conflict.
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].line, 2);
  assert.deepStrictEqual(result.conflicts[0].excerpt, { presumedText: 'b', observedText: 'X' });
});

// An edit record carrying BOTH a populated structuredPatch and originalFile.
function makeEditWithPatchAndOriginal(filePath, oldString, newString, patchLines, originalFile, iso) {
  var record = JSON.parse(h.makeEditLine(filePath, oldString, newString, false, originalFile));
  record.toolUseResult.structuredPatch = [{ lines: patchLines }];
  record.timestamp = iso;
  return JSON.stringify(record);
}

runWithContext('test_trackLineStates_originalFileOverlayAppliesBeforeItsEditSplice', function (ctx) {
  // Behavior: the originalFile observation and the edit splice come from the
  // SAME record (identical unixMs/jsonl/jsonlLine). The overlay MUST apply
  // BEFORE the splice: overlay pins the pre-edit file, then the splice authors
  // the changed line on top. Splice-then-overlay would re-overwrite the changed
  // line with pre-edit content -> WRONG. Asserted via the changed line ending
  // 'authored' and a zero-mismatch verdict against the post-edit content.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    makeEditWithPatchAndOriginal('/repo/t.py', 'b', 'B', ['-b', '+B'], 'a\nb\nc\n', TS2)
  ], { via: 'final', content: 'a\nB\nc\n' });
  var entry = result.timeline[String(MS2)];
  assert.strictEqual(entry.lines['2'].state, 'authored');
  assert.strictEqual(result.finalVerdict.perLineStats.mismatched, 0);
});

runWithContext('test_trackLineStates_originalFilePinsWholeFileAtEditInstantNoPresumedResidual', function (ctx) {
  // The headline payoff: a Read establishes belief at T1; at T3 an Edit whose
  // originalFile is the full pre-edit content (re)confirms EVERY line at the edit
  // instant — no line is left 'presumed' carry-forward — while the changed line
  // is authored. The verdict against the post-edit content is clean.
  var result = trackFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeReadToolUse('r1', '/repo/t.py'),
    withTimestamp(h.makeReadToolResult('r1', '1\ta\n2\tb\n3\tc\n'), TS1),
    makeEditWithPatchAndOriginal('/repo/t.py', 'b', 'B', ['-b', '+B'], 'a\nb\nc\n', TS3)
  ], { via: 'final', content: 'a\nB\nc\n' });
  var entry = result.timeline[String(MS3)];
  assert.strictEqual(entry.summary.eofConfirmed, true);
  assert.strictEqual(entry.summary.lastLine, 3);
  // Step: EVERY line was (re)confirmed at the edit instant — zero presumed residual.
  var lineNums = Object.keys(entry.lines);
  assert.strictEqual(lineNums.length, 3);
  for (var i = 0; i < lineNums.length; i++) {
    assert.strictEqual(entry.lines[lineNums[i]].confirmedAtMs, MS3);
    assert.notStrictEqual(entry.lines[lineNums[i]].state, 'presumed');
  }
  // Step: the changed line is authored; the verdict against post-edit content is clean.
  assert.strictEqual(entry.lines['2'].state, 'authored');
  assert.strictEqual(result.finalVerdict.perLineStats.mismatched, 0);
});

runWithContext('test_trackLineStates_originalFileRescuesAnEditThatWouldOtherwiseFloat', function (ctx) {
  // Regression / headline benefit: an edit whose old_string is absent from the
  // stale carried-forward belief would FLOAT; once originalFile pins the actual
  // pre-edit file at the edit instant, the splice locates it and does NOT float.
  var lines = [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeReadToolUse('r1', '/repo/t.py'),
    withTimestamp(h.makeReadToolResult('r1', '1\tx\n2\ty\n'), TS1),
    makeEditWithPatchAndOriginal('/repo/t.py', 'b', 'B', ['-b', '+B'], 'a\nb\nc\n', TS3)
  ];
  // Without the originalFile observation the edit cannot find 'b' -> it floats.
  var floated = trackFixture(ctx, lines, null, function (e) { return e.originalFile === null; });
  var floatedEdit = floated.timeline[String(MS3)].events.filter(function (e) { return e.edit !== null; })[0];
  assert.strictEqual(floatedEdit.edit.floating, true);
  // WITH originalFile pinning the pre-edit file first, the same edit locates 'b'.
  var pinned = trackFixture(ctx, lines, null);
  var pinnedEdit = pinned.timeline[String(MS3)].events.filter(function (e) { return e.edit !== null; })[0];
  assert.strictEqual(pinnedEdit.edit.floating, false);
});

h.summary();
