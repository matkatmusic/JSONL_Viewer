// Tests for api/grep-tool-results: the pure native-Grep content parser. parseGrepRows
// turns a `relpath:line:text` content block into {relPath,lineNum,text,startIndex,
// endIndex} rows (spans into the content string); non-numbered rows (the "--" group
// separator, blanks) are skipped. extractGrepToolResults pairs a content-mode Grep
// tool_use with its tool_result. Mirrors the grepEntries row-walk (bash-read-evidence).

var assert = require('assert');
var h = require('./test-helpers');
var f = require('./track-line-states-fixtures');
var run = h.run;
var gtr = require('../api/grep-tool-results');
var TS = f.TS1;

run('test_parseGrepRows_splits_path_line_text_rows_with_correct_spans', function () {
  // Behavior: each relpath:line:text row becomes one entry whose relPath, numeric
  // lineNum and text are recovered, and whose span bounds the text within content.
  // Step: a two-file content block of three match rows.
  var content = 'src/a.js:12:const x = 1;\nsrc/a.js:30:return x;\nlib/b.js:5:foo()';
  var rows = gtr.parseGrepRows(content);
  // Step: three entries, in order.
  assert.strictEqual(rows.length, 3);
  // Step: relPath, lineNum and text are recovered per row.
  assert.deepStrictEqual(rows.map(function (r) { return r.relPath; }), ['src/a.js', 'src/a.js', 'lib/b.js']);
  assert.deepStrictEqual(rows.map(function (r) { return r.lineNum; }), [12, 30, 5]);
  assert.deepStrictEqual(rows.map(function (r) { return r.text; }), ['const x = 1;', 'return x;', 'foo()']);
  // Step: each span slices back to exactly the entry's text.
  for (var i = 0; i < rows.length; i++) {
    assert.strictEqual(content.slice(rows[i].startIndex, rows[i].endIndex), rows[i].text);
  }
});

run('test_parseGrepRows_skips_the_group_separator_and_blank_lines', function () {
  // Behavior: rows that are not a numbered path:line prefix — the "--" group
  // separator and blank lines — produce no entry.
  // Step: content with a separator and a blank line between two real rows.
  var content = 'src/a.js:12:hello\n--\n\nsrc/b.js:5:world';
  var rows = gtr.parseGrepRows(content);
  // Step: only the two numbered rows survive.
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows.map(function (r) { return r.relPath; }), ['src/a.js', 'src/b.js']);
  assert.deepStrictEqual(rows.map(function (r) { return r.lineNum; }), [12, 5]);
});

run('test_parseGrepRows_keeps_text_containing_colons_intact', function () {
  // Behavior: only the leading relpath:line: prefix is stripped; colons inside the
  // matched text survive (the path capture is non-greedy up to the first :digits:
  // boundary).
  // Step: a row whose text itself contains colons.
  var content = 'src/a.js:42:key: value: more';
  var rows = gtr.parseGrepRows(content);
  // Step: one entry; relPath and lineNum are the prefix, text keeps its colons.
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].relPath, 'src/a.js');
  assert.strictEqual(rows[0].lineNum, 42);
  assert.strictEqual(rows[0].text, 'key: value: more');
  assert.strictEqual(content.slice(rows[0].startIndex, rows[0].endIndex), 'key: value: more');
});

run('test_extractGrepToolResults_pairs_a_content_mode_grep_use_with_its_result', function () {
  // Behavior: a content-mode Grep tool_use paired by id with its tool_result yields one
  // result carrying the result record's 1-based index, its timestamp, and parsed rows.
  // Step: a Grep use, then its timestamped result.
  var lines = [
    h.makeGrepToolUse('g1', 'foo'),
    f.withTimestamp(h.makeGrepToolResult('g1', 'src/a.js:3:foo here', 1, 1), TS)
  ];
  var parsed = lines.map(function (l) { return JSON.parse(l); });
  var results = gtr.extractGrepToolResults(parsed);
  // Step: one result at the result record's 1-based line, with its timestamp.
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].resultLine, 2);
  assert.strictEqual(results[0].timestamp, TS);
  // Step: the rows are the parsed grep rows.
  assert.strictEqual(results[0].rows.length, 1);
  assert.strictEqual(results[0].rows[0].relPath, 'src/a.js');
  assert.strictEqual(results[0].rows[0].lineNum, 3);
});

run('test_extractGrepToolResults_skips_files_with_matches_mode', function () {
  // Behavior: a Grep run in a non-content mode (files_with_matches) is not line-addressed,
  // so it is not collected and its result yields nothing.
  // Step: a Grep use whose output_mode is files_with_matches, paired with a result.
  var useRecord = JSON.parse(h.makeGrepToolUse('g1', 'foo'));
  useRecord.message.content[0].input.output_mode = 'files_with_matches';
  var lines = [
    JSON.stringify(useRecord),
    f.withTimestamp(h.makeGrepToolResult('g1', 'src/a.js', 1, 1), TS)
  ];
  var parsed = lines.map(function (l) { return JSON.parse(l); });
  // Step: nothing is extracted.
  assert.strictEqual(gtr.extractGrepToolResults(parsed).length, 0);
});

run('test_extractGrepToolResults_skips_a_result_with_no_timestamp', function () {
  // Behavior: a result record without a timestamp cannot join the time-keyed timeline,
  // so it is dropped (mirrors the read/cat/bash extractors).
  // Step: a content-mode Grep use + a result carrying NO timestamp.
  var lines = [
    h.makeGrepToolUse('g1', 'foo'),
    h.makeGrepToolResult('g1', 'src/a.js:3:foo here', 1, 1)
  ];
  var parsed = lines.map(function (l) { return JSON.parse(l); });
  // Step: nothing is extracted (no timestamp).
  assert.strictEqual(gtr.extractGrepToolResults(parsed).length, 0);
});

h.summary();
