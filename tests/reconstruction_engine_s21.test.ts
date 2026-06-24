import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S21_JSONL } from "./fixtures.ts";

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

// S21 is strictly linear — three user edits interleaved with two Claude edits, NO rewind. Branch
// enumeration must yield exactly one branch, the surviving one (tip 49e4f32d), with NO rewound
// branch and NO rewind point. (Same structural shape as S18; the multi-edit extension of it.)
test("test_S21_findConversationBranches_yields_only_the_surviving_branch", () => {
    // Load the real S21 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S21_JSONL));
    // Exactly one branch, and it is the surviving branch with tip 49e4f32d.
    assert.equal(branches.length, 1);
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.ok(surviving !== undefined);
    assert.equal(surviving.tip.toString().slice(0, 8), "49e4f32d");
    // No branch was rewound: none is non-surviving, and the surviving branch has no rewind point.
    assert.equal(branches.filter((branch) => !branch.isSurviving).length, 0);
    assert.equal(surviving.rewindPoint, undefined);
});

// With no rewind, branch-aware reconstruction yields zero rewound branches — the whole history
// (all three user edits + both Claude edits) lives on the surviving lineage.
test("test_S21_reconstructBranches_yields_no_rewound_branch", () => {
    // Reconstruct the branch-aware history.
    const branched = reconstructBranches(loadRecords(S21_JSONL));
    // There are no rewound branches at all.
    assert.equal(branched.rewound.length, 0);
});

// REGRESSION LOCK — the surviving scenario21.py is exactly SIX revisions whose kinds alternate
// write -> userEdit -> edit -> userEdit -> edit -> userEdit. The S19 reseed must NOT splice any
// synthetic overwrite/seed revision (every edit base is aligned because there is no rewind), and
// the final text is the exact 8-line on-disk ground truth (the prepend on top of all four methods).
test("test_S21_surviving_scenario_has_six_revisions_with_alternating_kinds_and_no_seed", () => {
    // Reconstruct the surviving files and take scenario21.py (not the test file).
    const branched = reconstructBranches(loadRecords(S21_JSONL));
    const scenario = historyEndingWith(branched.surviving, "scenario21.py", true);
    // Exactly six revisions — a fired reseed would add a seventh (overwrite) revision.
    assert.equal(scenario.revisions.length, 6);
    // The kinds alternate write, userEdit, edit, userEdit, edit, userEdit.
    assert.deepEqual(
        scenario.revisions.map((revision) => revision.kind),
        [
            EventKind.write,
            EventKind.userEdit,
            EventKind.edit,
            EventKind.userEdit,
            EventKind.edit,
            EventKind.userEdit,
        ],
    );
    // The final text is the exact 8-line ground truth.
    assert.equal(
        historyFinalText(scenario),
        "# Counter class\nclass Counter:\n    def __init__(self):\n        self.count = 0\n    def increment(self): self.count += 1\n    def decrement(self): self.count -= 1\n    def reset(self): self.count = 0\n    def get_count(self): return self.count",
    );
});

// Extraction surfaces exactly THREE user-edit events (D #a4588e3c, F #ce4ae4a5, H #6fe6b088),
// each interleaved after a write/edit. This locks that all three external edits are RECORDED as
// user-edit changes (the content-aware guard kept each because each differs from current), and
// that two Claude edits (E, G) and two writes (B, C) sit among them.
test("test_S21_extractFileEvents_records_three_user_edits_among_two_edits_and_two_writes", () => {
    // Extract every file event from the S21 transcript.
    const events = extractFileEvents(loadRecords(S21_JSONL));
    // Exactly three user-edit events, in order, with the expected attachment-uuid changeIds.
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)),
        ["a4588e3c", "ce4ae4a5", "6fe6b088"],
    );
    // Exactly two Claude edits and two writes (scenario21.py B + test_scenario21.py C).
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 2);
});
