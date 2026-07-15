// The document's gitOperations[]: every git command the agent ran as a Bash tool_use, in record
// order, each with a parsed kind and detail — the timeline's `* git <kind> <detail> *` rows, and
// (for kind commit) its pick hard-stops. Extraction reads the transcript records directly, not the
// consent scan's ScriptRun list (that list serves script consent, not git history).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjectDocument } from "../src/viewer_api.ts";
import { findGitOperations } from "../src/reconstruction_git_operations.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import { BlockType, GitOperationKind, RecordType, ToolName } from "../src/structures/vocabulary.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";
import { S6_JSONL, S19_JSONL, S39_JSONL_PATHS, S41_JSONL_PATHS, S85_JSONL_PATHS } from "./fixtures.ts";

test("test_s39_git_operations_are_init_then_add", () => {
    // Scenario: s39's two-session transcript records exactly two git Bash commands — `git init`
    // and `git add orders.py tests/`. (The scenario prompt's commit/branch lines are instruction
    // prose, never executed; they must NOT appear.)
    // Steps:
    // build the two-session s39 document.
    const document = buildProjectDocument(S39_JSONL_PATHS, undefined);
    // assert the operations' kinds are [init, add], in record order.
    assert.deepEqual(
        document.gitOperations.map((operation) => operation.kind),
        [GitOperationKind.init, GitOperationKind.add],
    );
    // assert init carries no detail and add carries its target paths.
    assert.deepEqual(
        document.gitOperations.map((operation) => operation.detail),
        ["", "orders.py tests/"],
    );
    // assert each operation preserves its verbatim command and carries a Date timestamp, a Uuid
    // sessionId (timeline attribution), and its Bash record's own Uuid (the { } button resolves
    // the command's JSONL line through it).
    assert.equal(document.gitOperations[0]!.command, "git init");
    assert.equal(document.gitOperations[1]!.command, "git add orders.py tests/");
    for (const operation of document.gitOperations) {
        assert.ok(operation.timestamp instanceof Date);
        assert.ok(operation.sessionId instanceof Uuid);
        assert.ok(operation.uuid instanceof Uuid);
    }
});

test("test_s85_commit_operations_carry_their_messages", () => {
    // Scenario: s85 runs git through the `git -C <path> <subcommand> …` form, so the subcommand
    // is not the first word after `git` — parsing must skip global flags and their arguments.
    // Its two commits carry `-m` messages; those are the commit rows' details.
    // Steps:
    // build the s85 project document.
    const document = buildProjectDocument(S85_JSONL_PATHS, undefined);
    // assert the full kind sequence: init, add, commit, add, commit.
    assert.deepEqual(
        document.gitOperations.map((operation) => operation.kind),
        [
            GitOperationKind.init,
            GitOperationKind.add,
            GitOperationKind.commit,
            GitOperationKind.add,
            GitOperationKind.commit,
        ],
    );
    // assert the commit details are the -m messages with their quotes stripped.
    const commits = document.gitOperations.filter(
        (operation) => operation.kind === GitOperationKind.commit,
    );
    assert.deepEqual(
        commits.map((operation) => operation.detail),
        ["baseline", "post-rename"],
    );
    // assert add details are paths only (the -C dir is a flag argument; `add -A` has no paths).
    const adds = document.gitOperations.filter(
        (operation) => operation.kind === GitOperationKind.add,
    );
    assert.deepEqual(
        adds.map((operation) => operation.detail),
        ["one.py two.py three.py", ""],
    );
});

