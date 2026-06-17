#!/usr/bin/env node
// CLI for the unified reconstruction engine. The library logic moved (Phase 5)
// to api/unified-reconstruct{,-steps,-patch}.js (common/unified-reconstruct*.js
// are tombstones, kept only for their viewer script tags until phase 7).
// Usage: node unified-reconstruct.js <folder> <targetFile>

var unified = require('../api/unified-reconstruct');

// CLI entry point.
function main() {
  var cliArgs = process.argv.slice(2);
  if (cliArgs.length < 2) {
    console.error('Usage: node unified-reconstruct.js <folder> <targetFile>');
    process.exit(1);
  }
  var result = unified.reconstructFromFolder(cliArgs[0], cliArgs[1]);
  process.stdout.write(result.content);
  console.error('Patches: ' + result.patches.length);
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}
