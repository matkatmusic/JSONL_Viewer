import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCli } from "../src/reconstruction_cli.ts";
import { S42_JSONL } from "./fixtures.ts";

// s42 = the `git-baseline` family composed with an s38-style MCP script-rename IN THE BASELINE. The baseline
// session (write `inventory.py` with terse names, run `rename_inv.py` through the MCP sandbox to rename
// qty_chk→check_quantity / add_item→insert_item / rm_item→remove_item, then `git commit "baseline"`) is
// dropped by `--excludeJSONL`. So this transcript opens MID-STREAM with three `inventory.py` events — Claude
// adds `reorder`, a user edit appends `# reviewed by ops`, Claude adds `shrink` — and the rename machinery is
// never present. rev 0 is seeded from the file-history backup left by the excluded baseline (which already
// carries the post-rename names), which is WHY the renamed identifiers appear with no rename replay here. The
// rendered ground-truth `inventory.py` sits in the same local executed dir S42_JSONL points at; the engine
// reconstructs the tip from the JSONL transcript while this file is the independently rendered artifact, so
// the byte-compare below stays a cross-source check.
const S42_GT =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s42-git-baseline-from-s38";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S42_GT}/${relativePath}`, "utf8");
}

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// (Verbatim from the S28–S41 CLI tests.)
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
// For s42 that is the tip revision 3 — the 191-line state with `shrink` and the `# reviewed by ops` comment.
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// Slice a SPECIFIC revision N out of a verbose block: from its `revision N  @` line to the next `revision `
// marker or block end. Lets each edit's state be checked independently.
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

// C1 — default view prints BOTH DAGs. s42's transcript opens MID-STREAM (the `--excludeJSONL` respawn dropped
// the baseline session that ran the MCP rename), so the conversationDAG is the lone prompt and a linear
// THREE-node ladder on inventory.py: B edit (reorder) → C user-edit (`# reviewed by ops`) → D edit (shrink).
// `tests/test_inventory.py` and `rename_inv.py` were written in the excluded baseline session and never
// touched here, so they must appear NOWHERE. The scenario's `low_stock`/`restock` steps left no trace in the
// executed file or the transcript, so the engine must not invent them.
test("test_S42_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S42_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #09c1efd9"));
    assert.ok(out.includes(
        "  B  edit       inventory.py  #01HyE14A\n" +
        "  C  user-edit  inventory.py  #6a022912\n" +
        "  D  edit       inventory.py  #01SNebUt",
    ));
    assert.ok(!out.includes("branch ")); // linear — no rewind
    assert.ok(!out.includes("test_inventory.py"), "test_inventory.py must not be reconstructed");
    assert.ok(!out.includes("rename_inv.py"), "the rename script lived in the excluded baseline — no node");
    assert.ok(!/\blow_stock\b/.test(out), "low_stock never executed — no low_stock anywhere");
    assert.ok(!/\brestock\b/.test(out), "restock never executed — no restock anywhere");
});

