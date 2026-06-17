var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var runWithContext = h.runWithContext;
var ev = require('../api/line-state-evidence');

var TS = '2026-05-22T03:38:27.174Z';

// An extract-file-events-shaped event with one kind sub-object set.
function makeKindEvent(jsonlPath, jsonlLine, kindName, kindFields) {
  var event = { jsonl: jsonlPath, jsonlLine: jsonlLine, unixMs: Date.parse(TS), timestamp: TS };
  var kinds = ['snapshot', 'fileAbsent', 'write', 'edit', 'readFull', 'readChunk', 'cat', 'originalFile'];
  for (var i = 0; i < kinds.length; i++) { event[kinds[i]] = null; }
  event[kindName] = kindFields;
  return event;
}

function writeJsonlFixture(ctx, lines) {
  var fs = require('fs'), path = require('path');
  var dir = ctx.tempDir('rev-ev-');
  var jsonlPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

run('test_splitContentLines_dropsSingleTrailingNewlineKeepsInteriorBlanks', function () {
  // Behavior: "a\n\nb\n" is THREE lines (a, blank, b) — the final newline is a
  // terminator, not a fourth empty line; interior blanks survive.
  assert.deepStrictEqual(ev.splitContentLines('a\n\nb\n'), ['a', '', 'b']);
  // Step: an empty string is a zero-line file.
  assert.deepStrictEqual(ev.splitContentLines(''), []);
  // Step: no trailing newline keeps the last line.
  assert.deepStrictEqual(ev.splitContentLines('a\nb'), ['a', 'b']);
});

run('test_contentLineSpans_substringBoundsReconstructEachLine', function () {
  // Behavior: each span slices its exact line text back out of the string.
  var text = 'ab\n\ncd\n';
  var spans = ev.contentLineSpans(text);
  assert.strictEqual(spans.length, 3);
  assert.strictEqual(text.slice(spans[0].startIndex, spans[0].endIndex), 'ab');
  assert.strictEqual(text.slice(spans[1].startIndex, spans[1].endIndex), '');
  assert.strictEqual(text.slice(spans[2].startIndex, spans[2].endIndex), 'cd');
});

run('test_numberedLineEntries_carriesAbsoluteLineNumbersAndPostPrefixSpans', function () {
  // Behavior: Read results number lines "N\tcontent"; entries carry the
  // ABSOLUTE file line number and spans covering content AFTER the prefix.
  var raw = '10\tfoo\n11\tbar';
  var entries = ev.numberedLineEntries(raw);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].lineNum, 10);
  assert.strictEqual(entries[0].text, 'foo');
  assert.strictEqual(raw.slice(entries[0].startIndex, entries[0].endIndex), 'foo');
  assert.strictEqual(entries[1].lineNum, 11);
  assert.strictEqual(raw.slice(entries[1].startIndex, entries[1].endIndex), 'bar');
});

run('test_numberedLineEntries_skipsUnnumberedNoise', function () {
  // Behavior: unnumbered lines (system reminders, truncation notices) are not
  // file content and contribute no entries.
  var raw = '1\tfoo\n<system-reminder>noise</system-reminder>\n2\tbar';
  var entries = ev.numberedLineEntries(raw);
  assert.deepStrictEqual(entries.map(function (e) { return e.lineNum; }), [1, 2]);
});

run('test_catLineEntries_numbersPlainStdoutSequentially', function () {
  // Behavior: un-numbered cat stdout is the whole file from line 1 — entries
  // are numbered sequentially with whole-line spans.
  var raw = 'foo\nbar';
  var entries = ev.catLineEntries(raw);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].lineNum, 1);
  assert.strictEqual(entries[1].text, 'bar');
  assert.strictEqual(raw.slice(entries[1].startIndex, entries[1].endIndex), 'bar');
});

run('test_buildTextPropertyRef_hasExactlyOneNonNullLocator', function () {
  // Behavior: an evidenceRef groups locator fields into nullable sub-objects;
  // exactly the one matching the value's shape is non-null.
  var ref = ev.buildTextPropertyRef('/t/a.jsonl', 7, 'toolUseResult.content', 3, 9);
  assert.strictEqual(ref.jsonl, '/t/a.jsonl');
  assert.strictEqual(ref.jsonlLine, 7);
  assert.deepStrictEqual(ref.textProperty, { property: 'toolUseResult.content', startIndex: 3, endIndex: 9 });
  assert.strictEqual(ref.structuredPatch, null);
  assert.strictEqual(ref.blobFile, null);
});

