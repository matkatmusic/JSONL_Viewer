import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, runCli } from "../src/reconstruction_cli.ts";
import { S1_JSONL, S2_JSONL, S3_JSONL, S4_JSONL, S5_JSONL, S6_JSONL, S7_JSONL } from "./fixtures.ts";

// The append entry's whole list line (matched by its short change id).
function entryLineWith(out: string, shortChangeId: string): string {
    return out.split("\n").find((line) => line.includes(shortChangeId))!;
}

// The default view of the real S5 transcript lists create -> append -> overwrite, with the
// redirect line counts recovered from the file-history sidecar (append 1->2, overwrite ->1).
test("test_default_view_lists_s5_redirect_entries", () => {
    const out = runCli([S5_JSONL]);
    assert.ok(out.includes("s5_redirect.txt"));
    assert.ok(out.includes("create"));
    assert.ok(out.includes("append"));
    assert.ok(out.includes("overwrite"));
    // The append entry recovered its appended tail from the sidecar: two lines now.
    const appendLine = entryLineWith(out, "#01PDv4Df");
    assert.ok(appendLine.includes("append"));
    assert.ok(appendLine.includes("2 lines"));
    // The overwrite entry recovered its replacement content: one line.
    const overwriteLine = entryLineWith(out, "#01UB1SvL");
    assert.ok(overwriteLine.includes("overwrite"));
    assert.ok(overwriteLine.includes("1 lines"));
});

// The default view lists the renamed file's create -> rename -> edit and the test's create.
test("test_default_view_lists_s6_git_mv_lineage", () => {
    const out = runCli([S6_JSONL]);
    // The renamed file appears with both its rename and its later edit.
    assert.ok(out.includes("s6_git_renamed.py"));
    assert.ok(out.includes("rename"));
    assert.ok(out.includes("edit"));
    // The git mv and the goodbye edit carry their short change ids.
    assert.ok(out.includes("#019BbcnY")); // the git mv
    assert.ok(out.includes("#01CVhCVD")); // the goodbye edit
    // The test file is listed as its own create.
    assert.ok(out.includes("tests/test_s6_git.py"));
});

// Default (no flag): ALL branches — both the surviving v2 writes and the rewound v1 writes appear,
// under branch headers naming the rewind point. (No "overwrite": the v2 write is a create on its
// own branch, not an overwrite of v1.)
test("test_default_view_shows_all_branches", () => {
    const out = runCli([S7_JSONL]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("#2e47efbe")); // rewind point
    assert.ok(out.includes("#01JWycFr")); // surviving v2 scenario7.py
    assert.ok(out.includes("#012jN7F9")); // rewound v1 scenario7.py
    assert.ok(out.includes("#015eug6V")); // rewound v1 test
    assert.ok(!out.includes("overwrite"));
});

// A transcript with no rewound branch (S1) renders exactly as before — no branch headers added.
test("test_default_view_unchanged_when_no_rewound_branches", () => {
    const out = runCli([S1_JSONL]);
    assert.ok(!out.includes("## surviving"));
    assert.ok(!out.includes("## rewound"));
});

// --surviving: only the surviving branch (the v2 creates); no rewound v1 ids, no headers.
test("test_surviving_flag_shows_only_surviving_branch", () => {
    const out = runCli([S7_JSONL, "--surviving"]);
    assert.ok(out.includes("#01JWycFr"));
    assert.ok(!out.includes("#012jN7F9")); // rewound v1 not shown
    assert.ok(!out.includes("## rewound"));
});

// --list-branches: one summary line per branch, naming the surviving and rewound tips + rewind pt.
test("test_list_branches_summarizes_surviving_and_rewound", () => {
    const out = runCli([S7_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("#77494da3")); // surviving tip
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("#55ee424f")); // rewound tip
    assert.ok(out.includes("#2e47efbe")); // rewind point
    assert.ok(!out.includes("create  2 lines")); // a summary, not the full per-revision listing
});

// --branch <id>: render exactly one branch (the rewound v1), selected by tip short id.
test("test_branch_id_retrieves_one_specific_branch", () => {
    const out = runCli([S7_JSONL, "--branch", "55ee424f"]);
    assert.ok(out.includes("#012jN7F9")); // the rewound v1 writes are shown
    assert.ok(out.includes("#015eug6V"));
    assert.ok(!out.includes("#01JWycFr")); // the surviving branch is NOT shown
});

