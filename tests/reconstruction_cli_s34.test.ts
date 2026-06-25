import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S34_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28–S33 CLI tests.)
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
// end). Needed because ledger.py's EARLIER revisions (write / prepend beacon / `audit` edit, all PRE-rename)
// legitimately carry the OLD terse names — only the FINAL renamed revision must be free of their whole-word
// forms. (Verbatim from the S33 CLI test.)
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// C1 — the default view prints BOTH DAGs. The conversationDAG renders the single prompt then the
// file-touching turns, including the FOUR user-edit turns: the step-2 ledger prepend (`#0ee68aad`), the
// step-5 renames.csv beacon (`#ba8ee917`), and the two script-run `edited_text_file` beacons (ledger
// `#2a0d75ba`, test `#720ee20c`). The rename ran through Bash, so its run leaves NO file event — only the
// beacons surface it. The run is linear (no rewind/branch header).
test("test_S34_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S34_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #7d7450c2"));
    assert.ok(out.includes("user-edit  ledger.py"));
    assert.ok(out.includes("#0ee68aad"));
    assert.ok(out.includes("user-edit  renames.csv"));
    assert.ok(out.includes("#ba8ee917"));
    assert.ok(out.includes("#2a0d75ba"));
    assert.ok(out.includes("user-edit  test_ledger.py"));
    assert.ok(out.includes("#720ee20c"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// C2 — one surviving branch, tip #97e510eb, covering all four files; no rewound branch.
test("test_S34_list_branches_single_surviving_four_files", () => {
    const out = runCli([S34_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #97e510eb"));
    for (const basename of ["ledger.py", "test_ledger.py", "renames.csv", "apply_renames.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// C3 — `--graphFile` node ladders. Each contiguous file block ends at the next file's name, so these
// assertions lock EXACTLY the node count per file: ledger.py 5 (write / prepend beacon / `audit` edit /
// script-rename beacon / `report` edit), test_ledger.py 2 (write / script-rename beacon), renames.csv 2
// (write / step-5 beacon), apply_renames.py 1 (write). The synthetic reseed Write (the step-9 append) and
// the S27 completion (the step-7 append) add NO node — their changeId is the blob name, kept out of the
// graphs (spec 40) — so a spurious extra node would break the `\n<next-file>` boundary.
test("test_S34_graphFile_node_ladders", () => {
    const out = runCli([S34_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "ledger.py\n" +
        "  B  write      #0185fBUs\n" +
        "  D  user-edit  #0ee68aad\n" +
        "  E  edit       #01JBokec\n" +
        "  I  user-edit  #2a0d75ba\n" +
        "  K  edit       #01KcAiCq\n" +
        "test_ledger.py",
    ));
    assert.ok(out.includes(
        "test_ledger.py\n" +
        "  C  write      #01La3fdo\n" +
        "  J  user-edit  #720ee20c\n" +
        "renames.csv",
    ));
    assert.ok(out.includes(
        "renames.csv\n" +
        "  F  write      #01P4fRne\n" +
        "  G  user-edit  #ba8ee917\n" +
        "apply_renames.py",
    ));
    assert.ok(out.includes("apply_renames.py\n  H  write      #01FTauF3"));
});

// C4 — verbose ledger.py. Completed to a 6-revision history (0..5, no revision 6). Revision 4 (174 lines) is
// the SYNTHETIC out-of-window reseed — the step-9 NO-BEACON trailing append recovered from a file-history
// backup — and the FINAL revision 5 (187 lines) is the post-script `report` edit replayed on top of it. The
// final revision carries the renamed `def report(` / `def audit(`, ends with `# names normalized via rename
// script`, and has NO whole-word OLD terse name (those live only in the earlier pre-rename revisions, so the
// check is scoped to the final-revision slice).
test("test_S34_verbose_ledger_six_revisions_174_reseed", () => {
    const block = fileVerboseBlock(runCli([S34_JSONL, "--verbose"]), "/ledger.py");
    assert.ok(block.includes("revision 5  @"));
    assert.ok(!block.includes("revision 6  @"));
    assert.ok(block.includes("(174 lines)"), "missing the synthetic 174-line reseed revision");
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(187 lines)"));
    assert.ok(finalRevision.includes("def report("));
    assert.ok(finalRevision.includes("def audit("));
    assert.ok(finalRevision.includes("# names normalized via rename script"));
    assert.ok(!/\badd_entry\b/.test(finalRevision));
    assert.ok(!/\brm_entry\b/.test(finalRevision));
    assert.ok(!/\btot_debits\b/.test(finalRevision));
    assert.ok(!/\btot_credits\b/.test(finalRevision));
});

// C5 — verbose test_ledger.py. Completed to a 2-revision history (0..1, no revision 2). The FINAL revision
// (57 lines) imports the NEW names: `from ledger import record_entry, bal, remove_entry` (revision 0 still
// shows the old `add_entry, bal, rm_entry` import, hence the final-revision scoping).
test("test_S34_verbose_test_file_renamed", () => {
    const block = fileVerboseBlock(runCli([S34_JSONL, "--verbose"]), "/tests/test_ledger.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(57 lines)"));
    assert.ok(finalRevision.includes("from ledger import record_entry, bal, remove_entry"));
    assert.ok(!/\badd_entry\b/.test(finalRevision));
    assert.ok(!/\brm_entry\b/.test(finalRevision));
});

// C6 — verbose renames.csv (3-revision ladder via S27) + apply_renames.py. renames.csv: revision 0 (3 lines,
// write of header + 2 rows), revision 1 (4 lines, step-5 manual beacon), revision 2 (5 lines, the step-7
// NO-BEACON append completed by the existing S27 completeTruncatedBeacon). apply_renames.py is a single write
// (54 lines, revision 0) recording the whole-word `re.sub(r"\b" + re.escape(old) + r"\b", new, text)`
// substitution the one Bash run applied. NOTE the substitution is the STRING-CONCAT form (not the s33
// f-string form) — captured live from the rendered driver.
test("test_S34_verbose_renames_csv_three_revisions_and_apply_script", () => {
    const csvBlock = fileVerboseBlock(runCli([S34_JSONL, "--verbose"]), "/renames.csv");
    assert.ok(csvBlock.includes("revision 0  @"));
    assert.ok(csvBlock.includes("(3 lines)"));
    assert.ok(csvBlock.includes("revision 1  @"));
    assert.ok(csvBlock.includes("(4 lines)"));
    assert.ok(csvBlock.includes("revision 2  @"));
    assert.ok(csvBlock.includes("(5 lines)"));
    assert.ok(!csvBlock.includes("revision 3  @"));
    assert.ok(csvBlock.includes("tot_credits,total_credits"));
    assert.ok(csvBlock.includes("add_entry,record_entry"));
    assert.ok(csvBlock.includes("rm_entry,remove_entry"));
    assert.ok(csvBlock.includes("tot_debits,total_debits"));

    const scriptBlock = fileVerboseBlock(runCli([S34_JSONL, "--verbose"]), "/apply_renames.py");
    assert.ok(scriptBlock.includes("revision 0  @"));
    assert.ok(scriptBlock.includes("(54 lines)"));
    assert.ok(!scriptBlock.includes("revision 1  @"));
    assert.ok(
        scriptBlock.includes(String.raw`re.sub(r"\b" + re.escape(old) + r"\b", new, text)`),
        "apply_renames missing whole-word substitution",
    );
});
