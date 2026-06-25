import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S35_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28–S34 CLI tests.)
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
// end). Needed because EARLIER revisions legitimately carry the OLD terse names (pre-rename) — only the
// FINAL renamed revision must be free of their whole-word forms. (Verbatim from the S33/S34 CLI test.)
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// C1 — the default view prints BOTH DAGs. The conversationDAG renders the single prompt then the file-touching
// turns, including the THREE user-edit turns: the coalesced rename-script edit (`#c67cfd9c`) and the two
// script-run `edited_text_file` beacons (inventory `#dbc2e4c1`, test `#f3e90535`). The rename ran through Bash,
// so its run leaves NO file event — only the beacons surface it. The run is linear (no rewind/branch header).
test("test_S35_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S35_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #da499f4e"));
    assert.ok(out.includes("user-edit  rename_inv.py"));
    assert.ok(out.includes("#c67cfd9c"));
    assert.ok(out.includes("user-edit  inventory.py"));
    assert.ok(out.includes("#dbc2e4c1"));
    assert.ok(out.includes("user-edit  test_inventory.py"));
    assert.ok(out.includes("#f3e90535"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// C2 — one surviving branch, tip #72049b4a, covering all three files; no rewound branch.
test("test_S35_list_branches_single_surviving_three_files", () => {
    const out = runCli([S35_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #72049b4a"));
    for (const basename of ["inventory.py", "test_inventory.py", "rename_inv.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// C3 — `--graphFile` node ladders. Each contiguous file block ends at the next file's name, so these
// assertions lock EXACTLY the node count per file: inventory.py 4 (write / `low_stock` edit / script beacon /
// `restock` edit), test_inventory.py 2 (write / script beacon), rename_inv.py 2 (write / coalesced script
// beacon). The synthetic backup completions add NO node — their changeId is the blob name, kept out of the
// graphs (spec 40) — so a spurious extra node would break the `\n<next-file>` boundary.
test("test_S35_graphFile_node_ladders", () => {
    const out = runCli([S35_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "inventory.py\n" +
        "  B  write      #018onbtn\n" +
        "  D  edit       #01QJk3w5\n" +
        "  G  user-edit  #dbc2e4c1\n" +
        "  I  edit       #01WWAP3d\n" +
        "test_inventory.py",
    ));
    assert.ok(out.includes(
        "test_inventory.py\n" +
        "  C  write      #019Dbqca\n" +
        "  H  user-edit  #f3e90535\n" +
        "rename_inv.py",
    ));
    assert.ok(out.includes(
        "rename_inv.py\n" +
        "  E  write      #017SLne6\n" +
        "  F  user-edit  #c67cfd9c",
    ));
});

// C4 — verbose rename_inv.py: the elided-beacon completion as the CLI renders it. A 3-revision history
// (0..2, no revision 3): revision 0 (43 lines, write of the 1-tuple script), revision 1 (17 lines, the
// coalesced steps-4+5 elided fragment), revision 2 (45 lines, the S28 completion from backup `@v2`). The
// final revision carries all three rename tuples and the whole-word string-concat substitution literal.
test("test_S35_verbose_rename_script_three_revisions_completed", () => {
    const block = fileVerboseBlock(runCli([S35_JSONL, "--verbose"]), "/rename_inv.py");
    assert.ok(block.includes("revision 0  @"));
    assert.ok(block.includes("(43 lines)"));
    assert.ok(block.includes("revision 1  @"));
    assert.ok(block.includes("(17 lines)"));
    assert.ok(block.includes("revision 2  @"));
    assert.ok(block.includes("(45 lines)"));
    assert.ok(!block.includes("revision 3  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes('("qty_chk", "check_quantity")'));
    assert.ok(finalRevision.includes('("add_item", "insert_item")'));
    assert.ok(finalRevision.includes('("rm_item", "remove_item")'));
    assert.ok(finalRevision.includes(String.raw`re.sub(r"\b" + re.escape(old) + r"\b", new, text)`));
});

// C5 — verbose test_inventory.py: the truncated-beacon completion (3-revision history 0..2: 79 → 51 → 79).
// The FINAL revision imports the NEW name (`from inventory import check_quantity, tot_value` — `tot_value`
// kept, `qty_chk` renamed) while the method name `def test_qty_chk_less_than_stock(` keeps `qty_chk` as a
// SUBSTRING. So `\bqty_chk\b` is absent from the final revision even though the substring survives.
test("test_S35_verbose_test_file_renamed_with_kept_substring", () => {
    const block = fileVerboseBlock(runCli([S35_JSONL, "--verbose"]), "/tests/test_inventory.py");
    assert.ok(block.includes("revision 0  @"));
    assert.ok(block.includes("(79 lines)"));
    assert.ok(block.includes("revision 1  @"));
    assert.ok(block.includes("(51 lines)"));
    assert.ok(block.includes("revision 2  @"));
    assert.ok(!block.includes("revision 3  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("from inventory import check_quantity, tot_value"));
    assert.ok(finalRevision.includes("def test_qty_chk_less_than_stock("));
    assert.ok(!/\bqty_chk\b/.test(finalRevision));
});

// C6 — verbose inventory.py: completed to a 4-revision history (0..3, no revision 4); the final revision is
// 244 lines and carries every renamed def (`check_quantity` / `insert_item` / `remove_item`), the post-script
// `restock`, and the kept terse names `find_item` / `tot_value`. No OLD whole-word terse name survives in the
// final revision (those live only in earlier pre-rename revisions, hence the final-revision scoping).
test("test_S35_verbose_inventory_final_renamed_and_kept_names", () => {
    const block = fileVerboseBlock(runCli([S35_JSONL, "--verbose"]), "/inventory.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(block.includes("(244 lines)"));
    assert.ok(!block.includes("revision 4  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("def check_quantity("));
    assert.ok(finalRevision.includes("def insert_item("));
    assert.ok(finalRevision.includes("def remove_item("));
    assert.ok(finalRevision.includes("def restock("));
    assert.ok(finalRevision.includes("def find_item("));
    assert.ok(finalRevision.includes("def tot_value("));
    assert.ok(!/\bqty_chk\b/.test(finalRevision));
    assert.ok(!/\badd_item\b/.test(finalRevision));
    assert.ok(!/\brm_item\b/.test(finalRevision));
});