test("test_s41_two_session_git_operations_include_branch_creation", () => {
    // Scenario: s41's baseline session runs init → add → commit "baseline" → `git checkout -b
    // feature` (the first captured branch-creation command in any scenario); the mid-stream
    // session runs add → commit "wip". The two-session document must extract all six in
    // chronological record order, and the checkout must carry the new branch name as its
    // detail. (Sequence pinned from a live capture of this document, 2026-07-08.)
    // Steps:
    // build the two-session s41 document.
    const document = buildProjectDocument(S41_JSONL_PATHS, undefined);
    // assert the full kind sequence in record order.
    assert.deepEqual(
        document.gitOperations.map((operation) => operation.kind),
        [
            GitOperationKind.init,
            GitOperationKind.add,
            GitOperationKind.commit,
            GitOperationKind.checkout,
            GitOperationKind.add,
            GitOperationKind.commit,
        ],
    );
    // assert the branch creation is the checkout subcommand carrying the branch name — its
    // detail parser (findFirstNonFlagArgument) skips the `-b` flag.
    const checkouts = document.gitOperations.filter(
        (operation) => operation.kind === GitOperationKind.checkout,
    );
    assert.equal(checkouts.length, 1);
    assert.equal(checkouts[0]!.detail, "feature");
    assert.equal(checkouts[0]!.command, "git checkout -b feature");
    // assert the commit details are the two -m messages in order.
    assert.deepEqual(
        document.gitOperations
            .filter((operation) => operation.kind === GitOperationKind.commit)
            .map((operation) => operation.detail),
        ["baseline", "wip"],
    );
});

// An assistant record carrying one Bash tool_use running `command` under block id `toolUseId`
// (item 66: minimal-record builder, same shape as reconstruction_git_evidence.test.ts's).
function buildBashToolUseRecord(command: string, toolUseId: string, timestamp: string): TranscriptRecord {
    return {
        type: RecordType.assistant,
        timestamp: new Date(timestamp),
        message: { content: [{ type: BlockType.tool_use, id: toolUseId, name: ToolName.Bash, input: { command }, caller: { type: "direct" } }] },
    } as unknown as TranscriptRecord;
}

// A user record carrying the tool_result for `toolUseId`, whose content is the command's printed
// output text (the shape git commit's `[branch hash] message` summary arrives in).
function buildToolResultRecord(toolUseId: string, resultText: string, timestamp: string): TranscriptRecord {
    return {
        type: RecordType.user,
        timestamp: new Date(timestamp),
        message: { content: [{ type: BlockType.tool_result, tool_use_id: toolUseId, content: resultText, is_error: false }] },
    } as unknown as TranscriptRecord;
}

test("test_commit_operations_carry_result_hash", () => {
    // Scenario: a successful `git commit`'s tool_result text carries the short hash in git's
    // `[branch hash] message` summary line; findGitOperations must capture that hash on the
    // commit's GitOperation as resultHash so the viewer can render `GIT COMMIT [hash]`.
    // Steps:
    // build one assistant record running `git commit -m "fix: x"` under block id toolu_hash1.
    // build one user record whose tool_result for toolu_hash1 prints git's summary line.
    const records = [
        buildBashToolUseRecord('git commit -m "fix: x"', "toolu_hash1", "2026-01-01T00:00:01Z"),
        buildToolResultRecord("toolu_hash1", "[master 4fa08d2] fix: x\n 1 file changed, 1 insertion(+)", "2026-01-01T00:00:02Z"),
    ];
    // extract the git operations from the records.
    const operations = findGitOperations(records);
    // assert exactly one operation came back and it is the commit.
    assert.equal(operations.length, 1);
    assert.equal(operations[0]!.kind, GitOperationKind.commit);
    // assert the commit operation carries the short hash from its result's summary line.
    assert.equal(operations[0]!.resultHash, "4fa08d2");
});

test("test_commit_operations_carry_result_hash_from_bare_hex_token", () => {
    // Scenario: scenario captures pipe git's summary away and echo their own line containing the
    // short hash (s84 prints `ok 928eaa9`); with no `[branch hash]` line present, a whole-word
    // 7-to-40-char hex token in the commit's own result is still unambiguously the hash.
    // Steps:
    // build one assistant record running `git commit -m "baseline"` under block id toolu_hash2.
    const records = [
        buildBashToolUseRecord('git commit -m "baseline"', "toolu_hash2", "2026-01-01T00:00:01Z"),
        // build one user record whose tool_result prints the scenario-style `ok <hash>` line.
        buildToolResultRecord("toolu_hash2", "ok 928eaa9", "2026-01-01T00:00:02Z"),
    ];
    // extract the git operations from the records.
    const operations = findGitOperations(records);
    // assert the commit operation carries the hash found as a bare hex token.
    assert.equal(operations.length, 1);
    assert.equal(operations[0]!.kind, GitOperationKind.commit);
    assert.equal(operations[0]!.resultHash, "928eaa9");
});

