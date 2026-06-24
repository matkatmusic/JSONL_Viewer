import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import type { FileRevision, FileHistory } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { M5_JSONL } from "./fixtures.ts";

// m5's user_add_2 out-of-band edit (F) leaves NO content in the JSONL — its disk state
// (base+user_add_1+user_add_2) lives ONLY in the file-history backup 17bbea89afb745a4@v5.
// The surviving agent_add_2 Edit (G) was computed against that disk, so its hunk base is stale
// (the reconstructed on-branch base is only 3 lines) and seedStaleEditBases recovers @v5 as a
// synthetic overwrite revision before replaying G — the S19 "base too short" reseed, ACTIVE here
// (the firing complement of m3, where it stays dormant). In-memory reader so the engine tests
// don't depend on the live ~/.claude/file-history tree (mirrors engine_m3 / engine_s5).
const M5_BACKUPS: Record<string, string> = {
    "17bbea89afb745a4@v5":
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"\n',
};
const m5Reader: BackupReader = (name) => M5_BACKUPS[name.toString()] ?? "";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// Pick the history whose target ends with the given (leading-slash) suffix.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    const match = histories.find((history) => history.target.toString().endsWith(suffix));
    assert.ok(match, `no history ending with ${suffix}`);
    return match;
}

// The surviving source is FOUR revisions [write, user-edit, overwrite, edit]; the overwrite is the
// backup-seeded @v5, and the final text is the 5-line ground truth.
test("test_m5_surviving_source_is_write_useredit_overwrite_edit_four_revisions", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL), m5Reader);
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    assert.equal(source.revisions.length, 4);
    assert.deepEqual(
        source.revisions.map((revision) => revision.kind),
        [EventKind.write, EventKind.userEdit, EventKind.overwrite, EventKind.edit],
    );
    assert.equal(
        finalTextOf(source.revisions[3]!),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"\ndef agent_add_2(): return "agent2"',
    );
});

// THE CRUX (S19 reseed FIRES): the user_add_2 disk state is recovered from the backup and spliced
// as a synthetic overwrite revision (changeId = the backup filename) before the agent_add_2 Edit.
test("test_m5_user_add_2_recovered_from_backup_as_seeded_overwrite", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL), m5Reader);
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    const seeded = source.revisions[2]!;
    assert.equal(seeded.kind, EventKind.overwrite);
    assert.equal(seeded.changeId.toString(), "17bbea89afb745a4@v5");
    assert.equal(
        finalTextOf(seeded),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"',
    );
});

// Reader-independence of the ENDPOINT: WITHOUT a reader the @v5 overwrite is dropped (3 revisions,
// no overwrite), but the surviving final text is byte-identical — the reader changes only the
// intermediate ladder, never the endpoint.
test("test_m5_without_reader_drops_seeded_overwrite_final_text_unchanged", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL));
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    assert.equal(source.revisions.length, 3);
    assert.ok(!source.revisions.some((revision) => revision.kind === EventKind.overwrite));
    assert.equal(
        finalTextOf(source.revisions[source.revisions.length - 1]!),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"\ndef agent_add_2(): return "agent2"',
    );
});

// user_add_1 is KEPT on the surviving branch across the code rewind (S18/S20/S22 behavior); the
// surviving copy (F) has a DISTINCT changeId from the rewound copy (D). Surviving keeps two files;
// the sibling test file is a single write revision.
test("test_m5_user_add_1_kept_on_surviving_branch_across_code_rewind", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL), m5Reader);
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    const userEdit = source.revisions[1]!;
    assert.equal(userEdit.kind, EventKind.userEdit);
    assert.equal(userEdit.changeId.toString(), "84166ae7-b7ba-42af-ae9f-74a4d070867e");
    assert.equal(
        finalTextOf(userEdit),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"',
    );
    assert.equal(branches.surviving.length, 2);
    const testFile = historyEndingWith(branches.surviving, "/test_m5_interleave.py");
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});

// The rewound branch is base + user_add_1 + agent_add_1 (3 revisions [write, user-edit, edit]),
// and is READER-INDEPENDENT: agent_add_1's base is aligned, so seedStaleEditBases stays INERT here.
test("test_m5_rewound_branch_is_base_useredit_agentedit_reader_independent", () => {
    for (const branches of [
        reconstructBranches(loadRecords(M5_JSONL), m5Reader),
        reconstructBranches(loadRecords(M5_JSONL)),
    ]) {
        assert.equal(branches.rewound.length, 1);
        const rewound = branches.rewound[0]!;
        assert.equal(rewound.tip.toString(), "fcd9c268-cf98-4522-973d-c3356a58400f");
        const source = historyEndingWith(rewound.histories, "/m5_interleave.py");
        assert.equal(source.revisions.length, 3);
        assert.deepEqual(
            source.revisions.map((revision) => revision.kind),
            [EventKind.write, EventKind.userEdit, EventKind.edit],
        );
        assert.equal(
            finalTextOf(source.revisions[2]!),
            'def base():\n    return "base"\ndef user_add_1(): return "user1"\n\ndef agent_add_1():\n    return "agent1"',
        );
    }
});
