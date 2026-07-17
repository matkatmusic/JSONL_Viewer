#!/usr/bin/env node
// Definitive scan of toolUseResult.originalFile population over every .jsonl
// under a projects directory (recursive). Self-contained (fs/path only).
//
// Method (faithful to the brief): find candidate lines by a LITERAL substring
// match — never walkDirectory the parsed JSON tree to LOCATE the property:
//   '"originalFile":"'   -> originalFile present as a STRING (empty or non-empty)
//   '"structuredPatch"'  -> an Edit/Write tool-result (the universe where
//                            originalFile is relevant; also catches the `null`
//                            cases the first marker cannot see)
// Then parse ONLY the matched lines, read toolUseResult.originalFile, classify
// nonEmpty/empty/null/absent + the record kind, and cross-tabulate
// kind x version x state.
//
// Usage: node scan.js <projects-dir>
var fs = require('fs');
var path = require('path');

var OF_STR = '"originalFile":"';
var SP_MARK = '"structuredPatch"';
var STATES = ['nonEmpty', 'empty', 'null', 'absent'];

function walkDirectory(dir, out) {
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dir, entries[i].name);
    if (entries[i].isDirectory()) { walkDirectory(full, out); continue; }
    if (entries[i].isFile()) { if (full.endsWith('.jsonl')) { out.push(full); } }
  }
}

// originalFile state from a parsed record's toolUseResult.
function classifyOriginalFileState(tur) {
  if (!('originalFile' in tur)) { return 'absent'; }
  var v = tur.originalFile;
  if (v === null) { return 'null'; }
  if (typeof v !== 'string') { return 'null'; }
  if (v === '') { return 'empty'; }
  return 'nonEmpty';
}

// Record kind from the toolUseResult shape (the "is it an edit / write?" axis).
function classifyRecordKind(tur) {
  if (tur.type === 'create') { return 'Write(create)'; }
  if (tur.type === 'update') { return 'Write(update)'; }
  if ('oldString' in tur) { return 'Edit'; }
  if ('newString' in tur) { return 'Edit'; }
  return 'other';
}

function incrementBumpCounter(map, key) { map[key] = (map[key] || 0) + 1; }

function createAccumulator() {
  return { byKindState: {}, byVersionState: {}, byKindVersion: {}, versions: {}, kinds: {}, grep: 0, universe: 0 };
}

// Tally one candidate line into the accumulator (one record).
function accumulateRecordTally(acc, rec) {
  var tur = rec.toolUseResult;
  if (!tur) { return; }
  var kind = classifyRecordKind(tur);
  if (kind === 'other') { return; }
  acc.universe++;
  var st = classifyOriginalFileState(tur);
  var ver = rec.version || '(none)';
  acc.versions[ver] = true;
  acc.kinds[kind] = true;
  if (!acc.byKindState[kind]) { acc.byKindState[kind] = {}; }
  if (!acc.byVersionState[ver]) { acc.byVersionState[ver] = {}; }
  var kv = kind + '||' + ver;
  if (!acc.byKindVersion[kv]) { acc.byKindVersion[kv] = {}; }
  incrementBumpCounter(acc.byKindState[kind], st);
  incrementBumpCounter(acc.byVersionState[ver], st);
  incrementBumpCounter(acc.byKindVersion[kv], st);
}

// Literal-match one line; parse + tally only when a marker is present.
function scanLine(acc, line) {
  var hasOFStr = line.indexOf(OF_STR) !== -1;
  if (hasOFStr) { acc.grep++; }
  if (!hasOFStr) { if (line.indexOf(SP_MARK) === -1) { return; } }
  var rec;
  try { rec = JSON.parse(line); } catch (e) { return; }
  accumulateRecordTally(acc, rec);
}

function scanFile(acc, file) {
  var text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) { scanLine(acc, lines[i]); }
}

function formatStatisticsRow(m) {
  var total = STATES.reduce(function (a, s) { return a + (m[s] || 0); }, 0);
  var cells = STATES.map(function (s) { return String(m[s] || 0).padStart(9); }).join('');
  var trust = total ? (100 * (m.nonEmpty || 0) / total).toFixed(1) + '%' : '-';
  return cells + String(total).padStart(9) + '  ' + trust;
}

function compareVersions(a, b) {
  var pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var d = (pa[i] || 0) - (pb[i] || 0);
    if (d) { return d; }
  }
  return 0;
}

function printTables(acc) {
  var HEAD = 'nonEmpty'.padStart(9) + 'empty'.padStart(9) + 'null'.padStart(9) + 'absent'.padStart(9) + 'total'.padStart(9) + '  %nonEmpty';
  console.log('\n=== TABLE A: by record kind ===');
  console.log('kind'.padEnd(16) + HEAD);
  Object.keys(acc.kinds).sort().forEach(function (k) { console.log(k.padEnd(16) + formatStatisticsRow(acc.byKindState[k])); });
  console.log('\n=== TABLE B: by version ===');
  console.log('version'.padEnd(16) + HEAD);
  Object.keys(acc.versions).sort(compareVersions).forEach(function (v) { console.log(v.padEnd(16) + formatStatisticsRow(acc.byVersionState[v])); });
  console.log('\n=== TABLE C: kind x version ===');
  console.log('kind+version'.padEnd(28) + HEAD);
  Object.keys(acc.byKindVersion).sort(function (a, b) {
    var c = compareVersions(a.split('||')[1], b.split('||')[1]);
    return c ? c : (a < b ? -1 : 1);
  }).forEach(function (kv) {
    var parts = kv.split('||');
    console.log((parts[0] + ' @ ' + parts[1]).padEnd(28) + formatStatisticsRow(acc.byKindVersion[kv]));
  });
}

function runMain() {
  var root = process.argv[2];
  if (!root) { console.error('Usage: node scan.js <projects-dir>'); process.exit(1); }
  var files = [];
  walkDirectory(root, files);
  var acc = createAccumulator();
  for (var i = 0; i < files.length; i++) { scanFile(acc, files[i]); }
  console.log('files scanned (recursive):', files.length);
  console.log('literal "originalFile":" matches:', acc.grep);
  console.log('edit/write-universe records parsed:', acc.universe);
  printTables(acc);
}

if (require.runMain === module) { runMain(); }
