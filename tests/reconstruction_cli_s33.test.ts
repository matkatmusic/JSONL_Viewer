import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S33_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28/S29/S30/S31/S32 CLI tests.)
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
// end). Needed because billing.py's EARLIER revisions (write / `validate` edit, both PRE-rename) legitimately
// carry the OLD names (`calc_tot`, `chk_stock`, …) — only the FINAL renamed revision must be free of their
// whole-word forms.
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// C1 — the default view prints BOTH DAGs. The conversationDAG renders the single prompt then the file-touching
// turns, including the THREE user-edit turns: the two `edited_text_file` beacons (billing + test, from the
// Bash script run) and the genuine manual `renames.csv` edit. The rename script ran through Bash, so its run
// leaves NO file event — only the beacons surface it. The run is linear (no rewind/branch header).
test("test_S33_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S33_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #a542586f"));
    assert.ok(out.includes("user-edit  renames.csv"));
    assert.ok(out.includes("#b8591d24"));
    assert.ok(out.includes("user-edit  billing.py"));
    assert.ok(out.includes("#4480f645"));
    assert.ok(out.includes("user-edit  test_billing.py"));
    assert.ok(out.includes("#c7415420"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// C2 — one surviving branch, tip #c3d6846d, covering all four files; no rewound branch.
test("test_S33_list_branches_single_surviving_four_files", () => {
    const out = runCli([S33_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #c3d6846d"));
    for (const basename of ["billing.py", "test_billing.py", "renames.csv", "apply_renames.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// C3 — `--graphFile` node ladders. Each contiguous file block ends at the next file's name, so these
// assertions lock EXACTLY the node count per file: billing.py 4 (write / `validate` edit / user-edit beacon /
// `reorder` edit), test_billing.py 2 (write / user-edit beacon), renames.csv 2 (write / manual user-edit),
// apply_renames.py 1 (write). Any spurious node (e.g. a synthetic overwrite leaking in as a DAG node) would
// break the `\n<next-file>` boundary.
test("test_S33_graphFile_node_ladders", () => {
    const out = runCli([S33_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "billing.py\n" +
        "  B  write      #01UfPrAb\n" +
        "  D  edit       #01YJgz9B\n" +
        "  H  user-edit  #4480f645\n" +
        "  J  edit       #017YhvtC\n" +
        "test_billing.py",
    ));
    assert.ok(out.includes(
        "test_billing.py\n" +
        "  C  write      #01VRJBSC\n" +
        "  I  user-edit  #c7415420\n" +
        "renames.csv",
    ));
    assert.ok(out.includes(
        "renames.csv\n" +
        "  E  write      #01AREH5S\n" +
        "  F  user-edit  #b8591d24\n" +
        "apply_renames.py",
    ));
    assert.ok(out.includes("apply_renames.py\n  G  write      #01Epb4R7"));
});

// C4 — verbose billing.py. Completed to a 4-revision history (0..3, no revision 4). The FINAL revision
// (187 lines) carries the renamed `def calculate_total(` / `def format_currency(` / `def check_stock(` /
// `def apply_discount(`, plus the pre-script `def validate(` and the post-script `def reorder(`, and has NO
// whole-word OLD name — those live only in the earlier pre-rename revisions, so the check is scoped to the
// final-revision slice (the new names must not trip the `\bold\b` absence checks).
test("test_S33_verbose_billing_final_revision_renamed", () => {
    const block = fileVerboseBlock(runCli([S33_JSONL, "--verbose"]), "/billing.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(!block.includes("revision 4  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(187 lines)"));
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

// C5 — verbose test_billing.py. Completed to a 2-revision history (0..1, no revision 2). The FINAL revision
// (51 lines) imports the NEW names: `from billing import calculate_total, format_currency` (revision 0 still
// shows the old `calc_tot, fmt_money` import, hence the final-revision scoping).
test("test_S33_verbose_test_file_renamed_import", () => {
    const block = fileVerboseBlock(runCli([S33_JSONL, "--verbose"]), "/tests/test_billing.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(51 lines)"));
    assert.ok(finalRevision.includes("from billing import calculate_total, format_currency"));
    assert.ok(!/\bcalc_tot\b/.test(finalRevision));
    assert.ok(!/\bfmt_money\b/.test(finalRevision));
});

// C6 — verbose renames.csv (the NOVEL element) + apply_renames.py. renames.csv is a 2-revision history:
// revision 0 (4 lines, the write of header + 3 rows) and revision 1 (5 lines, the manual user-edit that
// appended the 4th `chk_stock,check_stock` row). apply_renames.py is a single write (51 lines, revision 0)
// recording the whole-word `re.sub(rf"\b{re.escape(old)}\b", new, text)` substitution the one Bash run applied.
test("test_S33_verbose_renames_csv_user_edit_and_apply_script", () => {
    const csvBlock = fileVerboseBlock(runCli([S33_JSONL, "--verbose"]), "/renames.csv");
    assert.ok(csvBlock.includes("revision 0  @"));
    assert.ok(csvBlock.includes("(4 lines)"));
    assert.ok(csvBlock.includes("revision 1  @"));
    assert.ok(csvBlock.includes("(5 lines)"));
    assert.ok(!csvBlock.includes("revision 2  @"));
    assert.ok(csvBlock.includes("chk_stock,check_stock"));
    assert.ok(csvBlock.includes("calc_tot,calculate_total"));
    assert.ok(csvBlock.includes("fmt_money,format_currency"));
    assert.ok(csvBlock.includes("apply_disc,apply_discount"));

    const scriptBlock = fileVerboseBlock(runCli([S33_JSONL, "--verbose"]), "/apply_renames.py");
    assert.ok(scriptBlock.includes("revision 0  @"));
    assert.ok(scriptBlock.includes("(51 lines)"));
    assert.ok(!scriptBlock.includes("revision 1  @"));
    assert.ok(scriptBlock.includes(String.raw`re.sub(rf"\b{re.escape(old)}\b", new, text)`), "apply_renames missing whole-word substitution");
});
