import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCli } from "../src/reconstruction_cli.ts";
import { S39_JSONL } from "./fixtures.ts";

// The rendered ground-truth `orders.py` sits in the same local executed dir the S39_JSONL points at. The
// engine reconstructs it from the JSONL transcript while this file is the independently rendered artifact,
// so the byte-compare below stays a real cross-source check.
const S39_GT =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s39-git-baseline-seed";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S39_GT}/${relativePath}`, "utf8");
}

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// (Verbatim from the S28–S38 CLI tests.)
function fileVerboseBlock(out: string, suffix: string): string {
    const lines = out.split("\n");
    const start = lines.findIndex((line) => line.startsWith("### ") && line.endsWith(suffix));
    assert.ok(start >= 0, `no verbose section for ${suffix}`);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index]!.startsWith("### ")) { end = index; break; }
    }
    return lines.slice(start, end).join("\n");
}

// Slice the LAST revision out of a file's verbose block (from its last `revision N  @` line to the block
// end). For s39 that is the tip revision 1 — the 41-line state with `count`. (Verbatim from the S38 CLI test.)
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// Reverse the verbose renderer's `  N | ` line-number prefix on every numbered line of a revision slice and
// rejoin — yielding the reconstructed file body so it can be byte-compared to the rendered ground truth.
function stripLineNumberPrefixes(revisionSlice: string): string {
    return revisionSlice
        .split("\n")
        .filter((line) => /^ *\d+ \| /.test(line))
        .map((line) => line.replace(/^ *\d+ \| /, ""))
        .join("\n");
}

// The engine drops a single trailing newline at replay, so the reconstructed body equals the rendered file
// with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}

// C1 — default view prints BOTH DAGs. s39's transcript opens MID-STREAM (the `--excludeJSONL` respawn dropped
// the baseline session), so the conversationDAG is just the lone prompt and the single `orders.py` Edit turn.
// The run is linear (no rewind/branch header). `tests/test_orders.py` was written in the excluded baseline
// session and never touched here, so it must appear NOWHERE.
test("test_S39_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S39_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #5b518fc2"));
    assert.ok(out.includes("B  edit  orders.py  #01XCwxVH"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
    assert.ok(!out.includes("test_orders.py"), "test_orders.py must not be reconstructed");
});

// C2 — one surviving branch, tip #d8c61657, single file orders.py; no rewound branch and no test file.
test("test_S39_list_branches_single_surviving_one_file", () => {
    const out = runCli([S39_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #d8c61657"));
    assert.ok(out.includes("orders.py"));
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("test_orders.py"));
});

// C3 — `--graphFile` node ladder. orders.py has EXACTLY ONE node: the `B  edit` (changeId #01XCwxVH). There is
// NO `write` node — the transcript opens mid-stream with the Edit, and the engine seeds rev 0 purely from the
// Edit's `toolUseResult.originalFile`, which is not a graph node. A spurious extra node would break this block.
test("test_S39_graphFile_single_edit_node", () => {
    const out = runCli([S39_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "orders.py\n" +
        "  B  edit  #01XCwxVH",
    ));
    assert.ok(!out.includes("write"), "no write node — rev 0 is originalFile-seeded, not an observed write");
});

// C4 — verbose orders.py. A 2-revision history (0..1, no revision 2): rev 0 (29 lines) is the originalFile
// baseline carrying `total`/`names` and NO `count`; the FINAL revision (41 lines) adds documented
// `count(items)` and, after stripping the `  N | ` line-number prefixes, BYTE-MATCHES the rendered on-disk
// orders.py.
test("test_S39_verbose_orders_two_revisions_tip_byte_matches", () => {
    const block = fileVerboseBlock(runCli([S39_JSONL, "--verbose"]), "/orders.py");
    assert.ok(block.includes("revision 0  @"));
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2  @"));

    // rev 0 — the originalFile baseline: total/names, no count.
    assert.ok(block.includes("(29 lines)"));
    const rev0Slice = block.slice(0, block.lastIndexOf("\nrevision "));
    assert.ok(rev0Slice.includes("def total("));
    assert.ok(rev0Slice.includes("def names("));
    assert.ok(!/\bdef count\(/.test(rev0Slice), "rev 0 must NOT yet have count()");

    // tip revision — adds count() and is byte-identical to the rendered on-disk file.
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(41 lines)"));
    assert.ok(finalRevision.includes("def count(items):"));
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth("orders.py")),
        "tip revision must byte-match rendered orders.py after stripping line-number prefixes",
    );
});

// C5 — no history is invented for tests/test_orders.py. It has no event in this transcript (written in the
// excluded baseline session), so the verbose output must carry no section for it.
test("test_S39_no_history_for_test_orders", () => {
    const out = runCli([S39_JSONL, "--verbose"]);
    assert.ok(!out.includes("test_orders.py"), "verbose must not render a test_orders.py section");
});
