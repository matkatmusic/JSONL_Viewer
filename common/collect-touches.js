// Permissive file-touch collector + cross-JSONL rename-lineage tracker.
// "Touched" = a session READ (Read tool / cat) OR MODIFIED (Write/Edit/create/
// update/cp/mv/git mv/rm/redirect) a file; lineage-aware so renames survive.
// Reuses existing extractors (does NOT re-parse tool records):
//   extractReadEdits      — ALL reads, unfiltered (the reads-filter gotcha fix)
//   extractEditsFromJSONL — create/update/edit/cat edits (heterogeneous output)
//   extractBashFileOps    — cp/mv/git-mv/rm/redirect bash operations
//   extractSessionMetadata— session cwd, to resolve relative bash paths

var fs, path, os;
var extractReadEdits, extractEditsFromJSONL, extractBashFileOps;
var extractSessionMetadata;
if (typeof module !== 'undefined' && typeof require === 'function') {
  fs = require('fs');
  path = require('path');
  os = require('os');
  extractReadEdits = require('./extract-file-state').extractReadEdits;
  extractEditsFromJSONL = require('./replay-edits').extractEditsFromJSONL;
  extractBashFileOps = require('./extract-bash-file-ops').extractBashFileOps;
  extractSessionMetadata = require('./git-file-state').extractSessionMetadata;
  // discoverProjects is required lazily in enumerateJsonlFiles to avoid a
  // load-time circular dependency: probe-projects.js now requires
  // file-path-history.js, which requires this module. Deferring the require to
  // call time lets probe-projects.js finish loading first.
}

// Bash op types that participate in lineage (rename/copy), vs. plain touches.
var LINEAGE_OP_TYPES = { cp: true, mv: true, 'git-mv': true };

// ─── Path resolution ────────────────────────────────────────────────────────

// Resolve a possibly-relative bash path to absolute against the session cwd.
// Expands a leading "~" to home first. Bash op src/dst/paths may be relative;
// reads/writes/cat already carry absolute paths.
function resolveAgainstCwd(cwd, p) {
  if (!p) { return p; }
  var expanded = p;
  if (p.charAt(0) === '~') { expanded = path.join(os.homedir(), p.slice(1)); }
  if (path.isAbsolute(expanded)) { return expanded; }
  return path.resolve(cwd || '', expanded);
}

// ─── Touch collection from a single JSONL ───────────────────────────────────

// Append read touches (unfiltered) to the touches array.
function appendReadTouches(touches, lines, parsed) {
  var reads = extractReadEdits(lines, parsed);
  for (var i = 0; i < reads.length; i++) {
    touches.push({ kind: 'read', path: reads[i].filePath, line: reads[i].line });
  }
}

// Map an edit's type to a touch kind, or null when it is not a touch.
// Read/cat-sourced edits are observations -> 'read'; create/update -> write,
// edit -> edit. Snapshot edits and raw bash-op objects are excluded here.
function touchKindForEdit(edit) {
  if (edit.source === 'snapshot') { return null; }
  if (!edit.filePath) { return null; }
  if (edit.source === 'read') { return 'read'; }
  if (edit.source === 'cat') { return 'read'; }
  if (edit.type === 'create') { return 'write'; }
  if (edit.type === 'update') { return 'write'; }
  if (edit.type === 'edit') { return 'edit'; }
  return null;
}

// Append write/edit/cat touches drawn from extractEditsFromJSONL.
function appendEditTouches(touches, jsonlText) {
  var edits = extractEditsFromJSONL(jsonlText);
  for (var i = 0; i < edits.length; i++) {
    var kind = touchKindForEdit(edits[i]);
    if (!kind) { continue; }
    touches.push({ kind: kind, path: edits[i].filePath, line: edits[i].line });
  }
}

// Append touches for each path removed by an rm op (paths may be relative).
function appendRmTouches(touches, op, cwd) {
  for (var i = 0; i < op.paths.length; i++) {
    touches.push({ kind: 'rm', path: resolveAgainstCwd(cwd, op.paths[i]), line: op.line });
  }
}

// Append touches for rm/redirect bash ops, resolving relative paths to absolute.
function appendBashOpTouches(touches, op, cwd) {
  if (op.type === 'rm') { appendRmTouches(touches, op, cwd); return; }
  if (op.type === 'redirect') {
    touches.push({ kind: 'redirect', path: resolveAgainstCwd(cwd, op.path), line: op.line });
  }
}

