#!/usr/bin/env node
// Tests for json-inspector.js — HTML escaping, syntax highlighting, jump links.

var assert = require('assert');
var h = require('./test-helpers');
var run = h.run;
var mod = require('../common/json-inspector');
var esc = mod.esc;
var syntaxHighlight = mod.syntaxHighlight;
var addJumpLinks = mod.addJumpLinks;
var renderInspector = mod.renderInspector;

console.log('\njson-inspector:');

// ─── esc ──────────────────────────────────────────────────────────────────────

run('test_esc_escapesAmpersand', function() {
  assert.strictEqual(esc('a&b'), 'a&amp;b');
});

run('test_esc_escapesAngleBrackets', function() {
  assert.strictEqual(esc('<div>'), '&lt;div&gt;');
});

run('test_esc_escapesDoubleQuotes', function() {
  assert.strictEqual(esc('"hi"'), '&quot;hi&quot;');
});

run('test_esc_handlesAllSpecialCharsAtOnce', function() {
  assert.strictEqual(esc('<a href="x&y">'), '&lt;a href=&quot;x&amp;y&quot;&gt;');
});

run('test_esc_returnsPlainStringUnchanged', function() {
  assert.strictEqual(esc('hello world'), 'hello world');
});

// ─── syntaxHighlight ──────────────────────────────────────────────────────────

run('test_syntaxHighlight_wrapsKeysInJsonKeySpan', function() {
  var input = '"name": "value"';
  var result = syntaxHighlight(input);
  assert(result.indexOf('json-key') >= 0);
});

run('test_syntaxHighlight_wrapsStringsInJsonStringSpan', function() {
  var input = '"hello"';
  var result = syntaxHighlight(input);
  assert(result.indexOf('json-string') >= 0);
});

run('test_syntaxHighlight_wrapsNumbersInJsonNumberSpan', function() {
  var input = '42';
  var result = syntaxHighlight(input);
  assert(result.indexOf('json-number') >= 0);
});

run('test_syntaxHighlight_wrapsBooleanInJsonBooleanSpan', function() {
  var input = 'true';
  var result = syntaxHighlight(input);
  assert(result.indexOf('json-boolean') >= 0);
});

run('test_syntaxHighlight_wrapsNullInJsonNullSpan', function() {
  var input = 'null';
  var result = syntaxHighlight(input);
  assert(result.indexOf('json-null') >= 0);
});

run('test_syntaxHighlight_fullJsonObjectProducesAllClasses', function() {
  var obj = { name: 'test', count: 3, active: true, data: null };
  var input = JSON.stringify(obj, null, 4);
  var result = syntaxHighlight(input);
  assert(result.indexOf('json-key') >= 0);
  assert(result.indexOf('json-string') >= 0);
  assert(result.indexOf('json-number') >= 0);
  assert(result.indexOf('json-boolean') >= 0);
  assert(result.indexOf('json-null') >= 0);
});

// ─── addJumpLinks ─────────────────────────────────────────────────────────────

run('test_addJumpLinks_replacesToolIdWithJumpLink', function() {
  // Scenario: HTML contains a tool_use ID; addJumpLinks should wrap it.
  var html = '&quot;toolu_abc123&quot;';
  var opts = { toolIdMap: { 'toolu_abc123': [5, 10] }, selfIdx: 5 };
  var result = addJumpLinks(html, opts);
  assert(result.indexOf('jump-link') >= 0);
  assert(result.indexOf('data-jump="10"') >= 0);
});

run('test_addJumpLinks_skipsToolIdWhenOnlySelfInTargets', function() {
  var html = '&quot;toolu_abc123&quot;';
  var opts = { toolIdMap: { 'toolu_abc123': [5] }, selfIdx: 5 };
  var result = addJumpLinks(html, opts);
  assert(result.indexOf('jump-link') < 0);
});

run('test_addJumpLinks_replacesUuidWithJumpLink', function() {
  var uuid = '12345678-1234-1234-1234-123456789abc';
  var html = '&quot;' + uuid + '&quot;';
  var opts = { uuidMap: {} };
  opts.uuidMap[uuid] = 7;
  var result = addJumpLinks(html, opts);
  assert(result.indexOf('jump-link') >= 0);
  assert(result.indexOf('data-jump="7"') >= 0);
});

run('test_addJumpLinks_leavesUnknownUuidAlone', function() {
  var uuid = '12345678-1234-1234-1234-123456789abc';
  var html = '&quot;' + uuid + '&quot;';
  var opts = { uuidMap: {} };
  var result = addJumpLinks(html, opts);
  assert(result.indexOf('jump-link') < 0);
});

run('test_addJumpLinks_worksWithEmptyOpts', function() {
  var html = 'no links here';
  var result = addJumpLinks(html, {});
  assert.strictEqual(result, 'no links here');
});

run('test_addJumpLinks_worksWithNullOpts', function() {
  var html = 'no links here';
  var result = addJumpLinks(html, null);
  assert.strictEqual(result, 'no links here');
});

h.summary();
