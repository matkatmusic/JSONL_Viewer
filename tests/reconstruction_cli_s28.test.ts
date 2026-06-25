import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S28_JSONL } from "./fixtures.ts";

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

// The real CLI builds the real sidecar reader, so both elided beacons reconstruct correctly (each is
// completed from its content-validated @v3 backup). The default conversationDAG renders the THREE
// `edited_text_file` beacons (one per script-rewritten file) as user-edit turns I/J/K after the Claude
// writes/edits; the run is linear (no rewind branch header). Locks §2.2 / §7.
test("test_S28_default_conversationDAG_shows_three_script_rename_user_edits", () => {
    const out = runCli([S28_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #e37840ba"));
    assert.ok(out.includes("  I  user-edit  catalog.py          #9d5b50af"));
    assert.ok(out.includes("  J  user-edit  test_catalog.py     #888a7d75"));
    assert.ok(out.includes("  K  user-edit  catalog_view.py     #c264b1e3"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The default fileDAG groups each file's events. The synthetic `overwrite` backup-seeds the fix injects
// (for test_catalog @v3 and catalog_view @v3) are REVISIONS, not DAG nodes, so they never appear here:
// test_catalog.py shows only its two real events, and catalog_view.py only its four. Locks §2.2 / §2.4.
test("test_S28_default_fileDAG_groups_each_file_events", () => {
    const out = runCli([S28_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "catalog.py\n  B  write      #01NpZcoG\n  E  edit       #013D61LM\n  F  edit       #01RRrizZ\n  I  user-edit  #9d5b50af",
    ));
    assert.ok(out.includes(
        "catalog_view.py\n  C  write      #016XemvW\n  K  user-edit  #c264b1e3\n  L  edit       #016EBfpc\n  M  edit       #01KBLPXd",
    ));
    assert.ok(out.includes("test_catalog.py\n  D  write      #0199WaHA\n  J  user-edit  #888a7d75"));
});

// list-branches: one surviving branch (tip #2114511a) over all six surviving files (the five tracked
// sources plus the stray `/tmp/cat.txt` cat-redirect side file), no rewound branch. Locks §2.6 / §7.
test("test_S28_list_branches_single_surviving_six_files", () => {
    const out = runCli([S28_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #2114511a"));
    for (const f of ["catalog.py", "catalog_view.py", "test_catalog.py", "scoped_renames.csv", "scoped_rename.py"]) {
        assert.ok(out.includes(f), `missing ${f}`);
    }
    assert.ok(!out.includes("rewound"));
});

// verbose catalog.py: exactly five revisions (0..4). The COMPLETE beacon already carries the scoped
// rename, so it is reader-independent. The rename lock is scoped to the FINAL revision (4): the exported
// `load_catalog` and the catalog-local `normalize_entry` are present and the terse `def load_all(` /
// `def _norm(` headers are gone. Locks §2.3 (catalog) / §7.
test("test_S28_verbose_catalog_five_revisions_renamed", () => {
    const block = fileVerboseBlock(runCli([S28_JSONL, "--surviving", "--verbose"]), "/catalog.py");
    assert.ok(block.includes("revision 4  @"));
    assert.ok(!block.includes("revision 5"));            // exactly five
    const finalRev = block.slice(block.indexOf("revision 4  @")); // final rendered revision only
    assert.ok(finalRev.includes("def load_catalog") && finalRev.includes("def normalize_entry"));
    assert.ok(!finalRev.includes("def load_all(") && !finalRev.includes("def _norm("));
});

// THE CRUX A, rendered: verbose tests/test_catalog.py has exactly three revisions (0..2). The TERMINAL
// MID-ELIDED beacon (revision 1) is completed by the `overwrite` backup-seed (revision 2), so the FINAL
// block shows the COMPLETE file — the renamed `catalog.load_catalog` call and NO bare `...` elision
// separator. WITHOUT the fix the file would stop at revision 1 (windowed, with `...` lines). Locks §2.3
// (test_catalog) / §2.4 / §7.
test("test_S28_verbose_test_catalog_three_revisions_overwrite_completes_file", () => {
    const block = fileVerboseBlock(runCli([S28_JSONL, "--surviving", "--verbose"]), "/test_catalog.py");
    assert.ok(block.includes("revision 2  @"));
    assert.ok(!block.includes("revision 3"));            // exactly three (write, beacon, overwrite)
    const finalRev = block.slice(block.indexOf("revision 2  @")); // the completed overwrite
    assert.ok(finalRev.includes("catalog.load_catalog"));         // the exported rename reached the test
    assert.ok(!finalRev.split("\n").some((l) => /\|\s*\.\.\.\s*$/.test(l))); // no windowed `...` survives
});

// THE CRUX B, rendered: verbose catalog_view.py has exactly six revisions (0..5). The head+tail-elided
// beacon (revision 1) is completed by the @v3 `overwrite` (revision 2), and the two `preview` Edits
// (revisions 3..5; the first renders as two) splice onto the COMPLETE post-script base — so the FINAL
// block shows `def preview(`, the renamed `load_catalog`, and NO terse `load_all`. Locks §2.3
// (catalog_view) / §2.4 / §7.
test("test_S28_verbose_catalog_view_six_revisions_overwrite_then_preview", () => {
    const block = fileVerboseBlock(runCli([S28_JSONL, "--surviving", "--verbose"]), "/catalog_view.py");
    assert.ok(block.includes("revision 5  @"));
    assert.ok(!block.includes("revision 6"));            // exactly six
    const finalRev = block.slice(block.indexOf("revision 5  @"));
    assert.ok(finalRev.includes("def preview("));        // the post-script Edit replayed onto the real base
    assert.ok(finalRev.includes("load_catalog"));
    assert.ok(!finalRev.includes("load_all"));
});