// Build a resolved lineage op (cp/mv/git-mv) with absolute src/dst, or null.
function buildLineageOp(op, cwd) {
  if (!LINEAGE_OP_TYPES[op.type]) { return null; }
  return { type: op.type, src: resolveAgainstCwd(cwd, op.src), dst: resolveAgainstCwd(cwd, op.dst), line: op.line };
}

// Parse every JSONL line once into an array of objects (null on bad line).
function parseLines(lines) {
  var parsed = [];
  for (var i = 0; i < lines.length; i++) {
    try { parsed.push(JSON.parse(lines[i])); }
    catch (e) { parsed.push(null); }
  }
  return parsed;
}

// Annotate each touch with the ISO timestamp of its JSONL record (or null when
// the record has none). The touch's `line` is the index into the same
// filter(Boolean) line array that produced `parsed`, so parsed[line] is the
// originating record. Carrying the timestamp lets touches be ordered GLOBALLY
// across transcripts (line numbers are only comparable within one transcript).
function stampTouchTimestamps(touches, parsed) {
  for (var i = 0; i < touches.length; i++) {
    var record = parsed[touches[i].line];
    touches[i].timestamp = (record && record.timestamp) ? record.timestamp : null;
  }
}

// Collect every touch and rename/copy op from one JSONL transcript.
// Returns { sessionId, cwd, touches:[{kind,path,line,timestamp}], ops:[{type,src,dst,line}] }.
// touches use absolute paths; ops are the cp/mv/git-mv records for lineage.
function collectTouches(jsonlText) {
  var lines = jsonlText.split('\n').filter(Boolean);
  var parsed = parseLines(lines);
  var meta = extractSessionMetadata(jsonlText);
  var cwd = meta.cwd || '';

  var touches = [];
  appendReadTouches(touches, lines, parsed);
  appendEditTouches(touches, jsonlText);

  var ops = [];
  var bashOps = extractBashFileOps(parsed);
  for (var i = 0; i < bashOps.length; i++) {
    appendBashOpTouches(touches, bashOps[i], cwd);
    var lineageOp = buildLineageOp(bashOps[i], cwd);
    if (lineageOp) { ops.push(lineageOp); }
  }

  stampTouchTimestamps(touches, parsed);
  return { sessionId: meta.sessionId, cwd: cwd, touches: touches, ops: ops };
}

// ─── Lineage graph ──────────────────────────────────────────────────────────

// Ensure a node exists in the adjacency map and return its neighbor set.
function ensureNode(graph, key) {
  if (!graph[key]) { graph[key] = new Set(); }
  return graph[key];
}

// Add a directed edge from -> to in the adjacency map.
function addDirectedEdge(graph, from, to) {
  ensureNode(graph, from).add(to);
  ensureNode(graph, to);
}

// Build an adjacency map (absolute path -> neighbor Set) from rename/copy ops.
//   mv / git-mv : UNDIRECTED edge src <-> dst (same file identity).
//   cp          : DIRECTED edge dst -> src (copy->source); a target reaches its
//                 copy-source, never the reverse.
function buildLineageGraph(allOps) {
  var graph = {};
  for (var i = 0; i < allOps.length; i++) {
    var op = allOps[i];
    if (op.type === 'cp') { addDirectedEdge(graph, op.dst, op.src); continue; }
    addDirectedEdge(graph, op.src, op.dst);
    addDirectedEdge(graph, op.dst, op.src);
  }
  return graph;
}

// Visit a node's neighbors, enqueueing any not yet seen.
function visitNeighbors(current, graph, aliases, queue) {
  var neighbors = graph[current];
  if (!neighbors) { return; }
  var list = Array.from(neighbors);
  for (var n = 0; n < list.length; n++) {
    if (aliases.has(list[n])) { continue; }
    aliases.add(list[n]);
    queue.push(list[n]);
  }
}

// Transitive closure (BFS) of alias paths reachable from one or more seeds.
// Returns a Set of absolute alias paths, always including the seeds themselves.
function resolveAliases(seedPaths, graph) {
  var aliases = new Set();
  var queue = seedPaths.slice();
  for (var s = 0; s < seedPaths.length; s++) { aliases.add(seedPaths[s]); }
  while (queue.length > 0) {
    visitNeighbors(queue.shift(), graph, aliases, queue);
  }
  return aliases;
}

