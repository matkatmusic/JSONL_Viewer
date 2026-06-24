import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S13_JSONL } from "./fixtures.ts";

// S13's CLI locks live in their own file (mirroring the per-scenario split for S10/S11/S12). They LOCK
// the structural rewound-branch discovery surfacing in every branch-aware view: the bare default's
// conversationDAG fork, the unchanged fileDAG, --list-branches, and the --branch content. The views use
// the real on-disk file-history reader (like the other real-transcript CLI tests).

// The bare default's conversationDAG now FORKS: rooted at the rewind point 8faab841, the rewound
// `farewell` Edit branch above the file-less surviving Read branch (marked `(no file changes)`).
test("test_S13_default_conversationDAG_shows_the_rewound_fork", () => {
    const out = runCli([S13_JSONL]);
    // The root is the rewind point.
    assert.ok(out.includes("A  prompt  #8faab841   (rewind point)"));
    // The rewound branch names its tip and rewind point and carries the single `farewell` edit turn.
    assert.ok(out.includes("branch rewound (rewound; tip #45cf4bf8; rewind @ #8faab841)"));
    assert.ok(out.includes("D  edit  scenario13.py  #01EoFfFx"));
    // The surviving branch is file-less: a kept header with a `(no file changes)` marker.
    assert.ok(out.includes("branch surviving (surviving; tip #9641c49c)"));
    assert.ok(out.includes("(no file changes)"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// The fileDAG is the branch-agnostic disk lineage and was ALREADY correct — it must stay unchanged:
// scenario13.py shows B write + D edit, test_scenario13.py shows C write.
test("test_S13_default_fileDAG_is_unchanged", () => {
    const out = runCli([S13_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    // scenario13.py: the trunk write B then the abandoned edit D.
    assert.ok(out.includes("B  write  #01KmxQkd"));
    assert.ok(out.includes("D  edit   #01EoFfFx"));
    // test_scenario13.py: the trunk write C.
    assert.ok(out.includes("C  write  #01WiSfee"));
});

// --list-branches now lists the structurally-discovered rewound branch (it touched scenario13.py only).
test("test_S13_list_branches_includes_the_rewound_branch", () => {
    const out = runCli([S13_JSONL, "--list-branches"]);
    // The surviving branch holds both files; the rewound branch holds scenario13.py only.
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("9641c49c"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("45cf4bf8"));
    assert.ok(out.includes("rewind @ #8faab841"));
});

// Selecting the abandoned branch by its tip reconstructs its content: scenario13.py = greet + farewell.
test("test_S13_branch_selects_the_abandoned_farewell_content", () => {
    const out = runCli([S13_JSONL, "--branch", "45cf4bf8", "--verbose"]);
    assert.ok(out.includes("def greet(name):"));
    assert.ok(out.includes("def farewell(name):"));
});
