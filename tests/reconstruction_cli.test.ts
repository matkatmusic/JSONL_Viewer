import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, runCli } from "../src/reconstruction_cli.ts";
import { S1_JSONL, S2_JSONL, S3_JSONL, S4_JSONL, S5_JSONL, S6_JSONL, S7_JSONL, S8_JSONL, S9_JSONL } from "./fixtures.ts";

// The append entry's whole list line (matched by its short change id).
function entryLineWith(out: string, shortChangeId: string): string {
    return out.split("\n").find((line) => line.includes(shortChangeId))!;
}

// The default view of the real S5 transcript renders the redirect lineage in both DAGs: one file,
// write -> append -> overwrite. Topology only — line counts live in the content views, not the graph.
test("test_default_view_lists_s5_redirect_entries", () => {
    const out = runCli([S5_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("s5_redirect.txt"));
    assert.ok(out.includes("write"));
    assert.ok(out.includes("append"));
    assert.ok(out.includes("overwrite"));
    // The append and overwrite turns carry their short change ids.
    assert.ok(entryLineWith(out, "#01PDv4Df").includes("append"));
    assert.ok(entryLineWith(out, "#01UB1SvL").includes("overwrite"));
    // No fork: a linear conversationDAG (no branch wrappers).
    assert.ok(!out.includes("branch "));
});

// The default view renders the renamed file's write -> rename -> edit lineage and the test file's
// write in both DAGs.
test("test_default_view_lists_s6_git_mv_lineage", () => {
    const out = runCli([S6_JSONL]);
    // The renamed file appears with both its rename and its later edit.
    assert.ok(out.includes("s6_git_renamed.py"));
    assert.ok(out.includes("rename"));
    assert.ok(out.includes("edit"));
    // The git mv and the goodbye edit carry their short change ids.
    assert.ok(out.includes("#019BbcnY")); // the git mv
    assert.ok(out.includes("#01CVhCVD")); // the goodbye edit
    // The test file appears by base name.
    assert.ok(out.includes("test_s6_git.py"));
    // No fork: a linear conversationDAG (no branch wrappers).
    assert.ok(!out.includes("branch "));
});

// Default (no flag): S7's forked conversationDAG shows the rewound branch (v1 writes) ABOVE the
// surviving branch (v2 writes), oldest-first, naming the rewind point; the fileDAG stays linear.
test("test_default_view_shows_all_branches", () => {
    const out = runCli([S7_JSONL]);
    assert.ok(out.includes("branch surviving"));
    assert.ok(out.includes("branch rewound"));
    assert.ok(out.includes("#2e47efbe")); // rewind point
    assert.ok(out.includes("#01JWycFr")); // surviving v2 scenario7.py
    assert.ok(out.includes("#012jN7F9")); // rewound v1 scenario7.py
    assert.ok(out.includes("#015eug6V")); // rewound v1 test
    // Oldest-first: the rewound branch renders before the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
    assert.ok(!out.includes("overwrite"));
});

// A transcript with no rewound branch (S1) renders a LINEAR conversationDAG: no branch wrappers, no
// connectors.
test("test_default_view_unchanged_when_no_rewound_branches", () => {
    const out = runCli([S1_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(!out.includes("branch "));
    assert.ok(!out.includes("├─"));
    assert.ok(!out.includes("└─"));
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
    // s1_delete.py is written then deleted: a write turn and a delete turn.
    assert.ok(out.includes("write"));
    assert.ok(out.includes("delete"));
});

// The default view lists s2's entries, including a first-class rename turn (its target is the new
// name) and the test file's edit change id.
test("test_default_view_lists_s2_entries_with_rename", () => {
    const out = runCli([S2_JSONL]);
    assert.ok(out.includes("s2_original.py"));
    // The rename is its own turn, targeting the new name.
    const renameLine = out.split("\n").find((line) => line.includes("rename"))!;
    assert.ok(renameLine.includes("s2_moved.py"));
    assert.ok(out.includes("015b59mN")); // the test file's edit
    assert.ok(!out.includes("branch ")); // linear
});

// The default view lists s3's three files and shows the copy turn plus the edit's short changeId.
test("test_default_view_lists_s3_with_copy_entry", () => {
    const out = runCli([S3_JSONL]);
    assert.ok(out.includes("s3_source.py"));
    assert.ok(out.includes("s3_copy.py"));
    assert.ok(out.includes("test_s3_source.py"));
    assert.ok(out.includes("copy"));          // the cp is its own turn
    assert.ok(out.includes("#012rscwP"));     // the copied file's edit
    assert.ok(!out.includes("branch "));      // linear
});

// The default view lists S4's two files, each written twice (the second Write is a `write` turn in
// the topology view — overwrite detection is a content-view concern).
test("test_default_view_lists_s4_overwrite_entries", () => {
    const out = runCli([S4_JSONL]);
    assert.ok(out.includes("s4_overwrite.py"));
    assert.ok(out.includes("test_s4_overwrite.py"));
    assert.ok(out.includes("write"));
    assert.ok(out.includes("#012vJCJs")); // the second write of s4_overwrite.py
    assert.ok(!out.includes("branch "));  // linear
});

// Default (no flag): S8's forked conversationDAG has TWO rewound branch wrappers (v_a, v_b) above the
// surviving branch (v_c). The file-less step-12 Hello head is not a branch.
test("test_default_view_shows_surviving_vc_plus_two_rewound", () => {
    const out = runCli([S8_JSONL]);
    assert.ok(out.includes("branch surviving"));
    assert.ok(!out.includes("no files touched"));
    assert.equal((out.match(/branch rewound/g) ?? []).length, 2); // exactly two rewound wrappers
    assert.ok(out.includes("#01WWP6tD"));            // surviving v_c scenario8.py
    assert.ok(out.includes("#01Jn7kgw"));            // surviving v_c test
    assert.ok(out.includes("#014hpZNH"));            // rewound v_a
    assert.ok(out.includes("#014Yd3uL"));            // rewound v_b
    assert.ok(out.includes("#04c69f8b"));            // rewind point (root)
    assert.ok(!out.includes("overwrite"));
});

// --surviving: only v_c (the on-disk files), no rewound ids, no branch headers.
test("test_surviving_flag_shows_only_vc", () => {
    const out = runCli([S8_JSONL, "--surviving"]);
    assert.ok(out.includes("#01WWP6tD"));
    assert.ok(!out.includes("#014hpZNH"));           // v_a not shown
    assert.ok(!out.includes("#014Yd3uL"));           // v_b not shown
    assert.ok(!out.includes("## rewound"));
});

// --list-branches: one surviving line (tip #2988ac8f) and exactly two rewound summary lines.
test("test_list_branches_lists_surviving_vc_and_two_rewound", () => {
    const out = runCli([S8_JSONL, "--list-branches"]);
    assert.ok(out.includes("#2988ac8f"));            // surviving tip = v_c
    assert.ok(out.includes("#546718c1"));            // v_a tip
    assert.ok(out.includes("#84d669da"));            // v_b tip
    assert.equal((out.match(/rewound/g) ?? []).length, 2);
});

// --branch <v_a tip short id>: retrieves exactly v_a's writes, not v_b/v_c.
test("test_branch_id_retrieves_one_rewound_version", () => {
    const out = runCli([S8_JSONL, "--branch", "546718c1"]);
    assert.ok(out.includes("#014hpZNH"));            // v_a shown
    assert.ok(!out.includes("#014Yd3uL"));           // v_b not shown
    assert.ok(!out.includes("#01WWP6tD"));           // surviving v_c not shown
});

// Default (no flag): S9 has one surviving branch and zero rewound branches (the read-only head is a
// file-less tangent), so its conversationDAG is LINEAR — no branch wrappers. Both restored files
// appear with their real create change ids.
test("test_s9_default_view_is_a_plain_list_of_the_restored_files", () => {
    const out = runCli([S9_JSONL]);
    assert.ok(out.includes("scenario9.py"));
    assert.ok(out.includes("test_scenario9.py"));
    assert.ok(out.includes("#01PZ3yAw"));            // scenario9.py create
    assert.ok(out.includes("#012EzSkd"));            // test create
    assert.ok(!out.includes("branch "));             // linear, no wrappers
    assert.ok(!out.includes("no files touched"));
});

// --list-branches: a single surviving line naming the restored-code tip #f1b8dede; no rewound line.
test("test_s9_list_branches_shows_only_the_surviving_restored_branch", () => {
    const out = runCli([S9_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("#f1b8dede"));            // restored-code tip
    assert.ok(!out.includes("rewound"));
});

// --surviving: the two restored files, no headers.
test("test_s9_surviving_flag_shows_the_restored_files", () => {
    const out = runCli([S9_JSONL, "--surviving"]);
    assert.ok(out.includes("scenario9.py"));
    assert.ok(out.includes("tests/test_scenario9.py"));
    assert.ok(!out.includes("## "));
});
