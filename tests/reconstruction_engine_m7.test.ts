import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { M7_JSONL } from "./fixtures.ts";

// each line's latest value, newline-joined
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The single history whose target path ends with `suffix`. m7 touches TWO files; a
// leading-slash suffix disambiguates ("/m7_conv.py" does not match "/test_m7_conv.py").
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// The 10-line off-branch disk base, recovered from file-history backup 29a113119f194d6f@v4.
// On the surviving branch the conv-only rewind left step1+step2+step3 on disk; the surviving
// Edit (step2_alt) was computed against it, so the engine reseeds this as an `overwrite`
// revision before replaying the Edit.
const M7_BACKUPS: Record<string, string> = {
    "29a113119f194d6f@v4":
        "def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step3():\n    return 3\n",
};
const m7Reader: BackupReader = (name) => M7_BACKUPS[name.toString()] ?? "";

const SURVIVING_DERIVED_FINAL =
    'def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step2_alt():\n    return "2alt"\n\n\ndef step3():\n    return 3';
const REWOUND_DERIVED_FINAL =
    "def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step3():\n    return 3";

// m7 is a conversation-only rewind, no user edits. The surviving branch has TWO files:
// m7_conv.py is THREE revisions [write, overwrite, edit] (the overwrite is the backup-seeded
// 10-line off-branch disk base that the surviving step2_alt Edit was computed against), and the
// sibling test is ONE write revision (never edited).
test("test_m7_surviving_two_histories_conv_three_revs_test_one_rev", () => {
    const { surviving } = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    assert.equal(surviving.length, 2);
    const conv = historyEndingWith(surviving, "/m7_conv.py");
    assert.deepEqual(
        conv.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.overwrite, EventKind.edit],
    );
    const testFile = historyEndingWith(surviving, "/test_m7_conv.py");
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});

// The surviving m7_conv.py ends at the 14-line ground truth (step1, step2, step2_alt, step3):
// step2_alt is inserted BEFORE step3, and step2 (left on disk by the off-branch edit) survives.
test("test_m7_surviving_conv_ends_at_step2_alt_inserted_before_step3", () => {
    const { surviving } = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    const conv = historyEndingWith(surviving, "/m7_conv.py");
    assert.equal(finalTextOf(conv.revisions[conv.revisions.length - 1]!), SURVIVING_DERIVED_FINAL);
});

// THE RESEED (crux): the surviving m7_conv.py rev1 is an `overwrite` whose changeId is the
// backup blob name and whose content is the 10-line off-branch disk base. This is the S19/m5
// stale-edit-base reseed firing on a conv rewind (off-branch Claude edits, not a user edit).
test("test_m7_surviving_conv_rev1_is_backup_seeded_overwrite_ten_lines", () => {
    const { surviving } = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    const conv = historyEndingWith(surviving, "/m7_conv.py");
    const seed = conv.revisions[1]!;
    assert.equal(seed.kind, EventKind.overwrite);
    assert.equal(seed.changeId.toString(), "29a113119f194d6f@v4");
    assert.equal(finalTextOf(seed), REWOUND_DERIVED_FINAL); // the 10-line step1+step2+step3
});

// THE READER IS LOAD-BEARING (regression guard, m6-style): WITHOUT a reader the surviving
// m7_conv.py is WRONG — 2 revisions and a corrupted final ("    return 1\n    return 2", with
// no "def step2():"); WITH the reader it is the correct 3-revision, 14-line result.
test("test_m7_surviving_requires_reader_else_step2_collapses", () => {
    const without = reconstructBranches(loadRecords(M7_JSONL)); // no reader
    const convNo = historyEndingWith(without.surviving, "/m7_conv.py");
    assert.equal(convNo.revisions.length, 2);
    const finalNo = finalTextOf(convNo.revisions[convNo.revisions.length - 1]!);
    assert.ok(finalNo.includes("    return 1\n    return 2")); // the mangle
    assert.ok(!finalNo.includes("def step2():")); // step2's header was lost

    const withR = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    const convYes = historyEndingWith(withR.surviving, "/m7_conv.py");
    assert.equal(convYes.revisions.length, 3);
    const finalYes = finalTextOf(convYes.revisions[convYes.revisions.length - 1]!);
    assert.equal(finalYes, SURVIVING_DERIVED_FINAL);
    assert.ok(!finalYes.includes("    return 1\n    return 2"));
});

// The REWOUND branch is reader-INDEPENDENT: exactly one rewound branch, tip + rewindPoint as
// captured, m7_conv.py = 3 revisions [write, edit, edit] ending at the 10-line step3 version,
// and BYTE-IDENTICAL whether or not a reader is supplied (its Edit bases are all in the JSONL,
// so the reseed never fires on it).
test("test_m7_rewound_is_step1_step2_step3_and_reader_independent", () => {
    const withR = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    assert.equal(withR.rewound.length, 1);
    const branch = withR.rewound[0]!;
    assert.equal(branch.tip.toString(), "8037716c-b633-4787-ae71-a115580b4e42");
    assert.equal(branch.rewindPoint!.toString(), "a76d12e8-ded8-43fa-96b9-f3cdb43c8cc2");
    const convR = historyEndingWith(branch.histories, "/m7_conv.py");
    assert.deepEqual(
        convR.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.edit],
    );
    assert.equal(finalTextOf(convR.revisions[convR.revisions.length - 1]!), REWOUND_DERIVED_FINAL);

    const without = reconstructBranches(loadRecords(M7_JSONL)); // no reader
    const convNo = historyEndingWith(without.rewound[0]!.histories, "/m7_conv.py");
    assert.equal(finalTextOf(convNo.revisions[convNo.revisions.length - 1]!), REWOUND_DERIVED_FINAL);
});
