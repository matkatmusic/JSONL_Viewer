import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S15_JSONL } from "./fixtures.ts";

// S15's CLI locks (mirroring the per-scenario split for S10–S14). S15 opens the user-edit family: a
// user edits scenario15.py out-of-band (an `edited_text_file` attachment, NOT a tool call), then a
// conversation-only rewind abandons that branch for a Read-only branch. Structurally this is the S13
// case — once the user edit is a recognized `user-edit` file event, the shipped S13/S14 machinery
// surfaces the fork with no further engine change. These lock the branch-aware views verbatim against
// the real CLI bytes. The views use the real on-disk file-history reader (like the other CLI tests).

// The bare default's conversationDAG FORKS: rooted at the rewind point a94b7090, the rewound
// `user-edit` branch above the file-less surviving Read branch (marked `(no file changes)`).
test("test_S15_default_conversationDAG_shows_the_rewound_fork", () => {
    const out = runCli([S15_JSONL]);
    // The root is the rewind point.
    assert.ok(out.includes("A  prompt  #a94b7090   (rewind point)"));
    // The rewound branch names its tip and rewind point and carries the single `user-edit` turn.
    assert.ok(out.includes("branch rewound (rewound; tip #56da61e5; rewind @ #a94b7090)"));
    assert.ok(out.includes("D  user-edit  scenario15.py  #d675bbfe"));
    // The surviving branch is file-less: a kept header with a `(no file changes)` marker.
    assert.ok(out.includes("branch surviving (surviving; tip #4eb82c06)"));
    assert.ok(out.includes("(no file changes)"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// The fileDAG is the branch-agnostic disk lineage: scenario15.py shows B write + D user-edit (the
// persisted out-of-band edit), test_scenario15.py shows C write. `user-edit` (9 chars) is the widest
// kind, so `write` is padded to that width.
test("test_S15_default_fileDAG_shows_write_then_user_edit", () => {
    const out = runCli([S15_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    // scenario15.py: the trunk write B then the user edit D.
    assert.ok(out.includes("B  write      #018tu7eT"));
    assert.ok(out.includes("D  user-edit  #d675bbfe"));
    // test_scenario15.py: the trunk write C.
    assert.ok(out.includes("C  write      #018f4SXM"));
});

// --list-branches lists the structurally-discovered rewound branch (it touched scenario15.py only).
test("test_S15_list_branches_includes_the_rewound_branch", () => {
    const out = runCli([S15_JSONL, "--list-branches"]);
    // The surviving branch holds both files; the rewound branch holds scenario15.py only.
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("4eb82c06"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("56da61e5"));
    assert.ok(out.includes("rewind @ #a94b7090"));
});

// Selecting the abandoned branch by its tip reconstructs its content: scenario15.py = user edit + hello.
test("test_S15_branch_selects_the_user_edit_content", () => {
    const out = runCli([S15_JSONL, "--branch", "56da61e5", "--verbose"]);
    assert.ok(out.includes("# user edit"));
    assert.ok(out.includes("def hello():"));
});

// The surviving Read branch records no file event of its own, so its scenario15.py is the trunk hello
// and must NOT contain the abandoned user edit.
test("test_S15_surviving_excludes_the_user_edit", () => {
    const out = runCli([S15_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("def hello():"));
    assert.ok(!out.includes("# user edit"));
});
