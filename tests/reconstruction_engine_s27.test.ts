import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S27_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. A leading-slash suffix (`/inventory.py`) never
// also matches a sibling such as `/test_inventory.py` — the char before `inventory.py` there is `_`,
// not `/` — so per-file lookups stay unambiguous.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// Ground-truth literals are sourced from the rendered executed-scenario files (the same canonical
// store S27_JSONL points at) instead of inlined as ~15 KB of escaped strings. The engine reconstructs
// from the JSONL while these expected values come from the independent rendered files, so each
// `=== *_FINAL` stays a real cross-source check; the exact byte-length asserts below pin the bytes
// regardless. (Deviation from S25's inline-literal pattern — documented in the implementation notes.)
const S27_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s27-script-rename-edited-before-run";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S27_GT}/${relativePath}`, "utf8");
}
// The engine drops a single trailing newline at replay (splitLines), so the newline-joined revision
// text equals the rendered file with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}
const S27_INVENTORY_FINAL = stripTrailingNewline(readGroundTruth("inventory.py"));
const S27_RENAME_INV_FINAL = stripTrailingNewline(readGroundTruth("rename_inv.py"));
const S27_TEST_INVENTORY_FINAL = stripTrailingNewline(readGroundTruth("tests/test_inventory.py"));
// The post-script `df7b79499e8a9377@v3` backup is byte-identical to the rendered test file (raw, WITH
// its trailing newline, 2216 bytes) — the COMPLETE content the fix injects to finish the truncated
// terminal beacon. Deriving it from the rendered file keeps the hermetic reader off the real
// ~/.claude/file-history tree.
const S27_TEST_INVENTORY_BACKUP = readGroundTruth("tests/test_inventory.py");

// Hermetic reader: returns the complete backup ONLY for the one post-script blob, "" otherwise — so
// the engine never touches the real file-history tree. The poison reader proves the fix's `startsWith`
// guard rejects non-prefix content (it never injects garbage).
const s27Reader: BackupReader = (name) =>
    name.toString() === "df7b79499e8a9377@v3" ? S27_TEST_INVENTORY_BACKUP : "";
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";

// One `python3 rename_inv.py` Bash run rewrites TWO tracked files (the renames accumulate across three
// script revisions written BEFORE the run); the run forks nothing, so the engine yields one surviving
// branch over the three touched files (the two renamed files plus the driver script) and zero rewound
// branches. Locks §2.6.
test("test_S27_linear_one_surviving_branch_three_files_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S27_JSONL), s27Reader);
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 3);
    for (const suffix of ["/inventory.py", "/test_inventory.py", "/rename_inv.py"]) {
        assert.ok(branched.surviving.some((h) => h.target.toString().endsWith(suffix)), `missing ${suffix}`);
    }
});

// inventory.py: its mid-stream `edited_text_file` beacon (the rev4 `user-edit`) is a COMPLETE snapshot
// of the renamed file, so the post-run `restock` Edit (rev5) splices cleanly onto it and the file
// reconstructs byte-identically with no reader and with a poisoned reader (reader-INDEPENDENT).
// Locks §2.3 (inventory) + §2.5.
test("test_S27_inventory_reader_independent_bytelock", () => {
    const without = historyEndingWith(reconstructBranches(loadRecords(S27_JSONL)).surviving, "/inventory.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S27_JSONL), poison).surviving, "/inventory.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit, EventKind.edit, EventKind.userEdit, EventKind.edit,
    ]);
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    assert.ok(!historyFinalText(withPoison).includes("POISONED"));
    const finalText = historyFinalText(without);
    assert.equal(finalText.length, 8442);
    assert.equal(finalText, S27_INVENTORY_FINAL);
    // The three renamed defs are present and `restock` (the post-run Edit) is replayed on the renamed
    // base; the terse def headers are gone. (find_item/tot_value/low_stock are NOT renamed — do not
    // assert their absence.)
    for (const def of ["def check_quantity(", "def insert_item(", "def remove_item(", "def restock("]) {
        assert.ok(finalText.includes(def), `inventory missing ${def}`);
    }
    for (const def of ["def qty_chk(", "def add_item(", "def rm_item("]) {
        assert.ok(!finalText.includes(def), `inventory still has terse ${def}`);
    }
});

// rename_inv.py: the driver script itself — no script rewrites it, so it is pure write + four Edits
// (the three renames accrue across the BEFORE-run edits). Reader-INDEPENDENT and byte-locked; its
// final text holds all three rename pairs as string literals. Locks §2.3 (rename_inv) + §2.5.
test("test_S27_rename_inv_reader_independent_bytelock", () => {
    const without = historyEndingWith(reconstructBranches(loadRecords(S27_JSONL)).surviving, "/rename_inv.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S27_JSONL), poison).surviving, "/rename_inv.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit, EventKind.edit, EventKind.edit,
    ]);
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    assert.ok(!historyFinalText(withPoison).includes("POISONED"));
    const finalText = historyFinalText(without);
    assert.equal(finalText.length, 1449);
    assert.equal(finalText, S27_RENAME_INV_FINAL);
    for (const [terse, renamed] of [["qty_chk", "check_quantity"], ["add_item", "insert_item"], ["rm_item", "remove_item"]]) {
        assert.ok(finalText.includes(terse!) && finalText.includes(renamed!), `rename_inv missing pair ${terse}->${renamed}`);
    }
});

