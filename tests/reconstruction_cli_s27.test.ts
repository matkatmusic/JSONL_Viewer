import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S27_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches
// a sibling file's revision line.
function fileVerboseBlock(out: string, suffix: string): string {
    const lines = out.split("\n");
    const start = lines.findIndex((l) => l.startsWith("### ") && l.endsWith(suffix));
    assert.ok(start >= 0, `no verbose section for ${suffix}`);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i]!.startsWith("### ")) { end = i; break; }
    }
    return lines.slice(start, end).join("\n");
}

// The real CLI builds the real sidecar reader, so test_inventory.py reconstructs correctly (its
// truncated terminal beacon is completed from the @v3 backup). The default conversationDAG renders the
// two `edited_text_file` beacons (one per rewritten file) as user-edit turns J/K sitting after the
// Claude edits; the run is linear (no rewind branch header). Locks §2.2 / §7.
test("test_S27_default_conversationDAG_shows_two_script_rename_user_edits", () => {
    const out = runCli([S27_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #c6902dc9"));
    assert.ok(out.includes("  J  user-edit  test_inventory.py  #51c639d6"));
    assert.ok(out.includes("  K  user-edit  inventory.py       #a39c4731"));
    assert.ok(out.includes("  L  edit       inventory.py       #019bUxnm"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The default fileDAG groups each file's events. The synthetic `overwrite` backup-seed is a revision,
// NOT a DAG node, so only the two real test_inventory.py events appear under it. Locks §2.2 / §7.
test("test_S27_default_fileDAG_groups_each_file_events", () => {
    const out = runCli([S27_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "inventory.py\n  B  write      #01F1ak6s\n  D  edit       #0165ozUN\n  E  edit       #01JHJMST\n  K  user-edit  #a39c4731\n  L  edit       #019bUxnm",
    ));
    assert.ok(out.includes("test_inventory.py\n  C  write      #0174GG2e\n  J  user-edit  #51c639d6"));
    assert.ok(out.includes(
        "rename_inv.py\n  F  write      #01UsLhRt\n  G  edit       #01KDtXgZ\n  H  edit       #01VHgCTm\n  I  edit       #01QV5EdK",
    ));
});

// list-branches: one surviving branch (tip #7e94e313) over the three files, no rewound branch.
// Locks §2.6 / §7.
test("test_S27_list_branches_single_surviving_three_files", () => {
    const out = runCli([S27_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #7e94e313"));
    for (const f of ["inventory.py", "test_inventory.py", "rename_inv.py"]) {
        assert.ok(out.includes(f), `missing ${f}`);
    }
    assert.ok(!out.includes("rewound"));
});

// verbose inventory.py: exactly six revisions (0..5). The terse pre-rename revisions legitimately still
// contain `def qty_chk(` etc., so the rename lock must be scoped to the FINAL revision (revision 5),
// which is fully renamed and carries the post-run `restock` addition. Locks §2.3 (inventory) / §7.
test("test_S27_verbose_inventory_six_revisions_renamed_with_restock", () => {
    const block = fileVerboseBlock(runCli([S27_JSONL, "--surviving", "--verbose"]), "/inventory.py");
    assert.ok(block.includes("revision 5  @"));
    assert.ok(!block.includes("revision 6"));            // exactly six
    const finalRev = block.slice(block.indexOf("revision 5  @")); // final rendered revision only
    assert.ok(finalRev.includes("| def check_quantity(") && finalRev.includes("| def insert_item("));
    assert.ok(finalRev.includes("| def remove_item(") && finalRev.includes("| def restock("));
    assert.ok(!finalRev.includes("| def qty_chk(") && !finalRev.includes("| def rm_item("));
});

// THE CRUX, rendered: verbose tests/test_inventory.py has exactly three revisions (0..2). The terminal
// truncated beacon (revision 1, 50 lines) is completed by the `overwrite` backup-seed (revision 2,
// 73 lines), so the FINAL block shows the COMPLETE file — the renamed `check_quantity` call and the
// four `test_tot_value_*` functions that live past the truncation point. WITHOUT the fix the file would
// stop at revision 1 and those functions would be absent. Locks §2.3 (test_inventory) / §2.4 / §7.
test("test_S27_verbose_test_inventory_three_revisions_overwrite_completes_file", () => {
    const block = fileVerboseBlock(runCli([S27_JSONL, "--surviving", "--verbose"]), "/test_inventory.py");
    assert.ok(block.includes("revision 2  @"));
    assert.ok(!block.includes("revision 3"));            // exactly three (write, beacon, overwrite)
    const finalRev = block.slice(block.indexOf("revision 2  @")); // the completed overwrite
    assert.ok(finalRev.includes("check_quantity"));      // renamed call (terse rev0 had qty_chk)
    for (const fn of [
        "def test_tot_value_single_item(",
        "def test_tot_value_multiple_items(",
        "def test_tot_value_ignores_extra_keys(",
        "def test_tot_value_missing_price_key_raises(",
    ]) {
        assert.ok(finalRev.includes(fn), `final test_inventory missing restored ${fn}`);
    }
});

// verbose rename_inv.py: exactly five revisions (0..4); the driver script's final text holds all three
// rename pairs as string literals (terse AND renamed names coexist — it maps one to the other).
// Locks §2.3 (rename_inv) / §7.
test("test_S27_verbose_rename_inv_five_revisions_holds_rename_pairs", () => {
    const block = fileVerboseBlock(runCli([S27_JSONL, "--surviving", "--verbose"]), "/rename_inv.py");
    assert.ok(block.includes("revision 4  @"));
    assert.ok(!block.includes("revision 5"));            // exactly five
    const finalRev = block.slice(block.indexOf("revision 4  @"));
    for (const name of ["qty_chk", "check_quantity", "add_item", "insert_item", "rm_item", "remove_item"]) {
        assert.ok(finalRev.includes(name), `rename_inv final missing ${name}`);
    }
});
