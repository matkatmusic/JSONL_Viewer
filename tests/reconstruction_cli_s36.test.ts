import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S36_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28–S35 CLI tests.)
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
// FINAL renamed revision must be free of their whole-word forms. (Verbatim from the S33/S34/S35 CLI test.)
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// C1 — the default view prints BOTH DAGs. The conversationDAG renders the single prompt then the file-touching
// turns, including the THREE user-edit turns: the manual renames.csv edit (`#96b40a66`) and the two MCP-run
// `edited_text_file` beacons (billing `#de1f5023`, test `#aecbb827`). The rename ran through the context-mode
// MCP sandbox, so its run leaves NO file event — only the beacons surface it. Linear (no rewind/branch header).
test("test_S36_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S36_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #fdce1bb9"));
    assert.ok(out.includes("user-edit  renames.csv"));
    assert.ok(out.includes("#96b40a66"));
    assert.ok(out.includes("user-edit  billing.py"));
    assert.ok(out.includes("#de1f5023"));
    assert.ok(out.includes("user-edit  test_billing.py"));
    assert.ok(out.includes("#aecbb827"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// C2 — one surviving branch, tip #a7ed17a3, covering all four files; no rewound branch.
test("test_S36_list_branches_single_surviving_four_files", () => {
    const out = runCli([S36_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #a7ed17a3"));
    for (const basename of ["billing.py", "test_billing.py", "renames.csv", "apply_renames.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// C3 — `--graphFile` node ladders. Each contiguous file block ends at the next file's name, so these
// assertions lock EXACTLY the node count per file: billing.py 4 (write / `validate` edit / MCP beacon /
// `reorder` edit), test_billing.py 2 (write / MCP beacon), renames.csv 2 (write / manual user-edit),
// apply_renames.py 1 (write). The MCP run leaves no Edit/Write node of its own — only its beacons surface.
test("test_S36_graphFile_node_ladders", () => {
    const out = runCli([S36_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "billing.py\n" +
        "  B  write      #01TM2Vqi\n" +
        "  D  edit       #01VU5maD\n" +
        "  H  user-edit  #de1f5023\n" +
        "  J  edit       #01MCcReq\n" +
        "test_billing.py",
    ));
    assert.ok(out.includes(
        "test_billing.py\n" +
        "  C  write      #01Qbyi3X\n" +
        "  I  user-edit  #aecbb827\n" +
        "renames.csv",
    ));
    assert.ok(out.includes(
        "renames.csv\n" +
        "  E  write      #01J6kqHe\n" +
        "  F  user-edit  #96b40a66\n" +
        "apply_renames.py",
    ));
    assert.ok(out.includes(
        "apply_renames.py\n" +
        "  G  write      #01HKg84y",
    ));
});

// C4 — verbose billing.py: a 4-revision history (0..3, no revision 4). The FINAL revision is 219 lines and
// carries every renamed def (`calculate_total` / `format_currency` / `check_stock` / `apply_discount`), the
// post-script `reorder`, and the pre-script `validate`. No OLD whole-word terse name survives in the final
// revision (those live only in earlier pre-rename revisions, hence the final-revision scoping). WHOLE-WORD
// HAZARD: `\bapply_disc\b` is absent even though `apply_discount` contains `apply_disc` as a 5× substring.
test("test_S36_verbose_billing_final_revision_renamed", () => {
    const block = fileVerboseBlock(runCli([S36_JSONL, "--verbose"]), "/billing.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(block.includes("(219 lines)"));
    assert.ok(!block.includes("revision 4  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("def calculate_total("));
    assert.ok(finalRevision.includes("def format_currency("));
    assert.ok(finalRevision.includes("def check_stock("));
    assert.ok(finalRevision.includes("def apply_discount("));
    assert.ok(finalRevision.includes("def reorder("));
    assert.ok(finalRevision.includes("def validate("));
    assert.ok(!/\bcalc_tot\b/.test(finalRevision));
    assert.ok(!/\bfmt_money\b/.test(finalRevision));
    assert.ok(!/\bchk_stock\b/.test(finalRevision));
    assert.ok(!/\bapply_disc\b/.test(finalRevision));
});

// C5 — verbose test_billing.py: a 2-revision history (0..1, no revision 2); 50 lines, final imports the NEW
// names. The whole-word rename leaves no `calc_tot`/`fmt_money` in the final revision.
test("test_S36_verbose_test_file_renamed_import", () => {
    const block = fileVerboseBlock(runCli([S36_JSONL, "--verbose"]), "/tests/test_billing.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(block.includes("(50 lines)"));
    assert.ok(!block.includes("revision 2  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("from billing import calculate_total, format_currency"));
    assert.ok(!/\bcalc_tot\b/.test(finalRevision));
    assert.ok(!/\bfmt_money\b/.test(finalRevision));
});

// C6 — verbose renames.csv (the CSV-edit element) + apply_renames.py byte-lock. renames.csv is a 2-revision
// history: revision 0 (4 lines, write of the 3 rows) → revision 1 (5 lines, the manually-appended 4th row
// `chk_stock,check_stock`). apply_renames.py is a single-revision 51-line file carrying the string-concat
// whole-word substitution literal — the driver that applied the renames through the MCP sandbox.
test("test_S36_verbose_renames_csv_user_edit_and_apply_script", () => {
    const out = runCli([S36_JSONL, "--verbose"]);
    const renamesBlock = fileVerboseBlock(out, "/renames.csv");
    assert.ok(renamesBlock.includes("revision 0  @"));
    assert.ok(renamesBlock.includes("(4 lines)"));
    assert.ok(renamesBlock.includes("revision 1  @"));
    assert.ok(renamesBlock.includes("(5 lines)"));
    assert.ok(!renamesBlock.includes("revision 2  @"));
    assert.ok(renamesBlock.includes("chk_stock,check_stock"));
    for (const row of ["calc_tot,calculate_total", "fmt_money,format_currency", "apply_disc,apply_discount"]) {
        assert.ok(renamesBlock.includes(row), `renames.csv block missing row ${row}`);
    }

    const applyBlock = fileVerboseBlock(out, "/apply_renames.py");
    assert.ok(applyBlock.includes("revision 0  @"));
    assert.ok(applyBlock.includes("(51 lines)"));
    assert.ok(!applyBlock.includes("revision 1  @"));
    assert.ok(applyBlock.includes(String.raw`re.sub(r"\b" + re.escape(old) + r"\b", new, text)`));
});
