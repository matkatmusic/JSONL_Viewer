import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S30_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28/S29 CLI tests.)
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
// end). Needed because test_pricing.py's INTERMEDIATE revision (the elided beacon) legitimately carries a
// windowed `| ...` line — only the FINAL revision must be free of it.
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// True when some line of `text` is a windowed-elision row (`    19 | ...`).
function hasWindowedElisionLine(text: string): boolean {
    return text.split("\n").some((line) => /\|\s*\.\.\.\s*$/.test(line));
}

// The default conversationDAG renders the TWO `edited_text_file` beacons (one per script-rewritten file)
// as user-edit turns after the Claude writes/edits. The run is linear (no rewind branch header). Spacing
// copied from a live runCli run. Locks §2.2 / §2.7.
test("test_S30_default_conversationDAG_shows_two_script_rename_user_edits", () => {
    const out = runCli([S30_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #b2ad40c6"));
    assert.ok(out.includes("user-edit  test_pricing.py    #388074da"));
    assert.ok(out.includes("user-edit  pricing.py         #9a1c303d"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// In the fileDAG, pricing.py carries all five nodes (write, two quote edits, the beacon user-edit, and the
// later receipt edit) and test_pricing.py carries exactly its write + beacon user-edit with NO overwrite
// line (the synthetic overwrite is never a DAG node). The two no-beacon files each show a single write.
// Locks §2.3 / §2.7.
test("test_S30_fileDAG_pricing_five_nodes_test_two_nodes", () => {
    const out = runCli([S30_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    for (const node of [
        "B  write      #01TYChTi",
        "D  edit       #01Gb6PRJ",
        "E  edit       #017QLHmt",
        "I  user-edit  #9a1c303d",
        "J  edit       #01RonDvN",
    ]) {
        assert.ok(out.includes(node), `pricing.py missing fileDAG node ${node}`);
    }
    // test_pricing.py: exactly write + user-edit, immediately followed by the next file's block — proving
    // the synthetic overwrite never became a node.
    assert.ok(out.includes("test_pricing.py\n  C  write      #011voEjh\n  H  user-edit  #388074da\ncount_renames.csv"));
    assert.ok(out.includes("count_renames.csv\n  F  write      #014iwvDL"));
    assert.ok(out.includes("safe_rename.py\n  G  write      #01FMppx9"));
});

// The whole run is one surviving branch (no rewind), tip #e61d0ae0, covering all four files. Locks §2.
test("test_S30_list_branches_single_surviving_four_files", () => {
    const out = runCli([S30_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #e61d0ae0"));
    for (const basename of ["pricing.py", "test_pricing.py", "count_renames.csv", "safe_rename.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// CRUX (rendered view): test_pricing.py's elided beacon is completed to a 3-revision history (0..2, no
// revision 3); the FINAL revision carries the applied `round_to_cents`, keeps `base_price`, has no
// whole-word `round_price`, and no windowed `...` survivor (the intermediate beacon revision still shows
// the window, so the check is scoped to the final revision). Locks §2.3 + §2.4.
test("test_S30_verbose_test_pricing_elided_completed", () => {
    const block = fileVerboseBlock(runCli([S30_JSONL, "--verbose"]), "/tests/test_pricing.py");
    assert.ok(block.includes("revision 2  @"));
    assert.ok(!block.includes("revision 3  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("round_to_cents"));
    assert.ok(/\bbase_price\b/.test(finalRevision));
    assert.ok(!/\bround_price\b/.test(finalRevision));
    assert.ok(!hasWindowedElisionLine(finalRevision));
});

// pricing.py in the rendered/verbose view: completed to a 5-revision history (0..4, no revision 5); the
// FINAL revision carries `round_to_cents`, keeps `base_price`, adds `def receipt(`, and never gains the
// refused `unit_price` or a whole-word `round_price`. Locks §2.3 (pricing.py) + the refusal.
test("test_S30_verbose_pricing_receipt_and_refusal", () => {
    const block = fileVerboseBlock(runCli([S30_JSONL, "--verbose"]), "/pricing.py");
    assert.ok(block.includes("revision 4  @"));
    assert.ok(!block.includes("revision 5  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("round_to_cents"));
    assert.ok(/\bbase_price\b/.test(finalRevision));
    assert.ok(finalRevision.includes("def receipt("));
    assert.ok(!/\bunit_price\b/.test(finalRevision));
    assert.ok(!/\bround_price\b/.test(finalRevision));
});

// The refusal's paper trail: count_renames.csv records BOTH rows verbatim — the applied
// `round_price,round_to_cents,8` and the deliberately wrong `base_price,unit_price,10` (off by one) that
// caused the `MISMATCH`. The `unit_price` name appears ONLY in that CSV: neither the pricing.py nor the
// test_pricing.py verbose block contains it, because the rename it names was refused and never reached any
// reconstructed code. Locks §1.2.
test("test_S30_csv_records_off_by_one_and_no_unit_price_in_code", () => {
    const out = runCli([S30_JSONL, "--verbose"]);
    const csvBlock = fileVerboseBlock(out, "/count_renames.csv");
    assert.ok(csvBlock.includes("round_price,round_to_cents,8"));
    assert.ok(csvBlock.includes("base_price,unit_price,10")); // the off-by-one row that was refused
    assert.ok(!fileVerboseBlock(out, "/pricing.py").includes("unit_price"));
    assert.ok(!fileVerboseBlock(out, "/tests/test_pricing.py").includes("unit_price"));
});
