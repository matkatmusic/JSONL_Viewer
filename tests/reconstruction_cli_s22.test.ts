import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S22_JSONL } from "./fixtures.ts";

// S22's conversationDAG FORKS at the rewind point: the root prompt A is the rewind point, the
// rewound branch holds D (user-edit push) + E (edit pop), and the surviving branch holds F
// (user-edit peek) + G (edit is_empty).
test("test_S22_default_conversationDAG_forks_into_rewound_and_surviving_at_the_rewind_point", () => {
    const out = runCli([S22_JSONL]);
    // The root prompt is marked as the rewind point.
    assert.ok(out.includes("A  prompt  #f3ad1ed6   (rewind point)"));
    // The rewound branch header and its two turns.
    assert.ok(out.includes("branch rewound (rewound; tip #549149a1; rewind @ #f3ad1ed6)"));
    assert.ok(out.includes("D  user-edit  scenario22.py  #eea066db"));
    assert.ok(out.includes("E  edit       scenario22.py  #01UWTUSU"));
    // The surviving branch header and its two turns.
    assert.ok(out.includes("branch surviving (surviving; tip #adb42316)"));
    assert.ok(out.includes("F  user-edit  scenario22.py  #5df7ac59"));
    assert.ok(out.includes("G  edit       scenario22.py  #01Chd9Wv"));
});

// The fileDAG lists scenario22.py's five change events across both branches (write, both
// user-edits, both Claude edits) with their changeIds, plus the test file's lone write.
test("test_S22_default_fileDAG_lists_both_branches_edits_and_the_test_write", () => {
    const out = runCli([S22_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01DQ5FKj"));
    assert.ok(out.includes("D  user-edit  #eea066db"));
    assert.ok(out.includes("E  edit       #01UWTUSU"));
    assert.ok(out.includes("F  user-edit  #5df7ac59"));
    assert.ok(out.includes("G  edit       #01Chd9Wv"));
    assert.ok(out.includes("C  write      #018QRZd1"));
});

// --list-branches lists BOTH branches: the surviving branch (tip #adb42316, owning both files)
// and the rewound branch (tip #549149a1) with its rewind marker.
test("test_S22_list_branches_shows_surviving_and_rewound", () => {
    const out = runCli([S22_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("adb42316"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("549149a1"));
    assert.ok(out.includes("rewind @ #f3ad1ed6"));
});

// The surviving view KEEPS the off-branch push+pop (absorbed by F's snapshot) plus the surviving
// peek (F) and is_empty (G) — all four methods are present in the final surviving file.
test("test_S22_surviving_keeps_offbranch_push_pop_and_the_surviving_peek_and_is_empty", () => {
    const out = runCli([S22_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("    def push(self, item): self.items.append(item)"));
    assert.ok(out.includes("    def pop(self): return self.items.pop()"));
    assert.ok(out.includes("    def peek(self): return self.items[-1] if self.items else None"));
    assert.ok(out.includes("    def is_empty(self): return len(self.items) == 0"));
});

// POSITION LOCK — the surviving scenario22.py renders as three revisions; the user-edit (rev1)
// absorbs the off-branch edits to six lines, and the final (rev2) is seven lines with push on line
// 4 and is_empty on line 7 (proving nothing was dropped when F absorbed the off-branch push+pop).
test("test_S22_surviving_verbose_shows_three_revisions_and_locks_final_positions", () => {
    const out = runCli([S22_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 2"));
    assert.ok(out.includes("(6 lines)"));
    assert.ok(out.includes("(7 lines)"));
    assert.ok(out.includes("4 |     def push(self, item): self.items.append(item)"));
    assert.ok(out.includes("7 |     def is_empty(self): return len(self.items) == 0"));
});
