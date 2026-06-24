import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import type { FileRevision, FileHistory } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { M6_JSONL } from "./fixtures.ts";

// m6 forks m6_source.py -> m6_derived.py with `cp`, a USER out-of-band edit inserts `# derived
// version` into the copy, Claude adds transform(), a code rewind discards it, Claude adds validate().
// On the REWOUND branch the original user edit (8897e505) yields NO file event, so the transform Edit
// would splice onto the bare 6-line copy and duplicate `return self.name`. The true pre-edit disk
// state (7 lines, WITH `# derived version`) lives ONLY in the file-history backup
// b90d0fcb711472b4@v1, snapshotted 22ms AFTER the edit's tool-use time — recovered via the
// includeAfter fallback in backupSeedWriteFor (m6 fix). In-memory reader so the engine tests don't
// depend on the live ~/.claude/file-history tree (mirrors engine_m5 / engine_s5).
const M6_BACKUPS: Record<string, string> = {
    "b90d0fcb711472b4@v1":
        'class Base:\n    def __init__(self):\n# derived version\n        self.name = "base"\n\n    def describe(self):\n        return self.name\n',
};
const m6Reader: BackupReader = (name) => M6_BACKUPS[name.toString()] ?? "";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// Pick the history whose target ends with the given (leading-slash) suffix. The leading slash keeps
// `/m6_source.py` from also matching `/test_m6_source.py`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    const match = histories.find((history) => history.target.toString().endsWith(suffix));
    assert.ok(match, `no history ending with ${suffix}`);
    return match;
}

// The 10-line surviving validate() ground truth (§2.4 of the plan).
const SURVIVING_VALIDATE =
    'class Base:\n    def __init__(self):\n# derived version\n        self.name = "base"\n\n    def describe(self):\n        return self.name\n\n    def validate(self):\n        return True';
// The 10-line rewound transform() ground truth (§2.4) — NO duplicated return self.name.
const REWOUND_TRANSFORM =
    'class Base:\n    def __init__(self):\n# derived version\n        self.name = "base"\n\n    def describe(self):\n        return self.name\n\n    def transform(self):\n        return self.name.upper()';
// The 7-line `# derived version` pre-edit content (the backup-recovered base).
const DERIVED_COMMENT_SEVEN_LINES =
    'class Base:\n    def __init__(self):\n# derived version\n        self.name = "base"\n\n    def describe(self):\n        return self.name';

// The surviving branch is three files: m6_source.py [write, edit] ending at the 6-line describe
// version, the test file as a single write, and m6_derived.py [copy, user-edit, edit].
test("test_m6_surviving_three_histories_source_test_derived", () => {
    const branches = reconstructBranches(loadRecords(M6_JSONL), m6Reader);
    assert.equal(branches.surviving.length, 3);
    // m6_source.py — 2 revisions ending at the 6-line describe version.
    const source = historyEndingWith(branches.surviving, "/m6_source.py");
    assert.equal(source.revisions.length, 2);
    assert.deepEqual(
        source.revisions.map((revision) => revision.kind),
        [EventKind.write, EventKind.edit],
    );
    assert.equal(
        finalTextOf(source.revisions[1]!),
        'class Base:\n    def __init__(self):\n        self.name = "base"\n\n    def describe(self):\n        return self.name',
    );
    // test_m6_source.py — a single write revision.
    const testFile = historyEndingWith(branches.surviving, "/test_m6_source.py");
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
    // m6_derived.py — 3 revisions [copy, user-edit, edit].
    const derived = historyEndingWith(branches.surviving, "/m6_derived.py");
    assert.equal(derived.revisions.length, 3);
    assert.deepEqual(
        derived.revisions.map((revision) => revision.kind),
        [EventKind.copy, EventKind.userEdit, EventKind.edit],
    );
});

