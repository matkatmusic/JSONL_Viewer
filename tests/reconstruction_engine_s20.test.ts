import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S20_JSONL } from "./fixtures.ts";

// The pre-edit backup blobs keyed by the names the snapshots use. S20's surviving edit (G) is
// aligned with the 3-line user-tweak base, so the S19 reseed never reads these — they are supplied
// only to keep the reseed code path active so Task-1 test 3 can prove it stays dormant.
const S20_BACKUPS: Record<string, string> = {
    "29ba685652bbe1e0@v2": "def add(a, b):\n    return a + b\n# user tweak\n",
    "29ba685652bbe1e0@v4": "def add(a, b):\n    return a + b\n# user tweak\n",
};
const s20Reader: BackupReader = (name) => S20_BACKUPS[name.toString()] ?? "";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The history whose final path ends with `suffix` (and, when excludeTest, is not the test file).
function historyEndingWith(histories: FileHistory[], suffix: string, excludeTest: boolean): FileHistory {
    return histories.find((history) => {
        const path = history.target.toString();
        const matches = path.endsWith(suffix);
        return excludeTest ? matches && !path.includes("test_") : matches;
    })!;
}

test("test_S20_surviving_file_keeps_user_tweak_and_ends_with_multiply", () => {
    // Behavior: the surviving scenario20.py reconstructs to the 7-line on-disk ground truth —
    // the code-rewind restore kept `# user tweak` on line 3 and G's multiply was applied after
    // the two blank lines. Steps:
    // reconstruct every file history for S20.
    const histories = reconstructAll(loadRecords(S20_JSONL), s20Reader);
    // find the scenario file (not the test file).
    const scenario = historyEndingWith(histories, "scenario20.py", true);
    // assert its final text is the exact 7-line ground truth.
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "def add(a, b):\n    return a + b\n# user tweak\n\n\ndef multiply(a, b):\n    return a * b",
    );
});

test("test_S20_findConversationBranches_yields_surviving_and_rewound", () => {
    // Behavior: the code rewind forks the conversation into a surviving and a rewound branch at A.
    // Steps:
    // enumerate the branches.
    const branches = findConversationBranches(loadRecords(S20_JSONL));
    // assert there are exactly two.
    assert.equal(branches.length, 2);
    const surviving = branches.find((b) => b.isSurviving)!;
    const rewound = branches.find((b) => !b.isSurviving)!;
    // the surviving branch's tip is #cacc87c7 and it has no rewind point.
    assert.equal(surviving.tip.toString().slice(0, 8), "cacc87c7");
    assert.equal(surviving.rewindPoint, undefined);
    // the rewound branch's tip is #51227411 and it was rewound at A (#e76a23d3).
    assert.equal(rewound.tip.toString().slice(0, 8), "51227411");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "e76a23d3");
});

test("test_S20_surviving_file_has_three_revisions_and_no_synthetic_seed", () => {
    // Behavior: REGRESSION LOCK — the surviving scenario20.py is exactly three revisions
    // (B write, F user-edit, G edit). The S19 reseed must NOT splice a synthetic overwrite,
    // because F already advances the base to the 3-line disk state that G aligns with.
    // Steps:
    // reconstruct the branches with the reader present (reseed path active).
    const branched = reconstructBranches(loadRecords(S20_JSONL), s20Reader);
    const scenario = historyEndingWith(branched.surviving, "scenario20.py", true);
    // assert exactly three revisions.
    assert.equal(scenario.revisions.length, 3);
    // assert the kinds are write -> userEdit -> edit (NOT write -> overwrite -> edit, which is
    // what a fired reseed would produce).
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.userEdit);
    assert.equal(scenario.revisions[2]!.kind, EventKind.edit);
    // assert the middle (user-edit) revision is the 3-line code-rewind restore state.
    assert.equal(
        finalTextOf(scenario.revisions[1]!),
        "def add(a, b):\n    return a + b\n# user tweak",
    );
});

test("test_S20_surviving_test_file_is_a_single_write_revision", () => {
    // Behavior: tests/test_scenario20.py is untouched after its initial write, so it has one revision.
    // Steps:
    // reconstruct the branches and find the test file on the surviving branch.
    const branched = reconstructBranches(loadRecords(S20_JSONL), s20Reader);
    const testFile = branched.surviving.find((h) => h.target.toString().endsWith("test_scenario20.py"))!;
    // assert exactly one revision, of kind write.
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});
