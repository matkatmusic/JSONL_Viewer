// Tests for api/bash-op-evidence.js — materialization of the Bash-file-op event
// kinds (bashRm / bashTruncate / bashAppend) and the conservative
// redirectContentFromCommand parser. Materializers deref the Bash command record
// into evidence refs; the parser extracts written content only from
// unambiguous single-quoted echo/printf producers (skip → null).

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var fek = require('../api/file-event-kinds');
var boev = require('../api/bash-op-evidence');

function rc(command) { return boev.redirectContentFromCommand(command); }

var TS1 = '2026-05-22T03:00:00.000Z';

function withTs(lineJson, iso) {
  var record = JSON.parse(lineJson);
  record.timestamp = iso;
  return JSON.stringify(record);
}

function writeTranscript(ctx, lines) {
  var fs = require('fs'), path = require('path');
  var jsonlPath = path.join(ctx.tempDir('rev-boev-'), 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

runWithContext('test_materializeBashRm_buildsWholeCommandTextPropertyRef', function (ctx) {
  // Behavior: a bashRm materializes to {kind, ref}, the ref a textProperty span
  // over the Bash command string that removed the file — the auditable evidence.
  var command = 'rm -f /repo/t.py';
  var jsonlPath = writeTranscript(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', command), TS1)
  ]);
  var event = fek.createKindEvent(jsonlPath, 2, TS1, 'bashRm', {});
  var m = boev.materializeBashRm(event);
  assert.strictEqual(m.kind, 'bashRm');
  assert.strictEqual(m.ref.jsonl, jsonlPath);
  assert.strictEqual(m.ref.jsonlLine, 2);
  assert.strictEqual(m.ref.textProperty.property, 'message.content[0].input.command');
  assert.strictEqual(m.ref.textProperty.startIndex, 0);
  assert.strictEqual(m.ref.textProperty.endIndex, command.length);
});

runWithContext('test_materializeBashTruncate_buildsByLineRefsIntoCommand', function (ctx) {
  // Behavior: bashTruncate materializes to per-line {lineNum, text, ref}; each
  // ref is a textProperty span over input.command that slices back to that line.
  var cmd = "echo 'a\nb' > /repo/t.py";
  var jsonlPath = writeTranscript(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', cmd), TS1)
  ]);
  var event = fek.createKindEvent(jsonlPath, 2, TS1, 'bashTruncate', {});
  var m = boev.materializeBashTruncate(event);
  assert.strictEqual(m.kind, 'bashTruncate');
  assert.strictEqual(m.byLine.length, 2);
  assert.strictEqual(m.byLine[0].lineNum, 1);
  assert.strictEqual(m.byLine[0].text, 'a');
  assert.strictEqual(m.byLine[1].text, 'b');
  var ref0 = m.byLine[0].ref.textProperty;
  assert.strictEqual(ref0.property, 'message.content[0].input.command');
  assert.strictEqual(cmd.slice(ref0.startIndex, ref0.endIndex), 'a');
  var ref1 = m.byLine[1].ref.textProperty;
  assert.strictEqual(cmd.slice(ref1.startIndex, ref1.endIndex), 'b');
});

runWithContext('test_materializeBashAppend_buildsByLineRefsNumberedFromOne', function (ctx) {
  // Behavior: bashAppend materializes like truncate (per-line refs into the
  // command) numbered from 1 (RELATIVE); the apply branch offsets by the extent.
  var cmd = "printf 'p\nq' >> /repo/t.py";
  var jsonlPath = writeTranscript(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    withTs(h.makeBashCommandLine('b1', cmd), TS1)
  ]);
  var event = fek.createKindEvent(jsonlPath, 2, TS1, 'bashAppend', {});
  var m = boev.materializeBashAppend(event);
  assert.strictEqual(m.kind, 'bashAppend');
  assert.strictEqual(m.byLine.length, 2);
  assert.strictEqual(m.byLine[0].lineNum, 1);
  assert.strictEqual(m.byLine[0].text, 'p');
  assert.strictEqual(m.byLine[1].lineNum, 2);
  assert.strictEqual(m.byLine[1].text, 'q');
  assert.strictEqual(cmd.slice(m.byLine[1].ref.textProperty.startIndex, m.byLine[1].ref.textProperty.endIndex), 'q');
});

// ─── redirectContentFromCommand (conservative content parser) ────────────────

run('test_redirectContentFromCommand_extractsSingleQuotedEcho', function () {
  // Behavior: single-quoted echo content is literal — extracted with a span
  // that slices back to exactly that content in the command string.
  var cmd = "echo 'hello world' > /repo/t.py";
  var r = rc(cmd);
  assert.strictEqual(r.content, 'hello world');
  assert.strictEqual(cmd.slice(r.startIndex, r.endIndex), 'hello world');
});

run('test_redirectContentFromCommand_extractsLiteralPrintfAndAppendForm', function () {
  // Behavior: literal printf (no % / no backslash) is extractable; the mode
  // (`>>`) is irrelevant to extraction — emission decides truncate vs append.
  var cmd = "printf 'abc' >> log.txt";
  var r = rc(cmd);
  assert.strictEqual(r.content, 'abc');
  assert.strictEqual(cmd.slice(r.startIndex, r.endIndex), 'abc');
});

run('test_redirectContentFromCommand_spansEmbeddedNewlineInSingleQuote', function () {
  // Behavior: a single-quoted string with a real newline yields multi-line
  // content whose span still slices back exactly (refs stay dereferenceable).
  var cmd = "echo 'line1\nline2' > f";
  var r = rc(cmd);
  assert.strictEqual(r.content, 'line1\nline2');
  assert.strictEqual(cmd.slice(r.startIndex, r.endIndex), 'line1\nline2');
});

run('test_redirectContentFromCommand_keepsLiteralBackslashInEcho', function () {
  // Behavior: echo (no -e) prints backslashes literally, so the command bytes
  // equal the file bytes — extractable (unlike printf, which interprets them).
  var cmd = "echo 'a\\tb' > f";
  assert.strictEqual(rc(cmd).content, 'a\\tb');
});

run('test_redirectContentFromCommand_skipsAmbiguousProducers', function () {
  // Behavior: anything whose written bytes may differ from the command bytes is
  // skipped (null) — double quotes, echo flags, printf escapes, no redirect,
  // and empty content (echo '' writes a newline the empty span can't represent).
  assert.strictEqual(rc('echo "x" > f'), null);          // double-quoted
  assert.strictEqual(rc("echo -e 'x' > f"), null);       // -e interprets escapes
  assert.strictEqual(rc("echo -n 'x' > f"), null);       // -n suppresses newline
  assert.strictEqual(rc("printf '%s' > f"), null);       // % format
  assert.strictEqual(rc("printf 'a\\nb' > f"), null);    // backslash escape
  assert.strictEqual(rc("echo 'x'"), null);              // no redirect
  assert.strictEqual(rc("echo '' > f"), null);           // empty content
});

h.summary();
