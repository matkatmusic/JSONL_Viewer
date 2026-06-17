// Tests for api/file-event-wishlists.js — the readsForFile / editsForFile
// wish-list selectors. Thin filters over extractFileEventsFromText: readsForFile
// keeps read kinds (readFull/readChunk/cat), editsForFile keeps authored kinds
// (write/edit). Relocated VERBATIM from test-file-events-extractors (roadmap item
// 3, Phase 0) when the helpers moved to their own module.

var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var fw = require('../api/file-event-wishlists');

var TS = '2026-05-22T03:38:27.174Z';
var KIND_NAMES = ['snapshot', 'fileAbsent', 'write', 'edit', 'readFull', 'readChunk', 'cat', 'originalFile'];

// Patch a helper-built JSONL line with a top-level record timestamp.
function withTimestamp(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

// Write the fixture transcript to a temp dir and return its path.
function writeJsonlFixture(ctx, lines) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-fw-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

// Assert the event's kind sub-objects have exactly kindName non-null.
function assertOnlyKindNonNull(event, kindName) {
  for (var i = 0; i < KIND_NAMES.length; i++) {
    if (KIND_NAMES[i] === kindName) { assert.notStrictEqual(event[KIND_NAMES[i]], null); }
    else { assert.strictEqual(event[KIND_NAMES[i]], null); }
  }
}

// A transcript that both writes (edit kind) and reads (read kind) one file.
function writeWriteAndReadFixture(ctx) {
  return writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTimestamp(h.makeCreateLine('/repo/t.py', 'a\nb'), TS),
    h.makeReadToolUse('r1', '/repo/t.py'),
    withTimestamp(h.makeReadToolResult('r1', '1\talpha\n2\tbeta\n'), TS)
  ]);
}

runWithContext('test_readsForFile_keepsReadKindExcludesWrite', function (ctx) {
  var reads = fw.readsForFile(writeWriteAndReadFixture(ctx), ['/repo/t.py'], null);
  assert.strictEqual(reads.length, 1);
  assertOnlyKindNonNull(reads[0], 'readFull');
});

runWithContext('test_editsForFile_keepsWriteKindExcludesRead', function (ctx) {
  var edits = fw.editsForFile(writeWriteAndReadFixture(ctx), ['/repo/t.py'], null);
  assert.strictEqual(edits.length, 1);
  assertOnlyKindNonNull(edits[0], 'write');
});

h.summary();