// The surviving m6_derived.py ends at the 10-line validate() version, and its rev1 is the user edit
// that re-introduces `# derived version` (changeId e4073b7d, the post-rewind disk-echo user edit).
test("test_m6_surviving_derived_ends_at_validate_with_derived_comment", () => {
    const branches = reconstructBranches(loadRecords(M6_JSONL), m6Reader);
    const derived = historyEndingWith(branches.surviving, "/m6_derived.py");
    // rev2 final text is the 10-line validate ground truth.
    assert.equal(finalTextOf(derived.revisions[2]!), SURVIVING_VALIDATE);
    // rev1 is the user edit carrying `# derived version`.
    const userEdit = derived.revisions[1]!;
    assert.equal(userEdit.kind, EventKind.userEdit);
    assert.equal(userEdit.changeId.toString(), "e4073b7d-904d-4a1d-86c5-6885693b04de");
    assert.equal(finalTextOf(userEdit), DERIVED_COMMENT_SEVEN_LINES);
});

// THE FIX: the rewound m6_derived.py is THREE revisions [copy, overwrite, edit] — the overwrite is
// the backup-seeded `# derived version` base — and rev2 ends at the 10-line transform() version.
test("test_m6_rewound_derived_is_copy_overwrite_edit_three_revisions", () => {
    const branches = reconstructBranches(loadRecords(M6_JSONL), m6Reader);
    assert.equal(branches.rewound.length, 1);
    const rewound = branches.rewound[0]!;
    assert.equal(rewound.tip.toString(), "9b69e66c-55b9-490d-bf1f-98ce3a1b7d00");
    assert.equal(rewound.rewindPoint.toString(), "a2903cef-f7d2-4571-ab1e-4d46e3930e67");
    const derived = historyEndingWith(rewound.histories, "/m6_derived.py");
    assert.equal(derived.revisions.length, 3);
    assert.deepEqual(
        derived.revisions.map((revision) => revision.kind),
        [EventKind.copy, EventKind.overwrite, EventKind.edit],
    );
    assert.equal(finalTextOf(derived.revisions[2]!), REWOUND_TRANSFORM);
});

// THE CRUX: the rewound overwrite revision is recovered from the file-history backup b90d0fcb...@v1
// — its changeId is the backup blob name and its content is the 7-line `# derived version` base.
test("test_m6_rewound_overwrite_is_backup_recovered_derived_comment", () => {
    const branches = reconstructBranches(loadRecords(M6_JSONL), m6Reader);
    const derived = historyEndingWith(branches.rewound[0]!.histories, "/m6_derived.py");
    const overwrite = derived.revisions[1]!;
    assert.equal(overwrite.kind, EventKind.overwrite);
    assert.equal(overwrite.changeId.toString(), "b90d0fcb711472b4@v1");
    assert.equal(finalTextOf(overwrite), DERIVED_COMMENT_SEVEN_LINES);
});

// The reader is LOAD-BEARING: WITHOUT it the rewound branch falls back to 2 revisions [copy, edit]
// and the transform Edit splices onto the bare 6-line copy, DUPLICATING `return self.name`. WITH the
// reader (+ the includeAfter fix) the duplicate is gone. This is the bug's regression guard.
test("test_m6_rewound_requires_reader_else_duplicate_persists", () => {
    // Without a reader: the duplicate persists.
    const noReader = reconstructBranches(loadRecords(M6_JSONL));
    const derivedNoReader = historyEndingWith(noReader.rewound[0]!.histories, "/m6_derived.py");
    assert.equal(derivedNoReader.revisions.length, 2);
    assert.ok(
        finalTextOf(derivedNoReader.revisions[1]!).includes(
            "        return self.name\n        return self.name",
        ),
        "without a reader the rewound transform should still carry the duplicated return self.name",
    );
    // With the reader: the duplicate is gone.
    const withReader = reconstructBranches(loadRecords(M6_JSONL), m6Reader);
    const derivedWithReader = historyEndingWith(withReader.rewound[0]!.histories, "/m6_derived.py");
    assert.ok(
        !finalTextOf(derivedWithReader.revisions[2]!).includes(
            "        return self.name\n        return self.name",
        ),
        "with the reader the rewound transform must NOT carry the duplicated return self.name",
    );
});