test("test_commit_operations_without_result_output_have_no_hash", () => {
    // Scenario: a commit whose tool_result text carries no `[branch hash]` summary line (e.g.
    // output was piped away) yields a commit operation with NO resultHash — the viewer's pill
    // falls back to a dash.
    // Steps:
    // build the same commit record, but a tool_result whose text has no `[branch hash]` line.
    const records = [
        buildBashToolUseRecord('git commit -m "fix: x"', "toolu_hash1", "2026-01-01T00:00:01Z"),
        buildToolResultRecord("toolu_hash1", "ok done", "2026-01-01T00:00:02Z"),
    ];
    // extract the git operations from the records.
    const operations = findGitOperations(records);
    // assert the commit came back with resultHash undefined.
    assert.equal(operations.length, 1);
    assert.equal(operations[0]!.kind, GitOperationKind.commit);
    assert.equal(operations[0]!.resultHash, undefined);
});

test("test_compound_command_yields_one_operation_per_git_segment", () => {
    // Scenario: one Bash call chains two git commands with `&&` (task 89). Each segment gets its
    // own operation — the commit must not vanish into the add, the add's detail must not carry
    // the compound tail, and only the commit segment reads the shared tool_result's hash.
    const records = [
        buildBashToolUseRecord('git add a.py && git commit -m "fix: x"', "toolu_compound1", "2026-01-01T00:00:01Z"),
        buildToolResultRecord("toolu_compound1", "[master 4fa08d2] fix: x\n 2 files changed", "2026-01-01T00:00:02Z"),
    ];
    const operations = findGitOperations(records);
    // assert one operation per segment, in command order.
    assert.deepEqual(
        operations.map((operation) => operation.kind),
        [GitOperationKind.add, GitOperationKind.commit],
    );
    // assert each detail is the segment's own (no compound tail pollution).
    assert.deepEqual(
        operations.map((operation) => operation.detail),
        ["a.py", "fix: x"],
    );
    // assert each operation carries its own segment as its command text.
    assert.deepEqual(
        operations.map((operation) => operation.command),
        ["git add a.py", 'git commit -m "fix: x"'],
    );
    // assert the commit segment found the hash in the shared tool_result; the add carries none.
    assert.equal(operations[0]!.resultHash, undefined);
    assert.equal(operations[1]!.resultHash, "4fa08d2");
});

test("test_s6_compound_add_and_commit_each_get_an_operation", () => {
    // Scenario: s6-git-mv records a compound `git add … && git commit -m "$(cat …)"` Bash command
    // (it failed at capture time; the agent reissued the add and commit separately). Its two
    // segments must each yield an operation — the kind sequence gains a commit at index 2
    // (pre-task-89 extraction yielded [init, add, add, commit, other]).
    const document = buildProjectDocument([new Path(S6_JSONL)], undefined);
    // assert the compound contributes BOTH its add and its commit, in record order.
    assert.deepEqual(
        document.gitOperations.map((operation) => operation.kind),
        [
            GitOperationKind.init, GitOperationKind.add, GitOperationKind.commit,
            GitOperationKind.add, GitOperationKind.commit, GitOperationKind.other,
        ],
    );
    // assert the compound add's detail stops at its own segment (no `&& git commit …` tail).
    assert.equal(document.gitOperations[1]!.detail, "s6_git.py tests/test_s6_git.py");
});

test("test_s19_without_git_yields_no_operations", () => {
    // Scenario: a scenario that never runs git yields an empty gitOperations — the timeline
    // renders no git rows and derives no commit hard-stops from it.
    // Steps:
    // build the single-session s19 document; assert gitOperations is exactly [].
    const document = buildProjectDocument([new Path(S19_JSONL)], undefined);
    assert.deepEqual(document.gitOperations, []);
});