runWithContext('test_materializeEvent_writeYieldsPerLineTextWithContentRefs', function (ctx) {
  // Behavior: materializing a write event derefs toolUseResult.content into
  // per-line text, each line carrying a textProperty ref into that property.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeCreateLine('/repo/t.py', 'alpha\nbeta\n')
  ]);
  var event = makeKindEvent(jsonlPath, 2, 'write', {});
  var m = ev.materializeEvent(event);
  assert.strictEqual(m.kind, 'write');
  assert.strictEqual(m.lines.length, 2);
  assert.strictEqual(m.lines[0].text, 'alpha');
  assert.strictEqual(m.lines[1].text, 'beta');
  var ref = m.lines[1].ref;
  assert.strictEqual(ref.textProperty.property, 'toolUseResult.content');
  assert.strictEqual('alpha\nbeta\n'.slice(ref.textProperty.startIndex, ref.textProperty.endIndex), 'beta');
});

runWithContext('test_materializeEvent_snapshotYieldsBlobFileRefsNamingTheBackupKey', function (ctx) {
  // Behavior: a snapshot event derefs the blob bytes; each line's ref is a
  // blobFile locator keeping BOTH the record property that named the blob and
  // the resolved path, so record -> blob -> bytes stays auditable.
  var fs = require('fs'), path = require('path');
  var blobDir = ctx.tempDir('rev-blob-');
  var blobPath = path.join(blobDir, 'blob-1');
  fs.writeFileSync(blobPath, 'alpha\nbeta\n');
  var backups = {};
  backups['scripts/t.py'] = { backupFileName: 'blob-1', version: 1 };
  var snapshot = { messageId: 'm1', timestamp: TS, trackedFileBackups: backups };
  var snapshotLine = JSON.stringify({ type: 'file-history-snapshot', messageId: 'm1', isSnapshotUpdate: false, snapshot: snapshot });
  var jsonlPath = writeJsonlFixture(ctx, [h.makeSystemLine('s1', 'main', '/repo'), snapshotLine]);
  var event = makeKindEvent(jsonlPath, 2, 'snapshot', { blob: blobPath, isSnapshotUpdate: false });
  var m = ev.materializeEvent(event);
  assert.strictEqual(m.kind, 'snapshot');
  assert.strictEqual(m.lines.length, 2);
  var ref = m.lines[0].ref;
  assert.strictEqual(ref.blobFile.property, "snapshot.trackedFileBackups['scripts/t.py']");
  assert.strictEqual(ref.blobFile.path, blobPath);
  assert.strictEqual('alpha\nbeta\n'.slice(ref.blobFile.startIndex, ref.blobFile.endIndex), 'alpha');
  assert.strictEqual(ref.textProperty, null);
});

runWithContext('test_materializeEvent_readChunkYieldsAbsoluteNumberedLines', function (ctx) {
  // Behavior: a readChunk materializes to lines keyed by ABSOLUTE file line
  // number with refs into the tool_result content string.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeReadToolUse('t1', '/repo/t.py'),
    h.makeReadToolResult('t1', '10\tfoo\n11\tbar\n')
  ]);
  var event = makeKindEvent(jsonlPath, 3, 'readChunk', { firstLine: 10, lineCount: 2, hitEof: true });
  var m = ev.materializeEvent(event);
  assert.strictEqual(m.kind, 'readChunk');
  assert.strictEqual(m.byLine.length, 2);
  assert.strictEqual(m.byLine[0].lineNum, 10);
  assert.strictEqual(m.byLine[0].text, 'foo');
  assert.strictEqual(m.byLine[0].ref.textProperty.property, 'message.content[0].content');
});

runWithContext('test_refForAuthoredEditLine_prefersStructuredPatchFallsBackToNewString', function (ctx) {
  // Behavior: an edit-authored line's evidence is its structuredPatch location
  // when the patch holds it; otherwise a substring span into newString.
  var record = JSON.parse(h.makeEditLine('/repo/t.py', 'old line', 'new line'));
  record.toolUseResult.structuredPatch = [{ lines: ['-old line', '+new line'] }];
  var jsonlPath = writeJsonlFixture(ctx, [h.makeSystemLine('s1', 'main', '/repo'), JSON.stringify(record)]);
  var event = makeKindEvent(jsonlPath, 2, 'edit', { floating: false });
  // Step: the patch holds the line -> structuredPatch ref.
  var patchRef = ev.refForAuthoredEditLine(event, 'new line');
  assert.deepStrictEqual(patchRef.structuredPatch, { property: 'toolUseResult.structuredPatch', hunkIndex: 0, lineIndex: 1 });
  // Step: a boundary line absent from the patch but inside newString -> textProperty span.
  var subRef = ev.refForAuthoredEditLine(event, 'ew lin');
  assert.strictEqual(subRef.textProperty.property, 'toolUseResult.newString');
  assert.strictEqual('new line'.slice(subRef.textProperty.startIndex, subRef.textProperty.endIndex), 'ew lin');
});

