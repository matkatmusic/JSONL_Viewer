import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S11_JSONL } from "./fixtures.ts";

// S11's CLI regression locks live in their own file because the 250-line cap on
// reconstruction_cli.test.ts is already reached; this mirrors the per-scenario split for S10
// (reconstruction_cli_s10.test.ts). All four pass on the unchanged CLI — they LOCK the output so a
// future change cannot silently regress S11.

// Default (no flag): S11 has one surviving branch (the multiply rewrite) AND one rewound branch (the
// abandoned add turn that wrote files), so its conversationDAG FORKS into a rewound wrapper (add)
// above a surviving wrapper (multiply) — unlike S9/S10's linear graphs.
test("test_s11_default_view_shows_surviving_multiply_and_rewound_add", () => {
    const out = runCli([S11_JSONL]);
    assert.ok(out.includes("branch surviving"));
    assert.ok(out.includes("branch rewound"));
    assert.ok(out.includes("#01U5g9RL"));            // surviving multiply scenario11.py
    assert.ok(out.includes("#01B97eyh"));            // surviving multiply test
    assert.ok(out.includes("#01CMuVT4"));            // rewound add scenario11.py
    assert.ok(out.includes("#01EW4ztd"));            // rewound add test
    // Oldest-first: the rewound add branch renders above the surviving multiply branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// --surviving: only the multiply rewrite (the on-disk files); no rewound add ids, no branch headers.
test("test_s11_surviving_flag_shows_only_the_multiply_rewrite", () => {
    const out = runCli([S11_JSONL, "--surviving"]);
    assert.ok(out.includes("#01U5g9RL"));            // multiply scenario11.py shown
    assert.ok(!out.includes("#01CMuVT4"));           // add scenario11.py NOT shown
    assert.ok(!out.includes("## rewound"));
});

// --list-branches: one surviving line (tip #d03f0078) and one rewound summary line naming the rewound
// tip #a7ceb7ae and the rewind point #742f44f2.
test("test_s11_list_branches_summarizes_surviving_and_rewound", () => {
    const out = runCli([S11_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("#d03f0078"));            // surviving (multiply) tip
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("#a7ceb7ae"));            // rewound (add) tip
    assert.ok(out.includes("#742f44f2"));            // rewind point
});

// --branch <rewound tip>: render exactly the rewound add branch, selected by its short tip id.
test("test_s11_branch_id_retrieves_the_rewound_add_branch", () => {
    const out = runCli([S11_JSONL, "--branch", "a7ceb7ae"]);
    assert.ok(out.includes("#01CMuVT4"));            // the rewound add scenario11.py create is shown
    assert.ok(out.includes("#01EW4ztd"));            // the rewound add test create is shown
    assert.ok(!out.includes("#01U5g9RL"));           // the surviving multiply create is NOT shown
});
