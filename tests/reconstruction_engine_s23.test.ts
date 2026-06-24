import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S23_JSONL } from "./fixtures.ts";

// The real pre-edit backup blobs, keyed by the backupFileName the snapshots name — the in-memory
// sidecar the surviving-branch seed recovers G's stale Edit base from. The seed reads only the v5
// blob (the real `init + size + push` disk the uncaptured `size` user-edit produced); v4 is included
// for completeness. Mirrors the S19 reader.
const S23_BACKUPS: Record<string, string> = {
    "11be2855feaa5668@v4": "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n",
    "11be2855feaa5668@v5":
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def size(self): return len(self.items)\n    def push(self, item): self.items.append(item)\n",
};
const s23Reader: BackupReader = (name) => S23_BACKUPS[name.toString()] ?? "";

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

test("test_S23_surviving_scenario_file_absorbs_uncaptured_user_size_edit", () => {
    // The surviving scenario23.py must reconstruct to the on-disk ground truth: G's is_empty edit
    // applied to the v5 disk base (init + size + push), with size on line 4 and a single push on line 5.
    const histories = reconstructAll(loadRecords(S23_JSONL), s23Reader);
    const scenario = historyEndingWith(histories, "scenario23.py", true);
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def size(self): return len(self.items)\n    def push(self, item): self.items.append(item)\n\n    def is_empty(self):\n        return len(self.items) == 0",
    );
});

test("test_S23_findConversationBranches_yields_surviving_and_rewound", () => {
    const branches = findConversationBranches(loadRecords(S23_JSONL));
    assert.equal(branches.length, 2);
    const surviving = branches.find((b) => b.isSurviving)!;
    const rewound = branches.find((b) => !b.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "f224cf19");
    assert.equal(surviving.rewindPoint, undefined);
    assert.equal(rewound.tip.toString().slice(0, 8), "e62d73ad");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "bbf6cd91");
});

test("test_S23_surviving_scenario_file_has_seeded_v5_base_revision", () => {
    // Four revisions: B's write, F's restore-echo user-edit, the synthetic v5 seed (overwrite), G's edit.
    const branched = reconstructBranches(loadRecords(S23_JSONL), s23Reader);
    const scenario = historyEndingWith(branched.surviving, "scenario23.py", true);
    assert.equal(scenario.revisions.length, 4);
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.userEdit);
    assert.equal(scenario.revisions[2]!.kind, EventKind.overwrite);
    assert.equal(scenario.revisions[3]!.kind, EventKind.edit);
    // The seeded revision is exactly the v5 on-disk content (init + size + push).
    assert.equal(
        finalTextOf(scenario.revisions[2]!),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def size(self): return len(self.items)\n    def push(self, item): self.items.append(item)",
    );
});

test("test_S23_rewound_scenario_file_is_init_push_pop_three_revisions", () => {
    // The rewound branch is unaffected by the fix: D (push) then E (pop), ending at 5 lines.
    const branched = reconstructBranches(loadRecords(S23_JSONL), s23Reader);
    const rewoundBranch = branched.rewound.find((branch) => branch.tip.toString().slice(0, 8) === "e62d73ad")!;
    const scenario = historyEndingWith(rewoundBranch.histories, "scenario23.py", true);
    assert.equal(scenario.revisions.length, 3);
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n    def pop(self): return self.items.pop()",
    );
});
