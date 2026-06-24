import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S14_JSONL } from "./fixtures.ts";

// S14's CLI locks (mirroring the per-scenario split for S10/S11/S12/S13). S14 is the conv-only twin of
// S13: a conversation-only rewind leaves the abandoned `farewell` Edit on disk, so the engine must
// still name the Read branch surviving and surface the rewound Edit branch. The rendered output is
// byte-identical to S13's (modulo names/uuids). These lock the branch-aware views: the bare default's
// conversationDAG fork, the unchanged fileDAG, --list-branches, and the --branch content. The views
// use the real on-disk file-history reader (like the other real-transcript CLI tests).

// The bare default's conversationDAG FORKS: rooted at the rewind point acc07a57, the rewound
// `farewell` Edit branch above the file-less surviving Read branch (marked `(no file changes)`).
test("test_S14_default_conversationDAG_shows_the_rewound_fork", () => {
    const out = runCli([S14_JSONL]);
    // The root is the rewind point.
    assert.ok(out.includes("A  prompt  #acc07a57   (rewind point)"));
    // The rewound branch names its tip and rewind point and carries the single `farewell` edit turn.
    assert.ok(out.includes("branch rewound (rewound; tip #68f74356; rewind @ #acc07a57)"));
    assert.ok(out.includes("D  edit  scenario14.py  #01X52CXE"));
    // The surviving branch is file-less: a kept header with a `(no file changes)` marker.
    assert.ok(out.includes("branch surviving (surviving; tip #de63b23a)"));
    assert.ok(out.includes("(no file changes)"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// The fileDAG is the branch-agnostic disk lineage and was ALREADY correct — it must stay unchanged:
// scenario14.py shows B write + D edit, test_scenario14.py shows C write.
test("test_S14_default_fileDAG_is_unchanged", () => {
    const out = runCli([S14_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    // scenario14.py: the trunk write B then the abandoned edit D.
    assert.ok(out.includes("B  write  #0131TtyG"));
    assert.ok(out.includes("D  edit   #01X52CXE"));
    // test_scenario14.py: the trunk write C.
    assert.ok(out.includes("C  write  #01YE6fsX"));
});

// --list-branches lists the structurally-discovered rewound branch (it touched scenario14.py only).
test("test_S14_list_branches_includes_the_rewound_branch", () => {
    const out = runCli([S14_JSONL, "--list-branches"]);
    // The surviving branch holds both files; the rewound branch holds scenario14.py only.
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("de63b23a"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("68f74356"));
    assert.ok(out.includes("rewind @ #acc07a57"));
});

// Selecting the abandoned branch by its tip reconstructs its content: scenario14.py = greet + farewell.
test("test_S14_branch_selects_the_abandoned_farewell_content", () => {
    const out = runCli([S14_JSONL, "--branch", "68f74356", "--verbose"]);
    assert.ok(out.includes("def greet(name):"));
    assert.ok(out.includes("def farewell(name):"));
});
