import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S18_JSONL } from "./fixtures.ts";

// S18's conversationDAG is LINEAR: A prompt then B/C writes, the D user-edit, then the E farewell
// edit — no rewind point, no branch headers. The user-edit turn (D) is present on the trunk.
test("test_S18_default_conversationDAG_is_linear_with_a_user_edit_turn", () => {
    const out = runCli([S18_JSONL]);
    // The root prompt, and each trunk turn including the user edit and the later farewell edit.
    assert.ok(out.includes("A  prompt  #257a17e2"));
    assert.ok(out.includes("B  write      scenario18.py"));
    assert.ok(out.includes("D  user-edit  scenario18.py"));
    assert.ok(out.includes("E  edit       scenario18.py"));
    assert.ok(out.includes("#8902b3f0"));
    assert.ok(out.includes("#015Q6Dme"));
    // It is linear: no rewind point and no branch headers are rendered.
    assert.ok(!out.includes("(rewind point)"));
    assert.ok(!out.includes("branch rewound"));
    assert.ok(!out.includes("branch surviving"));
});

// The fileDAG shows scenario18.py as write → user-edit → edit (the persisted out-of-band edit sits
// between the two Claude file ops), and the test file's lone write. Unlike S16/S17, the `user-edit`
// kind IS present here — this is the S18 signature.
test("test_S18_default_fileDAG_shows_write_user_edit_edit", () => {
    const out = runCli([S18_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    // scenario18.py: trunk write B, the user edit D, then the farewell edit E.
    assert.ok(out.includes("B  write      #01Gi9FvK"));
    assert.ok(out.includes("D  user-edit  #8902b3f0"));
    assert.ok(out.includes("E  edit       #015Q6Dme"));
    // test_scenario18.py: the trunk write C.
    assert.ok(out.includes("C  write      #01XgoZoq"));
    // The user-edit kind is present on the surviving lineage (the inversion of S16/S17).
    assert.ok(out.includes("user-edit"));
});

// --list-branches lists only the surviving branch — there is no rewound branch to discover.
test("test_S18_list_branches_shows_only_the_surviving_branch", () => {
    const out = runCli([S18_JSONL, "--list-branches"]);
    // The surviving branch and its tip.
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("503a45bb"));
    // No rewound branch, no rewind marker.
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("rewind @"));
});

// The surviving view KEEPS the user edit and the farewell built on top of it — greet + the user's
// comment + farewell are all present (the inversion of S15, whose surviving view excludes the edit).
test("test_S18_surviving_keeps_user_edit_and_farewell", () => {
    const out = runCli([S18_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("# user was here"));
    assert.ok(out.includes("def greet(name):"));
    assert.ok(out.includes("def farewell(name):"));
});

// --verbose renders scenario18.py as three distinct revisions: the user edit is its own revision
// (greet + comment, no farewell yet) and the final revision adds farewell on top.
test("test_S18_verbose_shows_the_user_edit_as_its_own_revision", () => {
    const out = runCli([S18_JSONL, "--verbose"]);
    // All three revisions are rendered.
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    // The user's comment appears, and the farewell appears (added by the last revision).
    assert.ok(out.includes("# user was here"));
    assert.ok(out.includes("def farewell(name):"));
});
