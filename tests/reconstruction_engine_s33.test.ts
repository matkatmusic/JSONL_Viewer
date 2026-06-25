import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S33_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. The leading-slash suffixes keep `/billing.py`
// from also matching `/tests/test_billing.py` (the char before each basename is `/`, never a word char).
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}
// The engine drops a single trailing newline at replay (splitLines), so the newline-joined revision text
// equals the rendered file with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}
// The block of a top-level `def <name>(` definition: from its `def` line to the next top-level `def ` or
// EOF. Used to scope crux assertions to one function so a marker in a sibling def can't satisfy them.
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

// Ground-truth literals come from the rendered executed-scenario store the same JSONL points at. The engine
// reconstructs from the JSONL while these expected values come from the independent rendered files, so each
// `readGroundTruth(...)` stays a real cross-source check. Same pattern as S30/S31/S32 — every file rendered.
const S33_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s33-script-rename-csv-user-edit";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S33_GT}/${relativePath}`, "utf8");
}

// The four touched files, paired (path-suffix → rendered-file relative path). The suffix's leading slash
// disambiguates `/billing.py` from `/tests/test_billing.py`.
const FILES = [
    { suffix: "/billing.py", rel: "billing.py" },
    { suffix: "/tests/test_billing.py", rel: "tests/test_billing.py" },
    { suffix: "/renames.csv", rel: "renames.csv" },
    { suffix: "/apply_renames.py", rel: "apply_renames.py" },
];

// The four whole-word renames the one `python3 apply_renames.py` Bash run applied (old → new). The 4th pair
// (`chk_stock` → `check_stock`) exists ONLY because the step-4 manual CSV user-edit appended its row before
// the script ran — that pair is what distinguishes s33 from its siblings.
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["calc_tot", "calculate_total"], ["fmt_money", "format_currency"],
    ["apply_disc", "apply_discount"], ["chk_stock", "check_stock"],
];

// A reader that must NEVER be consulted: every byte S33 reconstructs comes from the JSONL beacons (HAS-BEACON),
// so serving poison and seeing it never surface proves reader-independence (clean poison matrix).
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";

// T1 — billing byte-lock. The Bash-script rename (calc_tot/fmt_money/apply_disc/chk_stock →
// calculate_total/format_currency/apply_discount/check_stock) plus the pre-script `validate` edit and the
// post-script `reorder` edit reconstruct to a file byte-identical to the independently-rendered ground truth.
// Reconstruct with NO BackupReader (reader-independent — this absence is itself the assertion).
test("test_S33_billing_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S33_JSONL)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/billing.py"));
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("billing.py")));
});

// T2 — test-file byte-lock. tests/test_billing.py reconstructs byte-identical to its rendered ground truth
// (it was rewritten ONLY by the script run — a single `edited_text_file` beacon, no bridging Edit).
test("test_S33_test_file_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S33_JSONL)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/tests/test_billing.py"));
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("tests/test_billing.py")));
});

// T3 — the NOVEL element: renames.csv reconstructs to a 2-revision ladder across a MANUAL user-edit. rev0 is
// the `write` of the header + 3 rows (4 lines, NO `chk_stock,check_stock`); rev1 is the step-4 manual user-edit
// that appended the 4th row (5 lines, WITH it). A wrong write→user-edit ordering would drop the 4th rename.
// apply_renames.py is byte-locked here too (single `write` revision, the instruction set the run consumed).
test("test_S33_renames_csv_user_edit_two_revisions", () => {
    const surviving = reconstructBranches(loadRecords(S33_JSONL)).surviving;
    const csvHistory = historyEndingWith(surviving, "/renames.csv");
    assert.equal(csvHistory.revisions.length, 2, "renames.csv should have exactly 2 revisions");

    const rev0Text = finalTextOf(csvHistory.revisions[0]!);
    assert.equal(rev0Text.split("\n").length, 4, "renames.csv rev0 should be 4 lines (header + 3 rows)");
    assert.ok(!rev0Text.includes("chk_stock,check_stock"), "rev0 must NOT yet carry the manually-added 4th row");

    const finalText = historyFinalText(csvHistory);
    assert.equal(finalText.split("\n").length, 5, "renames.csv final should be 5 lines (4th row appended)");
    assert.ok(finalText.includes("chk_stock,check_stock"), "final must carry the manually-added 4th row");
    assert.ok(finalText.includes("calc_tot,calculate_total"), "final missing calc_tot row");
    assert.ok(finalText.includes("fmt_money,format_currency"), "final missing fmt_money row");
    assert.ok(finalText.includes("apply_disc,apply_discount"), "final missing apply_disc row");
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("renames.csv")));

    const scriptHistory = historyEndingWith(surviving, "/apply_renames.py");
    assert.equal(scriptHistory.revisions.length, 1, "apply_renames.py should have exactly 1 revision");
    assert.equal(historyFinalText(scriptHistory), stripTrailingNewline(readGroundTruth("apply_renames.py")));
});