// --branch <id> with --target narrows to one file on that branch.
test("test_branch_id_with_target_narrows_to_one_file", () => {
    const target = "/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.daizis4h/scenario7.py";
    const out = runCli([S7_JSONL, "--branch", "55ee424f", "--target", target]);
    assert.ok(out.includes("#012jN7F9"));            // the v1 scenario7.py
    assert.ok(!out.includes("tests/test_scenario7.py")); // the test file is filtered out
});

// An unknown branch id is rejected with a message that lists the available ids.
test("test_branch_id_unknown_throws_with_available_ids", () => {
    assert.throws(() => runCli([S7_JSONL, "--branch", "deadbeef"]), /55ee424f|77494da3/);
});

// A transcript path is required; without one, parseArgs reports usage.
test("test_parse_args_requires_a_transcript_path", () => {
    assert.throws(() => parseArgs(["--verbose"]), /usage/);
});

// parseArgs reads the path, an optional --target, and the view flags.
test("test_parse_args_reads_path_target_and_flags", () => {
    const options = parseArgs(["t.jsonl", "--target", "/a/b.py", "--diff"]);
    assert.equal(options.jsonlPath, "t.jsonl");
    assert.equal(options.target?.toString(), "/a/b.py");
    assert.equal(options.diff, true);
    assert.equal(options.verbose, false);
});

// End-to-end: runCli renders EVERY file s1 touches, each under its path header.
test("test_run_cli_renders_every_touched_file_for_s1", () => {
    const out = runCli([S1_JSONL, "--verbose"]);
    assert.ok(out.includes("s1_delete.py"));
    assert.ok(out.includes("test_s1_delete.py"));
    assert.ok(out.includes("def hello():"));
});

// The default (no view flag) lists each touched file with its numbered entries.
test("test_run_cli_default_lists_touched_files", () => {
    const out = runCli([S1_JSONL]);
    assert.ok(out.includes("s1_delete.py"));
    assert.ok(out.includes("test_s1_delete.py"));
    // s1_delete.py is created then deleted: a create entry and a delete entry.
    assert.ok(out.includes("create"));
    assert.ok(out.includes("delete"));
});

// The default view lists s2's entries, including a first-class rename line and
// the short change id shared by the test file's two edits.
test("test_default_view_lists_s2_entries_with_rename", () => {
    const out = runCli([S2_JSONL]);
    assert.ok(out.includes("s2_moved.py"));
    // The rename is its own entry naming both the old and new file.
    const renameLine = out
        .split("\n")
        .find((line) => line.includes("rename"))!;
    assert.ok(renameLine.includes("s2_original.py"));
    assert.ok(renameLine.includes("s2_moved.py"));
    // The test file's two edits share the change id 015b59mN.
    assert.ok(out.includes("015b59mN"));
});

// The default view lists s3's three files, marks the copied file, and shows the
// copy entry plus the short change id shared by its two edits.
test("test_default_view_lists_s3_with_copy_entry", () => {
    const out = runCli([S3_JSONL]);
    // All three touched files appear.
    assert.ok(out.includes("s3_source.py"));
    assert.ok(out.includes("s3_copy.py"));
    assert.ok(out.includes("test_s3_source.py"));
    // The copied file is marked a copy of the source and carries a copy entry.
    assert.ok(out.includes("(copy of s3_source.py)"));
    assert.ok(out.includes("copy"));
    // The copied file's edits share the Edit's short changeId.
    assert.ok(out.includes("#012rscwP"));
});

// The default view lists S4's two files, each created then overwritten.
test("test_default_view_lists_s4_overwrite_entries", () => {
    const out = runCli([S4_JSONL]);
    // Both touched files appear.
    assert.ok(out.includes("s4_overwrite.py"));
    assert.ok(out.includes("test_s4_overwrite.py"));
    // Each carries a create entry and an overwrite entry.
    assert.ok(out.includes("create"));
    assert.ok(out.includes("overwrite"));
    // The overwrite of s4_overwrite.py carries its short change id.
    assert.ok(out.includes("#012vJCJs"));
});
