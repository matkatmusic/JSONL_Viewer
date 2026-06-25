import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
} from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S35_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. Leading-slash suffixes keep `/inventory.py` from also
// matching `/tests/test_inventory.py` (the char before each basename is `/`, never a word char).
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}
// The engine drops one trailing newline at replay, so newline-joined revision text == rendered file stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}
// The block of a top-level `def <name>(`: from its `def` line to the next top-level `def ` or EOF — scopes a
// crux assertion to one function so a marker in a sibling def can't satisfy it.
function defBlock(text: string, name: string): string {
    const lines = text.split("\n");
    const start = lines.findIndex((line) => line.startsWith(`def ${name}(`));
    assert.ok(start >= 0, `no top-level def ${name}(`);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index]!.startsWith("def ")) { end = index; break; }
    }
    return lines.slice(start, end).join("\n");
}

// Ground-truth literals come from the rendered executed-scenario store the same JSONL points at — an
// independent cross-source check (same pattern as S30–S34, every file rendered).
const S35_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s35-script-rename-script-user-edit";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S35_GT}/${relativePath}`, "utf8");
}

// The real on-disk file-history reader, built exactly as the CLI builds it. S35 is reader-DEPENDENT (MIXED):
// the rename_inv.py elided beacon and the test_inventory.py truncated beacon complete only from backups served
// through this reader; inventory.py's script beacon is COMPLETE (reader-INDEPENDENT).
function realReader(records: ReturnType<typeof loadRecords>): BackupReader {
    return createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
}

// The three touched files, paired (path-suffix → rendered-file relative path). The suffix's leading slash
// disambiguates `/inventory.py` from `/tests/test_inventory.py`.
const FILES = [
    { suffix: "/inventory.py", rel: "inventory.py" },
    { suffix: "/tests/test_inventory.py", rel: "tests/test_inventory.py" },
    { suffix: "/rename_inv.py", rel: "rename_inv.py" },
];

// The three whole-word renames the one `python3 rename_inv.py` Bash run applied (old → new). The 2nd and 3rd
// pairs exist ONLY because steps 4 & 5 user-edited the rename SCRIPT itself (adding their tuples) before the
// run. Assert ABSENCE of these OLD names as whole words (the new names recur in prose/docstrings — a prose hazard).
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["qty_chk", "check_quantity"], ["add_item", "insert_item"], ["rm_item", "remove_item"],
];

// A reader serving only poison. The S27/S28 completion guards (truncated/elided content-validation) must
// REJECT it: `test_inventory.py` falls back to 51, `rename_inv.py` to 17, and no final text leaks "POISONED".
const poison: BackupReader = () => "POISONED\nPOISONED\n";

