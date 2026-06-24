import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M1_JSONL } from "./fixtures.ts";

// m1's conversationDAG is LINEAR: a single root prompt A with B..G beneath it and
// NO branch/rewind lines. The cp surfaces as its own `copy` turn (E).
test("test_m1_default_conversationDAG_lists_seven_linear_turns_with_copy", () => {
    const out = runCli([M1_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #04e2614d"));
    assert.ok(out.includes("B  write  m1_base.py       #011qDCBo"));
    assert.ok(out.includes("C  write  test_m1_base.py  #01ReNqPU"));
    assert.ok(out.includes("D  edit   m1_base.py       #01DPFPpW"));
    assert.ok(out.includes("E  copy   m1_fork.py       #01GL8xRo"));
    assert.ok(out.includes("F  edit   m1_fork.py       #01TUUPpu"));
    assert.ok(out.includes("G  edit   m1_base.py       #0149eWBD"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG keeps base, test, and fork as THREE independent groups; the copy
// event (E) lives only under m1_fork.py, and m1_base.py shows write→edit→edit.
test("test_m1_default_fileDAG_groups_base_test_and_fork_independently", () => {
    const out = runCli([M1_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("m1_base.py\n  B  write  #011qDCBo\n  D  edit   #01DPFPpW\n  G  edit   #0149eWBD"));
    assert.ok(out.includes("test_m1_base.py\n  C  write  #01ReNqPU"));
    assert.ok(out.includes("m1_fork.py\n  E  copy   #01GL8xRo\n  F  edit   #01TUUPpu"));
});

// One surviving branch, no rewound branch (linear scenario).
test("test_m1_list_branches_single_surviving_no_rewind", () => {
    const out = runCli([M1_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #3740a519"));
    assert.ok(out.includes("m1_base.py, test_m1_base.py, m1_fork.py"));
    assert.ok(!out.includes("rewound"));
});

// Surviving verbose: m1_base.py ends at the 11-line disable_all version.
test("test_m1_surviving_verbose_base_ends_at_disable_all_eleven_lines", () => {
    const out = runCli([M1_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(11 lines)"));
    assert.ok(out.includes("    def disable_all(self):"));
});

// THE CRUX CLI BYTE-LOCK (property 1): m1_fork.py's revision 0 is a `copy` from the
// base, seeded with the 7-line base@copy content (so the copy block is 7 lines, NOT
// 11 — disable_all is absent), and the fork's final revision is the 10-line
// enable_verbose version.
test("test_m1_surviving_verbose_fork_copy_is_seven_line_base_at_copy_time", () => {
    const out = runCli([M1_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0  copy  "));
    assert.ok(out.includes("m1_base.py → "));
    assert.ok(out.includes("m1_fork.py"));
    assert.ok(out.includes("(7 lines)"));   // copy born content — base@D, not base-final
    assert.ok(out.includes("(10 lines)"));  // fork final — enable_verbose
    assert.ok(out.includes("    def enable_verbose(self):"));
});
