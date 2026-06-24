import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S23_JSONL } from "./fixtures.ts";

// S23's conversationDAG FORKS at the rewind point: the root prompt A is the rewind point, the
// rewound branch holds D (user-edit push) + E (edit pop), and the surviving branch holds F
// (user-edit restore echo) + G (edit is_empty).
test("test_S23_default_conversationDAG_shows_both_user_edits_and_edits", () => {
    const out = runCli([S23_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #bbf6cd91   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #e62d73ad; rewind @ #bbf6cd91)"));
    assert.ok(out.includes("D  user-edit  scenario23.py  #9565e2ac"));
    assert.ok(out.includes("E  edit       scenario23.py  #017pMPEo"));
    assert.ok(out.includes("branch surviving (surviving; tip #f224cf19)"));
    assert.ok(out.includes("F  user-edit  scenario23.py  #a68b543d"));
    assert.ok(out.includes("G  edit       scenario23.py  #01Gbp8oE"));
});

// The fileDAG lists scenario23.py's five change events across both branches (write, both
// user-edits, both Claude edits) with their changeIds, plus the test file's lone write.
test("test_S23_default_fileDAG_lists_all_scenario_turns_and_the_test_write", () => {
    const out = runCli([S23_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #0131iJBP"));
    assert.ok(out.includes("D  user-edit  #9565e2ac"));
    assert.ok(out.includes("E  edit       #017pMPEo"));
    assert.ok(out.includes("F  user-edit  #a68b543d"));
    assert.ok(out.includes("G  edit       #01Gbp8oE"));
    assert.ok(out.includes("C  write      #01SEvVm1"));
});

// --list-branches lists BOTH branches: the surviving branch (tip #f224cf19) and the rewound branch
// (tip #e62d73ad) with its rewind marker.
test("test_S23_list_branches_shows_surviving_and_rewound_tips", () => {
    const out = runCli([S23_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #f224cf19"));
    assert.ok(out.includes("rewound    tip #e62d73ad  rewind @ #bbf6cd91"));
});

// POSITION LOCK — the regression byte-lock: size on line 4, a SINGLE push on line 5 (no duplicate),
// is_empty after. The unfixed engine rendered a duplicated push on lines 4-5 and dropped size.
test("test_S23_surviving_verbose_reconstructs_eight_line_file_with_size_then_push", () => {
    const out = runCli([S23_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("    def size(self): return len(self.items)\n     5 |     def push(self, item): self.items.append(item)"));
    assert.ok(out.includes("    def push(self, item): self.items.append(item)\n     6 | \n     7 |     def is_empty(self):"));
    assert.ok(!out.includes("self.items.append(item)\n     5 |     def push(self, item): self.items.append(item)"));
});

// The surviving scenario23.py renders as four revisions; revision 2 is the 5-line v5 seed and
// revision 3 is the 8-line final (proving size survived and push was not duplicated).
test("test_S23_surviving_verbose_shows_four_revisions_with_seeded_base", () => {
    const out = runCli([S23_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    assert.ok(out.includes("revision 3"));
    // revision 2 is the 5-line v5 seed; revision 3 is the 8-line final.
    assert.ok(out.includes("(5 lines)"));
    assert.ok(out.includes("(8 lines)"));
});
