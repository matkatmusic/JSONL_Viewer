// Tests for api/bash-read-events: emission of bashReadChunk events from paired
// Bash command/result records. The event is emitted at the RESULT record's
// 1-based index, with the RESULT record's timestamp; all geometry (firstLine,
// lineCount, hitEof) is computed at emission and carried on the sub-object.

var assert = require('assert');
var h = require('./test-helpers');
var f = require('./track-line-states-fixtures');
var ev = require('../api/bash-read-events');

var P = '/repo/t.py';

function parsedFrom(lines) {
  return lines.map(function (l) { return JSON.parse(l); });
}

// A timestamped (command, result) pair linked by tool_use_id.
function pair(command, stdout, iso) {
  return [
    f.withTimestamp(h.makeBashCommandLine('u1', command), iso),
    f.withTimestamp(h.makeBashCatToolResult('u1', stdout), iso)
  ];
}

function emit(lines, aliasPaths) {
  return ev.bashReadEventsForFile('sess.jsonl', '', parsedFrom(lines), new Set(aliasPaths));
}

h.run('head -n N returning N lines: bashReadChunk, hitEof false, at result line', function () {
  var events = emit(pair('head -n 5 ' + P, 'l1\nl2\nl3\nl4\nl5\n', f.TS1), [P]);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].jsonlLine, 2);
  assert.strictEqual(events[0].timestamp, f.TS1);
  assert.deepStrictEqual(events[0].bashReadChunk, { firstLine: 1, lineCount: 5, hitEof: false });
});

h.run('head -n N returning fewer lines proves EOF (hitEof true)', function () {
  var events = emit(pair('head -n 5 ' + P, 'a\nb\nc\n', f.TS1), [P]);
  assert.deepStrictEqual(events[0].bashReadChunk, { firstLine: 1, lineCount: 3, hitEof: true });
});

h.run('sed -n A,Bp returning fewer lines proves EOF', function () {
  var events = emit(pair("sed -n '2,4p' " + P, 'x\ny\n', f.TS1), [P]);
  assert.deepStrictEqual(events[0].bashReadChunk, { firstLine: 2, lineCount: 2, hitEof: true });
});

h.run('tail -n +N (reads-to-EOF) always hitEof true', function () {
  var events = emit(pair('tail -n +2 ' + P, 'p\nq\nr\n', f.TS1), [P]);
  assert.deepStrictEqual(events[0].bashReadChunk, { firstLine: 2, lineCount: 3, hitEof: true });
});

h.run('non-alias path emits nothing', function () {
  var events = emit(pair('head -n 5 ' + P, 'a\nb\n', f.TS1), ['/other.py']);
  assert.strictEqual(events.length, 0);
});

h.run('result without a timestamp is dropped', function () {
  var lines = [
    f.withTimestamp(h.makeBashCommandLine('u1', 'head -n 5 ' + P), f.TS1),
    h.makeBashCatToolResult('u1', 'a\nb\n')
  ];
  assert.strictEqual(emit(lines, [P]).length, 0);
});

h.run('is_error result is skipped', function () {
  var res = JSON.parse(f.withTimestamp(h.makeBashCatToolResult('u1', 'a\nb\n'), f.TS1));
  res.message.content[0].is_error = true;
  var lines = [f.withTimestamp(h.makeBashCommandLine('u1', 'head -n 5 ' + P), f.TS1), JSON.stringify(res)];
  assert.strictEqual(emit(lines, [P]).length, 0);
});

h.run('empty stdout is skipped', function () {
  assert.strictEqual(emit(pair('head -n 5 ' + P, '', f.TS1), [P]).length, 0);
});

h.run('error-prefixed stdout is skipped', function () {
  assert.strictEqual(emit(pair('head -n 5 ' + P, 'Error: boom', f.TS1), [P]).length, 0);
});

h.run('unparseable command (tail -n N) emits nothing', function () {
  assert.strictEqual(emit(pair('tail -n 5 ' + P, 'a\nb\n', f.TS1), [P]).length, 0);
});

h.run('wc -l emits a bashExtent event with an empty sub-object', function () {
  var events = emit(pair('wc -l ' + P, '     207 ' + P, f.TS1), [P]);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].jsonlLine, 2);
  assert.deepStrictEqual(events[0].bashExtent, {});
});

h.run('grep -n emits a bashGrep event with an empty sub-object', function () {
  var events = emit(pair('grep -n foo ' + P, '3:foo here', f.TS1), [P]);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].bashGrep, {});
});

h.run('test_bashReadEventsForFile_matches_a_relative_read_path_resolved_against_session_cwd', function () {
  // Behavior: a `head` whose RAW path is relative emits a bashReadChunk only when the file's
  // aliasSet contains the path RESOLVED against the transcript's session cwd.
  var lines = [
    h.makeSystemLine('s1', 'main', '/abs/proj'),
    f.withTimestamp(h.makeBashCommandLine('u1', 'head -n 5 sub/f.py'), f.TS1),
    f.withTimestamp(h.makeBashCatToolResult('u1', 'l1\nl2\nl3\nl4\nl5\n'), f.TS1)
  ];
  var jsonlText = lines.join('\n');
  var parsed = parsedFrom(lines);
  // Step: aliasSet holds the RESOLVED absolute path -> one event at the result line (index 2 -> line 3).
  var events = ev.bashReadEventsForFile('sess.jsonl', jsonlText, parsed, new Set(['/abs/proj/sub/f.py']));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].jsonlLine, 3);
  assert.strictEqual(events[0].timestamp, f.TS1);
  assert.deepStrictEqual(events[0].bashReadChunk, { firstLine: 1, lineCount: 5, hitEof: false });
  // Step (control): the RAW relative path in the alias set yields ZERO events (matching is resolved).
  var none = ev.bashReadEventsForFile('sess.jsonl', jsonlText, parsed, new Set(['sub/f.py']));
  assert.strictEqual(none.length, 0);
});

h.summary();
