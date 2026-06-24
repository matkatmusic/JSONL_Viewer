import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S16_JSONL } from "./fixtures.ts";

// S16's CLI locks (mirroring the per-scenario split for S10–S15). S16 is the re-edit twin of S13: a code
// restore abandons the `farewell` edit, then the surviving branch RE-EDITS (`shout`). It is the first
// scenario where a structurally-discovered rewound branch coexists with a surviving branch that records
// its own file change. No engine change — these lock the branch-aware views verbatim against the real
// CLI bytes. The views use the real on-disk file-history reader (like the other CLI tests).

// The bare default's conversationDAG FORKS at the code-restore system record 9ab7b6e0: the rewound
// `farewell` edit above the surviving `shout` edit (oldest-first). The surviving branch is NOT file-less,
// so it shows its E edit rather than a `(no file changes)` marker.
test("test_S16_default_conversationDAG_shows_rewound_and_surviving_edits", () => {
    const out = runCli([S16_JSONL]);
    assert.ok(out.includes("A  prompt  #9ab7b6e0   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #24093c68; rewind @ #9ab7b6e0)"));
    assert.ok(out.includes("D  edit  scenario16.py  #01V2kMb8"));
    assert.ok(out.includes("branch surviving (surviving; tip #a4ec5565)"));
    assert.ok(out.includes("E  edit  scenario16.py  #01FE5WkH"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// The fileDAG is the branch-agnostic disk lineage: scenario16.py shows B write, D edit (the abandoned
// farewell, which WAS on disk before the restore), then E edit (shout); test_scenario16.py shows C write.
// The kind column is width 5 (`write`/`edit `) — the `edited_text_file` echo is DROPPED, so no width-9
// `user-edit` turn leaks in.
test("test_S16_default_fileDAG_shows_write_edit_edit_and_no_user_edit", () => {
    const out = runCli([S16_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write  #01P7tr8r"));
    assert.ok(out.includes("D  edit   #01V2kMb8"));
    assert.ok(out.includes("E  edit   #01FE5WkH"));
    assert.ok(out.includes("C  write  #01LMvhrm"));
    // The echo never becomes a turn.
    assert.ok(!out.includes("user-edit"));
});

// --list-branches lists both branches: the surviving branch (both files) and the structurally-discovered
// rewound branch (scenario16.py only), naming its tip and the rewind point.
test("test_S16_list_branches_includes_both_branches", () => {
    const out = runCli([S16_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("a4ec5565"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("24093c68"));
    assert.ok(out.includes("rewind @ #9ab7b6e0"));
});

// Selecting the abandoned branch by its tip reconstructs its content: scenario16.py = greet + farewell,
// never the surviving shout.
test("test_S16_branch_selects_the_abandoned_farewell", () => {
    const out = runCli([S16_JSONL, "--branch", "24093c68", "--verbose"]);
    assert.ok(out.includes("def farewell(name):"));
    assert.ok(!out.includes("def shout(name):"));
});

// --surviving shows the on-disk working tree: greet + shout, never the abandoned farewell.
test("test_S16_surviving_shows_the_shout_re_edit", () => {
    const out = runCli([S16_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("def shout(name):"));
    assert.ok(!out.includes("def farewell(name):"));
});
