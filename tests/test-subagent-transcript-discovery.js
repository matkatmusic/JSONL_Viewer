var assert = require('assert');
var h = require('./test-helpers');
var runWithContext = h.runWithContext;
var sj = require('../api/subagent-transcript-discovery');

// Fixture: a projects dir with one project, one main session transcript, and
// (optionally) subagent transcripts under <project>/<sessionId>/subagents/.
// Returns { projectsDir, projDir }.
function makeProjectWithMainSession(ctx, fs, path) {
  var projectsDir = ctx.tempDir('rev-');
  var projDir = path.join(projectsDir, 'proj');
  fs.mkdirSync(projDir);
  fs.writeFileSync(path.join(projDir, 'sess1.jsonl'),
    [h.makeSystemLine('sess1', 'main', '/repo'), h.makeCreateLine('/repo/target.py', 'x')].join('\n'));
  return { projectsDir: projectsDir, projDir: projDir };
}

// Fixture helper: write a subagent transcript that READS the given file.
function writeSubagentReading(fs, path, projDir, sessionId, agentName, filePath) {
  var subagentsDir = path.join(projDir, sessionId, 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  var jsonlPath = path.join(subagentsDir, agentName);
  fs.writeFileSync(jsonlPath, [
    h.makeSystemLine(sessionId + '-' + agentName, 'main', '/repo'),
    h.makeReadToolUse('t1', filePath),
    h.makeReadToolResult('t1', '1\thello\n')
  ].join('\n'));
  return jsonlPath;
}

runWithContext('test_enumerateSubagentJsonls_findsAgentJsonlsUnderSessionSubagentsDirs', function (ctx) {
  // Behavior: enumeration returns every <project>/<sessionDir>/subagents/agent-*.jsonl.
  var fs = require('fs'), path = require('path');
  // Step: a project with one main session and one subagent transcript under it.
  var fx = makeProjectWithMainSession(ctx, fs, path);
  var agentPath = writeSubagentReading(fs, path, fx.projDir, 'sess1', 'agent-a.jsonl', '/repo/target.py');
  // Step: enumeration finds exactly that subagent transcript.
  var found = sj.enumerateSubagentJsonls(fx.projectsDir);
  assert.deepStrictEqual(found, [agentPath]);
});

runWithContext('test_enumerateSubagentJsonls_ignoresFilesNotMatchingAgentPattern', function (ctx) {
  // Behavior: only agent-*.jsonl files count — other files in subagents/ are ignored.
  var fs = require('fs'), path = require('path');
  // Step: a subagents dir holding one agent transcript plus two non-matching files.
  var fx = makeProjectWithMainSession(ctx, fs, path);
  var agentPath = writeSubagentReading(fs, path, fx.projDir, 'sess1', 'agent-a.jsonl', '/repo/target.py');
  var subagentsDir = path.join(fx.projDir, 'sess1', 'subagents');
  fs.writeFileSync(path.join(subagentsDir, 'notes.txt'), 'not a transcript');
  fs.writeFileSync(path.join(subagentsDir, 'other.jsonl'), h.makeSystemLine('x', 'main', '/repo'));
  // Step: enumeration returns only the agent-*.jsonl file.
  var found = sj.enumerateSubagentJsonls(fx.projectsDir);
  assert.deepStrictEqual(found, [agentPath]);
});

runWithContext('test_subagentJsonlsReferencing_includesSubagentThatTouchedTarget', function (ctx) {
  // Behavior: a subagent transcript that READ the target file is returned by the
  // same touch test findReferencingJsonls applies to main transcripts.
  var fs = require('fs'), path = require('path');
  // Step: one subagent reads the target file.
  var fx = makeProjectWithMainSession(ctx, fs, path);
  var agentPath = writeSubagentReading(fs, path, fx.projDir, 'sess1', 'agent-a.jsonl', '/repo/target.py');
  // Step: the filter returns that transcript for the target path.
  var found = sj.subagentJsonlsReferencing(['/repo/target.py'], fx.projectsDir);
  assert.deepStrictEqual(found, [agentPath]);
});

runWithContext('test_subagentJsonlsReferencing_excludesSubagentThatNeverTouchedTarget', function (ctx) {
  // Behavior: a subagent transcript that only touched OTHER files is excluded.
  var fs = require('fs'), path = require('path');
  // Step: one subagent reads an unrelated file.
  var fx = makeProjectWithMainSession(ctx, fs, path);
  writeSubagentReading(fs, path, fx.projDir, 'sess1', 'agent-b.jsonl', '/repo/unrelated.py');
  // Step: the filter returns nothing for the target path.
  var found = sj.subagentJsonlsReferencing(['/repo/target.py'], fx.projectsDir);
  assert.deepStrictEqual(found, []);
});

runWithContext('test_findReferencingJsonlsIncludingSubagents_sortsParentMainAndItsSubagentsAdjacently', function (ctx) {
  // Behavior: the merged list contains main AND subagent transcripts that touched
  // the target, ordered so a parent session's main jsonl is immediately followed
  // by its own subagents (lexicographic path order gives exactly that adjacency).
  var fs = require('fs'), path = require('path');
  // Step: two main sessions touch the target; session 1 also has a touching subagent.
  var fx = makeProjectWithMainSession(ctx, fs, path);
  fs.writeFileSync(path.join(fx.projDir, 'sess2.jsonl'),
    [h.makeSystemLine('sess2', 'main', '/repo'), h.makeCreateLine('/repo/target.py', 'y')].join('\n'));
  var agentPath = writeSubagentReading(fs, path, fx.projDir, 'sess1', 'agent-a.jsonl', '/repo/target.py');
  // Step: the merged result is main1, its subagent, then main2 — adjacency proven by exact order.
  var found = sj.findReferencingJsonlsIncludingSubagents(['/repo/target.py'], fx.projectsDir);
  var expected = [
    path.join(fx.projDir, 'sess1.jsonl'),
    agentPath,
    path.join(fx.projDir, 'sess2.jsonl')
  ];
  assert.deepStrictEqual(found, expected);
});

runWithContext('test_findReferencingJsonlsIncludingSubagents_followsRenameLineageFromMainTranscripts', function (ctx) {
  // Behavior: a subagent that only saw the OLD name is still returned when the
  // caller queries the NEW name, because a main session recorded the rename and
  // the lineage graph is built from ALL transcripts together.
  var fs = require('fs'), path = require('path');
  // Step: a main session renames old.py -> target.py; a subagent read old.py only.
  var fx = makeProjectWithMainSession(ctx, fs, path);
  fs.writeFileSync(path.join(fx.projDir, 'sess2.jsonl'),
    [h.makeSystemLine('sess2', 'main', '/repo'),
     h.makeBashCommandLine('t1', 'mv /repo/old.py /repo/target.py')].join('\n'));
  var agentPath = writeSubagentReading(fs, path, fx.projDir, 'sess1', 'agent-a.jsonl', '/repo/old.py');
  // Step: querying the NEW name reaches the old-name-only subagent.
  var found = sj.findReferencingJsonlsIncludingSubagents(['/repo/target.py'], fx.projectsDir);
  assert.ok(found.indexOf(agentPath) >= 0);
});

h.summary();
