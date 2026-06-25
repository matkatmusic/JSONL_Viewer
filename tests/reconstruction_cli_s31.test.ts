import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S31_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28/S29/S30 CLI tests.)
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
// end). Needed because textutil.py's EARLIER revisions (write/`normalize`-edit) legitimately carry the OLD
// names (`cap`, `low`, `trim`) — only the FINAL renamed revision must be free of their whole-word forms.
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// The twelve `old,new` mapping rows the CSV records verbatim — the lock for C6.
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["cap", "capitalize"], ["low", "lowercase"], ["up", "uppercase"], ["rev", "reverse"],
    ["trim", "trim_whitespace"], ["pad", "pad_right"], ["cnt", "count"], ["idx", "index_of"],
    ["rep", "replace"], ["splt", "split"], ["joi", "join"], ["slug", "slugify"],
];

// C1 — the default view prints BOTH DAGs. The conversationDAG renders the single prompt then the eight
// file-touching turns, including the TWO `edited_text_file` beacons (one per script-rewritten file) as
// user-edit turns. The run is linear (no rewind/branch header). Locks the conversationDAG + fileDAG shape.
test("test_S31_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S31_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #425f4da2"));
    assert.ok(out.includes("user-edit  textutil.py"));
    assert.ok(out.includes("#98ce2cbf"));
    assert.ok(out.includes("user-edit  test_textutil.py"));
    assert.ok(out.includes("#590f882d"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// C2 — one surviving branch, tip #1349c502, covering all four files; no rewound branch.
test("test_S31_list_branches_single_surviving_four_files", () => {
    const out = runCli([S31_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #1349c502"));
    for (const basename of ["textutil.py", "test_textutil.py", "many_renames.csv", "bulk_rename.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// C3 — `--graphFile` node ladders. Each contiguous file block ends at the next file's name, so these
// assertions lock EXACTLY the node count per file: textutil.py 4 (write/edit/user-edit/edit),
// test_textutil.py 2 (write/user-edit), the CSV and the script 1 each. Any spurious node (e.g. a synthetic
// overwrite leaking in as a DAG node) would break the `\n<next-file>` boundary.
test("test_S31_graphFile_node_ladders", () => {
    const out = runCli([S31_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "textutil.py\n" +
        "  B  write      #01M6WBbt\n" +
        "  D  edit       #0133o9ck\n" +
        "  G  user-edit  #98ce2cbf\n" +
        "  I  edit       #01VPXxeW\n" +
        "test_textutil.py",
    ));
    assert.ok(out.includes(
        "test_textutil.py\n" +
        "  C  write      #01GUHzsE\n" +
        "  H  user-edit  #590f882d\n" +
        "many_renames.csv",
    ));
    assert.ok(out.includes("many_renames.csv\n  E  write      #01WnQf6y\nbulk_rename.py"));
    assert.ok(out.includes("bulk_rename.py\n  F  write      #01Liii6o"));
});

// C4 — verbose textutil.py. Completed to a 4-revision history (0..3, no revision 4). The FINAL revision
// carries the post-script `headline` Edit (`def headline(`, `slugify`) and has NO whole-word OLD name
// (`\btrim\b`/`\blow\b`/`\bcap\b`) — those live only in the earlier write/normalize revisions, so the check
// is scoped to the final revision slice (`capitalize` must not trip the `\bcap\b` absence check).
test("test_S31_verbose_textutil_final_revision_renamed", () => {
    const block = fileVerboseBlock(runCli([S31_JSONL, "--verbose"]), "/textutil.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(!block.includes("revision 4  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("def headline("));
    assert.ok(finalRevision.includes("slugify"));
    assert.ok(!/\btrim\b/.test(finalRevision));
    assert.ok(!/\blow\b/.test(finalRevision));
    assert.ok(!/\bcap\b/.test(finalRevision));
});

// C5 — verbose test_textutil.py. Completed to a 2-revision history (0..1, no revision 2). The FINAL
// revision imports the NEW names: `from textutil import capitalize, reverse, slugify` (revision 0 still
// shows the old `cap, rev, slug` import, hence the final-revision scoping).
test("test_S31_verbose_test_textutil_renamed_import", () => {
    const block = fileVerboseBlock(runCli([S31_JSONL, "--verbose"]), "/tests/test_textutil.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("from textutil import capitalize, reverse, slugify"));
});

// C6 — CSV bytelock. many_renames.csv records the `old,new` header and all twelve mapping rows verbatim —
// the full instruction set the one script run consumed.
test("test_S31_verbose_csv_records_twelve_mappings", () => {
    const csvBlock = fileVerboseBlock(runCli([S31_JSONL, "--verbose"]), "/many_renames.csv");
    assert.ok(csvBlock.includes("old,new"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(csvBlock.includes(`${oldName},${newName}`), `CSV missing row ${oldName},${newName}`);
    }
});
