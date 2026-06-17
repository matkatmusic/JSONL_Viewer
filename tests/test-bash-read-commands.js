// Tests for api/bash-read-commands: pure parsers for partial-content Bash reads.
// Phase A scope: head / sed -n / tail -n +N -> bashReadChunk (or null to skip).
// wc -l (bashExtent) and grep -n (bashGrep) parsers arrive in later phases and
// get their own assertions then.

var assert = require('assert');
var h = require('./test-helpers');
var p = require('../api/bash-read-commands');

var P = '/repo/t.py';

// ─── head ───────────────────────────────────────────────────────────────────

h.run('head with no -n defaults to first 10 lines', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('head ' + P),
    { kind: 'bashReadChunk', path: P, firstLine: 1, requested: 10 });
});

h.run('head -n N (spaced) reads N lines from line 1', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('head -n 5 ' + P),
    { kind: 'bashReadChunk', path: P, firstLine: 1, requested: 5 });
});

h.run('head -nN (glued) reads N lines from line 1', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('head -n5 ' + P),
    { kind: 'bashReadChunk', path: P, firstLine: 1, requested: 5 });
});

// ─── sed -n ───────────────────────────────────────────────────────────────────

h.run('sed -n quoted range numbers from A, requests B-A+1', function () {
  assert.deepStrictEqual(p.parseBashReadCommand("sed -n '5,10p' " + P),
    { kind: 'bashReadChunk', path: P, firstLine: 5, requested: 6 });
});

h.run('sed -n unquoted range', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('sed -n 5,10p ' + P),
    { kind: 'bashReadChunk', path: P, firstLine: 5, requested: 6 });
});

h.run('sed -n single line Np requests 1', function () {
  assert.deepStrictEqual(p.parseBashReadCommand("sed -n '7p' " + P),
    { kind: 'bashReadChunk', path: P, firstLine: 7, requested: 1 });
});

h.run('sed -n A,$p reads to EOF (requested null)', function () {
  assert.deepStrictEqual(p.parseBashReadCommand("sed -n '3,$p' " + P),
    { kind: 'bashReadChunk', path: P, firstLine: 3, requested: null });
});

h.run('sed -n with descending range is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand("sed -n '10,5p' " + P), null);
});

// ─── tail -n +N ───────────────────────────────────────────────────────────────

h.run('tail -n +N (spaced) reads from line N to EOF', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('tail -n +20 ' + P),
    { kind: 'bashReadChunk', path: P, firstLine: 20, requested: null });
});

h.run('tail -n+N (glued) reads from line N to EOF', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('tail -n+20 ' + P),
    { kind: 'bashReadChunk', path: P, firstLine: 20, requested: null });
});

// ─── deferred / skipped forms (return null forever) ───────────────────────────

h.run('piped command is skipped (anchored ^...$ over whole command)', function () {
  assert.strictEqual(p.parseBashReadCommand('cat ' + P + ' | head'), null);
});

h.run('redirected command is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('head ' + P + ' > out.txt'), null);
});

h.run('tail -n N (last-N, un-positionable) is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('tail -n 5 ' + P), null);
});

h.run('bare tail is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('tail ' + P), null);
});

h.run('head -N shorthand is skipped (deferred)', function () {
  assert.strictEqual(p.parseBashReadCommand('head -5 ' + P), null);
});

h.run('sed -n -e form is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand("sed -n -e '5,10p' " + P), null);
});

h.run('unrelated command is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('echo hi'), null);
});

h.run('non-string input is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand(null), null);
});

// ─── wc -l (bashExtent) ───────────────────────────────────────────────────────

h.run('wc -l file parses as bashExtent', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('wc -l ' + P),
    { kind: 'bashExtent', path: P });
});

h.run('wc without -l is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('wc ' + P), null);
});

h.run('piped wc -l is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('cat ' + P + ' | wc -l'), null);
});

h.run('wc -l with no file arg is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('wc -l'), null);
});

// ─── grep -n (bashGrep) ───────────────────────────────────────────────────────

h.run('single-file grep -n parses as bashGrep', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('grep -n foo ' + P),
    { kind: 'bashGrep', path: P });
});

h.run('grep -n with -A/-B/-C context flag parses (numeric arg consumed)', function () {
  assert.deepStrictEqual(p.parseBashReadCommand('grep -n -A 3 foo ' + P),
    { kind: 'bashGrep', path: P });
});

h.run('recursive grep -rn is skipped (item 5 territory)', function () {
  assert.strictEqual(p.parseBashReadCommand('grep -rn foo ' + P), null);
});

h.run('grep without -n is skipped (no line numbers)', function () {
  assert.strictEqual(p.parseBashReadCommand('grep foo ' + P), null);
});

h.run('multi-file grep -n is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('grep -n foo a.py b.py'), null);
});

h.run('piped grep -n is skipped', function () {
  assert.strictEqual(p.parseBashReadCommand('cat ' + P + ' | grep -n foo'), null);
});

h.summary();
