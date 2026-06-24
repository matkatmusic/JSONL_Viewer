import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M7_JSONL } from "./fixtures.ts";

// m7's conversationDAG shows the conv rewind: a rewind-point prompt A with TWO branches — the
// rewound branch (tip #8037716c, with the abandoned step2/step3 edits D,E) and the surviving
// branch (tip #b6d67431, with the step2_alt edit F).
test("test_m7_default_conversationDAG_shows_rewind_two_branches", () => {
    const out = runCli([M7_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #a76d12e8   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #8037716c; rewind @ #a76d12e8)"));
    assert.ok(out.includes("D  edit  m7_conv.py  #01Q1Afdv"));
    assert.ok(out.includes("E  edit  m7_conv.py  #01KgnABQ"));
    assert.ok(out.includes("branch surviving (surviving; tip #b6d67431)"));
    assert.ok(out.includes("F  edit  m7_conv.py  #01KWHULi"));
});

// The fileDAG groups m7_conv.py's four events (B/D/E/F) and test_m7_conv.py's one (C).
test("test_m7_default_fileDAG_groups_two_files", () => {
    const out = runCli([M7_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m7_conv.py\n  B  write  #01FNKuwc\n  D  edit   #01Q1Afdv\n  E  edit   #01KgnABQ\n  F  edit   #01KWHULi",
    ));
    assert.ok(out.includes("test_m7_conv.py\n  C  write  #01AYTKLo"));
});

// One surviving branch (two files) and one rewound branch (m7_conv.py only).
test("test_m7_list_branches_surviving_two_files_rewound_one", () => {
    const out = runCli([M7_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #b6d67431    m7_conv.py, test_m7_conv.py"));
    assert.ok(out.includes("rewound    tip #8037716c  rewind @ #a76d12e8    m7_conv.py"));
});

// SURVIVING BYTE-LOCK: the surviving m7_conv.py ends at the 14-line ground truth — step2_alt
// inserted before step3, with step2 (off-branch disk) preserved. (The 14-line block is the
// reader-recovered result; a regression in the reseed would drop step2.)
test("test_m7_surviving_verbose_ends_at_step2_alt_before_step3", () => {
    const out = runCli([M7_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes(
        "(14 lines)\n     1 | def step1():\n     2 |     return 1\n     3 | \n     4 | \n     5 | def step2():\n     6 |     return 2\n     7 | \n     8 | \n     9 | def step2_alt():\n    10 |     return \"2alt\"\n    11 | \n    12 | \n    13 | def step3():\n    14 |     return 3",
    ));
});

// REWOUND BYTE-LOCK: the rewound branch ends at the 10-line step1+step2+step3 version and does
// NOT contain step2_alt (the surviving edit is off this branch).
test("test_m7_rewound_branch_verbose_is_step3_no_step2_alt", () => {
    const out = runCli([M7_JSONL, "--branch", "8037716c", "--verbose"]);
    assert.ok(out.includes(
        "(10 lines)\n     1 | def step1():\n     2 |     return 1\n     3 | \n     4 | \n     5 | def step2():\n     6 |     return 2\n     7 | \n     8 | \n     9 | def step3():\n    10 |     return 3",
    ));
    assert.ok(!out.includes("step2_alt"));
});
