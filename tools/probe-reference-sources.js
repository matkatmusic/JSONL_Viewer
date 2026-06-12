// Reference-source probing + selection for probe-projects-v2.
//
// A replayed file is verified against the first source whose content matches:
// on-disk (current path after renames) → file-history snapshot → git. EVERY
// source is probed for availability first (no short-circuit), so the per-file
// record can show what was available, what was used, and what was skipped —
// a reconstruction source being skipped accidentally is visible, not silent.

var fs = require('fs');
var path = require('path');
var efs = require('../common/extract-file-state');
var gitState = require('../common/git-file-state');

// ─── Selection (pure) ───────────────────────────────────────────────────────

// Human label for each source name, used in comparedVia and skipped notes.
var COMPARED_VIA_BY_SOURCE = { onDisk: 'on-disk', snapshot: 'snapshot', git: 'git' };

// The first available source whose content equals the replay, or null.
function firstMatchingSource(replayedContent, sources) {
  for (var i = 0; i < sources.length; i++) {
    if (!sources[i].available) { continue; }
    if (sources[i].content === replayedContent) { return sources[i]; }
  }
  return null;
}

// The first available source regardless of content, or null.
function firstAvailableSource(sources) {
  for (var i = 0; i < sources.length; i++) {
    if (sources[i].available) { return sources[i]; }
  }
  return null;
}

// Availability notes for every available-but-unused source, e.g.
// "snapshot available but on-disk used".
function buildSkippedNotes(sources, usedSource) {
  var skipped = [];
  if (!usedSource) { return skipped; }
  for (var i = 0; i < sources.length; i++) {
    if (!sources[i].available) { continue; }
    if (sources[i] === usedSource) { continue; }
    skipped.push(sources[i].name + ' available but ' + COMPARED_VIA_BY_SOURCE[usedSource.name] + ' used');
  }
  return skipped;
}

// The per-file dataSources block: availability + identity detail + used flag
// for every source, plus the skipped notes.
function buildDataSourcesBlock(sources, usedSource, skipped) {
  var block = { skipped: skipped };
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    var entry = { available: s.available, used: s === usedSource };
    if (s.name === 'onDisk') { entry.path = s.path; }
    if (s.name === 'snapshot') { entry.blob = s.blob; }
    if (s.name === 'git') { entry.ref = s.ref; }
    block[s.name] = entry;
  }
  return block;
}

// Decide which reference source verifies the replayed content. Returns
// { status, comparedVia, usedSource, dataSources }.
function chooseReferenceSource(replayedContent, sources) {
  var match = firstMatchingSource(replayedContent, sources);
  var usedSource = match || firstAvailableSource(sources);
  var status = match ? 'PASS' : (usedSource ? 'MISMATCH' : 'NOT_FOUND');
  var skipped = buildSkippedNotes(sources, usedSource);
  return {
    status: status,
    comparedVia: usedSource ? COMPARED_VIA_BY_SOURCE[usedSource.name] : 'none',
    usedSource: usedSource || null,
    dataSources: buildDataSourcesBlock(sources, usedSource, skipped)
  };
}

// ─── Gathering (I/O) ────────────────────────────────────────────────────────

// Distinct basenames across a file's alias paths, most recent name first
// (snapshot/git stores key by basename; the current name is the likeliest hit).
function distinctBasenames(aliasPaths, lastSeenFullPath) {
  var names = [];
  if (lastSeenFullPath) { names.push(path.basename(lastSeenFullPath)); }
  for (var i = 0; i < aliasPaths.length; i++) {
    var name = path.basename(aliasPaths[i]);
    if (names.indexOf(name) < 0) { names.push(name); }
  }
  return names;
}

// Probe the on-disk reference: where the file lives NOW (following renames).
function gatherOnDiskSource(lastSeenFullPath) {
  if (!lastSeenFullPath) {
    return { name: 'onDisk', available: false, content: null, path: null };
  }
  if (!fs.existsSync(lastSeenFullPath)) {
    return { name: 'onDisk', available: false, content: null, path: null };
  }
  return {
    name: 'onDisk', available: true,
    content: fs.readFileSync(lastSeenFullPath, 'utf8'), path: lastSeenFullPath
  };
}

