#!/usr/bin/env node
// Test runner — executes all replay-edits test files.
// Run: node replay-edits.test.js

var cp = require('child_process');
var path = require('path');

var testFiles = [
  'test-extract.js',
  'test-replay.js',
  'test-verify.js',
  'test-cat.js',
  'test-read.js',
  'test-file-state-history.js',
  'test-git-file-state.js'
];

var allPassed = true;

testFiles.forEach(function(f) {
  var result = cp.spawnSync('node', ['--inspect=0', path.join(__dirname, f)], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    allPassed = false;
  }
});

process.exit(allPassed ? 0 : 1);
