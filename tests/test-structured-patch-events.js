// Tests for api/structured-patch-events.js — emission of the patchContext event
// kind (roadmap item 3). patchContextEventsFromEdits emits one patchContext
// event per kept authored edit that belongs to the file, isn't classified
// 'ignored', has a timestamp, and whose structuredPatch carries >=1 unchanged
// context (' ') line. Mirrors originalFileEventsFromEdits; the hunksHaveContextLine
// predicate decides whether a record has any context line to recover.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var spe = require('../api/structured-patch-events');

var TS = '2026-05-22T03:38:27.174Z';

// A parsed edit record carrying a structuredPatch with the given hunk lines.
function recordWithHunkLines(lines) {
  return { timestamp: TS, toolUseResult: { structuredPatch: [{ newStart: 1, lines: lines }] } };
}

run('test_patchContextEventsFromEdits_emitsOneEventForEditWithContextLine', function () {
  // Behavior: an edit whose structuredPatch holds a context (' ') line yields one
  // patchContext event at the edit's line+1 coordinate and record timestamp.
  var parsed = [null, recordWithHunkLines([' a', '+b', ' c'])];
  var edits = [{ line: 1, type: 'edit', filePath: '/repo/t.py', file: 't.py' }];
  var events = spe.patchContextEventsFromEdits('/x.jsonl', parsed, edits, {}, ['/repo/t.py']);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].patchContext, {});
  assert.strictEqual(events[0].jsonl, '/x.jsonl');
  assert.strictEqual(events[0].jsonlLine, 2);
  assert.strictEqual(events[0].timestamp, TS);
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

run('test_patchContextEventsFromEdits_filtersContextFreeAliasIgnoredAndTimestamplessEdits', function () {
  // Behavior: each of four conditions independently suppresses the event —
  // a context-free (pure-insertion) hunk, a non-alias file, an 'ignored'
  // classification, and a timestampless record.
  var edits = [{ line: 1, type: 'edit', filePath: '/repo/t.py', file: 't.py' }];
  var alias = ['/repo/t.py'];
  // Context-free: only '+' lines, nothing to recover.
  var contextFree = [null, recordWithHunkLines(['+a', '+b'])];
  assert.deepStrictEqual(spe.patchContextEventsFromEdits('/x.jsonl', contextFree, edits, {}, alias), []);
  // Non-alias file.
  var withCtx = [null, recordWithHunkLines([' a', '+b'])];
  assert.deepStrictEqual(spe.patchContextEventsFromEdits('/x.jsonl', withCtx, edits, {}, ['/other/t.py']), []);
  // Classified 'ignored' (keyed by edit.line+1).
  assert.deepStrictEqual(spe.patchContextEventsFromEdits('/x.jsonl', withCtx, edits, { 2: 'ignored' }, alias), []);
  // Timestampless record can't join the timeline.
  var noTs = [null, { toolUseResult: { structuredPatch: [{ newStart: 1, lines: [' a'] }] } }];
  assert.deepStrictEqual(spe.patchContextEventsFromEdits('/x.jsonl', noTs, edits, {}, alias), []);
});

run('test_hunksHaveContextLine_trueOnlyForUnchangedContextLines', function () {
  // Behavior: true iff some hunk carries a ' '-prefixed context line. '+' added,
  // '-' removed, and '\' "No newline" marker lines do not count; empty/absent
  // hunk arrays are false.
  assert.strictEqual(spe.hunksHaveContextLine([{ lines: [' ctx'] }]), true);
  assert.strictEqual(spe.hunksHaveContextLine([{ lines: ['+add', '-del'] }]), false);
  assert.strictEqual(spe.hunksHaveContextLine([{ lines: ['\\ No newline at end of file'] }]), false);
  assert.strictEqual(spe.hunksHaveContextLine([{ lines: ['+x'] }, { lines: [' y'] }]), true);
  assert.strictEqual(spe.hunksHaveContextLine([]), false);
  assert.strictEqual(spe.hunksHaveContextLine(null), false);
});

h.summary();
