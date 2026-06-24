import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S19_JSONL } from "./fixtures.ts";

// S19's conversationDAG has a rewind: the rewound branch carries D (user-edit) and E (subtract edit),
// the surviving branch carries F (multiply edit). The rewind point A (#b1368b53) forks the two.
test("test_S19_default_conversationDAG_shows_rewound_user_edit_and_surviving_edit", () => {
    const out = runCli([S19_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #b1368b53   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #7087c57e; rewind @ #b1368b53)"));
    assert.ok(out.includes("D  user-edit  scenario19.py  #5f254565"));
    assert.ok(out.includes("E  edit       scenario19.py  #01BBacF7"));
    assert.ok(out.includes("branch surviving (surviving; tip #66840964)"));
    assert.ok(out.includes("F  edit       scenario19.py  #01GD3fen"));
});

// The fileDAG lists every scenario19.py turn (B write, D user-edit, E edit, F edit) and the test write.
test("test_S19_default_fileDAG_lists_all_scenario_turns_and_the_test_write", () => {
    const out = runCli([S19_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01HfSPZ5"));
    assert.ok(out.includes("D  user-edit  #5f254565"));
    assert.ok(out.includes("E  edit       #01BBacF7"));
    assert.ok(out.includes("F  edit       #01GD3fen"));
    assert.ok(out.includes("C  write      #01HcWkVj"));
});

// --list-branches names the surviving and rewound tips with the rewound branch's rewind point.
test("test_S19_list_branches_shows_surviving_and_rewound_tips", () => {
    const out = runCli([S19_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #66840964"));
    assert.ok(out.includes("rewound    tip #7087c57e  rewind @ #b1368b53"));
});

// The regression byte-lock: the surviving scenario19.py keeps BOTH pairs of blank lines. The verbose
// render is line-numbered, so the blanks are locked by line POSITION — `def subtract` lands on line 5
// (lines 3,4 are the two blanks after `return a + b`) and `def multiply` lands on line 10 (lines 8,9
// are the two blanks after `# user tweak`). If the engine dropped the blanks, subtract/multiply would
// shift up to lines 3/8 and these assertions would fail.
test("test_S19_surviving_verbose_reconstructs_eleven_line_file_with_blank_lines", () => {
    const out = runCli([S19_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("5 | def subtract(a, b):"));
    assert.ok(out.includes("7 | # user tweak"));
    assert.ok(out.includes("10 | def multiply(a, b):"));
    assert.ok(out.includes("11 |     return a * b"));
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
