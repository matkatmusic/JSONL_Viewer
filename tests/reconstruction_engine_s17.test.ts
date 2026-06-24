import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S17_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (its last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// The abandoned `farewell` edit is a rewound branch discovered STRUCTURALLY: its tip 07038b43 is named
// by no last-prompt head (the conv-only rewind re-prompted from the fork), so branch enumeration must
// find it from the parentUuid fork at the system record 4a69b697. The surviving branch keeps the final
// head e53225b5.
// Steps:
//   - Load the real S17 transcript and enumerate its branches.
//   - The surviving branch's tip is the final head e53225b5.
//   - A non-surviving branch has tip 07038b43, forked at the rewind point 4a69b697.
test("test_S17_findConversationBranches_includes_the_structural_rewound_branch", () => {
    const branches = findConversationBranches(loadRecords(S17_JSONL));
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "e53225b5");
    const rewound = branches.find((branch) => branch.tip.toString().slice(0, 8) === "07038b43")!;
    assert.ok(rewound !== undefined);
    assert.equal(rewound.isSurviving, false);
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "4a69b697");
});

// Exactly one rewound branch, and it touches scenario17.py only (the test file was never edited
// off-trunk). Enumeration is clean — no degenerate head-based branch to filter.
// Steps:
//   - Reconstruct the branch-aware history.
//   - There is exactly one rewound branch.
//   - Its histories cover only scenario17.py.
test("test_S17_reconstructBranches_yields_one_rewound_branch_touching_only_scenario17", () => {
    const branched = reconstructBranches(loadRecords(S17_JSONL));
    assert.equal(branched.rewound.length, 1);
    const targets = branched.rewound[0]!.histories.map((history) => history.target.toString());
    assert.equal(targets.length, 1);
    assert.ok(targets[0]!.endsWith("scenario17.py"));
});

// Reconstructing the rewound branch replays the trunk greet Write then the abandoned `farewell` Edit, so
// its scenario17.py final text holds farewell and NOT shout. (Same as S16's rewound branch — D's edit is
// identical across the twins.)
// Steps:
//   - Reconstruct the branch-aware history and take the rewound branch's scenario17.py.
//   - Its final text contains `def farewell(name):` and not `def shout(name):`.
test("test_S17_rewound_branch_content_is_the_abandoned_farewell_edit", () => {
    const branched = reconstructBranches(loadRecords(S17_JSONL));
    const scenario = historyEndingWith(branched.rewound[0]!.histories, "scenario17.py");
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def farewell(name):"));
    assert.ok(!finalText.includes("def shout(name):"));
});

// THE S17 vs S16 INVERSION. The conv-only rewind KEEPS farewell on disk, so the surviving `shout` re-edit
// anchors on farewell; the spec-39 born-path materialises that off-branch farewell context, so the
// surviving scenario17.py is greet + farewell + shout: two revisions (the greet Write, then one Edit
// revision) whose final text contains BOTH `def farewell(name):` AND `def shout(name):`.
// (Contrast S16, whose code restore dropped farewell — there the surviving tree had shout but NOT
// farewell. Do NOT copy S16's `!includes("farewell")` assertion here.)
// Steps:
//   - Run the default (surviving-branch) reconstruction and take scenario17.py.
//   - It has exactly two revisions.
//   - Its final text contains BOTH `def farewell(name):` and `def shout(name):`.
test("test_S17_surviving_branch_keeps_farewell_and_adds_shout", () => {
    const surviving = reconstructAll(loadRecords(S17_JSONL));
    const scenario = historyEndingWith(surviving, "scenario17.py");
    assert.equal(scenario.revisions.length, 2);
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def farewell(name):"));
    assert.ok(finalText.includes("def shout(name):"));
});