runWithContext('test_materializeEvent_editCarriesSpliceStrings', function (ctx) {
  // Behavior: an edit materializes to the splice inputs the tracker needs.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeEditLine('/repo/t.py', 'aaa', 'bbb', true)
  ]);
  var event = makeKindEvent(jsonlPath, 2, 'edit', { floating: false });
  var m = ev.materializeEvent(event);
  assert.strictEqual(m.kind, 'edit');
  assert.strictEqual(m.oldString, 'aaa');
  assert.strictEqual(m.newString, 'bbb');
  assert.strictEqual(m.replaceAll, true);
});

runWithContext('test_materializeEvent_originalFileYieldsWholeFileByLineWithOriginalFileRefs', function (ctx) {
  // Behavior: an originalFile event derefs toolUseResult.originalFile into
  // per-line text numbered from 1, each line carrying a textProperty ref into
  // that property whose span slices the exact line out of the pre-edit content.
  var jsonlPath = writeJsonlFixture(ctx, [
    h.makeSystemLine('s1', 'main', '/repo'),
    h.makeEditLine('/repo/t.py', 'a', 'b', false, 'a\nb\n')
  ]);
  var event = makeKindEvent(jsonlPath, 2, 'originalFile', {});
  var m = ev.materializeEvent(event);
  assert.strictEqual(m.kind, 'originalFile');
  assert.strictEqual(m.byLine.length, 2);
  assert.strictEqual(m.byLine[0].lineNum, 1);
  assert.strictEqual(m.byLine[0].text, 'a');
  assert.strictEqual(m.byLine[1].lineNum, 2);
  assert.strictEqual(m.byLine[1].text, 'b');
  var ref = m.byLine[1].ref;
  assert.strictEqual(ref.textProperty.property, 'toolUseResult.originalFile');
  assert.strictEqual('a\nb\n'.slice(ref.textProperty.startIndex, ref.textProperty.endIndex), 'b');
});

runWithContext('test_materializeEvent_bashReadChunkNumbersFromFirstLine', function (ctx) {
  // Behavior: a bashReadChunk event routes to the bash-read materializer, which
  // numbers raw head/sed/tail stdout from the event's firstLine (no N\t prefixes).
  var jsonlPath = writeJsonlFixture(ctx, [h.makeBashCatToolResult('u1', 'alpha\nbeta\n')]);
  var event = makeKindEvent(jsonlPath, 1, 'bashReadChunk', { firstLine: 7, lineCount: 2, hitEof: true });
  var m = ev.materializeEvent(event);
  assert.strictEqual(m.kind, 'bashReadChunk');
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [7, 8]);
  assert.strictEqual(m.byLine[0].text, 'alpha');
  assert.strictEqual(m.byLine[0].ref.textProperty.property, 'message.content[0].content');
});

runWithContext('test_materializeEvent_bashExtentParsesLineCount', function (ctx) {
  // Behavior: a bashExtent event routes to the wc -l materializer, which parses
  // the leading integer of stdout into a ref-less {kind, lineCount}.
  var jsonlPath = writeJsonlFixture(ctx, [h.makeBashCatToolResult('u1', '     207 /repo/t.py')]);
  var event = makeKindEvent(jsonlPath, 1, 'bashExtent', {});
  assert.deepStrictEqual(ev.materializeEvent(event), { kind: 'bashExtent', lineCount: 207 });
});

runWithContext('test_materializeEvent_bashGrepParsesNumberedRows', function (ctx) {
  // Behavior: a bashGrep event routes to the grep -n materializer, numbering each
  // N:/N- row by its explicit line number.
  var jsonlPath = writeJsonlFixture(ctx, [h.makeBashCatToolResult('u1', '3:gamma\n9:iota')]);
  var m = ev.materializeEvent(makeKindEvent(jsonlPath, 1, 'bashGrep', {}));
  assert.strictEqual(m.kind, 'bashGrep');
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [3, 9]);
  assert.strictEqual(m.byLine[1].text, 'iota');
});

runWithContext('test_materializeEvent_routes_a_grepMatches_event_to_its_materializer', function (ctx) {
  // Behavior: a grepMatches event routes to the native-Grep materializer, which keeps only
  // the rows for the event's filePath and numbers them by their grep-reported line numbers.
  var jsonlPath = writeJsonlFixture(ctx, [h.makeGrepToolResult('g1', 'a.js:4:delta\nb.js:9:other', 2, 2)]);
  var event = makeKindEvent(jsonlPath, 1, 'grepMatches', { filePath: '/repo/a.js', cwd: '/repo' });
  var m = ev.materializeEvent(event);
  assert.strictEqual(m.kind, 'grepMatches');
  // Step: only the a.js row survives, at its grep-reported absolute line number.
  assert.deepStrictEqual(m.byLine.map(function (e) { return e.lineNum; }), [4]);
  assert.strictEqual(m.byLine[0].text, 'delta');
});

h.summary();