// Try ONE transcript for a snapshot blob of any of the file's basenames.
function gatherSnapshotSourceFromTranscript(transcriptText, basenames, snapshotBaseDir) {
  for (var b = 0; b < basenames.length; b++) {
    var blob = efs.findLastSnapshotBlob(transcriptText, basenames[b], snapshotBaseDir);
    if (!blob) { continue; }
    return {
      name: 'snapshot', available: true, content: blob.content,
      blob: { sessionId: blob.sessionId, backupFileName: blob.backupFileName }
    };
  }
  return null;
}

// Probe the snapshot reference: scan the file's transcripts most-recent-first
// for a file-history snapshot blob of any of its basenames.
function gatherSnapshotSource(transcriptTexts, basenames, snapshotBaseDir) {
  for (var t = transcriptTexts.length - 1; t >= 0; t--) {
    var source = gatherSnapshotSourceFromTranscript(transcriptTexts[t].text, basenames, snapshotBaseDir);
    if (source) { return source; }
  }
  return { name: 'snapshot', available: false, content: null, blob: null };
}

// Try every multi-ref candidate in order so the WINNING ref is known (the
// provenance needs it; resolveGitContentMultiRef hides which ref hit).
function resolveGitContentWithRef(basename, filePathMap, repoRoot, refs) {
  for (var r = 0; r < refs.length; r++) {
    var content = gitState.resolveGitContent(basename, filePathMap, repoRoot, refs[r]);
    if (content !== null) { return { content: content, ref: refs[r] }; }
  }
  return null;
}

// Try ONE transcript's git session metadata for any of the file's basenames.
// null when the session has no usable git context or no ref holds the file.
function gatherGitSourceFromTranscript(transcriptText, basenames, edits) {
  var meta = gitState.extractSessionMetadata(transcriptText);
  if (!meta.gitBranch) { return null; }
  if (!meta.cwd) { return null; }
  var repoRoot = gitState.resolveRepoRootWalkingUp(meta.cwd);
  if (!repoRoot) { return null; }
  var refs = gitState.buildMultiRefs(meta.gitBranch);
  var filePathMap = gitState.buildFilePathMap(edits);
  for (var b = 0; b < basenames.length; b++) {
    var hit = resolveGitContentWithRef(basenames[b], filePathMap, repoRoot, refs);
    if (hit) { return { name: 'git', available: true, content: hit.content, ref: hit.ref }; }
  }
  return null;
}

// Probe the git reference: scan transcripts most-recent-first for session git
// metadata, then try the file's basenames against that session's refs.
function gatherGitSource(transcriptTexts, basenames, perTranscriptEdits) {
  for (var t = transcriptTexts.length - 1; t >= 0; t--) {
    var edits = perTranscriptEdits[transcriptTexts[t].file].edits;
    var source = gatherGitSourceFromTranscript(transcriptTexts[t].text, basenames, edits);
    if (source) { return source; }
  }
  return { name: 'git', available: false, content: null, ref: null };
}

// Read each of the file's ordered transcripts once for source probing.
function readTranscriptTexts(orderedTranscripts) {
  return orderedTranscripts.map(function (t) {
    return { file: t.transcriptPath, text: fs.readFileSync(t.transcriptPath, 'utf8') };
  });
}

// Probe ALL reference sources for one file (on-disk, snapshot, git) — every
// source's availability is recorded even when an earlier one already matched.
function gatherReferenceSources(lastSeenFullPath, aliasPaths, orderedTranscripts, perTranscriptEdits, snapshotBaseDir) {
  var transcriptTexts = readTranscriptTexts(orderedTranscripts);
  var basenames = distinctBasenames(aliasPaths, lastSeenFullPath);
  return [
    gatherOnDiskSource(lastSeenFullPath),
    gatherSnapshotSource(transcriptTexts, basenames, snapshotBaseDir),
    gatherGitSource(transcriptTexts, basenames, perTranscriptEdits)
  ];
}

module.exports = {
  chooseReferenceSource: chooseReferenceSource,
  gatherReferenceSources: gatherReferenceSources,
  distinctBasenames: distinctBasenames
};