// T1 — all-files byte-lock with the real reader. Every touched file reconstructs byte-identical to its
// independently-rendered ground truth (inventory 244, test 79, rename 45), even though two depend on backups.
test("test_S35_all_files_bytelock_with_reader", () => {
    const records = loadRecords(S35_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    for (const { suffix, rel } of FILES) {
        const finalText = historyFinalText(historyEndingWith(surviving, suffix));
        assert.equal(finalText, stripTrailingNewline(readGroundTruth(rel)), `${suffix} not byte-identical`);
    }
});

// T2 — the headline crux: the rename SCRIPT itself is user-edited; the engine completes its single coalesced
// ELIDED beacon. write (1 tuple, 43L) → steps-4+5 land as ONE 17-line head+tail-cut beacon → S28
// `completeElidedBeacons` recovers the 45-line 3-tuple script from backup `41364cab6ad88cbb@v2`.
test("test_S35_rename_script_elided_beacon_completed_from_backup", () => {
    const records = loadRecords(S35_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    const renameHistory = historyEndingWith(surviving, "/rename_inv.py");
    assert.equal(renameHistory.revisions.length, 3, "rename_inv.py should have exactly 3 revisions");
    assert.deepEqual(renameHistory.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit, EventKind.overwrite]);
    const rev0Text = finalTextOf(renameHistory.revisions[0]!);
    assert.equal(rev0Text.split("\n").length, 43, "rev0 (write) should be 43 lines");
    assert.ok(rev0Text.includes('("qty_chk", "check_quantity")'), "rev0 missing the first rename tuple");
    assert.ok(!rev0Text.includes("insert_item"), "rev0 must NOT yet carry the 2nd (step-4) rename tuple");
    assert.ok(!rev0Text.includes("remove_item"), "rev0 must NOT yet carry the 3rd (step-5) rename tuple");
    const rev1 = renameHistory.revisions[1]!;
    assert.equal(rev1.kind, EventKind.userEdit, "rev1 should be the coalesced script user-edit");
    assert.equal(rev1.lines.length, 17, "rev1 (the elided fragment) should be 17 lines");
    assert.equal(
        finalTextOf(rev1).split("\n")[0],
        "boundaries) so that substrings inside longer identifiers are left alone.",
        "rev1 first line should be the head+tail-cut middle window",
    );
    const rev2 = renameHistory.revisions[2]!;
    assert.equal(rev2.kind, EventKind.overwrite, "rev2 should be the synthetic backup completion");
    assert.equal(rev2.changeId.toString(), "41364cab6ad88cbb@v2", "rev2 must come from the @v2 backup blob");
    assert.equal(rev2.lines.length, 45, "rev2 (completed script) should be 45 lines");
    const finalText = historyFinalText(renameHistory);
    assert.ok(finalText.includes('("qty_chk", "check_quantity")'), "final missing qty_chk tuple");
    assert.ok(finalText.includes('("add_item", "insert_item")'), "final missing add_item tuple");
    assert.ok(finalText.includes('("rm_item", "remove_item")'), "final missing rm_item tuple");
    assert.ok(
        finalText.includes(String.raw`re.sub(r"\b" + re.escape(old) + r"\b", new, text)`),
        "final missing the whole-word substitution literal (string-concat form)",
    );
});

// T3 — mixed beacon completeness in ONE run. The same `python3 rename_inv.py` leaves a TRUNCATED beacon for
// test_inventory.py (S27 → backup `5ea404c2628560f6@v3`: write 79 → 51 → 79) and a COMPLETE beacon for
// inventory.py (no rescue: write 172 → low_stock 192 → script beacon 192 → restock 244).
test("test_S35_test_file_truncated_beacon_and_inventory_complete_beacon", () => {
    const records = loadRecords(S35_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    const testHistory = historyEndingWith(surviving, "/tests/test_inventory.py");
    assert.equal(testHistory.revisions.length, 3, "test_inventory.py should have exactly 3 revisions");
    assert.deepEqual(testHistory.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit, EventKind.overwrite]);
    assert.equal(testHistory.revisions[1]!.lines.length, 51, "rev1 should be the 51-line truncated prefix");
    const testRev2 = testHistory.revisions[2]!;
    assert.equal(testRev2.kind, EventKind.overwrite, "rev2 should be the S27 truncated-beacon completion");
    assert.equal(testRev2.changeId.toString(), "5ea404c2628560f6@v3", "rev2 must come from the @v3 backup blob");
    assert.equal(testRev2.lines.length, 79, "rev2 (completed test) should be 79 lines");
    const inventoryHistory = historyEndingWith(surviving, "/inventory.py");
    assert.equal(inventoryHistory.revisions.length, 4, "inventory.py should have exactly 4 revisions");
    assert.deepEqual(
        inventoryHistory.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.userEdit, EventKind.edit],
    );
    assert.deepEqual(
        inventoryHistory.revisions.map((r) => r.lines.length),
        [172, 192, 192, 244],
        "inventory.py ladder line counts (rev2 COMPLETE beacon = 192, no backup completion)",
    );
});

