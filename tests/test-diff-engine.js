#!/usr/bin/env node
// Tests for diff-engine.js — LCS line diff and diff rendering.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../common/diff-engine');
var lineDiff = mod.lineDiff;
var renderInlineDiff = mod.renderInlineDiff;
var renderSxsDiff = mod.renderSxsDiff;

console.log('\ndiff-engine:');

// ─── lineDiff ─────────────────────────────────────────────────────────────────

run('test_lineDiff_identicalLinesAllContext', function() {
  var ops = lineDiff(['a', 'b'], ['a', 'b']);
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0].op, 'ctx');
  assert.strictEqual(ops[1].op, 'ctx');
});

run('test_lineDiff_addedLineProducesAddOp', function() {
  var ops = lineDiff(['a'], ['a', 'b']);
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0].op, 'ctx');
  assert.strictEqual(ops[1].op, 'add');
  assert.strictEqual(ops[1].text, 'b');
});

run('test_lineDiff_removedLineProducesDelOp', function() {
  var ops = lineDiff(['a', 'b'], ['a']);
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0].op, 'ctx');
  assert.strictEqual(ops[1].op, 'del');
  assert.strictEqual(ops[1].text, 'b');
});

run('test_lineDiff_changedLineProducesDelThenAdd', function() {
  var ops = lineDiff(['hello'], ['world']);
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0].op, 'del');
  assert.strictEqual(ops[0].text, 'hello');
  assert.strictEqual(ops[1].op, 'add');
  assert.strictEqual(ops[1].text, 'world');
});

run('test_lineDiff_emptyToContentAllAdds', function() {
  var ops = lineDiff([], ['a', 'b']);
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0].op, 'add');
  assert.strictEqual(ops[1].op, 'add');
});

run('test_lineDiff_contentToEmptyAllDels', function() {
  var ops = lineDiff(['a', 'b'], []);
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0].op, 'del');
  assert.strictEqual(ops[1].op, 'del');
});

run('test_lineDiff_bothEmptyNoOps', function() {
  var ops = lineDiff([], []);
  assert.strictEqual(ops.length, 0);
});

// ─── renderInlineDiff ─────────────────────────────────────────────────────────

run('test_renderInlineDiff_ctxLineHasCorrectClass', function() {
  var ops = [{ op: 'ctx', text: 'same' }];
  var html = renderInlineDiff(ops);
  assert(html.indexOf('diff-ctx') >= 0);
  assert(html.indexOf(' same') >= 0);
});

run('test_renderInlineDiff_addLineHasCorrectClass', function() {
  var ops = [{ op: 'add', text: 'new' }];
  var html = renderInlineDiff(ops);
  assert(html.indexOf('diff-add') >= 0);
  assert(html.indexOf('+new') >= 0);
});

run('test_renderInlineDiff_delLineHasCorrectClass', function() {
  var ops = [{ op: 'del', text: 'old' }];
  var html = renderInlineDiff(ops);
  assert(html.indexOf('diff-del') >= 0);
  assert(html.indexOf('-old') >= 0);
});

// ─── renderSxsDiff ────────────────────────────────────────────────────────────

run('test_renderSxsDiff_ctxRowSpansFullWidth', function() {
  var ops = [{ op: 'ctx', text: 'same' }];
  var html = renderSxsDiff(ops);
  assert(html.indexOf('ctx-row') >= 0);
});

run('test_renderSxsDiff_changeRowHasDelAndAddCells', function() {
  var ops = [{ op: 'del', text: 'old' }, { op: 'add', text: 'new' }];
  var html = renderSxsDiff(ops);
  assert(html.indexOf('diff-cell del') >= 0);
  assert(html.indexOf('diff-cell add') >= 0);
});

run('test_renderSxsDiff_unevenChangePadsWithEmpty', function() {
  // Scenario: 2 deletes, 1 add — second row should have empty right cell.
  var ops = [
    { op: 'del', text: 'a' },
    { op: 'del', text: 'b' },
    { op: 'add', text: 'c' }
  ];
  var html = renderSxsDiff(ops);
  assert(html.indexOf('diff-cell empty') >= 0);
});

run('test_renderSxsDiff_htmlEscapesContent', function() {
  var ops = [{ op: 'ctx', text: '<script>' }];
  var html = renderSxsDiff(ops);
  assert(html.indexOf('&lt;script&gt;') >= 0);
  assert(html.indexOf('<script>') < 0);
});

h.summary();
