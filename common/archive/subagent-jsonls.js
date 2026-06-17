// MOVED in full to api/subagent-transcript-discovery.js (phase 2). Tombstone
// kept commented out per the archive procedure; no viewer script tags
// reference this file, so it moves to common/archive/ at the end of phase 2.

// // Subagent transcript discovery + the merged main/subagent reference lookup.
// // Subagent transcripts live at <project>/<sessionDir>/subagents/agent-*.jsonl.
// // They contribute reads/edits to file reconstruction but never snapshot
// // beacons (fileHistory runs with the parent session's state, main only).
// // Reuses collect-touches' scan/touch-test machinery — collect-touches.js is
// // at its 300-line cap, so the subagent layer lives here and requires from it.
//
// var fs, path;
// var collectAllJsonls, loadAllJsonlFilesInProjectsFolder, findReferencingJsonls;
// if (typeof module !== 'undefined' && typeof require === 'function') {
//   fs = require('fs');
//   path = require('path');
//   var ct = require('./collect-touches');
//   collectAllJsonls = ct.collectAllJsonls;
//   loadAllJsonlFilesInProjectsFolder = ct.loadAllJsonlFilesInProjectsFolder;
//   findReferencingJsonls = ct.findReferencingJsonls;
// }
//
// // True for files named like a subagent transcript: agent-*.jsonl.
// function isAgentJsonlName(name) {
//   if (!name.startsWith('agent-')) { return false; }
//   return name.endsWith('.jsonl');
// }
//
// // Append every agent-*.jsonl inside one session dir's subagents/ folder.
// function appendAgentJsonlsForSessionDir(files, sessionDirPath) {
//   var subagentsDir = path.join(sessionDirPath, 'subagents');
//   if (!fs.existsSync(subagentsDir)) { return; }
//   var entries = fs.readdirSync(subagentsDir).sort();
//   for (var i = 0; i < entries.length; i++) {
//     if (!isAgentJsonlName(entries[i])) { continue; }
//     files.push(path.join(subagentsDir, entries[i]));
//   }
// }
//
// // Append the subagent transcripts of every session dir inside one project dir.
// function appendAgentJsonlsForProject(files, projectDir) {
//   var entries = fs.readdirSync(projectDir).sort();
//   for (var i = 0; i < entries.length; i++) {
//     var full = path.join(projectDir, entries[i]);
//     if (!fs.statSync(full).isDirectory()) { continue; }
//     appendAgentJsonlsForSessionDir(files, full);
//   }
// }
//
// // Flat sorted list of every <project>/<sessionDir>/subagents/agent-*.jsonl
// // under the projects folder.
// function enumerateSubagentJsonls(projectsDir) {
//   var discoverProjects = require('../tools/probe-projects').discoverProjects;
//   var projects = discoverProjects(projectsDir);
//   var files = [];
//   for (var p = 0; p < projects.length; p++) {
//     appendAgentJsonlsForProject(files, projects[p].dir);
//   }
//   return files;
// }
//
// // Subagent transcripts that touched any of aliasPaths — the same touch test
// // findReferencingJsonls applies to main transcripts, run over a cache built
// // from the subagent files only.
// function subagentJsonlsReferencing(aliasPaths, projectsDir) {
//   var cache = collectAllJsonls(enumerateSubagentJsonls(projectsDir));
//   return findReferencingJsonls(aliasPaths, projectsDir, cache);
// }
//
// // Main AND subagent transcripts that touched any of targetPaths, with the
// // lineage graph built from ALL transcripts together (a rename recorded in a
// // main session reaches a subagent that only saw the old name). Sorted
// // lexicographically: <proj>/<sid>.jsonl sorts immediately before
// // <proj>/<sid>/subagents/agent-*.jsonl, so a parent session's main jsonl and
// // its own subagents are adjacent.
// function findReferencingJsonlsIncludingSubagents(targetPaths, projectsDir) {
//   var mainCache = loadAllJsonlFilesInProjectsFolder(projectsDir);
//   var subagentCache = collectAllJsonls(enumerateSubagentJsonls(projectsDir));
//   var combined = mainCache.concat(subagentCache);
//   var matches = findReferencingJsonls(targetPaths, projectsDir, combined);
//   return matches.slice().sort();
// }
//
// // ─── Exports ────────────────────────────────────────────────────────────────
//
// if (typeof module !== 'undefined' && module.exports) {
//   module.exports = {
//     enumerateSubagentJsonls: enumerateSubagentJsonls,
//     subagentJsonlsReferencing: subagentJsonlsReferencing,
//     findReferencingJsonlsIncludingSubagents: findReferencingJsonlsIncludingSubagents
//   };
// }
