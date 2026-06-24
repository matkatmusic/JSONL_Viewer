import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M5_JSONL } from "./fixtures.ts";

// m5 is the first m-series scenario with a rewind, so its conversationDAG is BRANCHED: the root
// prompt A is the rewind point, with a rewound branch (D user-edit, E edit) and a surviving branch
// (F user-edit, G edit) beneath it.
test("test_m5_default_conversationDAG_shows_rewind_with_two_branches", () => {
    const out = runCli([M5_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #b3aed408   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #fcd9c268; rewind @ #b3aed408)"));
    assert.ok(out.includes("D  user-edit  m5_interleave.py  #5f68c3e1"));
    assert.ok(out.includes("E  edit       m5_interleave.py  #01YM4bk4"));
    assert.ok(out.includes("branch surviving (surviving; tip #93e7f94c)"));
    assert.ok(out.includes("F  user-edit  m5_interleave.py  #84166ae7"));
    assert.ok(out.includes("G  edit       m5_interleave.py  #0144beFx"));
});

// The fileDAG groups all five m5_interleave.py events in order, plus the single test-file write.
test("test_m5_default_fileDAG_groups_two_files_in_event_order", () => {
    const out = runCli([M5_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m5_interleave.py\n  B  write      #01Mbgcvf\n  D  user-edit  #5f68c3e1\n  E  edit       #01YM4bk4\n  F  user-edit  #84166ae7\n  G  edit       #0144beFx",
    ));
    assert.ok(out.includes("test_m5_interleave.py\n  C  write      #01C4Qun2"));
});

// Two branches: surviving (two files), rewound (one file), with the rewind-point marker.
test("test_m5_list_branches_surviving_two_files_and_rewound_one_file", () => {
    const out = runCli([M5_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #93e7f94c    m5_interleave.py, test_m5_interleave.py"));
    assert.ok(out.includes("rewound    tip #fcd9c268  rewind @ #b3aed408    m5_interleave.py"));
});

// THE BACKUP-RECOVERY BYTE-LOCK (end-to-end through the real on-disk reader): the surviving verbose
// shows revision 2 = the @v5 overwrite recovered from the file-history backup (the 4-line block
// including user_add_2), and exactly four revisions (0..3), no fifth.
test("test_m5_surviving_verbose_recovers_user_add_2_from_backup", () => {
    const out = runCli([M5_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes(
        '(4 lines)\n     1 | def base():\n     2 |     return "base"\n     3 | def user_add_1(): return "user1"\n     4 | def user_add_2(): return "user2"',
    ));
    assert.ok(out.includes("revision 3"));
    assert.ok(!out.includes("revision 4"));
});

// THE FINAL GROUND-TRUTH BYTE-LOCK: the surviving final revision is the 5-line interleaved file.
test("test_m5_surviving_verbose_final_revision_is_five_line_ground_truth", () => {
    const out = runCli([M5_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes(
        '(5 lines)\n     1 | def base():\n     2 |     return "base"\n     3 | def user_add_1(): return "user1"\n     4 | def user_add_2(): return "user2"\n     5 | def agent_add_2(): return "agent2"',
    ));
});
