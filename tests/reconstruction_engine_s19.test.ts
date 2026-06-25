import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
} from "../src/reconstruction_sidecar.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S19_JSONL } from "./fixtures.ts";

// s19 was re-run (2026-06-25; in-worktree transcript d8a5cf41-…) with fresh file-history backups.
// These tests read the REAL on-disk file-history reader for that session — exactly as the CLI
// builds it — rather than a hardcoded blob map, so they track the live ground truth. In the re-run the
// surviving branch interleaves as add → multiply → tweak → subtract (the rewound `subtract` survives on
// disk and the post-rewind `multiply` edit is spliced before it).

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The real on-disk file-history reader for this transcript's session, built exactly as the CLI builds it.
function realReader(records: ReturnType<typeof loadRecords>): BackupReader {
    return createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
}

// The history whose final path ends with `suffix` (and, when excludeTest, is not the test file).
function historyEndingWith(histories: FileHistory[], suffix: string, excludeTest: boolean): FileHistory {
    return histories.find((history) => {
        const path = history.target.toString();
        const matches = path.endsWith(suffix);
        return excludeTest ? matches && !path.includes("test_") : matches;
    })!;
}

test("test_S19_surviving_scenario_file_keeps_off_branch_subtract_and_splices_multiply", () => {
    // The surviving scenario19.py reconstructs to the on-disk ground truth: the rewound branch's
    // `subtract` survives on disk, and F's `multiply` edit is applied to that base — yielding
    // add → multiply → `# user tweak` → subtract (the engine drops the file's single trailing newline).
    const histories = reconstructAll(loadRecords(S19_JSONL), realReader(loadRecords(S19_JSONL)));
    const scenario = historyEndingWith(histories, "scenario19.py", true);
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "def add(a, b):\n    return a + b\n\n\ndef multiply(a, b):\n    return a * b\n# user tweak\n\n\ndef subtract(a, b):\n    return a - b",
    );
});

test("test_S19_findConversationBranches_yields_surviving_and_rewound", () => {
    const branches = findConversationBranches(loadRecords(S19_JSONL));
    assert.equal(branches.length, 2);
    const surviving = branches.find((b) => b.isSurviving)!;
    const rewound = branches.find((b) => !b.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "620ef9f7");
    assert.equal(surviving.rewindPoint, undefined);
    assert.equal(rewound.tip.toString().slice(0, 8), "66a6d627");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "e4196ca9");
});

test("test_S19_surviving_scenario_file_has_seeded_backup_base_revision", () => {
    // Three revisions: B's `add` write, the backup-seeded base (overwrite) = the disk state the rewound
    // branch left behind (add + `# user tweak` + subtract), then F's multiply edit on that base.
    const branched = reconstructBranches(loadRecords(S19_JSONL), realReader(loadRecords(S19_JSONL)));
    const scenario = historyEndingWith(branched.surviving, "scenario19.py", true);
    assert.equal(scenario.revisions.length, 3);
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.overwrite);
    assert.equal(scenario.revisions[2]!.kind, EventKind.edit);
    // The seeded middle revision is exactly the rewound-branch disk state F edited.
    assert.equal(
        finalTextOf(scenario.revisions[1]!),
        "def add(a, b):\n    return a + b\n# user tweak\n\n\ndef subtract(a, b):\n    return a - b",
    );
});

test("test_S19_surviving_test_file_is_a_single_write_revision", () => {
    const branched = reconstructBranches(loadRecords(S19_JSONL), realReader(loadRecords(S19_JSONL)));
    const testFile = branched.surviving.find((h) => h.target.toString().endsWith("test_scenario19.py"))!;
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});
