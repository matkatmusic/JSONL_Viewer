#!/usr/bin/env node
// Tests for api/unified-reconstruct-patch.js — structured patch operations.
// Split (Phase 5) from the over-cap test-unified-reconstruct.js so each module
// of the moved trio has its own test-<basename>.js suite. Assertions unchanged.

var assert = require('assert');
var t = require('./test-helpers');
var run = t.run;
var summary = t.summary;

var p = require('../api/unified-reconstruct-patch');

console.log('test-unified-reconstruct-patch.js\n');

run('extractOldLines returns context and removed lines', function() {
  // Scenario: hunk with context, removed, and added lines yields context+removed
  var hunk = { lines: [' ctx', '-old1', '-old2', '+new1'] };
  assert.deepStrictEqual(p.extractOldLines(hunk), ['ctx', 'old1', 'old2']);
});

run('extractNewLines returns context and added lines', function() {
  // Scenario: hunk with context, removed, and added lines yields context+added
  var hunk = { lines: [' ctx', '-old1', '+new1', '+new2'] };
  assert.deepStrictEqual(p.extractNewLines(hunk), ['ctx', 'new1', 'new2']);
});

run('regionMatches detects exact match', function() {
  // Scenario: stateLines contains targetLines at the given offset
  assert.strictEqual(p.regionMatches(['a', 'b', 'c', 'd'], 1, ['b', 'c']), true);
});

run('regionMatches detects mismatch', function() {
  // Scenario: stateLines do not match targetLines at the given offset
  assert.strictEqual(p.regionMatches(['a', 'b', 'c', 'd'], 1, ['b', 'x']), false);
});

run('regionMatches rejects negative offset', function() {
  // Scenario: negative offset always returns false
  assert.strictEqual(p.regionMatches(['a', 'b'], -1, ['a']), false);
});

run('regionMatches rejects out-of-bounds', function() {
  // Scenario: offset + length exceeds array size
  assert.strictEqual(p.regionMatches(['a', 'b'], 1, ['b', 'c']), false);
});

run('findHunkOffset locates at stated position', function() {
  // Scenario: old lines match at the hunk's 1-based oldStart position
  var hunk = { oldStart: 2, lines: [' b', ' c'] };
  var oldLines = p.extractOldLines(hunk);
  assert.strictEqual(p.findHunkOffset(['a', 'b', 'c', 'd'], hunk, oldLines), 1);
});

run('findHunkOffset finds drifted position', function() {
  // Scenario: old lines not at stated position but found nearby
  var hunk = { oldStart: 2, lines: [' b', ' c'] };
  var oldLines = p.extractOldLines(hunk);
  // 'b','c' are at index 2, not at index 1 (stated - 1)
  assert.strictEqual(p.findHunkOffset(['x', 'a', 'b', 'c', 'd'], hunk, oldLines), 2);
});

run('diffAgainstPatch returns null when old lines match', function() {
  // Scenario: state content matches the patch's expected old lines
  var hunks = [{ oldStart: 1, lines: [' a', '-b', '+B'] }];
  assert.strictEqual(p.diffAgainstPatch('a\nb\nc', hunks), null);
});

run('diffAgainstPatch detects drift', function() {
  // Scenario: state content differs from the patch's expected old lines
  var hunks = [{ oldStart: 1, lines: [' a', '-b', '+B'] }];
  var result = p.diffAgainstPatch('a\nX\nc', hunks);
  assert.strictEqual(result.hunkIndex, 0);
  assert.deepStrictEqual(result.expected, ['a', 'b']);
  assert.deepStrictEqual(result.actual, ['a', 'X']);
});

run('applyPatchToState applies single hunk', function() {
  // Scenario: replacing 'b' with 'B' in three-line file
  var hunks = [{ oldStart: 1, lines: [' a', '-b', '+B'] }];
  assert.strictEqual(p.applyPatchToState('a\nb\nc', hunks), 'a\nB\nc');
});

run('applyPatchToState applies multiple hunks in reverse order', function() {
  // Scenario: two hunks at different positions both apply correctly
  var hunks = [
    { oldStart: 1, lines: ['-a', '+A'] },
    { oldStart: 3, lines: ['-c', '+C'] }
  ];
  assert.strictEqual(p.applyPatchToState('a\nb\nc\nd', hunks), 'A\nb\nC\nd');
});

summary();