// THE CRUX: tests/test_inventory.py is reader-DEPENDENT. Its terminal `edited_text_file` beacon (rev1)
// is a TRUNCATED 50-line prefix of the 73-line post-script file, and there is NO later Edit to reseed
// against. The fix (`completeTruncatedBeacon`) appends a synthetic `overwrite` from the file's latest
// file-history backup (df7b79499e8a9377@v3, 73 lines) so the terminal revision is the COMPLETE file.
// This is S27's reason for existing. Locks §2.3 (test_inventory) + §2.4.
test("test_S27_test_inventory_terminal_beacon_backup_overwrite", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S27_JSONL), s27Reader).surviving, "/test_inventory.py");
    assert.deepEqual(h.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit, EventKind.overwrite]);
    const rev1 = h.revisions[1]!; // the truncated beacon
    assert.equal(rev1.kind, EventKind.userEdit);
    assert.equal(rev1.changeId.toString(), "51c639d6-4417-4525-bb79-95efa2eede1d");
    assert.equal(rev1.lines.length, 50);
    const rev2 = h.revisions[2]!; // the injected complete backup
    assert.equal(rev2.kind, EventKind.overwrite);
    assert.equal(rev2.changeId.toString(), "df7b79499e8a9377@v3");
    assert.equal(rev2.lines.length, 73);
    const finalText = historyFinalText(h);
    assert.equal(finalText.length, 2215);
    assert.equal(finalText, S27_TEST_INVENTORY_FINAL);
    assert.ok(finalText.includes("check_quantity"));
    // The four `test_tot_value_*` functions live past line 50 — they exist ONLY because the overwrite
    // restored the truncated tail, so they are the load-bearing proof the fix fired.
    for (const fn of [
        "def test_tot_value_single_item(",
        "def test_tot_value_multiple_items(",
        "def test_tot_value_ignores_extra_keys(",
        "def test_tot_value_missing_price_key_raises(",
    ]) {
        assert.ok(finalText.includes(fn), `test_inventory missing restored ${fn}`);
    }
});

// test_inventory.py's reader-dependence is load-bearing: WITHOUT a backup the truncated terminal beacon
// is adopted verbatim, so the history has only 2 revisions (no `overwrite`) and the final is short by
// 23 lines / 621 bytes (1594 vs 2215), diverging from ground truth. This proves the @v3 backup is
// essential. Locks §2.5 (the load-bearing contrast).
test("test_S27_test_inventory_without_reader_is_wrong_no_overwrite_two_revs", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S27_JSONL)).surviving, "/test_inventory.py");
    assert.equal(h.revisions.length, 2);
    assert.ok(!h.revisions.some((r) => r.kind === EventKind.overwrite));
    assert.deepEqual(h.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    const finalText = historyFinalText(h);
    assert.equal(finalText.length, 1594);
    assert.notEqual(finalText, S27_TEST_INVENTORY_FINAL); // truncated without the backup
});

// The poison guard: with a backup whose content is NOT a byte-prefix of the beacon, `beaconIsTruncated`
// returns false, so the fix never injects garbage — the file stays at its 2 truncated revisions. This
// is the `startsWith` half of the guard. Locks §2.5 (poison row).
test("test_S27_poison_reader_does_not_inject_garbage", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S27_JSONL), poison).surviving, "/test_inventory.py");
    assert.deepEqual(h.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    const finalText = historyFinalText(h);
    assert.equal(finalText.length, 1594);
    assert.ok(!finalText.includes("POISONED"));
});

// The rename is recovered ONLY from the two `edited_text_file` beacons (inventory.py + test_inventory.py),
// not from parsing the opaque `python3` Bash command. The synthetic `overwrite` reseed is a REVISION,
// not an extracted event, so it never appears here. Locks §2.2.
test("test_S27_extractFileEvents_two_userEdits_no_overwrite", () => {
    const events = extractFileEvents(loadRecords(S27_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((e) => e.changeId.toString().slice(0, 8)).sort(),
        ["51c639d6", "a39c4731"],
    );
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 3);   // inventory, test_inventory, rename_inv
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 6);    // 1 inventory pre, 1 inventory restock, 4 rename_inv
    assert.equal(events.filter((e) => e.kind === EventKind.overwrite).length, 0); // reseed is synthetic
    assert.equal(events.filter((e) => e.kind === EventKind.append).length, 0);
});
