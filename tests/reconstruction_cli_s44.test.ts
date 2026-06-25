import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCli } from "../src/reconstruction_cli.ts";
import { S44_JSONL } from "./fixtures.ts";

// s44 = the `git-baseline` family with the script-rename running MID-STREAM, the twist relative to s42/s43 where
// the rename lived in the EXCLUDED baseline. `--excludeJSONL` fires at step 4 — BEFORE the rename script exists —
// so this transcript opens with the full rename machinery present: `rename_inv.py` is Written (one tuple
// qty_chk→check_quantity) then takes 2 USER edits (add_item→insert_item, rm_item→remove_item), the MCP sandbox
// runs it, and only afterwards does `inventory.py` take four edits (Claude `restock`, Claude `reorder`, a user
// edit appending `# reviewed by ops`, Claude `shrink`). So BOTH files reconstruct here: `rename_inv.py` (38-line
// tip) and `inventory.py` (264-line tip). The MCP rename leaves NO `inventory.py` DAG node — its effect surfaces
// only because rev 0 of `inventory.py` (175 lines) is seeded from the file-history backup taken AFTER the rename
// ran, so rev 0 already carries the post-rename names (check_quantity / insert_item / remove_item) with no rename
// replay (reader-DEPENDENT, same as s42/s43). NOTE: unlike s43 there is NO `low_stock` anywhere in s44, and —
// unlike s43 — `restock` IS present (it is a mid-stream edit here, not a pre-backup baseline func). The rendered
// ground-truth files sit in the same local executed dir S44_JSONL points at, so the byte-compares stay
// cross-source checks (engine-reconstructed tip vs independently rendered artifact).
const S44_GT =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s44-git-baseline-then-rename";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S44_GT}/${relativePath}`, "utf8");
}

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// (Verbatim from the S28–S43 CLI tests.)
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

// C1 — default view prints BOTH DAGs. s44's mid-stream transcript carries the full rename machinery, so the
// conversationDAG is the lone prompt followed by a SIX-node ladder: rename_inv.py is written (B) then user-edited
// (C); inventory.py then takes four edits — restock (D), reorder (E), `# reviewed by ops` user-edit (F),
// shrink (G). It is linear (no rewind). `tests/test_inventory.py` is only ever renamed by the script and never
// separately edited, so it must appear NOWHERE. There is NO `low_stock` in s44 (it does not exist in this
// scenario), so the old terse names from the pre-rename baseline must also be absent from inventory.py's history.
test("test_S44_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S44_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #9e222129"));
    assert.ok(out.includes(
        "  B  write      rename_inv.py  #01P7yUwh\n" +
        "  C  user-edit  rename_inv.py  #37df4213\n" +
        "  D  edit       inventory.py   #012m36TL\n" +
        "  E  edit       inventory.py   #01V7qRzW\n" +
        "  F  user-edit  inventory.py   #7b942a81\n" +
        "  G  edit       inventory.py   #01XWh7Ph",
    ));
    assert.ok(!out.includes("branch ")); // linear — no rewind
    assert.ok(!out.includes("test_inventory.py"), "test_inventory.py must not be reconstructed");
    assert.ok(!out.includes("low_stock"), "low_stock does not exist anywhere in s44");
});

// C2 — one surviving branch, tip #974a065f, BOTH files (rename_inv.py + inventory.py); no rewound branch and no
// test file. The two-file branch tip is the s44 distinction vs s43 (which lists inventory.py alone).
test("test_S44_list_branches_single_surviving_two_files", () => {
    const out = runCli([S44_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #974a065f"));
    assert.ok(out.includes("rename_inv.py"));
    assert.ok(out.includes("inventory.py"));
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("test_inventory.py"));
});

// C3 — `--graphFile` per-file node ladders. rename_inv.py has TWO nodes (write B, user-edit C); inventory.py has
// FOUR (edit D restock, edit E reorder, user-edit F `# reviewed by ops`, edit G shrink) — in order. Neither has a
// node for the MCP rename (it leaves no DAG node) nor for the never-edited test file.
test("test_S44_graphFile_two_file_ladders", () => {
    const out = runCli([S44_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "rename_inv.py\n" +
        "  B  write      #01P7yUwh\n" +
        "  C  user-edit  #37df4213",
    ));
    assert.ok(out.includes(
        "inventory.py\n" +
        "  D  edit       #012m36TL\n" +
        "  E  edit       #01V7qRzW\n" +
        "  F  user-edit  #7b942a81\n" +
        "  G  edit       #01XWh7Ph",
    ));
    assert.ok(!out.includes("test_inventory.py"), "no node for the never-edited test file");
});

// C4 — verbose rename_inv.py. A 3-revision history (0..2): rev 0 (36 lines, the Write of the one-tuple script),
// rev 1 (16 lines) and rev 2 (38 lines, the tip) from the two USER edits that append the other two rename tuples
// and the apply/main scaffolding. The tip byte-matches the rendered on-disk rename_inv.py after stripping the
// `  N | ` prefixes. This whole file is the s44-specific addition — s43 has no mid-stream rename_inv.py.
test("test_S44_verbose_rename_inv_three_revisions_tip_byte_matches", () => {
    const block = fileVerboseBlock(runCli([S44_JSONL, "--verbose"]), "/rename_inv.py");
    for (const revisionNumber of [0, 1, 2]) {
        assert.ok(block.includes(`revision ${revisionNumber}  @`), `missing revision ${revisionNumber}`);
    }
    assert.ok(!block.includes("revision 3  @"), "must stop at revision 2 (the tip)");
    for (const lineCount of ["(36 lines)", "(16 lines)", "(38 lines)"]) {
        assert.ok(block.includes(lineCount), `missing ${lineCount}`);
    }

    // tip (rev 2) — carries all three rename tuples and byte-matches the rendered file.
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(38 lines)"));
    for (const pair of ['("qty_chk", "check_quantity")', '("add_item", "insert_item")', '("rm_item", "remove_item")']) {
        assert.ok(finalRevision.includes(pair), `tip must carry rename tuple ${pair}`);
    }
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth("rename_inv.py")),
        "rename_inv.py tip must byte-match the rendered file after stripping line-number prefixes",
    );
});

