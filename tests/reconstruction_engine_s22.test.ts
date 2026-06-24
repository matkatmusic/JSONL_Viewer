import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S22_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix` (and, when excludeTest, is not the test file).
function historyEndingWith(histories: FileHistory[], suffix: string, excludeTest: boolean): FileHistory {
    return histories.find((history) => {
        const path = history.target.toString();
        const matches = path.endsWith(suffix);
        return excludeTest ? matches && !path.includes("test_") : matches;
    })!;
}

// A conversation-only rewind forks the history into TWO branches: the surviving branch (tip
// adb42316, no rewind point of its own) and the rewound branch (tip 549149a1) whose rewindPoint
// is the root prompt A (f3ad1ed6). This is the structural shape S22 introduces — a user edit on
// each side of a conv rewind.
test("test_S22_findConversationBranches_yields_surviving_and_rewound_forked_at_the_rewind_point", () => {
    // Load the real S22 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S22_JSONL));
    // Exactly two branches.
    assert.equal(branches.length, 2);
    // The surviving branch has tip adb42316 and carries no rewind point.
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "adb42316");
    assert.equal(surviving.rewindPoint, undefined);
    // The rewound branch has tip 549149a1 and its rewindPoint is the root prompt f3ad1ed6.
    const rewound = branches.find((branch) => !branch.isSurviving)!;
    assert.equal(rewound.tip.toString().slice(0, 8), "549149a1");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "f3ad1ed6");
});

// REGRESSION LOCK — the surviving scenario22.py is exactly THREE revisions (write, userEdit, edit).
// Because the conversation-only rewind left the off-branch push+pop on disk, the surviving
// user-edit F's snapshot ABSORBS them: rev1 jumps from 3 lines to 6 (init+push+pop+peek) in a
// single userEdit. The S19 reseed must NOT splice a synthetic revision (it stays inert: F is a
// user-edit, and G's base is aligned), and the final text is the exact 7-line on-disk ground truth.
test("test_S22_surviving_scenario_absorbs_the_offbranch_edits_in_three_revisions_with_no_seed", () => {
    // Reconstruct the surviving files (NO reader) and take scenario22.py (not the test file).
    const branched = reconstructBranches(loadRecords(S22_JSONL));
    const scenario = historyEndingWith(branched.surviving, "scenario22.py", true);
    // Exactly three revisions — a fired reseed would add a fourth (overwrite) revision.
    assert.equal(scenario.revisions.length, 3);
    // The kinds are write, userEdit, edit.
    assert.deepEqual(
        scenario.revisions.map((revision) => revision.kind),
        [EventKind.write, EventKind.userEdit, EventKind.edit],
    );
    // The surviving user-edit (rev1) absorbs the off-branch push+pop: it is six lines.
    assert.equal(scenario.revisions[1]!.lines.length, 6);
    // The final text is the exact 7-line ground truth.
    assert.equal(
        historyFinalText(scenario),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n    def pop(self): return self.items.pop()\n    def peek(self): return self.items[-1] if self.items else None\n    def is_empty(self): return len(self.items) == 0",
    );
});

// The rewound (abandoned) branch is reconstructed and scoped to scenario22.py. On THIS branch the
// user-edit D adds only ONE line (push), because the abandoned-branch disk then held just
// init+push — the same user-edit kind that adds three lines on the surviving branch. It ends at the
// 5-line init+push+pop file (D's push, then E's pop), never seeing peek or is_empty.
test("test_S22_rewound_branch_reconstructs_to_init_push_pop", () => {
    // Reconstruct the branch-aware history (NO reader).
    const branched = reconstructBranches(loadRecords(S22_JSONL));
    // There is exactly one rewound branch, with tip 549149a1 and rewindPoint f3ad1ed6.
    assert.equal(branched.rewound.length, 1);
    const rewound = branched.rewound[0]!;
    assert.equal(rewound.tip.toString().slice(0, 8), "549149a1");
    assert.equal(rewound.rewindPoint.toString().slice(0, 8), "f3ad1ed6");
    // Its scenario22.py is three revisions: write, userEdit (push), edit (pop).
    const scenario = historyEndingWith(rewound.histories, "scenario22.py", true);
    assert.equal(scenario.revisions.length, 3);
    assert.deepEqual(
        scenario.revisions.map((revision) => revision.kind),
        [EventKind.write, EventKind.userEdit, EventKind.edit],
    );
    // It ends at the 5-line init+push+pop file — no peek, no is_empty.
    assert.equal(
        historyFinalText(scenario),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n    def pop(self): return self.items.pop()",
    );
});

// Extraction surfaces exactly TWO user-edit events (D #eea066db on the abandoned branch, F
// #5df7ac59 on the surviving branch), each recorded because its content differs from current
// (the S15 content-aware guard). Two Claude edits (E, G) and two writes (B scenario22.py, C
// test_scenario22.py) sit among them.
test("test_S22_extractFileEvents_records_two_user_edits_among_two_edits_and_two_writes", () => {
    // Extract every file event from the S22 transcript.
    const events = extractFileEvents(loadRecords(S22_JSONL));
    // Exactly two user-edit events, in order, with the expected attachment-uuid changeIds.
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)),
        ["eea066db", "5df7ac59"],
    );
    // Exactly two Claude edits and two writes.
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 2);
});
