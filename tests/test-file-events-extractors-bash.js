// Tests for api/file-events-extractors.js — the Bash-derived event kinds
// (bashReadChunk / bashExtent / bashGrep) and cat-emission cwd resolution. Split
// from tests/test-file-events-extractors.js at the 250-line write cap.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var efe = require('../api/file-events-extractors');

var TS = '2026-05-22T03:38:27.174Z';

// Patch a helper-built JSONL line with a top-level record timestamp.
function withTimestamp(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

// Write the fixture transcript to a temp dir and return its path.
function writeJsonlFixture(ctx, lines) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-efe-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

// ─── bashReadChunk events (partial-content Bash reads) ──────────────────────

runWithContext('test_extractFileEvents_bashHeadBecomesBashReadChunkEvent', function (ctx) {
  // A partial-content Bash read (head) extracts as a bashReadChunk event at the
  // RESULT line, with geometry computed at emission; hitEof since 2 < 5 asked.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCommandLine('u1', 'head -n 5 /repo/t.py'),
    withTimestamp(h.makeBashCatToolResult('u1', 'a\nb\n'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].bashReadChunk, { firstLine: 1, lineCount: 2, hitEof: true });
  assert.strictEqual(events[0].jsonlLine, 3);
  assert.strictEqual(events[0].unixMs, Date.parse(TS));
});

runWithContext('test_extractFileEvents_wcBecomesBashExtentEvent', function (ctx) {
  // `wc -l` extracts as a bashExtent event at the RESULT line (ref-less extent).
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCommandLine('u1', 'wc -l /repo/t.py'),
    withTimestamp(h.makeBashCatToolResult('u1', '     207 /repo/t.py'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].bashExtent, {});
  assert.strictEqual(events[0].jsonlLine, 3);
});

runWithContext('test_extractFileEvents_grepBecomesBashGrepEvent', function (ctx) {
  // Single-file `grep -n` extracts as a bashGrep event (sparse per-line matches).
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeBashCommandLine('u1', 'grep -n foo /repo/t.py'),
    withTimestamp(h.makeBashCatToolResult('u1', '3:foo here'), TS)
  ]);
  var events = efe.extractFileEvents(jsonlPath, ['/repo/t.py'], null);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].bashGrep, {});
});

// ─── Cat emission resolution (relative cat path resolved against session cwd) ─

run('test_catEventsForFile_matches_a_relative_cat_path_resolved_against_session_cwd', function () {
  // Behavior: a relative `cat sub/f.py` emits a 'cat' event only when the file's aliasSet
  // contains the path RESOLVED against the transcript's session cwd.
  var lines = [
    h.makeSystemLine('s1', 'main', '/abs/proj'),
    h.makeBashCatToolUse('t1', 'sub/f.py'),
    withTimestamp(h.makeBashCatToolResult('t1', '1\talpha\n'), TS)
  ];
  var jsonlText = lines.join('\n');
  var parsed = lines.map(function (l) { return JSON.parse(l); });
  // Step: resolved alias matches -> one cat event at the result line (index 2 -> line 3).
  var events = efe.catEventsForFile('sess.jsonl', jsonlText, parsed, new Set(['/abs/proj/sub/f.py']));
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].cat, {});
  assert.strictEqual(events[0].jsonlLine, 3);
  // Step (control): the RAW relative path in the alias set yields ZERO events (matching is resolved).
  var none = efe.catEventsForFile('sess.jsonl', jsonlText, parsed, new Set(['sub/f.py']));
  assert.strictEqual(none.length, 0);
});

h.summary();
