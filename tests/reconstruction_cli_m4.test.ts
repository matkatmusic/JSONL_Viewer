import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M4_JSONL } from "./fixtures.ts";

// m4's conversationDAG is LINEAR: a single root prompt A with B..G beneath it and NO
// branch/rewind lines. The `rm` surfaces as a `delete` turn (E); the recreate as `write` (F).
test("test_m4_default_conversationDAG_lists_prompt_and_six_linear_events", () => {
    const out = runCli([M4_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #1d55df91"));
    assert.ok(out.includes("  B  write   m4_lifecycle.py       #016pNFF6"));
    assert.ok(out.includes("  C  write   test_m4_lifecycle.py  #0147VowY"));
    assert.ok(out.includes("  D  edit    m4_lifecycle.py       #01USMe5y"));
    assert.ok(out.includes("  E  delete  m4_lifecycle.py       #017nbCaY"));
    assert.ok(out.includes("  F  write   m4_lifecycle.py       #01MLZYnc"));
    assert.ok(out.includes("  G  edit    test_m4_lifecycle.py  #0155AQbn"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG groups the source file's four events (B/D/E/F) under m4_lifecycle.py and the
// test file's two (C/G) under test_m4_lifecycle.py, each in order. The delete is a turn.
test("test_m4_default_fileDAG_groups_two_files_by_lifecycle", () => {
    const out = runCli([M4_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m4_lifecycle.py\n  B  write   #016pNFF6\n  D  edit    #01USMe5y\n  E  delete  #017nbCaY\n  F  write   #01MLZYnc",
    ));
    assert.ok(out.includes(
        "test_m4_lifecycle.py\n  C  write   #0147VowY\n  G  edit    #0155AQbn",
    ));
});

// One surviving branch, no rewound branch (linear scenario); BOTH files are listed.
test("test_m4_list_branches_single_surviving_two_files", () => {
    const out = runCli([M4_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #3b6a446e"));
    assert.ok(out.includes("m4_lifecycle.py, test_m4_lifecycle.py"));
    assert.ok(!out.includes("rewound"));
});

// THE DELETE BYTE-LOCK: even though the file is later recreated, the `rm` renders as an
// absent (0-line) revision in the surviving verbose history.
test("test_m4_surviving_verbose_shows_delete_as_absent_revision", () => {
    const out = runCli([M4_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(0 lines)\n  (file absent — 0 lines)"));
});

// THE RECREATE BYTE-LOCK (end-to-end born-fresh): the revision after the absent one carries
// ONLY the 2-line v2 content (def v2 / return 2) — the recreate did not carry v1/v1_helper
// forward. The source history has exactly four revisions (0..3); there is no revision 4.
test("test_m4_surviving_verbose_recreate_shows_only_v2_content", () => {
    const out = runCli([M4_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(2 lines)\n     1 | def v2():\n     2 |     return 2"));
    assert.ok(!out.includes("revision 4"));
});
