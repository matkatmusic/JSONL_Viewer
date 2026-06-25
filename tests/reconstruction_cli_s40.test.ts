import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCli } from "../src/reconstruction_cli.ts";
import { S40_JSONL } from "./fixtures.ts";

// s40 = s39 + two interleaved USER edits on `orders.py`. The rendered ground-truth `orders.py` sits in the
// same local executed dir S40_JSONL points at; the engine reconstructs the tip from the JSONL transcript
// while this file is the independently rendered artifact, so the byte-compare below stays a cross-source check.
const S40_GT =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s40-git-baseline-user-edits";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S40_GT}/${relativePath}`, "utf8");
}

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// (Verbatim from the S28–S39 CLI tests.)
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

// Slice the LAST revision out of a file's verbose block (from its last `revision N  @` line to the block end).
// For s40 that is the tip revision 6 — the 55-line state ending in both appended comments. (Verbatim from s39.)
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// Slice a SPECIFIC revision N out of a verbose block: from its `revision N  @` line to the next `revision `
// marker or block end. Lets each interleaved edit's state be checked independently.
function revisionSlice(block: string, revisionNumber: number): string {
    const marker = `revision ${revisionNumber}  @`;
    const start = block.indexOf(marker);
    assert.ok(start >= 0, `no revision ${revisionNumber} in block`);
    const nextMarker = block.indexOf("\nrevision ", start + marker.length);
    const end = nextMarker >= 0 ? nextMarker : block.length;
    return block.slice(start, end);
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

// C1 — default view prints BOTH DAGs. s40's transcript opens MID-STREAM (the `--excludeJSONL` respawn dropped
// the baseline session), so the conversationDAG is the lone prompt and a linear 4-node ladder on orders.py:
// B edit → C user-edit → D edit → E user-edit. No rewind/branch. `tests/test_orders.py` was written in the
// excluded baseline session and never touched here, so it must appear NOWHERE.
test("test_S40_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S40_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #e84ca6bc"));
    assert.ok(out.includes(
        "  B  edit       orders.py  #0112WZX4\n" +
        "  C  user-edit  orders.py  #9a3cae75\n" +
        "  D  edit       orders.py  #017v7Ebf\n" +
        "  E  user-edit  orders.py  #450a2098",
    ));
    assert.ok(!out.includes("branch ")); // linear — no rewind
    assert.ok(!out.includes("test_orders.py"), "test_orders.py must not be reconstructed");
});

// C2 — one surviving branch, tip #86c30c1a, single file orders.py; no rewound branch and no test file.
test("test_S40_list_branches_single_surviving_one_file", () => {
    const out = runCli([S40_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #86c30c1a"));
    assert.ok(out.includes("orders.py"));
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("test_orders.py"));
});

// C3 — `--graphFile` node ladder. orders.py has EXACTLY FOUR nodes — the two Claude `edit`s (B, D) and the two
// `user-edit`s (C, E) — in order. There is NO `write` node: the transcript opens mid-stream with the first
// Edit, and the engine seeds rev 0 purely from that Edit's `toolUseResult.originalFile`.
test("test_S40_graphFile_four_node_ladder", () => {
    const out = runCli([S40_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "orders.py\n" +
        "  B  edit       #0112WZX4\n" +
        "  C  user-edit  #9a3cae75\n" +
        "  D  edit       #017v7Ebf\n" +
        "  E  user-edit  #450a2098",
    ));
    assert.ok(!out.includes("write"), "no write node — rev 0 is originalFile-seeded, not an observed write");
});

// C4 — verbose orders.py. A 7-revision history (0..6, no revision 7). The full-state ladder is monotonic:
// rev 0 (28, originalFile baseline) → rev 1 (40, B: count) → rev 3 (41, C: `# reviewed by ops`) →
// rev 4 (54, D: subtotal) → rev 6 (55, E: `# checked`, the tip). rev 2 and rev 5 are the 9-line user-edit
// partial-echo snapshots (the tail window ending in the appended comment) — EXPECTED, not a defect. The tip
// (rev 6) byte-matches the rendered on-disk orders.py after stripping the `  N | ` prefixes.
test("test_S40_verbose_orders_seven_revisions_tip_byte_matches", () => {
    const block = fileVerboseBlock(runCli([S40_JSONL, "--verbose"]), "/orders.py");
    for (const revisionNumber of [0, 1, 2, 3, 4, 5, 6]) {
        assert.ok(block.includes(`revision ${revisionNumber}  @`), `missing revision ${revisionNumber}`);
    }
    assert.ok(!block.includes("revision 7  @"), "must stop at revision 6 (the tip)");

    // Full-state ladder line counts.
    for (const lineCount of ["(28 lines)", "(40 lines)", "(41 lines)", "(54 lines)", "(55 lines)"]) {
        assert.ok(block.includes(lineCount), `missing ${lineCount}`);
    }

    // rev 0 — the originalFile baseline: total/names, no count yet.
    const rev0 = revisionSlice(block, 0);
    assert.ok(rev0.includes("(28 lines)"));
    assert.ok(rev0.includes("def total("));
    assert.ok(rev0.includes("def names("));
    assert.ok(!/\bdef count\(/.test(rev0), "rev 0 must NOT yet have count()");

    // rev 2 and rev 5 are the 9-line partial-echo snapshots of the two user edits.
    const rev2 = revisionSlice(block, 2);
    assert.ok(rev2.includes("(9 lines)"));
    assert.ok(rev2.includes("# reviewed by ops"));
    assert.ok(!rev2.includes("# checked"), "rev 2 echoes only the FIRST user edit");
    const rev5 = revisionSlice(block, 5);
    assert.ok(rev5.includes("(9 lines)"));
    assert.ok(rev5.includes("# checked"), "rev 5 echoes the SECOND user edit");

    // rev 3 — first user edit applied to full state: carries `# reviewed by ops`, NOT yet `# checked`.
    const rev3 = revisionSlice(block, 3);
    assert.ok(rev3.includes("(41 lines)"));
    assert.ok(rev3.includes("# reviewed by ops"));
    assert.ok(!rev3.includes("# checked"), "rev 3 precedes the second user edit");

    // tip revision (rev 6) — both comments appended, subtotal present, byte-identical to the rendered file.
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(55 lines)"));
    assert.ok(finalRevision.includes("# checked"));
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth("orders.py")),
        "tip revision must byte-match rendered orders.py after stripping line-number prefixes",
    );
});

// C5 — no history is invented for tests/test_orders.py. It has no event in this transcript (written in the
// excluded baseline session), so the verbose output must carry no section for it.
test("test_S40_no_history_for_test_orders", () => {
    const out = runCli([S40_JSONL, "--verbose"]);
    assert.ok(!out.includes("test_orders.py"), "verbose must not render a test_orders.py section");
});
