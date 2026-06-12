// Git-related file resolution for JSONL replay.
// Resolves file content from git branches when files aren't on disk.

var cp;
if (typeof module !== 'undefined' && typeof require === 'function') {
  cp = require('child_process');
}

// Safely parse a single JSON line, returning the object or null.
function tryParseJSON(line) {
  try { return JSON.parse(line); } catch (e) { return null; }
}

// Find the first system record in JSONL lines array.
function findSystemRecord(lines) {
  for (var i = 0; i < lines.length; i++) {
    var obj = tryParseJSON(lines[i]);
    if (obj && obj.type === 'system') { return obj; }
  }
  return null;
}

// Extract session metadata (gitBranch, cwd, sessionId) from JSONL text.
function extractSessionMetadata(jsonlText) {
  var sys = findSystemRecord(jsonlText.split('\n').filter(Boolean));
  if (!sys) { return { gitBranch: null, cwd: null, sessionId: null }; }
  return {
    gitBranch: sys.gitBranch || null,
    cwd: sys.cwd || null,
    sessionId: sys.sessionId || null
  };
}

// Strip repo root prefix from an absolute file path, returning the relative path.
function computeRepoRelativePath(filePath, repoRoot) {
  var root = repoRoot.replace(/\/+$/, '');
  if (filePath.indexOf(root + '/') !== 0) { return null; }
  return filePath.substring(root.length + 1);
}

// Run git show to retrieve file content at a specific ref.
function gitShowFile(repoPath, ref, relativeFilePath) {
  try {
    var cmd = 'git -C ' + JSON.stringify(repoPath) + ' show ' + ref + ':' + relativeFilePath;
    return cp.execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) { return null; }
}

// Map basename to first-seen absolute filePath from edits.
function buildFilePathMap(edits) {
  var map = {};
  for (var i = 0; i < edits.length; i++) {
    if (edits[i].file && !map[edits[i].file]) { map[edits[i].file] = edits[i].filePath; }
  }
  return map;
}

// Orchestrate git content resolution: lookup path, compute relative, call git show.
function resolveGitContent(basename, filePathMap, repoRoot, gitBranch) {
  if (!gitBranch) { return null; }
  var fullPath = filePathMap[basename];
  if (!fullPath) { return null; }
  var relPath = computeRepoRelativePath(fullPath, repoRoot);
  if (!relPath) { return null; }
  return gitShowFile(repoRoot, gitBranch, relPath);
}

// Build a list of git refs to try, ordered by likelihood.
function buildMultiRefs(branch) {
  var refs = [];
  if (branch) {
    refs.push(branch);
    refs.push('origin/' + branch);
  }
  var fallbacks = ['HEAD', 'main', 'master'];
  for (var i = 0; i < fallbacks.length; i++) {
    if (refs.indexOf(fallbacks[i]) < 0) { refs.push(fallbacks[i]); }
  }
  return refs;
}

// Try multiple git refs for a file, returning content from the first that succeeds.
function resolveGitContentMultiRef(basename, filePathMap, repoRoot, refs) {
  var fullPath = filePathMap[basename];
  if (!fullPath) { return null; }
  var relPath = computeRepoRelativePath(fullPath, repoRoot);
  if (!relPath) { return null; }
  for (var i = 0; i < refs.length; i++) {
    var content = gitShowFile(repoRoot, refs[i], relPath);
    if (content !== null) { return content; }
  }
  return null;
}

// Try to get the git repo root for a directory. Returns root path or null.
function tryGitRoot(dirPath) {
  try {
    var root = cp.execSync('git -C ' + JSON.stringify(dirPath) + ' rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
    return root.trim();
  } catch (e) { return null; }
}

// Walk up from startPath to find the nearest directory that is a git repo.
function resolveRepoRootWalkingUp(startPath) {
  if (!startPath) { return null; }
  var fs = require('fs');
  var current = startPath;
  while (current && current !== '/') {
    if (fs.existsSync(current)) {
      var root = tryGitRoot(current);
      if (root) { return root; }
    }
    var parent = require('path').dirname(current);
    if (parent === current) { break; }
    current = parent;
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractSessionMetadata: extractSessionMetadata,
    computeRepoRelativePath: computeRepoRelativePath,
    gitShowFile: gitShowFile,
    buildFilePathMap: buildFilePathMap,
    resolveGitContent: resolveGitContent,
    buildMultiRefs: buildMultiRefs,
    resolveGitContentMultiRef: resolveGitContentMultiRef,
    resolveRepoRootWalkingUp: resolveRepoRootWalkingUp
  };
}
