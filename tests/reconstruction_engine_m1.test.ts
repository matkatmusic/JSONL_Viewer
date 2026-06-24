import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { M1_JSONL } from "./fixtures.ts";

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

const BASE_AT_COPY =
    "class Config:\n    def __init__(self):\n        self.debug = False\n        self.verbose = False\n\n    def enable_debug(self):\n        self.debug = True";
const BASE_FINAL =
    "class Config:\n    def __init__(self):\n        self.debug = False\n        self.verbose = False\n\n    def enable_debug(self):\n        self.debug = True\n\n    def disable_all(self):\n        self.debug = False\n        self.verbose = False";
const FORK_FINAL =
    "class Config:\n    def __init__(self):\n        self.debug = False\n        self.verbose = False\n\n    def enable_debug(self):\n        self.debug = True\n\n    def enable_verbose(self):\n        self.verbose = True";
const TEST_FINAL =
    "from m1_base import Config\n\n\ndef test_config_debug_is_false():\n    assert Config().debug == False";

// m1 is linear: exactly three file histories, no rewound branch, and the base's
// own history is write→edit→edit ending at disable_all (the copy event does NOT
// appear in the base's lineage — it is keyed to the fork's destination path).
test("test_m1_base_history_is_write_edit_edit_ending_at_disable_all", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    const base = historyEndingWith(histories, "m1_base.py", true);
    assert.equal(base.revisions.length, 3);
    assert.deepEqual(
        base.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.edit],
    );
    assert.equal(finalTextOf(base.revisions[base.revisions.length - 1]!), BASE_FINAL);
});

// THE CRUX (property 1 — copy-time snapshot): the fork is born as a copy whose
// content is the base AS OF THE cp MOMENT (init + enable_debug, 7 lines), NOT the
// base's final content (which later gains disable_all). revision 0's kind is copy
// and its `copy.from` is the base path.
test("test_m1_fork_born_as_copy_of_base_at_copy_time_without_disable_all", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    const fork = historyEndingWith(histories, "m1_fork.py", false);
    assert.equal(fork.revisions[0]!.kind, EventKind.copy);
    assert.ok(fork.revisions[0]!.copy!.from.toString().endsWith("/m1_base.py"));
    assert.equal(finalTextOf(fork.revisions[0]!), BASE_AT_COPY);
    assert.ok(!finalTextOf(fork.revisions[0]!).includes("disable_all"));
});

// Property 2 (independence): the fork's post-copy edit adds enable_verbose and the
// fork NEVER gains the base's disable_all. Two revisions total (copy then edit).
test("test_m1_fork_final_adds_enable_verbose_and_never_gains_disable_all", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    const fork = historyEndingWith(histories, "m1_fork.py", false);
    assert.equal(fork.revisions.length, 2);
    assert.equal(fork.revisions[1]!.kind, EventKind.edit);
    assert.equal(finalTextOf(fork.revisions[fork.revisions.length - 1]!), FORK_FINAL);
    assert.ok(!finalTextOf(fork.revisions[fork.revisions.length - 1]!).includes("disable_all"));
});

// The test file is a single write, untouched by the fork; m1 yields exactly three
// histories (base, test, fork) — proof the copy did not collapse paths.
test("test_m1_test_file_single_write_and_three_total_histories", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    assert.equal(histories.length, 3);
    const testFile = historyEndingWith(histories, "test_m1_base.py", false);
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
    assert.equal(finalTextOf(testFile.revisions[0]!), TEST_FINAL);
});
