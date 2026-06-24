import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S20_JSONL } from "./fixtures.ts";

// S20 is the first scenario with a user-edit on BOTH branches — D (real human edit) on the rewound
// branch, F (the code-rewind file-restore echo) on the surviving branch. The rewind point A
// (#e76a23d3) forks the two.
test("test_S20_default_conversationDAG_shows_user_edit_on_both_branches", () => {
    const out = runCli([S20_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #e76a23d3   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #51227411; rewind @ #e76a23d3)"));
    assert.ok(out.includes("D  user-edit  scenario20.py  #1f34678f"));
    assert.ok(out.includes("E  edit       scenario20.py  #01SnupgK"));
    assert.ok(out.includes("branch surviving (surviving; tip #cacc87c7)"));
    assert.ok(out.includes("F  user-edit  scenario20.py  #ce4c11d8"));
    assert.ok(out.includes("G  edit       scenario20.py  #01WTdWiM"));
});

// The fileDAG lists every scenario20.py turn (B write, D user-edit, E edit, F user-edit, G edit) and
// the test write (C).
test("test_S20_default_fileDAG_lists_both_user_edits_and_the_test_write", () => {
    const out = runCli([S20_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01LCjSdM"));
    assert.ok(out.includes("D  user-edit  #1f34678f"));
    assert.ok(out.includes("E  edit       #01SnupgK"));
    assert.ok(out.includes("F  user-edit  #ce4c11d8"));
    assert.ok(out.includes("G  edit       #01WTdWiM"));
    assert.ok(out.includes("C  write      #01VMPUqx"));
});

// --list-branches names both tips and the rewound branch's rewind point.
test("test_S20_list_branches_shows_surviving_and_rewound_tips", () => {
    const out = runCli([S20_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #cacc87c7"));
    assert.ok(out.includes("rewound    tip #51227411  rewind @ #e76a23d3"));
});

// BYTE/POSITION LOCK — `# user tweak` is on line 3 (no blank before it, the S20-vs-S19 inversion),
// and `def multiply` is on line 6 (proving lines 4,5 are the two blank lines). The render is
// line-numbered, so a dropped tweak or dropped blanks would shift these numbers.
test("test_S20_surviving_verbose_locks_user_tweak_on_line_three_and_multiply_after_blanks", () => {
    const out = runCli([S20_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("3 | # user tweak"));
    assert.ok(out.includes("6 | def multiply(a, b):"));
    assert.ok(out.includes("7 |     return a * b"));
});

// --surviving --verbose renders scenario20.py as exactly three revisions; the final is 7 lines.
test("test_S20_surviving_verbose_shows_three_revisions_for_scenario_file", () => {
    const out = runCli([S20_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    assert.ok(out.includes("(7 lines)"));
});
