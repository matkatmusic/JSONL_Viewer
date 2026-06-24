import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S26_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// `revision 0` appears for all four files, so per-file assertions must be scoped this way.
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

// Test 1 — default conversationDAG: the two script-rename beacons as user-edit turns; linear.
test("test_S26_default_conversationDAG_shows_two_script_rename_user_edits", () => {
    const out = runCli([S26_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #122ba017"));
    assert.ok(out.includes("  F  write      apply_renames.py  #01CRFECp"));
    assert.ok(out.includes("  G  user-edit  billing.py        #298a585d"));
    assert.ok(out.includes("  H  user-edit  test_billing.py   #507c3e6b"));
    assert.ok(out.includes("  I  edit       billing.py        #01JBQ5ch"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// Test 2 — default fileDAG groups each file's events.
test("test_S26_default_fileDAG_groups_each_file_events", () => {
    const out = runCli([S26_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "billing.py\n  B  write      #018abLNH\n  D  edit       #01MVSbjC\n  G  user-edit  #298a585d\n  I  edit       #01JBQ5ch",
    ));
    assert.ok(out.includes("test_billing.py\n  C  write      #01Hqxhox\n  H  user-edit  #507c3e6b"));
    assert.ok(out.includes("renames.csv\n  E  write      #01P7ZSHL"));
    assert.ok(out.includes("apply_renames.py\n  F  write      #01CRFECp"));
});

// Test 3 — list-branches: one surviving, four files, no rewound.
test("test_S26_list_branches_single_surviving_four_files", () => {
    const out = runCli([S26_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #ae7838c8"));
    for (const f of ["billing.py", "test_billing.py", "renames.csv", "apply_renames.py"]) {
        assert.ok(out.includes(f), `missing ${f}`);
    }
    assert.ok(!out.includes("rewound"));
});

// Test 4 — verbose billing.py: exactly four revisions; final revision renamed + print_invoice; no
// terse `def` headers leak from the final revision. `--verbose` prints EVERY revision, and the terse
// pre-rename revisions (0..1) legitimately still contain `def calc_tot(` etc., so the rename lock is
// scoped to the FINAL revision (revision 3).
test("test_S26_verbose_billing_four_revisions_renamed_print_invoice", () => {
    const block = fileVerboseBlock(runCli([S26_JSONL, "--surviving", "--verbose"]), "/billing.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(!block.includes("revision 4"));            // exactly four
    const finalRev = block.slice(block.indexOf("revision 3  @")); // final rendered revision only
    assert.ok(finalRev.includes("| def calculate_total(") && finalRev.includes("| def format_currency("));
    assert.ok(finalRev.includes("| def check_stock(") && finalRev.includes("| def apply_discount("));
    assert.ok(finalRev.includes("| def print_invoice("));
    assert.ok(!finalRev.includes("| def calc_tot(") && !finalRev.includes("| def apply_disc("));
});

// Test 5 — verbose tests/test_billing.py: exactly two revisions; final renamed import. `--verbose`
// prints EVERY revision, and the terse pre-rename revision 0 legitimately still contains
// `from billing import calc_tot, fmt_money` — so the terse-absence check is scoped to the FINAL
// revision (revision 1), mirroring the billing.py Test 4 pattern.
test("test_S26_verbose_test_billing_two_revisions_renamed", () => {
    const block = fileVerboseBlock(runCli([S26_JSONL, "--surviving", "--verbose"]), "/test_billing.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2"));            // exactly two
    const finalRev = block.slice(block.indexOf("revision 1  @")); // final rendered revision only
    assert.ok(finalRev.includes("from billing import calculate_total, format_currency"));
    assert.ok(!finalRev.includes("import calc_tot") && !finalRev.includes("import fmt_money"));
});

// Test 6 — verbose driver files: renames.csv and apply_renames.py each exactly one revision.
// renames.csv shows the rename map rows; apply_renames.py references renames.csv.
test("test_S26_verbose_driver_files_single_revision_each", () => {
    const out = runCli([S26_JSONL, "--surviving", "--verbose"]);
    const csv = fileVerboseBlock(out, "/renames.csv");
    assert.ok(csv.includes("revision 0  @"));
    assert.ok(!csv.includes("revision 1"));              // exactly one
    assert.ok(csv.includes("| old,new") && csv.includes("| calc_tot,calculate_total"));
    const drv = fileVerboseBlock(out, "/apply_renames.py");
    assert.ok(drv.includes("revision 0  @"));
    assert.ok(!drv.includes("revision 1"));              // exactly one
    assert.ok(drv.includes("renames.csv"));
});