// T4 — renames applied WHOLE-WORD, kept-names survive. Kept-name hazard: terse-but-unrenamed find_item /
// tot_value survive; the method name `test_qty_chk_less_than_stock(` keeps `qty_chk` as a SUBSTRING (leading
// `_` defeats `\b`). Absence MUST use `\bold\b` — a bare `includes("qty_chk")` would WRONGLY fail (5 substrings).
test("test_S35_renames_whole_word_and_kept_names", () => {
    const records = loadRecords(S35_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;

    const inventoryText = historyFinalText(historyEndingWith(surviving, "/inventory.py"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(`\\b${oldName}\\b`).test(inventoryText), `inventory still has whole-word ${oldName}`);
        assert.ok(inventoryText.includes(newName), `inventory missing new name ${newName}`);
    }
    assert.ok(/\bfind_item\b/.test(inventoryText), "kept name find_item must survive");
    assert.ok(/\btot_value\b/.test(inventoryText), "kept name tot_value must survive");

    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_inventory.py"));
    assert.ok(
        testText.includes("from inventory import check_quantity, tot_value"),
        "test missing renamed import surface (kept tot_value alongside renamed check_quantity)",
    );
    assert.ok(!/\bqty_chk\b/.test(testText), "test still has whole-word qty_chk");
    assert.ok(
        testText.includes("def test_qty_chk_less_than_stock("),
        "kept-substring method name must survive (whole-word rename did not touch it)",
    );
});

// T5 — load-bearing post-script edit. `restock` (added AFTER the run) replayed on the renamed beacon: it calls
// `check_quantity`/`insert_item` and has no whole-word `qty_chk`/`add_item`. `low_stock` (added BEFORE the run)
// references no rename-set name, so the rename left it untouched. Scoping to each def block proves the ordering.
test("test_S35_restock_uses_renamed_names_lowstock_unaffected", () => {
    const records = loadRecords(S35_JSONL);
    const inventoryText = historyFinalText(
        historyEndingWith(reconstructBranches(records, realReader(records)).surviving, "/inventory.py"),
    );

    const restock = defBlock(inventoryText, "restock");
    assert.ok(restock.includes("check_quantity"), "restock does not call renamed check_quantity");
    assert.ok(restock.includes("insert_item"), "restock does not call renamed insert_item");
    assert.ok(!/\bqty_chk\b/.test(restock), "restock kept old whole-word qty_chk");
    assert.ok(!/\badd_item\b/.test(restock), "restock kept old whole-word add_item");

    const lowStock = defBlock(inventoryText, "low_stock");
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(`\\b${oldName}\\b`).test(lowStock), `low_stock unexpectedly has old name ${oldName}`);
        assert.ok(!lowStock.includes(newName), `low_stock unexpectedly has new name ${newName}`);
    }
});

// T6 — event multiset + reader-dependence + poison rejection. The Bash run leaves no Edit/Write record, so
// renames surface ONLY as beacons: 3 writes, 2 Claude edits (both inventory — low_stock/restock), 0 overwrites,
// 3 user-edits (`c67cfd9c` rename-script, `dbc2e4c1` inventory beacon, `f3e90535` test beacon). NO reader ⇒ the
// incomplete beacons can't complete (test 51/2, rename 17/2; inventory unaffected 244). POISON ⇒ guards reject
// it: no leaked "POISONED", test/rename fall back to the no-reader fragments.
test("test_S35_multiset_reader_dependence_and_poison_rejected", () => {
    const events = extractFileEvents(loadRecords(S35_JSONL));
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 3);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["c67cfd9c", "dbc2e4c1", "f3e90535"],
    );

    const noReader = reconstructBranches(loadRecords(S35_JSONL)).surviving;
    const noReaderTest = historyEndingWith(noReader, "/tests/test_inventory.py");
    assert.equal(noReaderTest.revisions.length, 2, "no-reader test_inventory.py keeps only the 2-rev fragment");
    assert.equal(historyFinalText(noReaderTest).split("\n").length, 51, "no-reader test final is the 51-line fragment");
    const noReaderRename = historyEndingWith(noReader, "/rename_inv.py");
    assert.equal(noReaderRename.revisions.length, 2, "no-reader rename_inv.py keeps only the 2-rev fragment");
    assert.equal(historyFinalText(noReaderRename).split("\n").length, 17, "no-reader rename final is the 17-line fragment");
    assert.equal(
        historyFinalText(historyEndingWith(noReader, "/inventory.py")),
        stripTrailingNewline(readGroundTruth("inventory.py")),
        "inventory.py is reader-INDEPENDENT (complete beacon)",
    );

    const poisoned = reconstructBranches(loadRecords(S35_JSONL), poison).surviving;
    for (const { suffix } of FILES) {
        const poisonedText = historyFinalText(historyEndingWith(poisoned, suffix));
        assert.ok(!poisonedText.includes("POISONED"), `${suffix} leaked POISONED backup`);
    }
    assert.equal(
        historyFinalText(historyEndingWith(poisoned, "/tests/test_inventory.py")),
        historyFinalText(noReaderTest),
        "poison test falls back to the no-reader fragment",
    );
    assert.equal(
        historyFinalText(historyEndingWith(poisoned, "/rename_inv.py")),
        historyFinalText(noReaderRename),
        "poison rename falls back to the no-reader fragment",
    );
});