// ─── JSONL enumeration ──────────────────────────────────────────────────────

// Flat list of absolute .jsonl paths under every project folder in projectsDir.
function enumerateJsonlFiles(projectsDir) {
  var discoverProjects = require('../tools/probe-projects').discoverProjects;
  var projects = discoverProjects(projectsDir);
  var files = [];
  for (var p = 0; p < projects.length; p++) {
    var entries = fs.readdirSync(projects[p].dir);
    for (var e = 0; e < entries.length; e++) {
      if (!entries[e].endsWith('.jsonl')) { continue; }
      files.push(path.join(projects[p].dir, entries[e]));
    }
  }
  return files;
}

// ─── Core two-pass engine ───────────────────────────────────────────────────

// The earliest line index in a JSONL whose touch matches the alias set, or
// Infinity when nothing matches. Orders results deterministically.
function firstMatchingLine(touches, aliases) {
  var best = Infinity;
  for (var i = 0; i < touches.length; i++) {
    if (!aliases.has(touches[i].path)) { continue; }
    if (touches[i].line >= best) { continue; }
    best = touches[i].line;
  }
  return best;
}

// Pass 1: collect touches + ops for every JSONL once, caching the result.
function collectAllJsonls(jsonlFiles) {
  var cache = [];
  for (var i = 0; i < jsonlFiles.length; i++) {
    var text = fs.readFileSync(jsonlFiles[i], 'utf8');
    var collected = collectTouches(text);
    cache.push({ file: jsonlFiles[i], touches: collected.touches, ops: collected.ops });
  }
  return cache;
}

// Gather every lineage op across all cached JSONLs into one flat array.
function gatherAllOps(cache) {
  var allOps = [];
  for (var i = 0; i < cache.length; i++) {
    allOps = allOps.concat(cache[i].ops);
  }
  return allOps;
}

// Compare two match entries: by first matching line, then by file path.
function compareMatches(a, b) {
  if (a.firstLine !== b.firstLine) { return a.firstLine - b.firstLine; }
  return a.file < b.file ? -1 : (a.file > b.file ? 1 : 0);
}

// Pass 2: select cached JSONLs that touched any alias path, sorted by first match.
function selectReferencing(cache, aliases) {
  var matches = [];
  for (var i = 0; i < cache.length; i++) {
    var firstLine = firstMatchingLine(cache[i].touches, aliases);
    if (firstLine === Infinity) { continue; }
    matches.push({ file: cache[i].file, firstLine: firstLine });
  }
  matches.sort(compareMatches);
  return matches.map(function (m) { return m.file; });
}

// The one-and-only disk read + JSON.parse of all JSONL files in the projects
// folder. Callers that loop over many files build this once and pass it to
// findReferencingJsonls so the transcripts are never re-read per file.
function loadAllJsonlFilesInProjectsFolder(projectsDir) {
  return collectAllJsonls(enumerateJsonlFiles(projectsDir));
}

// Find every JSONL transcript that touched any of targetPaths (or a lineage
// alias of them). Returns a sorted referencedIn list. Optional cache: pass
// loadAllJsonlFilesInProjectsFolder(projectsDir) to reuse one scan.
function findReferencingJsonls(targetPaths, projectsDir, cache) {
  cache = cache || loadAllJsonlFilesInProjectsFolder(projectsDir);
  var graph = buildLineageGraph(gatherAllOps(cache));
  var aliases = resolveAliases(targetPaths, graph);
  return selectReferencing(cache, aliases);
}

// ─── Exports ────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolveAgainstCwd: resolveAgainstCwd,
    collectTouches: collectTouches,
    buildLineageGraph: buildLineageGraph,
    resolveAliases: resolveAliases,
    enumerateJsonlFiles: enumerateJsonlFiles,
    loadAllJsonlFilesInProjectsFolder: loadAllJsonlFilesInProjectsFolder,
    findReferencingJsonls: findReferencingJsonls,
    // Shared scan primitives, reused by common/file-path-history.js so the
    // per-run scan machinery lives in one place.
    collectAllJsonls: collectAllJsonls,
    gatherAllOps: gatherAllOps
  };
}
