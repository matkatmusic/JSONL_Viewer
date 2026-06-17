// Tests for api/file-event-kinds.js — the canonical event-schema core:
// KIND_NAMES (the kind registry), createKindEvent (the event constructor), and
// eventHasAnyKind (kind-membership test). Extracted from file-events-extractors.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var fek = require('../api/file-event-kinds');

var TS = '2026-05-22T03:38:27.174Z';
var BASELINE_KINDS = ['snapshot', 'fileAbsent', 'write', 'edit', 'readFull', 'readChunk', 'cat'];

run('test_KIND_NAMES_registersEveryBaselineKind', function () {
  // Behavior: the registry lists every kind the extractors can build.
  for (var i = 0; i < BASELINE_KINDS.length; i++) {
    assert.notStrictEqual(fek.KIND_NAMES.indexOf(BASELINE_KINDS[i]), -1);
  }
});

run('test_createKindEvent_setsCoreFieldsAndOnlyTheNamedKind', function () {
  // Behavior: an event carries its join coordinates plus EXACTLY ONE non-null
  // kind sub-object; every other kind slot is null.
  var event = fek.createKindEvent('/t/a.jsonl', 5, TS, 'edit', { floating: false });
  assert.strictEqual(event.jsonl, '/t/a.jsonl');
  assert.strictEqual(event.jsonlLine, 5);
  assert.strictEqual(event.timestamp, TS);
  assert.strictEqual(event.unixMs, Date.parse(TS));
  assert.deepStrictEqual(event.edit, { floating: false });
  for (var i = 0; i < fek.KIND_NAMES.length; i++) {
    if (fek.KIND_NAMES[i] === 'edit') { continue; }
    assert.strictEqual(event[fek.KIND_NAMES[i]], null);
  }
});

run('test_eventHasAnyKind_matchesTheNonNullKindAgainstAList', function () {
  // Behavior: true iff the event's non-null kind is among the queried names.
  var readEvent = fek.createKindEvent('/t/a.jsonl', 1, TS, 'readFull', {});
  assert.strictEqual(fek.eventHasAnyKind(readEvent, ['readFull', 'readChunk', 'cat']), true);
  assert.strictEqual(fek.eventHasAnyKind(readEvent, ['write', 'edit']), false);
});

run('test_KIND_NAMES_includesOriginalFile', function () {
  // Behavior: 'originalFile' is a registered kind (roadmap item 1) — a whole-file
  // pre-edit observation; every event now carries an originalFile slot.
  assert.notStrictEqual(fek.KIND_NAMES.indexOf('originalFile'), -1);
});

run('test_KIND_NAMES_includesBashRm', function () {
  // Behavior: 'bashRm' is a registered kind (roadmap item 2) — a Tier-2 absence
  // observation from a Bash `rm` of the file.
  assert.notStrictEqual(fek.KIND_NAMES.indexOf('bashRm'), -1);
});

run('test_KIND_NAMES_includesPatchContext', function () {
  // Behavior: 'patchContext' is a registered kind (roadmap item 3) — a Tier-2
  // sparse-overlay observation of the unchanged context lines inside an edit's
  // structuredPatch hunks.
  assert.notStrictEqual(fek.KIND_NAMES.indexOf('patchContext'), -1);
});

run('test_KIND_NAMES_includesBashReadChunk', function () {
  // Behavior: 'bashReadChunk' is a registered kind (roadmap item 4) — a Tier-2
  // overlay observation from a partial-content Bash read (head / sed / tail).
  assert.notStrictEqual(fek.KIND_NAMES.indexOf('bashReadChunk'), -1);
});

run('test_KIND_NAMES_includesBashExtent', function () {
  // Behavior: 'bashExtent' is a registered kind (roadmap item 4) — a Tier-2
  // lower-bound extent observation from `wc -l`.
  assert.notStrictEqual(fek.KIND_NAMES.indexOf('bashExtent'), -1);
});

run('test_KIND_NAMES_includesBashGrep', function () {
  // Behavior: 'bashGrep' is a registered kind (roadmap item 4) — a Tier-2 sparse
  // overlay from single-file `grep -n`.
  assert.notStrictEqual(fek.KIND_NAMES.indexOf('bashGrep'), -1);
});

run('test_createKindEvent_sets_only_grepMatches_when_named', function () {
  // Behavior: 'grepMatches' (roadmap item 5) is a registered kind, and an event built for
  // it carries ONLY the grepMatches sub-object — every other registered kind slot is null.
  // Step: grepMatches is in the registry.
  assert.notStrictEqual(fek.KIND_NAMES.indexOf('grepMatches'), -1);
  // Step: a grepMatches event holds its fields and nulls every other kind.
  var event = fek.createKindEvent('/t/a.jsonl', 7, TS, 'grepMatches', { filePath: '/repo/a.js', cwd: '/repo' });
  assert.deepStrictEqual(event.grepMatches, { filePath: '/repo/a.js', cwd: '/repo' });
  for (var i = 0; i < fek.KIND_NAMES.length; i++) {
    if (fek.KIND_NAMES[i] === 'grepMatches') { continue; }
    assert.strictEqual(event[fek.KIND_NAMES[i]], null);
  }
});

h.summary();
