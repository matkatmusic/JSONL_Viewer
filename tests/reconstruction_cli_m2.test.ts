import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M2_JSONL } from "./fixtures.ts";

// m2's conversationDAG is LINEAR: a single root prompt A with B..F beneath it and NO
// branch/rewind lines. The mv surfaces as its own `rename` turn (E).
test("test_m2_default_conversationDAG_lists_six_linear_turns_with_rename", () => {
    const out = runCli([M2_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #222eac11"));
    assert.ok(out.includes("  B  write   m2_old_name.py       #01ByHKPs"));
    assert.ok(out.includes("  C  write   test_m2_old_name.py  #0138XEEN"));
    assert.ok(out.includes("  D  edit    m2_old_name.py       #01BfXLQz"));
    assert.ok(out.includes("  E  rename  m2_new_name.py       #01SMiNy8"));
    assert.ok(out.includes("  F  edit    m2_new_name.py       #01FMMzJD"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG groups by the path each event names: m2_old_name.py shows its
// pre-rename events (B write, D edit), m2_new_name.py shows the rename + post-rename
// edit (E rename, F edit), and the test file is its own group.
test("test_m2_default_fileDAG_groups_old_test_and_new_paths", () => {
    const out = runCli([M2_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("m2_old_name.py\n  B  write   #01ByHKPs\n  D  edit    #01BfXLQz"));
    assert.ok(out.includes("test_m2_old_name.py\n  C  write   #0138XEEN"));
    assert.ok(out.includes("m2_new_name.py\n  E  rename  #01SMiNy8\n  F  edit    #01FMMzJD"));
});

// One surviving branch, no rewound branch (linear scenario); the old name is ABSENT
// from the surviving file set (it was renamed away).
test("test_m2_list_branches_single_surviving_old_name_absent", () => {
    const out = runCli([M2_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #7260996e"));
    assert.ok(out.includes("m2_new_name.py, test_m2_old_name.py"));
    assert.ok(!out.includes("rewound"));
    // the rename source is collapsed, so it is not listed as its own surviving file
    assert.ok(!out.includes(", m2_old_name.py"));
});

// Surviving verbose: m2_new_name.py ends at the 10-line finalize version.
test("test_m2_surviving_verbose_new_file_ends_at_finalize_ten_lines", () => {
    const out = runCli([M2_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(10 lines)"));
    assert.ok(out.includes("def finalize():"));
});

// THE CRUX CLI BYTE-LOCK: m2_new_name.py's revision 2 is a `rename` from the old path
// to the new path; its pre-rename revision is the 6-line process+validate version
// (proving the pre-rename `validate` edit was carried across), and its final revision
// is the 10-line finalize version.
test("test_m2_surviving_verbose_rename_revision_carries_pre_rename_content", () => {
    const out = runCli([M2_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 2  rename  "));
    assert.ok(out.includes("m2_old_name.py → "));
    assert.ok(out.includes("m2_new_name.py"));
    assert.ok(out.includes("(6 lines)"));   // pre-rename content carried across — process+validate
    assert.ok(out.includes("def validate():"));
    assert.ok(out.includes("(10 lines)"));  // post-rename final — adds finalize
});