// C5 — verbose inventory.py. A 5-revision history (0..4, no revision 5). Monotonic full-state ladder:
// rev 0 (175, backup-seeded post-rename baseline) → rev 1 (206, D: restock) → rev 2 (241, E: reorder) →
// rev 3 (242, F: `# reviewed by ops`) → rev 4 (264, the tip: shrink). rev 0 carries the FIVE post-rename baseline
// funcs (check_quantity / insert_item / remove_item / find_item / tot_value) and NONE of the later edits — and
// crucially NO low_stock (it does not exist in s44). The tip (rev 4) byte-matches the rendered on-disk
// inventory.py after stripping the `  N | ` prefixes, and — unlike s43 — restock IS part of that tip.
test("test_S44_verbose_inventory_five_revisions_tip_byte_matches", () => {
    const block = fileVerboseBlock(runCli([S44_JSONL, "--verbose"]), "/inventory.py");
    for (const revisionNumber of [0, 1, 2, 3, 4]) {
        assert.ok(block.includes(`revision ${revisionNumber}  @`), `missing revision ${revisionNumber}`);
    }
    assert.ok(!block.includes("revision 5  @"), "must stop at revision 4 (the tip)");

    // Full-state ladder line counts.
    for (const lineCount of ["(175 lines)", "(206 lines)", "(241 lines)", "(242 lines)", "(264 lines)"]) {
        assert.ok(block.includes(lineCount), `missing ${lineCount}`);
    }

    // rev 0 — the backup-seeded baseline: the five post-rename funcs, none of the later edits, no low_stock.
    const rev0 = revisionSlice(block, 0);
    assert.ok(rev0.includes("(175 lines)"));
    for (const fn of ["check_quantity", "insert_item", "remove_item", "find_item", "tot_value"]) {
        assert.ok(new RegExp(`\\bdef ${fn}\\(`).test(rev0), `rev 0 must have ${fn}()`);
    }
    assert.ok(!/\bdef restock\(/.test(rev0), "rev 0 must NOT yet have restock()");
    assert.ok(!/\bdef reorder\(/.test(rev0), "rev 0 must NOT yet have reorder()");
    assert.ok(!/\bdef shrink\(/.test(rev0), "rev 0 must NOT yet have shrink()");
    assert.ok(!rev0.includes("# reviewed by ops"), "rev 0 precedes the user edit");
    assert.ok(!rev0.includes("low_stock"), "low_stock does not exist in s44");
    // rev 0 carries the POST-rename names only — the pre-rename terse names must be gone.
    assert.ok(!/\bdef qty_chk\(/.test(rev0), "rev 0 must carry the post-rename names, not qty_chk");

    // rev 1 — restock added; no reorder/shrink/comment yet.
    const rev1 = revisionSlice(block, 1);
    assert.ok(rev1.includes("(206 lines)"));
    assert.ok(/\bdef restock\(/.test(rev1), "rev 1 adds restock()");
    assert.ok(!/\bdef reorder\(/.test(rev1), "rev 1 precedes reorder()");

    // rev 2 — reorder added; no comment, no shrink yet.
    const rev2 = revisionSlice(block, 2);
    assert.ok(rev2.includes("(241 lines)"));
    assert.ok(/\bdef reorder\(/.test(rev2), "rev 2 adds reorder()");
    assert.ok(!rev2.includes("# reviewed by ops"), "rev 2 precedes the user edit");
    assert.ok(!/\bdef shrink\(/.test(rev2), "rev 2 precedes shrink()");

    // rev 3 — the user edit appends `# reviewed by ops`; shrink not yet present.
    const rev3 = revisionSlice(block, 3);
    assert.ok(rev3.includes("(242 lines)"));
    assert.ok(rev3.includes("# reviewed by ops"));
    assert.ok(!/\bdef shrink\(/.test(rev3), "rev 3 precedes shrink()");

    // tip revision (rev 4) — shrink added, comment kept, restock retained, byte-identical to file.
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(264 lines)"));
    assert.ok(/\bdef shrink\(/.test(finalRevision), "tip adds shrink()");
    assert.ok(/\bdef restock\(/.test(finalRevision), "tip retains restock() (present mid-stream in s44)");
    assert.ok(finalRevision.includes("# reviewed by ops"));
    assert.ok(!finalRevision.includes("low_stock"), "tip must NOT have low_stock");
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth("inventory.py")),
        "tip revision must byte-match rendered inventory.py after stripping line-number prefixes",
    );
});

// C6 — no history is invented for tests/test_inventory.py. It is renamed by the script but never separately
// edited in this transcript, so the verbose output must carry no `### …` SECTION for it. (The bare string does
// occur once — inside `rename_inv.py`'s docstring "…renames to inventory.py and tests/test_inventory.py" — which
// is exactly why a whole-output substring check would be wrong here; we assert the absence of a file section.)
test("test_S44_no_history_for_test_inventory", () => {
    const out = runCli([S44_JSONL, "--verbose"]);
    const hasSection = out
        .split("\n")
        .some((line) => line.startsWith("### ") && line.endsWith("test_inventory.py"));
    assert.ok(!hasSection, "verbose must not render a test_inventory.py file section");
});
