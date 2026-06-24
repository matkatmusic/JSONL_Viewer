import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S18_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// S18 is strictly linear — no rewind, no fork. Branch enumeration must yield exactly one branch,
// the surviving one (tip 503a45bb), with NO rewound branch and NO rewind point. This is the
// structural inversion of S15 (which forks into a rewound user-edit branch + a surviving Read branch).
test("test_S18_findConversationBranches_yields_only_the_surviving_branch", () => {
    // Load the real S18 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S18_JSONL));
    // Exactly one branch, and it is the surviving branch with tip 503a45bb.
    assert.equal(branches.length, 1);
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.ok(surviving !== undefined);
    assert.equal(surviving.tip.toString().slice(0, 8), "503a45bb");
    // No branch was rewound: none is non-surviving, and the surviving branch has no rewind point.
    assert.equal(branches.filter((branch) => !branch.isSurviving).length, 0);
    assert.equal(surviving.rewindPoint, undefined);
});

// With no rewind, branch-aware reconstruction yields zero rewound branches — the whole history lives
// on the surviving lineage. (S15's analogue yields exactly one rewound branch; S18 yields none.)
test("test_S18_reconstructBranches_yields_no_rewound_branch", () => {
    // Reconstruct the branch-aware history.
    const branched = reconstructBranches(loadRecords(S18_JSONL));
    // There are no rewound branches at all.
    assert.equal(branched.rewound.length, 0);
});

// The surviving scenario18.py keeps the user's out-of-band edit AND the later farewell edit that was
// anchored on top of it: three revisions (greet → +user comment → +farewell), final text holding all
// three markers. This is the headline: the user edit is recorded on the surviving lineage and the
// subsequent Claude edit builds on it.
test("test_S18_surviving_scenario18_keeps_user_edit_and_adds_farewell", () => {
    // Reconstruct the surviving files and take scenario18.py.
    const surviving = reconstructAll(loadRecords(S18_JSONL));
    const scenario = historyEndingWith(surviving, "scenario18.py");
    // Three revisions: greet write, user edit, farewell edit.
    assert.equal(scenario.revisions.length, 3);
    // The final text holds the user's comment, the original greet, and the added farewell.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("# user was here"));
    assert.ok(finalText.includes("def greet(name):"));
    assert.ok(finalText.includes("def farewell(name):"));
});

// Extraction surfaces exactly one user-edit event (changeId 8902b3f0), ordered after the two trunk
// write events. This locks the fact that the external edit is RECORDED as a user-edit change (the
// content-aware guard kept it because it differs from what B wrote).
test("test_S18_extractFileEvents_records_one_user_edit_after_the_writes", () => {
    // Extract every file event from the S18 transcript.
    const events = extractFileEvents(loadRecords(S18_JSONL));
    // Exactly one user-edit event, identified by the attachment record's uuid 8902b3f0.
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 1);
    assert.equal(userEdits[0]!.changeId.toString().slice(0, 8), "8902b3f0");
    // It is ordered after both trunk write events (the user edited the file after it was written).
    const writeCount = events.filter((event) => event.kind === EventKind.write).length;
    const userEditIndex = events.findIndex((event) => event.kind === EventKind.userEdit);
    assert.equal(writeCount, 2);
    assert.ok(userEditIndex >= writeCount);
});