// T4 — rename applied, WHOLE-WORD. In final billing.py every old terse name has zero whole-word occurrences and
// every new name is present. In final test_billing.py the renamed import line is present and the terse old
// names are absent as whole words. Absence MUST be a `\bold\b` regex: the new names appear ~16× in billing.py
// docstrings (prose hazard), and a bare substring check on old names would be brittle.
test("test_S33_renames_whole_word", () => {
    const surviving = reconstructBranches(loadRecords(S33_JSONL)).surviving;
    const billingText = historyFinalText(historyEndingWith(surviving, "/billing.py"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(`\\b${oldName}\\b`).test(billingText), `billing still has whole-word ${oldName}`);
        assert.ok(billingText.includes(newName), `billing missing new name ${newName}`);
    }
    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_billing.py"));
    assert.ok(testText.includes("from billing import calculate_total, format_currency"), "test missing renamed import");
    assert.ok(!/\bcalc_tot\b/.test(testText), "test still has whole-word calc_tot");
    assert.ok(!/\bfmt_money\b/.test(testText), "test still has whole-word fmt_money");
});

// T5 — edit-ordering crux, load-bearing through the manual CSV edit. `reorder` was added AFTER the script run
// (a post-rename Edit replayed on top of the renamed beacon) and its body calls `check_stock` — a name that
// exists ONLY because the step-4 CSV user-edit appended the `chk_stock,check_stock` row that the script then
// applied. `validate` was added BEFORE the run and references no terse name, so the rename left it untouched
// (neither old nor new terse names appear in it). Scoping each assertion to its own def block proves ordering.
test("test_S33_edit_ordering_reorder_on_renamed_validate_unaffected", () => {
    const billingText = historyFinalText(
        historyEndingWith(reconstructBranches(loadRecords(S33_JSONL)).surviving, "/billing.py"),
    );
    const reorder = defBlock(billingText, "reorder");
    assert.ok(reorder.includes("check_stock"), "reorder does not call renamed check_stock");
    assert.ok(reorder.includes("calculate_total"), "reorder does not call renamed calculate_total");
    assert.ok(!/\bchk_stock\b/.test(reorder), "reorder kept old whole-word chk_stock");
    assert.ok(!/\bcalc_tot\b/.test(reorder), "reorder kept old whole-word calc_tot");

    const validate = defBlock(billingText, "validate");
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(`\\b${oldName}\\b`).test(validate), `validate unexpectedly references ${oldName}`);
        assert.ok(!validate.includes(newName), `validate unexpectedly references ${newName}`);
    }
});

// T6 — HAS-BEACON multiset + reader-independence. The `python3 apply_renames.py` Bash run carries no Edit/Write
// record, so the rename surfaces ONLY as the two `edited_text_file` beacons (billing + test). The raw stream
// carries exactly 4 writes (billing, test, renames.csv, apply_renames.py), 2 Claude edits (both on billing.py —
// the `validate` and `reorder` additions), 3 user-edits, and ZERO overwrites. The three user-edits have mixed
// provenance — `4480f645`/`c7415420` are the script-run beacons, `b8591d24` is the genuine manual CSV edit —
// but the engine treats all three uniformly, which is why no engine change is needed. Then reconstruct with a
// POISON reader and assert every final text equals the no-reader result and never leaks "POISONED".
test("test_S33_has_beacon_multiset_and_reader_independent", () => {
    const events = extractFileEvents(loadRecords(S33_JSONL));
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 4);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["4480f645", "b8591d24", "c7415420"],
    );

    const base = reconstructBranches(loadRecords(S33_JSONL)).surviving;
    const poisoned = reconstructBranches(loadRecords(S33_JSONL), poison).surviving;
    for (const { suffix } of FILES) {
        const baseText = historyFinalText(historyEndingWith(base, suffix));
        const poisonedText = historyFinalText(historyEndingWith(poisoned, suffix));
        assert.equal(poisonedText, baseText, `${suffix} differs under poison reader`);
        assert.ok(!poisonedText.includes("POISONED"), `${suffix} leaked POISONED backup`);
    }
});
