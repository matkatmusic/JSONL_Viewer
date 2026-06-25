import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S19_JSONL } from "./fixtures.ts";

// S19's conversationDAG has a rewind: the rewound branch carries D (user-edit) and E (subtract edit),
// the surviving branch carries F (multiply edit). The rewind point A (#e4196ca9) forks the two.
// (Re-run 2026-06-25 in-worktree transcript d8a5cf41-…; all short ids below are that run's.)
test("test_S19_default_conversationDAG_shows_rewound_user_edit_and_surviving_edit", () => {
    const out = runCli([S19_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #e4196ca9   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #66a6d627; rewind @ #e4196ca9)"));
    assert.ok(out.includes("D  user-edit  scenario19.py  #144e50a3"));
    assert.ok(out.includes("E  edit       scenario19.py  #01HkQWUL"));
    assert.ok(out.includes("branch surviving (surviving; tip #620ef9f7)"));
    assert.ok(out.includes("F  edit       scenario19.py  #01R21Md2"));
});

// The fileDAG lists every scenario19.py turn (B write, D user-edit, E edit, F edit) and the test write.
test("test_S19_default_fileDAG_lists_all_scenario_turns_and_the_test_write", () => {
    const out = runCli([S19_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #0124J6Ks"));
    assert.ok(out.includes("D  user-edit  #144e50a3"));
    assert.ok(out.includes("E  edit       #01HkQWUL"));
    assert.ok(out.includes("F  edit       #01R21Md2"));
    assert.ok(out.includes("C  write      #0198ALMJ"));
});

// --list-branches names the surviving and rewound tips with the rewound branch's rewind point.
test("test_S19_list_branches_shows_surviving_and_rewound_tips", () => {
    const out = runCli([S19_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #620ef9f7"));
    assert.ok(out.includes("rewound    tip #66a6d627  rewind @ #e4196ca9"));
});

// The regression byte-lock: the surviving scenario19.py keeps BOTH pairs of blank lines. The verbose
// render is line-numbered, so the blanks are locked by line POSITION. In the re-run the post-rewind
// `multiply` edit splices ahead of the off-branch `subtract`, so `def multiply` lands on line 5 (lines
// 3,4 are the two blanks after `return a + b`) and `def subtract` lands on line 10 (lines 8,9 are the
// two blanks after `# user tweak`). If the engine dropped the blanks, they would shift up and fail.
test("test_S19_surviving_verbose_reconstructs_eleven_line_file_with_blank_lines", () => {
    const out = runCli([S19_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("5 | def multiply(a, b):"));
    assert.ok(out.includes("6 |     return a * b"));
    assert.ok(out.includes("7 | # user tweak"));
    assert.ok(out.includes("10 | def subtract(a, b):"));
    assert.ok(out.includes("11 |     return a - b"));
});

// --surviving --verbose renders scenario19.py as three revisions; revision 2 is the 11-line final.
test("test_S19_surviving_verbose_shows_three_revisions_for_scenario_file", () => {
    const out = runCli([S19_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    // revision 2 is the 11-line final.
    assert.ok(out.includes("(11 lines)"));
});
