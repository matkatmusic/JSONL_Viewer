import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M3_JSONL } from "./fixtures.ts";

// m3's conversationDAG is LINEAR: a single root prompt A with B..E beneath it and NO
// branch/rewind lines. The two `>>` redirects surface as `append` turns (C, E).
test("test_m3_default_conversationDAG_lists_prompt_and_four_linear_events", () => {
    const out = runCli([M3_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #6ae088f4"));
    assert.ok(out.includes("  B  write   m3_mixed.txt  #01D2sbvo"));
    assert.ok(out.includes("  C  append  m3_mixed.txt  #01VfBVfA"));
    assert.ok(out.includes("  D  edit    m3_mixed.txt  #015Don8V"));
    assert.ok(out.includes("  E  append  m3_mixed.txt  #01JDsxQb"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG groups all four events under the single m3_mixed.txt node, in order.
test("test_m3_default_fileDAG_groups_single_file_four_events", () => {
    const out = runCli([M3_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m3_mixed.txt\n  B  write   #01D2sbvo\n  C  append  #01VfBVfA\n  D  edit    #015Don8V\n  E  append  #01JDsxQb",
    ));
});

// One surviving branch, no rewound branch (linear scenario); the single file is listed.
test("test_m3_list_branches_single_surviving_one_file", () => {
    const out = runCli([M3_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #6076417b"));
    assert.ok(out.includes("m3_mixed.txt"));
    assert.ok(!out.includes("rewound"));
});

// THE EDIT BYTE-LOCK: the surviving verbose shows the Edit's removal+addition pair — a
// `(1 lines)` revision holding only `line two` (line one removed), then a `(2 lines)`
// revision holding `LINE ONE`/`line two`. Exactly five revisions (0..4), no sixth.
test("test_m3_surviving_verbose_byte_locks_edit_removal_addition_pair", () => {
    const out = runCli([M3_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 4"));
    assert.ok(!out.includes("revision 5"));          // exactly five revisions — no spurious reseed
    assert.ok(out.includes("(1 lines)\n     1 | line two"));        // rev 2 = edit removal (unique block)
    assert.ok(out.includes("     1 | LINE ONE\n     2 | line two")); // rev 3 = edit addition
});

// THE BASH-REDIRECT BYTE-LOCK (end-to-end through the real sidecar reader): the append
// revisions recover their tail lines from the file-history backups — rev 1 is
// `line one`/`line two`, and the final rev 4 is the 29-byte ground truth.
test("test_m3_surviving_verbose_appends_recover_backup_content_to_ground_truth", () => {
    const out = runCli([M3_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("     1 | line one\n     2 | line two"));                       // rev 1 = append C
    assert.ok(out.includes("     1 | LINE ONE\n     2 | line two\n     3 | line three")); // rev 4 = final ground truth
});
