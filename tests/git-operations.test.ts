// The document's gitOperations[]: every git command the agent ran as a Bash tool_use, in record
// order, each with a parsed kind and detail — the timeline's `* git <kind> <detail> *` rows, and
// (for kind commit) its pick hard-stops. Extraction reads the transcript records directly, not the
// consent scan's ScriptRun list (that list serves script consent, not git history).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjectDocument } from "../src/viewer_api.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import { GitOperationKind } from "../src/structures/vocabulary.ts";
import { S19_JSONL, S39_JSONL_PATHS, S85_JSONL_PATHS } from "./fixtures.ts";

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

test("test_s19_without_git_yields_no_operations", () => {
    // Scenario: a scenario that never runs git yields an empty gitOperations — the timeline
    // renders no git rows and derives no commit hard-stops from it.
    // Steps:
    // build the single-session s19 document; assert gitOperations is exactly [].
    const document = buildProjectDocument([new Path(S19_JSONL)], undefined);
    assert.deepEqual(document.gitOperations, []);
});
