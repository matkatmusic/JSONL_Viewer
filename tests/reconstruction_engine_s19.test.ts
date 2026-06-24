import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S19_JSONL } from "./fixtures.ts";

// The real pre-edit backup blobs, keyed by the backupFileName the snapshots name — the in-memory
// sidecar the surviving-branch seed recovers F's stale Edit base from. The seed reads only the v3
// blob (the disk state E left behind); v2 is included for completeness. Mirrors the S12 reader.
const S19_BACKUPS: Record<string, string> = {
    "928642d7d0c1c258@v2": "def add(a, b):\n    return a + b\n# user tweak\n",
    "928642d7d0c1c258@v3":
        "def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak\n",
};
const s19Reader: BackupReader = (name) => S19_BACKUPS[name.toString()] ?? "";

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

test("test_S19_surviving_scenario_file_keeps_off_branch_subtract_with_blank_lines", () => {
    // The surviving scenario19.py must reconstruct to the on-disk ground truth: F's multiply edit
    // applied to the v3 disk base, INCLUDING the two blank lines between `add` and `subtract`.
    const histories = reconstructAll(loadRecords(S19_JSONL), s19Reader);
    const scenario = historyEndingWith(histories, "scenario19.py", true);
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak\n\n\ndef multiply(a, b):\n    return a * b",
    );
});

test("test_S19_findConversationBranches_yields_surviving_and_rewound", () => {
    const branches = findConversationBranches(loadRecords(S19_JSONL));
    assert.equal(branches.length, 2);
    const surviving = branches.find((b) => b.isSurviving)!;
    const rewound = branches.find((b) => !b.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "66840964");
    assert.equal(surviving.rewindPoint, undefined);
    assert.equal(rewound.tip.toString().slice(0, 8), "7087c57e");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "b1368b53");
});

test("test_S19_surviving_scenario_file_has_seeded_backup_base_revision", () => {
    // Three revisions: B's `add` write, the synthetic v3 backup seed (overwrite), then F's edit.
    const branched = reconstructBranches(loadRecords(S19_JSONL), s19Reader);
    const scenario = historyEndingWith(branched.surviving, "scenario19.py", true);
    assert.equal(scenario.revisions.length, 3);
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.overwrite);
    assert.equal(scenario.revisions[2]!.kind, EventKind.edit);
    // The seeded middle revision is exactly the v3 on-disk content (7 lines incl. the two blanks).
    assert.equal(
        finalTextOf(scenario.revisions[1]!),
        "def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak",
    );
});

test("test_S19_surviving_test_file_is_a_single_write_revision", () => {
    const branched = reconstructBranches(loadRecords(S19_JSONL), s19Reader);
    const testFile = branched.surviving.find((h) => h.target.toString().endsWith("test_scenario19.py"))!;
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});
