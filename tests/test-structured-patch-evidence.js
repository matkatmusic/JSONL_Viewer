// Tests for api/structured-patch-evidence.js — materialization of the
// patchContext event kind (roadmap item 3). materializePatchContext walks the
// edit record's structuredPatch hunks and surfaces each unchanged context (' ')
// line as a {lineNum, text, ref} pair, numbered by its POST-edit absolute
// position (from hunk.newStart). '+' added lines advance the cursor but aren't
// emitted; '-' removed and '\' "No newline" marker lines are skipped without
// advancing. Each ref dereferences back to its hunk/line.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var fek = require('../api/file-event-kinds');
var spev = require('../api/structured-patch-evidence');

var TS = '2026-05-22T03:00:00.000Z';

// Write a transcript whose 2nd line is an edit record carrying these hunks.
function writeEditWithHunks(ctx, hunks) {
  var fs = require('fs'), path = require('path');
  var record = JSON.parse(h.makeEditLine('/repo/t.py', 'x', 'y'));
  record.toolUseResult.structuredPatch = hunks;
  record.timestamp = TS;
  var jsonlPath = path.join(ctx.tempDir('rev-spev-'), 'sess.jsonl');
  fs.writeFileSync(jsonlPath, [h.makeSystemLine('s1', 'main', '/repo'), JSON.stringify(record)].join('\n'));
  return jsonlPath;
}

function lineNums(byLine) { return byLine.map(function (e) { return e.lineNum; }); }
function texts(byLine) { return byLine.map(function (e) { return e.text; }); }

runWithContext('test_materializePatchContext_numbersContextLinesFromNewStart', function (ctx) {
  // Behavior: context lines are numbered by post-edit absolute position. From
  // newStart 5 over [' a','+b',' c','-d',' e']: a@5, b advances (added, not
  // emitted), c@7, d removed (no advance), e@8.
  var hunks = [{ oldStart: 5, oldLines: 3, newStart: 5, newLines: 4, lines: [' a', '+b', ' c', '-d', ' e'] }];
  var event = fek.createKindEvent(writeEditWithHunks(ctx, hunks), 2, TS, 'patchContext', {});
  var m = spev.materializePatchContext(event);
  assert.strictEqual(m.kind, 'patchContext');
  assert.deepStrictEqual(lineNums(m.byLine), [5, 7, 8]);
  assert.deepStrictEqual(texts(m.byLine), ['a', 'c', 'e']);
  // Each ref is a structuredPatch locator that slices back to its own line text.
  for (var i = 0; i < m.byLine.length; i++) {
    var loc = m.byLine[i].ref.structuredPatch;
    assert.strictEqual(loc.property, 'toolUseResult.structuredPatch');
    assert.strictEqual(hunks[loc.hunkIndex].lines[loc.lineIndex].slice(1), m.byLine[i].text);
  }
});

runWithContext('test_materializePatchContext_walksMultipleHunksAndSkipsNoNewlineMarker', function (ctx) {
  // Behavior: each hunk numbers from its own newStart; the '\' "No newline at end
  // of file" marker is skipped (no emit, no advance); hunkIndex tracks the source.
  var hunks = [
    { newStart: 1, lines: [' h1a', '+ins'] },
    { newStart: 10, lines: [' h2a', ' h2b', '\\ No newline at end of file'] }
  ];
  var event = fek.createKindEvent(writeEditWithHunks(ctx, hunks), 2, TS, 'patchContext', {});
  var m = spev.materializePatchContext(event);
  assert.deepStrictEqual(lineNums(m.byLine), [1, 10, 11]);
  assert.deepStrictEqual(texts(m.byLine), ['h1a', 'h2a', 'h2b']);
  assert.strictEqual(m.byLine[0].ref.structuredPatch.hunkIndex, 0);
  assert.strictEqual(m.byLine[1].ref.structuredPatch.hunkIndex, 1);
});

runWithContext('test_materializePatchContext_skipsHunkWithoutNumericNewStart', function (ctx) {
  // Behavior: a hunk with no numeric newStart can't be absolutely numbered — it
  // is skipped whole (a missing observation is safe).
  var hunks = [{ lines: [' a', ' b'] }];
  var event = fek.createKindEvent(writeEditWithHunks(ctx, hunks), 2, TS, 'patchContext', {});
  assert.deepStrictEqual(spev.materializePatchContext(event).byLine, []);
});

h.summary();
