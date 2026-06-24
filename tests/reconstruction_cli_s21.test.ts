import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S21_JSONL } from "./fixtures.ts";

// S21's conversationDAG is LINEAR: A prompt, B/C writes, then the three user edits (D, F, H)
// interleaved with the two Claude edits (E, G) — no rewind point, no branch headers.
test("test_S21_default_conversationDAG_is_linear_with_three_user_edit_turns", () => {
    const out = runCli([S21_JSONL]);
    // The root prompt and each trunk turn including all three user edits.
    assert.ok(out.includes("A  prompt  #e683be33"));
    assert.ok(out.includes("B  write      scenario21.py"));
    assert.ok(out.includes("D  user-edit  scenario21.py"));
    assert.ok(out.includes("E  edit       scenario21.py"));
    assert.ok(out.includes("F  user-edit  scenario21.py"));
    assert.ok(out.includes("G  edit       scenario21.py"));
    assert.ok(out.includes("H  user-edit  scenario21.py"));
    // It is linear: no rewind point and no branch headers are rendered.
    assert.ok(!out.includes("(rewind point)"));
    assert.ok(!out.includes("branch rewound"));
    assert.ok(!out.includes("branch surviving"));
});

// The fileDAG lists scenario21.py as write -> user-edit -> edit -> user-edit -> edit -> user-edit
// (all six turns with their changeIds), plus the test file's lone write.
test("test_S21_default_fileDAG_lists_all_six_turns_and_the_test_write", () => {
    const out = runCli([S21_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01MAX6e1"));
    assert.ok(out.includes("D  user-edit  #a4588e3c"));
    assert.ok(out.includes("E  edit       #012pCfid"));
    assert.ok(out.includes("F  user-edit  #ce4ae4a5"));
    assert.ok(out.includes("G  edit       #015ayHM2"));
    assert.ok(out.includes("H  user-edit  #6fe6b088"));
    assert.ok(out.includes("C  write      #012CK8yY"));
});

// --list-branches lists only the surviving branch (tip #49e4f32d) — there is no rewound branch.
test("test_S21_list_branches_shows_only_the_surviving_branch", () => {
    const out = runCli([S21_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("49e4f32d"));
    // No rewound branch, no rewind marker.
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("rewind @"));
});

// The surviving view KEEPS all three user edits and both Claude edits — the prepended comment,
// every method (increment from D, decrement from E, reset from F, get_count from G) is present.
test("test_S21_surviving_keeps_all_methods_and_the_prepended_comment", () => {
    const out = runCli([S21_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("# Counter class"));
    assert.ok(out.includes("    def increment(self): self.count += 1"));
    assert.ok(out.includes("    def decrement(self): self.count -= 1"));
    assert.ok(out.includes("    def reset(self): self.count = 0"));
    assert.ok(out.includes("    def get_count(self): return self.count"));
});

// POSITION LOCK — scenario21.py renders as six revisions; the final is 8 lines with the prepended
// comment on line 1, which pushes def get_count down to line 8 (proving H's prepend shifted every
// line below it and nothing was dropped).
test("test_S21_surviving_verbose_shows_six_revisions_and_locks_final_positions", () => {
    const out = runCli([S21_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 5"));
    assert.ok(out.includes("(8 lines)"));
    assert.ok(out.includes("1 | # Counter class"));
    assert.ok(out.includes("8 |     def get_count(self): return self.count"));
});
