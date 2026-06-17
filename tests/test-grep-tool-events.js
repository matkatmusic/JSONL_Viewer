// Tests for api/grep-tool-events: emission of grepMatches events. Each content-mode Grep
// result row's relative path is resolved against the session cwd; for every DISTINCT
// resolved path that is one of the file's alias paths, one event is emitted at the result
// record's line/timestamp carrying { filePath:<resolved>, cwd }. Mirrors bash-op-events.

var assert = require('assert');
var h = require('./test-helpers');
var f = require('./track-line-states-fixtures');
var run = h.run;
var gte = require('../api/grep-tool-events');
var TS = f.TS1;

// Build (jsonlText, parsed) for a session at cwd running one content-mode grep result.
function sessionWith(cwd, content, numFiles, numLines) {
  var lines = [
    h.makeSystemLine('s1', 'main', cwd),
    h.makeGrepToolUse('g1', 'foo'),
    f.withTimestamp(h.makeGrepToolResult('g1', content, numFiles, numLines), TS)
  ];
  return { jsonlText: lines.join('\n'), parsed: lines.map(function (l) { return JSON.parse(l); }) };
}

run('test_grepMatchEventsForFile_resolves_relative_paths_then_matches_aliasSet', function () {
  // Behavior: a row's cwd-relative path is resolved to absolute BEFORE the aliasSet test;
  // the emitted event carries the resolved absolute filePath and the session cwd.
  // Step: a grep result for relative 'a.js' under cwd /repo; aliasSet holds the absolute form.
  var s = sessionWith('/repo', 'a.js:3:foo here', 1, 1);
  var events = gte.grepMatchEventsForFile('sess.jsonl', s.jsonlText, s.parsed, new Set(['/repo/a.js']));
  // Step: exactly one event, at the result record's line/timestamp.
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].jsonlLine, 3);
  assert.strictEqual(events[0].timestamp, TS);
  // Step: the sub-object carries the RESOLVED absolute path and the cwd.
  assert.deepStrictEqual(events[0].grepMatches, { filePath: '/repo/a.js', cwd: '/repo' });
});

run('test_grepMatchEventsForFile_emits_one_event_per_resolved_file', function () {
  // Behavior: one event per DISTINCT resolved alias file — repeated rows for the same file
  // collapse to a single event; two different aliased files yield two events.
  // Step: a result with two rows for a.js and one for b.js, both aliased.
  var s = sessionWith('/repo', 'a.js:3:x\na.js:8:y\nb.js:2:z', 2, 3);
  var events = gte.grepMatchEventsForFile('sess.jsonl', s.jsonlText, s.parsed, new Set(['/repo/a.js', '/repo/b.js']));
  // Step: exactly two events, one per distinct resolved file.
  assert.strictEqual(events.length, 2);
  var filePaths = events.map(function (e) { return e.grepMatches.filePath; }).sort();
  assert.deepStrictEqual(filePaths, ['/repo/a.js', '/repo/b.js']);
});

run('test_grepMatchEventsForFile_drops_rows_resolving_outside_the_alias_set', function () {
  // Behavior: a row whose resolved path is NOT in the alias set emits no event.
  // Step: a result for aliased 'a.js' and non-aliased 'other.js' under cwd /repo.
  var s = sessionWith('/repo', 'a.js:3:x\nother.js:5:y', 2, 2);
  var events = gte.grepMatchEventsForFile('sess.jsonl', s.jsonlText, s.parsed, new Set(['/repo/a.js']));
  // Step: only the aliased file produces an event.
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].grepMatches.filePath, '/repo/a.js');
});

h.summary();
