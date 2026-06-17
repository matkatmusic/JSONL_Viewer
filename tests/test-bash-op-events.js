// Tests for api/bash-op-events.js — emission of the Bash-file-op event kinds.
// bashOpEventsForFile consumes the (frozen) extract-bash-file-ops parser,
// resolves each op's path against the session cwd, and emits one kind event per
// op whose resolved path is one of the file's alias paths. Phase 1 covers `rm`
// (bashRm); the redirect kinds (bashTruncate / bashAppend) are added later.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var boe = require('../api/bash-op-events');

var TS1 = '2026-05-22T03:00:00.000Z';
var MS1 = Date.parse(TS1);

function withTs(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

function buildTranscript(lines) {
  var jsonlText = lines.join('\n');
  var parsed = lines.map(function (line) { return JSON.parse(line); });
  return { jsonlText: jsonlText, parsed: parsed };
}

function opEvents(lines, aliasPaths) {
  var t = buildTranscript(lines);
  return boe.bashOpEventsForFile('/x/sess.jsonl', t.jsonlText, t.parsed, new Set(aliasPaths));
}

run('test_bashOpEventsForFile_emitsBashRmForRemovedAliasPath', function () {
  // Behavior: a relative `rm` path resolves against the session cwd; when it is
  // one of the file's aliases, one bashRm event lands at the record's coords.
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', 'rm t.py'), TS1)
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].bashRm, {});
  assert.strictEqual(events[0].jsonl, '/x/sess.jsonl');
  assert.strictEqual(events[0].jsonlLine, 2);
  assert.strictEqual(events[0].timestamp, TS1);
  assert.strictEqual(events[0].unixMs, MS1);
});

run('test_bashOpEventsForFile_emitsBashRmForAbsoluteAliasPath', function () {
  // Behavior: an absolute `rm` path (with flags) matches the alias set directly.
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', 'rm -rf /repo/t.py'), TS1)
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].jsonlLine, 2);
});

run('test_bashOpEventsForFile_skipsRmOfUnrelatedPath', function () {
  // Behavior: an `rm` of a different file emits nothing — alias membership gates.
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', 'rm other.py'), TS1)
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 0);
});

run('test_bashOpEventsForFile_skipsRmWithoutTimestamp', function () {
  // Behavior: a record with no timestamp can't join the time-keyed timeline —
  // no event (mirrors the read/cat/edit timestamp guard).
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCommandLine('b1', 'rm t.py')
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 0);
});

run('test_bashOpEventsForFile_emitsBashTruncateForRedirectWithExtractableContent', function () {
  // Behavior: a `>` redirect to an alias path, with single-quoted (extractable)
  // content, emits one bashTruncate at the record's coords.
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', "echo 'hello' > t.py"), TS1)
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].bashTruncate, {});
  assert.strictEqual(events[0].jsonlLine, 2);
});

run('test_bashOpEventsForFile_skipsRedirectWithUnextractableContent', function () {
  // Behavior: a `>` whose content can't be safely recovered (double-quoted)
  // emits nothing — a missing observation is safe, a wrong one is not.
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', 'echo "$VAR" > t.py'), TS1)
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 0);
});

run('test_bashOpEventsForFile_skipsRedirectOfUnrelatedPath', function () {
  // Behavior: a `>` to a different file emits nothing — alias membership gates.
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', "echo 'hello' > other.py"), TS1)
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 0);
});

run('test_bashOpEventsForFile_emitsBashAppendForDoubleRedirect', function () {
  // Behavior: a `>>` redirect to an alias path with extractable content emits
  // one bashAppend (the mode picks the kind).
  var events = opEvents([
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', "echo 'c' >> t.py"), TS1)
  ], ['/repo/t.py']);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].bashAppend, {});
  assert.strictEqual(events[0].jsonlLine, 2);
});

h.summary();
