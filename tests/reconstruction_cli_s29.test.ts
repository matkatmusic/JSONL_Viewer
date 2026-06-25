import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S29_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28 CLI test.)
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

// Slice the LAST revision out of a file's verbose block (from its last `revision N  @` line to the block
// end). Needed because pkg/a.py's INTERMEDIATE revision (the elided beacon) legitimately carries a
// windowed `| ...` line — only the FINAL revision must be free of it.
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// True when some line of `text` is a windowed-elision row (`   82 | ...`).
function hasWindowedElisionLine(text: string): boolean {
    return text.split("\n").some((line) => /\|\s*\.\.\.\s*$/.test(line));
}

// The default conversationDAG renders the SIX `edited_text_file` beacons (one per script-rewritten file)
// as user-edit turns after the Claude writes/edits. The run is linear (no rewind branch header). Spacing
// copied from a live runCli run. Locks §2.2 / §2.6.
test("test_S29_default_conversationDAG_shows_six_script_rename_user_edits", () => {
    const out = runCli([S29_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #726893c2"));
    assert.ok(out.includes("user-edit  test_pkg.py     #b27e66ab"));
    assert.ok(out.includes("user-edit  main.py         #1e9f8dd1"));
    assert.ok(out.includes("user-edit  __init__.py     #1527f907"));
    assert.ok(out.includes("user-edit  b.py            #4c52c762"));
    assert.ok(out.includes("user-edit  a.py            #e30c1bc6"));
    assert.ok(out.includes("user-edit  walk_rename.py  #d16b6b3b"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// THE CONTROL LOCK in the graph view: the walk SKIPPED `pkg/vendor/`, so vendor `c.py` has only its
// `write` event and NO user-edit — its fileDAG block is exactly one line before the next file (main.py).
// a.py and b.py DO carry their beacon user-edits; b.py also carries its later `pipeline` edit. The
// synthetic overwrites never appear as DAG nodes. Locks §2.6.
test("test_S29_fileDAG_vendor_control_has_no_user_edit", () => {
    const out = runCli([S29_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("c.py\n  F  write      #01U9Uyao\nmain.py")); // only a write, no user-edit
    assert.ok(out.includes("Q  user-edit  #e30c1bc6")); // a.py beacon
    assert.ok(out.includes("P  user-edit  #4c52c762")); // b.py beacon
    assert.ok(out.includes("S  edit       #01Mmn9pd")); // b.py later pipeline edit
});

// The whole run is one surviving branch (no rewind), tip #e6bfddf3, covering all eight files. Locks §2.
test("test_S29_list_branches_single_surviving_eight_files", () => {
    const out = runCli([S29_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #e6bfddf3"));
    for (const basename of ["a.py", "b.py", "c.py", "main.py", "test_pkg.py", "walk_rename.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// The three TRUNCATED rendered files reconstruct byte-perfect via the real sidecar reader: each verbose
// block shows its full revision count (main.py 0..5, test_pkg.py 0..5, walk_rename.py 0..2) and not one
// more; the FINAL revision carries the rename (`compute_value`) with no windowed `...` survivor, and
// walk_rename.py's self-rename leaves no bare `helper`. Locks §2.3 + §2.4.
test("test_S29_verbose_three_rendered_files_bytelock", () => {
    const out = runCli([S29_JSONL, "--verbose"]);
    for (const [suffix, last] of [["/main.py", 5], ["/tests/test_pkg.py", 5], ["/walk_rename.py", 2]] as const) {
        const block = fileVerboseBlock(out, suffix);
        assert.ok(block.includes(`revision ${last}  @`), `${suffix} missing revision ${last}`);
        assert.ok(!block.includes(`revision ${last + 1}  @`), `${suffix} has revision ${last + 1}`);
        const finalRevision = finalRevisionSlice(block);
        assert.ok(finalRevision.includes("compute_value"));
        assert.ok(!hasWindowedElisionLine(finalRevision));
    }
    assert.ok(!/\bhelper\b/.test(finalRevisionSlice(fileVerboseBlock(out, "/walk_rename.py"))));
});

// The vendor control in the rendered/verbose view: c.py has exactly one revision (revision 0, no
// revision 1), keeps `def helper(`, and never gains `compute_value`. Locks §2.3 (vendor) + §2.5.
test("test_S29_verbose_vendor_c_kept_helper", () => {
    const block = fileVerboseBlock(runCli([S29_JSONL, "--verbose"]), "/pkg/vendor/c.py");
    assert.ok(block.includes("revision 0  @"));
    assert.ok(!block.includes("revision 1  @"));
    assert.ok(block.includes("def helper("));
    assert.ok(!block.includes("compute_value"));
});

// CRUX A in the verbose view: pkg/a.py's elided beacon is completed to a 4-revision history (0..3, no
// revision 4); the FINAL revision keeps the pre-rename `preprocess`, carries `compute_value`, has no bare
// `helper`, and no windowed `...` survivor (the intermediate beacon revision still shows the window, so
// the check is scoped to the final revision). Locks §2.3 (a.py) + §2.4.
test("test_S29_verbose_a_py_elided_completed", () => {
    const block = fileVerboseBlock(runCli([S29_JSONL, "--verbose"]), "/pkg/a.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(!block.includes("revision 4  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("def preprocess("));
    assert.ok(finalRevision.includes("compute_value"));
    assert.ok(!/\bhelper\b/.test(finalRevision));
    assert.ok(!hasWindowedElisionLine(finalRevision));
});
