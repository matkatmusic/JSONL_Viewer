// Tests for api/apply-one-event: the per-event belief mutation extracted from
// track-line-states. Exercises applyOneEvent directly (the integration paths are
// covered end-to-end by test-track-line-states). Two representative kinds: a
// ref-less beacon needing no disk read, and a disk-backed whole-file write.

var assert = require('assert');
var h = require('./test-helpers');
var lb = require('../api/line-belief');
var fek = require('../api/file-event-kinds');
var aoe = require('../api/apply-one-event');
var fs = require('fs');
var path = require('path');

var TS = '2026-05-22T03:00:00.000Z';

h.run('fileAbsent resets belief to zero-length with EOF and no conflicts', function () {
  var belief = lb.createBelief();
  var conflicts = aoe.applyOneEvent(belief, fek.createKindEvent('/x.jsonl', 1, TS, 'fileAbsent', {}));
  assert.deepStrictEqual(conflicts, []);
  var s = lb.summarizeBelief(belief);
  assert.strictEqual(s.lastLine, 0);
  assert.strictEqual(s.eofConfirmed, true);
});

h.runWithContext('write applies whole-file content and confirms the extent', function (ctx) {
  var dir = ctx.tempDir('rev-aoe-');
  var jsonlPath = path.join(dir, 's.jsonl');
  fs.writeFileSync(jsonlPath, [h.makeSystemLine('s1', 'main', '/repo'), h.makeCreateLine('/repo/t.py', 'a\nb\n')].join('\n'));
  var belief = lb.createBelief();
  var conflicts = aoe.applyOneEvent(belief, fek.createKindEvent(jsonlPath, 2, TS, 'write', {}));
  assert.deepStrictEqual(conflicts, []);
  var s = lb.summarizeBelief(belief);
  assert.strictEqual(s.lastLine, 2);
  assert.strictEqual(s.eofConfirmed, true);
});

// ─── grepMatches (native Grep tool, sparse overlay — roadmap item 5) ─────────

// A fixture with a create (line 2) and a content-mode grep result (line 4) for /repo/t.py.
function grepFixture(ctx, createContent, grepContent) {
  var dir = ctx.tempDir('rev-aoeg-');
  var jsonlPath = path.join(dir, 's.jsonl');
  fs.writeFileSync(jsonlPath, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/t.py', createContent),
    h.makeGrepToolUse('g1', 'x'),
    h.makeGrepToolResult('g1', grepContent, 1, 1)
  ].join('\n'));
  return jsonlPath;
}

function grepEvent(jsonlPath) {
  return fek.createKindEvent(jsonlPath, 4, TS, 'grepMatches', { filePath: '/repo/t.py', cwd: '/repo' });
}

function writeEvent(jsonlPath) {
  return fek.createKindEvent(jsonlPath, 2, TS, 'write', {});
}

h.runWithContext('test_grepMatches_pins_witnessed_lines_as_observed', function (ctx) {
  // Behavior: grep witnesses an individual line as a FULL observation — the witnessed
  // line is overwritten to state 'observed' at the grep instant.
  var jsonlPath = grepFixture(ctx, 'a\nb\nc\n', 't.py:2:b');
  var belief = lb.createBelief();
  aoe.applyOneEvent(belief, writeEvent(jsonlPath));
  var conflicts = aoe.applyOneEvent(belief, grepEvent(jsonlPath));
  // Step: grep agrees with belief, so no conflict, and line 2 is now observed.
  assert.deepStrictEqual(conflicts, []);
  assert.strictEqual(belief.entries[2].state, 'observed');
  assert.strictEqual(belief.entries[2].confirmedAtMs, Date.parse(TS));
});

h.runWithContext('test_grepMatches_conflicts_when_belief_holds_different_text', function (ctx) {
  // Behavior: a grep match whose text contradicts belief wins the line and yields one
  // conflict info naming the displaced text and the grep observation.
  var jsonlPath = grepFixture(ctx, 'a\nb\nc\n', 't.py:2:DIFFERENT');
  var belief = lb.createBelief();
  aoe.applyOneEvent(belief, writeEvent(jsonlPath));
  var conflicts = aoe.applyOneEvent(belief, grepEvent(jsonlPath));
  // Step: exactly one conflict on line 2; the grep observation wins.
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].line, 2);
  assert.strictEqual(conflicts[0].presumedText, 'b');
  assert.strictEqual(conflicts[0].observedText, 'DIFFERENT');
  assert.strictEqual(belief.entries[2].text, 'DIFFERENT');
});

h.runWithContext('test_grepMatches_never_confirms_eof_or_becomes_a_beacon', function (ctx) {
  // Behavior: grep is a SPARSE overlay — it raises lastLine to the witnessed line but
  // NEVER fixes the extent (no finishWholeOverlay/finishChunk), so eofConfirmed stays
  // false and the file's end is never claimed (unlike a Tier-1 beacon).
  var jsonlPath = grepFixture(ctx, 'a\nb\nc\n', 't.py:3:c');
  var belief = lb.createBelief();
  // Step: apply grep to a fresh belief (no prior beacon).
  aoe.applyOneEvent(belief, grepEvent(jsonlPath));
  // Step: the witnessed line raises lastLine...
  assert.strictEqual(belief.lastLine, 3);
  // Step: ...but the extent is NOT confirmed (grep never witnesses EOF).
  assert.strictEqual(belief.eofConfirmed, false);
});

h.summary();