// C2 — one surviving branch, tip #a017b766, single file inventory.py; no rewound branch and no test file.
test("test_S42_list_branches_single_surviving_one_file", () => {
    const out = runCli([S42_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #a017b766"));
    assert.ok(out.includes("inventory.py"));
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("test_inventory.py"));
});

// C3 — `--graphFile` node ladder. inventory.py has EXACTLY THREE nodes — Claude `edit` (B, reorder),
// `user-edit` (C, `# reviewed by ops`), Claude `edit` (D, shrink) — in order. There is NO `write` node: the
// transcript opens mid-stream and rev 0 is seeded from the file-history backup, not an observed write.
test("test_S42_graphFile_three_node_ladder", () => {
    const out = runCli([S42_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "inventory.py\n" +
        "  B  edit       #01HyE14A\n" +
        "  C  user-edit  #6a022912\n" +
        "  D  edit       #01SNebUt",
    ));
    assert.ok(!out.includes("write"), "no write node — rev 0 is backup-seeded, not an observed write");
});

// C4 — verbose inventory.py. A 4-revision history (0..3, no revision 4). The full-state ladder is monotonic:
// rev 0 (145, backup-seeded baseline) → rev 1 (173, B: reorder) → rev 2 (174, C: `# reviewed by ops`) →
// rev 3 (191, the tip: shrink + the comment). rev 0 carries the five baseline funcs under their post-rename
// names; `low_stock`/`restock` appear in NO revision. The tip (rev 3) byte-matches the rendered on-disk
// inventory.py after stripping the `  N | ` prefixes.
test("test_S42_verbose_inventory_four_revisions_tip_byte_matches", () => {
    const block = fileVerboseBlock(runCli([S42_JSONL, "--verbose"]), "/inventory.py");
    for (const revisionNumber of [0, 1, 2, 3]) {
        assert.ok(block.includes(`revision ${revisionNumber}  @`), `missing revision ${revisionNumber}`);
    }
    assert.ok(!block.includes("revision 4  @"), "must stop at revision 3 (the tip)");

    // Full-state ladder line counts.
    for (const lineCount of ["(145 lines)", "(173 lines)", "(174 lines)", "(191 lines)"]) {
        assert.ok(block.includes(lineCount), `missing ${lineCount}`);
    }

    // rev 0 — the backup-seeded baseline: five post-rename funcs, none of the later additions.
    const rev0 = revisionSlice(block, 0);
    assert.ok(rev0.includes("(145 lines)"));
    for (const fn of ["check_quantity", "insert_item", "remove_item", "find_item", "tot_value"]) {
        assert.ok(new RegExp(`\\bdef ${fn}\\(`).test(rev0), `rev 0 must have ${fn}()`);
    }
    assert.ok(!/\bdef reorder\(/.test(rev0), "rev 0 must NOT yet have reorder()");
    assert.ok(!/\bdef shrink\(/.test(rev0), "rev 0 must NOT yet have shrink()");
    assert.ok(!rev0.includes("# reviewed by ops"), "rev 0 precedes the user edit");
    assert.ok(!/\blow_stock\b/.test(rev0), "rev 0 must NOT have low_stock");
    assert.ok(!/\brestock\b/.test(rev0), "rev 0 must NOT have restock");

    // rev 1 — reorder added, no comment, no shrink yet.
    const rev1 = revisionSlice(block, 1);
    assert.ok(rev1.includes("(173 lines)"));
    assert.ok(/\bdef reorder\(/.test(rev1), "rev 1 adds reorder()");
    assert.ok(!/\bdef shrink\(/.test(rev1), "rev 1 precedes shrink()");
    assert.ok(!rev1.includes("# reviewed by ops"), "rev 1 precedes the user edit");

    // rev 2 — the user edit appends `# reviewed by ops`; shrink not yet present.
    const rev2 = revisionSlice(block, 2);
    assert.ok(rev2.includes("(174 lines)"));
    assert.ok(rev2.includes("# reviewed by ops"));
    assert.ok(!/\bdef shrink\(/.test(rev2), "rev 2 precedes shrink()");

    // tip revision (rev 3) — shrink added, comment kept, NO low_stock/restock, byte-identical to the file.
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(191 lines)"));
    assert.ok(/\bdef shrink\(/.test(finalRevision), "tip adds shrink()");
    assert.ok(finalRevision.includes("# reviewed by ops"));
    assert.ok(!/\blow_stock\b/.test(finalRevision), "tip must NOT have low_stock");
    assert.ok(!/\brestock\b/.test(finalRevision), "tip must NOT have restock");
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth("inventory.py")),
        "tip revision must byte-match rendered inventory.py after stripping line-number prefixes",
    );
});

// C5 — no history is invented for tests/test_inventory.py or rename_inv.py. Neither has an event in this
// transcript (both written in the excluded baseline session), so the verbose output must carry no section
// for either.
test("test_S42_no_history_for_test_inventory", () => {
    const out = runCli([S42_JSONL, "--verbose"]);
    assert.ok(!out.includes("test_inventory.py"), "verbose must not render a test_inventory.py section");
    assert.ok(!out.includes("rename_inv.py"), "verbose must not render a rename_inv.py section");
});
