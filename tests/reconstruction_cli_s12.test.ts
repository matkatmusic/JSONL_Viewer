import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, runCli } from "../src/reconstruction_cli.ts";
import { S12_JSONL } from "./fixtures.ts";

// S12's CLI locks live in their own file (the 250-line cap on reconstruction_cli.test.ts is reached),
// mirroring the per-scenario split for S10/S11. These LOCK the new two-DAG global default plus the
// graph-flag dispatch so a future change cannot silently regress S12. The default and content views use
// the real on-disk file-history reader (like the other real-transcript CLI tests).

// The bare default renders BOTH DAGs: the conversationDAG (rooted at the rewind point, rewound branch
// above surviving — oldest-first) then the fileDAG (per file, shared letters cross-linking the turns).
test("test_s12_default_view_renders_both_dags_rewound_above_surviving", () => {
    const out = runCli([S12_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    // The root is the rewind point; the rewound branch header names its tip and rewind point.
    assert.ok(out.includes("A  prompt  #94000895   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #cba30c9f; rewind @ #94000895)"));
    // Branch B's tip short id, read off the engine output and transcribed.
    assert.ok(out.includes("branch surviving (surviving; tip #2c9424c4)"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
    // The four B–E turns, with the right kinds and targets.
    assert.ok(out.includes("B  write  scenario12.py"));
    assert.ok(out.includes("C  write  test_scenario12.py"));
    assert.ok(out.includes("D  edit   scenario12.py"));
    assert.ok(out.includes("E  edit   test_scenario12.py"));
    // The fileDAG cross-links the same letters via the real change ids.
    assert.ok(out.includes("#015zSRxJ")); // B / D scenario12.py writes+edits
    assert.ok(out.includes("#0161dgZL")); // E test edit
});

// --graphConvo renders ONLY the conversationDAG.
test("test_s12_graph_convo_flag_renders_only_the_conversation_dag", () => {
    const out = runCli([S12_JSONL, "--graphConvo"]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(!out.includes("══ fileDAG ══"));
});

// --graphFile renders ONLY the fileDAG.
test("test_s12_graph_file_flag_renders_only_the_file_dag", () => {
    const out = runCli([S12_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(!out.includes("══ conversationDAG ══"));
});

// --surviving --verbose shows the reconstructed surviving content: the recovered `add` base PLUS the
// `multiply` edit (proving the crash fix recovered the off-branch base and spliced the edit onto it).
test("test_s12_surviving_verbose_shows_add_base_plus_multiply_edit", () => {
    const out = runCli([S12_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("def add"));
    assert.ok(out.includes("def multiply"));
});

// parseArgs: with no view flags, the bare default turns BOTH graph flags on (the new global default).
test("test_parse_args_defaults_to_both_graphs_when_no_view_flags", () => {
    const options = parseArgs(["t.jsonl"]);
    assert.equal(options.graphConvo, true);
    assert.equal(options.graphFile, true);
});

// parseArgs: an explicit --graphConvo selects only that graph (the file default is suppressed).
test("test_parse_args_explicit_graph_convo_disables_the_file_default", () => {
    const options = parseArgs(["t.jsonl", "--graphConvo"]);
    assert.equal(options.graphConvo, true);
    assert.equal(options.graphFile, false);
});

// parseArgs: another selector (--surviving) suppresses the graph default entirely (content view).
test("test_parse_args_surviving_suppresses_the_graph_default", () => {
    const options = parseArgs(["t.jsonl", "--surviving"]);
    assert.equal(options.graphConvo, false);
    assert.equal(options.graphFile, false);
});
