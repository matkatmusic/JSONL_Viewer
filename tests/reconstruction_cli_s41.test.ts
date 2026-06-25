import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCli } from "../src/reconstruction_cli.ts";
import { S41_JSONL } from "./fixtures.ts";

// s41 = s40 + a mid-stream `git commit "wip"` between the two interleaved USER edits on `orders.py`. The commit
// is INERT (the `git add`/`commit`/`log` Bash records carry no file events), and the scenario's `subtotal`
// step never executed — so s41's tip is a 43-line `orders.py` (count + both appended comments, no subtotal),
// a SHORTER ladder than s40. The rendered ground-truth `orders.py` sits in the same local executed dir
// S41_JSONL points at; the engine reconstructs the tip from the JSONL transcript while this file is the
// independently rendered artifact, so the byte-compare below stays a cross-source check.
const S41_GT =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s41-git-baseline-mid-commit";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S41_GT}/${relativePath}`, "utf8");
}

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// (Verbatim from the S28–S40 CLI tests.)
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
// For s41 that is the tip revision 3 — the 43-line state ending in both appended comments. (Verbatim from s40.)
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

// C1 — default view prints BOTH DAGs. s41's transcript opens MID-STREAM (the `--excludeJSONL` respawn dropped
// the baseline session), so the conversationDAG is the lone prompt and a linear TWO-node ladder on orders.py:
// B edit (count) → C user-edit (`# reviewed by ops`). The second user edit (`# checked`) is NOT a separate
// node — it lives nowhere in the JSONL and the engine folds it into C via the file-history backup. The
// mid-stream `git commit` produces no node. `tests/test_orders.py` was written in the excluded baseline
// session and never touched here, so it must appear NOWHERE.
test("test_S41_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S41_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #f4131b49"));
    assert.ok(out.includes(
        "  B  edit       orders.py  #01Rw572a\n" +
        "  C  user-edit  orders.py  #a72dd041",
    ));
    assert.ok(!out.includes("branch ")); // linear — no rewind
    assert.ok(!out.includes("test_orders.py"), "test_orders.py must not be reconstructed");
    assert.ok(!out.includes("subtotal"), "the subtotal step never executed — no subtotal anywhere");
});

// C2 — one surviving branch, tip #fbd57365, single file orders.py; no rewound branch and no test file.
test("test_S41_list_branches_single_surviving_one_file", () => {
    const out = runCli([S41_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #fbd57365"));
    assert.ok(out.includes("orders.py"));
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("test_orders.py"));
});

// C3 — `--graphFile` node ladder. orders.py has EXACTLY TWO nodes — the Claude `edit` (B, count) and the
// `user-edit` (C, `# reviewed by ops`) — in order. There is NO `write` node: the transcript opens mid-stream
// with the first Edit, and the engine seeds rev 0 purely from that Edit's `toolUseResult.originalFile`.
test("test_S41_graphFile_two_node_ladder", () => {
    const out = runCli([S41_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "orders.py\n" +
        "  B  edit       #01Rw572a\n" +
        "  C  user-edit  #a72dd041",
    ));
    assert.ok(!out.includes("write"), "no write node — rev 0 is originalFile-seeded, not an observed write");
});

// C4 — verbose orders.py. A 4-revision history (0..3, no revision 4). The full-state ladder is monotonic:
// rev 0 (29, originalFile baseline) → rev 1 (41, B: count) → rev 3 (43, the tip: both comments, no subtotal).
// rev 2 is the 9-line user-edit partial-echo snapshot (the tail window ending in `# reviewed by ops`) —
// EXPECTED, not a defect. The tip (rev 3) byte-matches the rendered on-disk orders.py after stripping the
// `  N | ` prefixes. The second user edit (`# checked`) and the count are both present, the subtotal is not.
test("test_S41_verbose_orders_four_revisions_tip_byte_matches", () => {
    const block = fileVerboseBlock(runCli([S41_JSONL, "--verbose"]), "/orders.py");
    for (const revisionNumber of [0, 1, 2, 3]) {
        assert.ok(block.includes(`revision ${revisionNumber}  @`), `missing revision ${revisionNumber}`);
    }
    assert.ok(!block.includes("revision 4  @"), "must stop at revision 3 (the tip)");

    // Full-state + partial-echo ladder line counts.
    for (const lineCount of ["(29 lines)", "(41 lines)", "(9 lines)", "(43 lines)"]) {
        assert.ok(block.includes(lineCount), `missing ${lineCount}`);
    }

    // rev 0 — the originalFile baseline: total/names, no count yet.
    const rev0 = revisionSlice(block, 0);
    assert.ok(rev0.includes("(29 lines)"));
    assert.ok(rev0.includes("def total("));
    assert.ok(rev0.includes("def names("));
    assert.ok(!/\bdef count\(/.test(rev0), "rev 0 must NOT yet have count()");

    // rev 1 — count added, neither user-edit comment yet.
    const rev1 = revisionSlice(block, 1);
    assert.ok(rev1.includes("(41 lines)"));
    assert.ok(/\bdef count\(/.test(rev1), "rev 1 adds count()");
    assert.ok(!rev1.includes("# reviewed by ops"), "rev 1 precedes the first user edit");

    // rev 2 — the 9-line partial-echo snapshot of the FIRST user edit only.
    const rev2 = revisionSlice(block, 2);
    assert.ok(rev2.includes("(9 lines)"));
    assert.ok(rev2.includes("# reviewed by ops"));
    assert.ok(!rev2.includes("# checked"), "rev 2 echoes only the FIRST user edit");

    // tip revision (rev 3) — both comments appended, count present, NO subtotal, byte-identical to the file.
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(43 lines)"));
    assert.ok(finalRevision.includes("# reviewed by ops"));
    assert.ok(finalRevision.includes("# checked"));
    assert.ok(!finalRevision.includes("subtotal"), "the subtotal step never executed — tip has no subtotal");
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth("orders.py")),
        "tip revision must byte-match rendered orders.py after stripping line-number prefixes",
    );
});

// C5 — no history is invented for tests/test_orders.py. It has no event in this transcript (written in the
// excluded baseline session), so the verbose output must carry no section for it.
test("test_S41_no_history_for_test_orders", () => {
    const out = runCli([S41_JSONL, "--verbose"]);
    assert.ok(!out.includes("test_orders.py"), "verbose must not render a test_orders.py section");
});
