import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S38_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28–S37 CLI tests.)
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
// end). Needed because each file's EARLIER revisions (write / pre-rename edits / incomplete beacon)
// legitimately carry the OLD terse names — only the FINAL renamed revision must be free of their whole-word
// forms. (Verbatim from the S34/S37 CLI test.)
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// C1 — the default view prints BOTH DAGs. s38 is the MCP twin of S35: the rename SCRIPT (rename_inv.py) is
// itself user-edited. The conversationDAG renders the single prompt then the file-touching turns, including
// the THREE user-edit turns: the script user-edit (rename_inv `#2b4f98a9`), the test user-edit
// (test_inventory `#e61245c5`), and the inventory user-edit (`#059c4112`). The rename ran through the MCP
// sandbox, so its run leaves NO file event — only the beacons/edits surface it. The run is linear (no rewind).
test("test_S38_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S38_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #20f20b89"));
    assert.ok(out.includes("user-edit  rename_inv.py"));
    assert.ok(out.includes("#2b4f98a9"));
    assert.ok(out.includes("user-edit  test_inventory.py"));
    assert.ok(out.includes("#e61245c5"));
    assert.ok(out.includes("user-edit  inventory.py"));
    assert.ok(out.includes("#059c4112"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// C2 — one surviving branch, tip #ef548232, covering all three files; no rewound branch.
test("test_S38_list_branches_single_surviving_three_files", () => {
    const out = runCli([S38_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #ef548232"));
    for (const basename of ["inventory.py", "test_inventory.py", "rename_inv.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// C3 — `--graphFile` node ladders. Each contiguous file block ends at the next file's name, so these
// assertions lock EXACTLY the node count per file: inventory.py 4 (write / edit / MCP-run user-edit /
// post-rename edit), test_inventory.py 2 (write / MCP-run user-edit), rename_inv.py 2 (write / user-edit).
// The S27/S28 incomplete-beacon completions add NO node — their changeId is the blob name, kept out of the
// graphs (spec 40) — so a spurious extra node would break the `\n<next-file>` boundary.
test("test_S38_graphFile_node_ladders", () => {
    const out = runCli([S38_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "inventory.py\n" +
        "  B  write      #01Vmpn95\n" +
        "  D  edit       #01XQ4WRu\n" +
        "  H  user-edit  #059c4112\n" +
        "  I  edit       #01Sx957i\n" +
        "test_inventory.py",
    ));
    assert.ok(out.includes(
        "test_inventory.py\n" +
        "  C  write      #01Xm8JFF\n" +
        "  G  user-edit  #e61245c5\n" +
        "rename_inv.py",
    ));
    assert.ok(out.includes(
        "rename_inv.py\n" +
        "  E  write      #017mv9f8\n" +
        "  F  user-edit  #2b4f98a9",
    ));
});

// C4 — verbose inventory.py. A 4-revision history (0..3, no revision 4). The FINAL revision 3 (229 lines) is
// the post-MCP-run edit replayed on top of the renamed state. It carries the renamed defs and has NO
// whole-word OLD terse name (those live only in the pre-rename revisions, so the check is scoped to the
// final-revision slice). The unrenamed `find_item` / `tot_value` are KEPT names (not in RENAMES).
test("test_S38_verbose_inventory_four_revisions_final_renamed", () => {
    const block = fileVerboseBlock(runCli([S38_JSONL, "--verbose"]), "/inventory.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(!block.includes("revision 4  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(229 lines)"));
    assert.ok(finalRevision.includes("def check_quantity("));
    assert.ok(finalRevision.includes("def insert_item("));
    assert.ok(finalRevision.includes("def remove_item("));
    assert.ok(!/\bqty_chk\b/.test(finalRevision));
    assert.ok(!/\badd_item\b/.test(finalRevision));
    assert.ok(!/\brm_item\b/.test(finalRevision));
});

// C5 — verbose test_inventory.py. A 3-revision history (0..2, no revision 3): revision 1 (50 lines) is the
// incomplete MCP-run beacon, completed to revision 2 (74 lines) via the existing S27/S28 rescue. The FINAL
// revision calls the NEW name `inventory.check_quantity(` (revision 0 still shows the old `qty_chk`, hence
// the final scoping).
test("test_S38_verbose_test_file_renamed", () => {
    const block = fileVerboseBlock(runCli([S38_JSONL, "--verbose"]), "/tests/test_inventory.py");
    assert.ok(block.includes("revision 2  @"));
    assert.ok(!block.includes("revision 3  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(74 lines)"));
    assert.ok(finalRevision.includes("inventory.check_quantity("));
    assert.ok(!/\bqty_chk\b/.test(finalRevision));
    assert.ok(!/\badd_item\b/.test(finalRevision));
    assert.ok(!/\brm_item\b/.test(finalRevision));
});

// C6 — verbose rename_inv.py (the user-edited rename SCRIPT itself). A 3-revision ladder: revision 0
// (45 lines, write), revision 1 (17 lines, the incomplete user-edit beacon), revision 2 (47 lines, completed
// via the S27/S28 rescue). The FINAL revision records the whole-word substitution form — the INLINE
// `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` (NOT s37's precompiled two-line form) — and the
// RENAMES tuples for all three pairs.
test("test_S38_verbose_rename_script_three_revisions_final", () => {
    const block = fileVerboseBlock(runCli([S38_JSONL, "--verbose"]), "/rename_inv.py");
    assert.ok(block.includes("revision 0  @"));
    assert.ok(block.includes("(45 lines)"));
    assert.ok(block.includes("revision 1  @"));
    assert.ok(block.includes("(17 lines)"));
    assert.ok(block.includes("revision 2  @"));
    assert.ok(block.includes("(47 lines)"));
    assert.ok(!block.includes("revision 3  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes(`("qty_chk", "check_quantity")`));
    assert.ok(finalRevision.includes(`("add_item", "insert_item")`));
    assert.ok(finalRevision.includes(`("rm_item", "remove_item")`));
    assert.ok(
        finalRevision.includes(String.raw`text = re.sub(r"\b" + re.escape(old) + r"\b", new, text)`),
        "rename_inv missing inline re.sub line",
    );
});
