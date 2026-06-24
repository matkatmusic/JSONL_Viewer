import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S12_JSONL } from "./fixtures.ts";

// The real pre-edit backup blobs (snapshotted @16:09:52, before the surviving branch's edits), keyed
// by the backupFileName the snapshots name — the in-memory sidecar the seed recovers the Edit base
// from. Mirrors the reconstruction_engine_s5.test.ts in-memory reader pattern.
const S12_BACKUPS: Record<string, string> = {
    "43c1313ce6fd5f24@v2": "def add(a, b):\n    return a + b\n",
    "06083fd98836d88e@v2": "from scenario12 import add\n\n\ndef test_add():\n    assert add(1, 2) == 3\n",
};
const s12Reader: BackupReader = (name) => S12_BACKUPS[name.toString()] ?? "";

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

// The surviving scenario12.py is the seeded `add` base (recovered from the file-history backup) plus
// the `multiply` Edit — two revisions whose final text holds BOTH functions.
test("test_s12_surviving_scenario_file_is_seeded_add_base_then_multiply_edit", () => {
    const histories = reconstructAll(loadRecords(S12_JSONL), s12Reader);
    const scenario = historyEndingWith(histories, "scenario12.py", true);
    // Two revisions: the seeded write (the `add` base) then the `multiply` edit.
    assert.equal(scenario.revisions.length, 2);
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.edit);
    // The last revision is the real `multiply` Edit (changeId toolu_01NjGUyN…).
    assert.ok(scenario.revisions[1]!.changeId.toString().endsWith("01NjGUyNRPyhZYw4Ws1HtjYE"));
    // Its final text carries the recovered base (`def add`) AND the edit's addition (`def multiply`).
    const finalText = finalTextOf(scenario.revisions[1]!);
    assert.ok(finalText.includes("def add"));
    assert.ok(finalText.includes("def multiply"));
});

// The surviving test file's final text imports/uses multiply (the Edit added the multiply test).
test("test_s12_surviving_test_file_imports_multiply", () => {
    const histories = reconstructAll(loadRecords(S12_JSONL), s12Reader);
    const testFile = historyEndingWith(histories, "test_scenario12.py", false);
    const last = testFile.revisions[testFile.revisions.length - 1]!;
    assert.ok(finalTextOf(last).includes("multiply"));
});

// reconstructBranches keeps the abandoned `add` turn as exactly ONE rewound branch, forked at the
// rewind point 94000895, whose scenario12.py is the real `add` Write (toolu_015zSRxJ…).
test("test_s12_reconstruct_branches_keeps_one_rewound_add_branch", () => {
    const branched = reconstructBranches(loadRecords(S12_JSONL), s12Reader);
    // Exactly one rewound branch (the abandoned add turn that wrote files).
    assert.equal(branched.rewound.length, 1);
    const rewound = branched.rewound[0]!;
    // It forked at the rewind point 94000895.
    assert.ok(rewound.rewindPoint.toString().startsWith("94000895"));
    // Its scenario12.py is the real `add` Write, identified by its changeId.
    const changeIds = rewound.histories.flatMap((history) =>
        history.revisions.map((revision) => revision.changeId.toString()),
    );
    assert.ok(changeIds.some((id) => id.endsWith("015zSRxJ93FV3tpqoy4kZ3AR")));
});
