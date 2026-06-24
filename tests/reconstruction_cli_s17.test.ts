import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S17_JSONL } from "./fixtures.ts";

// S17's CLI locks (mirroring the per-scenario split for S10–S16). S17 is the conv-only twin of S16: a
// conversation-only rewind abandons the `farewell` edit CONVERSATIONALLY but LEAVES IT ON DISK, then the
// surviving branch RE-EDITS (`shout`) the still-farewell file. So the surviving working tree KEEPS
// farewell (greet + farewell + shout) — the one byte that inverts versus S16's greet + shout. No engine
// change — these lock the branch-aware views verbatim against the real CLI bytes. The views use the real
// on-disk file-history reader (like the other CLI tests).

// The bare default's conversationDAG FORKS at the conv-only-rewind system record 4a69b697: the rewound
// `farewell` edit above the surviving `shout` edit (oldest-first). The surviving branch is NOT file-less,
// so it shows its E edit rather than a `(no file changes)` marker.
test("test_S17_default_conversationDAG_shows_rewound_and_surviving_edits", () => {
    const out = runCli([S17_JSONL]);
    assert.ok(out.includes("A  prompt  #4a69b697   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #07038b43; rewind @ #4a69b697)"));
    assert.ok(out.includes("D  edit  scenario17.py  #01EbvweP"));
    assert.ok(out.includes("branch surviving (surviving; tip #e53225b5)"));
    assert.ok(out.includes("E  edit  scenario17.py  #01RvpwRx"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// The fileDAG is the branch-agnostic disk lineage: scenario17.py shows B write, D edit (the farewell,
// which is on disk and stays there), then E edit (shout); test_scenario17.py shows C write. The kind
// column is width 5 (`write`/`edit `) — there is NO `edited_text_file` echo in S17, so no width-9
// `user-edit` turn can appear.
test("test_S17_default_fileDAG_shows_write_edit_edit_and_no_user_edit", () => {
    const out = runCli([S17_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write  #017Kvucu"));
    assert.ok(out.includes("D  edit   #01EbvweP"));
    assert.ok(out.includes("E  edit   #01RvpwRx"));
    assert.ok(out.includes("C  write  #01S2jTCa"));
    // No echo exists, so no user-edit turn.
    assert.ok(!out.includes("user-edit"));
});

// --list-branches lists both branches: the surviving branch (both files) and the structurally-discovered
// rewound branch (scenario17.py only), naming its tip and the rewind point.
test("test_S17_list_branches_includes_both_branches", () => {
    const out = runCli([S17_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("e53225b5"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("07038b43"));
    assert.ok(out.includes("rewind @ #4a69b697"));
});

// Selecting the abandoned branch by its tip reconstructs its content: scenario17.py = greet + farewell,
// never the surviving shout.
test("test_S17_branch_selects_the_abandoned_farewell", () => {
    const out = runCli([S17_JSONL, "--branch", "07038b43", "--verbose"]);
    assert.ok(out.includes("def farewell(name):"));
    assert.ok(!out.includes("def shout(name):"));
});

// THE S17 vs S16 INVERSION at the CLI. --surviving shows the on-disk working tree the conv-only rewind
// preserved: greet + farewell + shout — BOTH farewell AND shout are present. (Contrast S16's --surviving,
// which had shout but NOT farewell. Do NOT copy S16's `!includes("farewell")` assertion here.)
test("test_S17_surviving_keeps_farewell_and_shout", () => {
    const out = runCli([S17_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("def farewell(name):"));
    assert.ok(out.includes("def shout(name):"));
});
