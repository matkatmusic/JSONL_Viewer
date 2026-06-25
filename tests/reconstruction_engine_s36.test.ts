import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S36_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. Leading-slash suffixes keep `/billing.py` from also
// matching `/tests/test_billing.py` (the char before each basename is `/`, never a word char).
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
// independent cross-source check (same pattern as S30–S35). s36 renders every touched file.
const S36_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s36-script-rename-csv-user-edit-mcp";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S36_GT}/${relativePath}`, "utf8");
}

// The four touched files, paired (path-suffix → rendered-file relative path). The suffix's leading slash
// disambiguates `/billing.py` from `/tests/test_billing.py`.
const FILES = [
    { suffix: "/billing.py", rel: "billing.py" },
    { suffix: "/tests/test_billing.py", rel: "tests/test_billing.py" },
    { suffix: "/renames.csv", rel: "renames.csv" },
    { suffix: "/apply_renames.py", rel: "apply_renames.py" },
];

// The four whole-word renames the one MCP `ctx_execute` apply_renames.py run applied (old → new). The 4th
// pair (`chk_stock`) exists ONLY because step-4 user-edited renames.csv to append its row before the run.
// Assert ABSENCE of these OLD names as whole words (the new names recur in prose/docstrings — a prose hazard).
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["calc_tot", "calculate_total"], ["fmt_money", "format_currency"],
    ["apply_disc", "apply_discount"], ["chk_stock", "check_stock"],
];

// A reader serving only poison. s36 is reader-INDEPENDENT (HAS-BEACON, every script-phase state is a COMPLETE
// `edited_text_file` snapshot), so no rescue stage consults it: final text must never leak "POISONED".
const poison: BackupReader = () => "POISONED\nPOISONED\n";

// T1 — billing.py byte-lock. The headline file reconstructs byte-identical to its independently-rendered
// ground truth (final 219 lines, ladder 156→184→184→219). s36 is reader-INDEPENDENT, so no reader is needed.
test("test_S36_billing_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S36_JSONL)).surviving;
    const billingHistory = historyEndingWith(surviving, "/billing.py");
    const finalText = historyFinalText(billingHistory);
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("billing.py")), "billing.py not byte-identical");
    assert.equal(finalText.split("\n").length, 219, "billing.py final should be 219 lines");
});

// T2 — test_billing.py byte-lock. The rename keeps the line count (50 → 50); the final imports the NEW names.
test("test_S36_test_file_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S36_JSONL)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/tests/test_billing.py"));
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("tests/test_billing.py")), "test file not byte-identical");
    assert.equal(finalText.split("\n").length, 50, "test_billing.py final should be 50 lines");
    assert.ok(finalText.includes("from billing import calculate_total, format_currency"), "test missing renamed import");
});

// T3 — the CSV-edit element + apply_renames byte-lock. renames.csv is a 2-revision history: rev0 (write, 4
// lines, the 3 rows WITHOUT chk_stock) → rev1 (user-edit, 5 lines, the manually-appended 4th row). Also
// byte-lock the rename driver itself (1 revision, 51 lines) and pin its STRING-CONCAT substitution literal.
test("test_S36_renames_csv_user_edit_two_revisions", () => {
    const surviving = reconstructBranches(loadRecords(S36_JSONL)).surviving;
    const renamesHistory = historyEndingWith(surviving, "/renames.csv");
    assert.equal(renamesHistory.revisions.length, 2, "renames.csv should have exactly 2 revisions");
    const rev0Text = finalTextOf(renamesHistory.revisions[0]!);
    assert.equal(rev0Text.split("\n").length, 4, "rev0 (write) should be 4 lines");
    assert.ok(!rev0Text.includes("chk_stock,check_stock"), "rev0 must NOT yet carry the step-4 4th row");
    const finalText = historyFinalText(renamesHistory);
    assert.equal(finalText.split("\n").length, 5, "rev1 (user-edit) should be 5 lines");
    assert.ok(finalText.includes("chk_stock,check_stock"), "final missing the appended 4th row");
    for (const row of ["calc_tot,calculate_total", "fmt_money,format_currency", "apply_disc,apply_discount"]) {
        assert.ok(finalText.includes(row), `final missing row ${row}`);
    }
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("renames.csv")), "renames.csv not byte-identical");

    const applyHistory = historyEndingWith(surviving, "/apply_renames.py");
    assert.equal(applyHistory.revisions.length, 1, "apply_renames.py should have exactly 1 revision");
    const applyText = historyFinalText(applyHistory);
    assert.equal(applyText, stripTrailingNewline(readGroundTruth("apply_renames.py")), "apply_renames.py not byte-identical");
    assert.ok(
        applyText.includes(String.raw`re.sub(r"\b" + re.escape(old) + r"\b", new, text)`),
        "apply_renames.py missing the whole-word substitution literal (string-concat form)",
    );
});

// T4 — renames applied WHOLE-WORD. WHOLE-WORD HAZARD: `apply_discount` contains `apply_disc` as a prefix
// substring 5× in final billing.py, so a bare `includes("apply_disc")` would WRONGLY report the old name
// present. `\bapply_disc\b` is 0 — `\b` after `disc` needs a non-word char, and `apply_discount` has `o` there.
test("test_S36_renames_whole_word", () => {
    const surviving = reconstructBranches(loadRecords(S36_JSONL)).surviving;
    const billingText = historyFinalText(historyEndingWith(surviving, "/billing.py"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(String.raw`\b${oldName}\b`).test(billingText), `billing still has whole-word ${oldName}`);
        assert.ok(billingText.includes(newName), `billing missing new name ${newName}`);
    }
    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_billing.py"));
    assert.ok(testText.includes("from billing import calculate_total, format_currency"), "test missing renamed import");
    assert.ok(!/\bcalc_tot\b/.test(testText), "test still has whole-word calc_tot");
    assert.ok(!/\bfmt_money\b/.test(testText), "test still has whole-word fmt_money");
});

// T5 — load-bearing post-script edit. `reorder` (added AFTER the MCP run) replayed on the renamed beacon: it
// calls `check_stock`/`calculate_total` and has no whole-word `chk_stock`/`calc_tot`. `check_stock` reaching
// `reorder` proves the step-4 CSV user-edit's 4th row flowed through the MCP run. `validate` (added BEFORE the
// run) references no rename-set name, so the rename left it untouched.
test("test_S36_reorder_uses_renamed_names_validate_unaffected", () => {
    const surviving = reconstructBranches(loadRecords(S36_JSONL)).surviving;
    const billingText = historyFinalText(historyEndingWith(surviving, "/billing.py"));

    const reorder = defBlock(billingText, "reorder");
    assert.ok(reorder.includes("check_stock"), "reorder does not call renamed check_stock");
    assert.ok(reorder.includes("calculate_total"), "reorder does not call renamed calculate_total");
    assert.ok(!/\bchk_stock\b/.test(reorder), "reorder kept old whole-word chk_stock");
    assert.ok(!/\bcalc_tot\b/.test(reorder), "reorder kept old whole-word calc_tot");

    const validate = defBlock(billingText, "validate");
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(String.raw`\b${oldName}\b`).test(validate), `validate unexpectedly has old name ${oldName}`);
        assert.ok(!new RegExp(String.raw`\b${newName}\b`).test(validate), `validate unexpectedly has new name ${newName}`);
    }
});

// T6 — the s36-DISTINCT lock: MCP-run provenance + event multiset + reader-independence. (a) The rename ran
// through `ctx_execute`, so 7 assistant records carry `attributionMcpServer`/`attributionMcpTool` — the keys
// S32's loadTranscript.ts allow-set admits. loadRecords must not throw, and the raw fixture must carry those 7
// records (a cross-source provenance check; the keys are allowed-but-not-typed, so read the raw JSONL). Then
// extractFileEvents = {write:4, edit:2, overwrite:0, userEdit:3 ids ["96b40a66","aecbb827","de1f5023"]}.
// (b) Reader-independence: a poison reader changes nothing and never leaks "POISONED".
test("test_S36_mcp_run_parses_and_reader_independent", () => {
    const records = loadRecords(S36_JSONL); // does not throw ⇒ S32's MCP-attribution allow-set is present
    const rawLines = readFileSync(S36_JSONL, "utf8").split("\n").filter((line) => line.length > 0);
    const mcpLines = rawLines.filter(
        (line) => line.includes('"attributionMcpTool":"ctx_execute"')
            && line.includes('"attributionMcpServer":"plugin:context-mode:context-mode"'),
    );
    assert.equal(mcpLines.length, 7, "fixture should carry 7 MCP-run (ctx_execute) assistant records");

    const events = extractFileEvents(records);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 4);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["96b40a66", "aecbb827", "de1f5023"],
    );

    const noReader = reconstructBranches(records).surviving;
    const poisoned = reconstructBranches(records, poison).surviving;
    for (const { suffix } of FILES) {
        const poisonedText = historyFinalText(historyEndingWith(poisoned, suffix));
        assert.ok(!poisonedText.includes("POISONED"), `${suffix} leaked POISONED backup`);
        assert.equal(
            poisonedText,
            historyFinalText(historyEndingWith(noReader, suffix)),
            `${suffix} differs under poison reader (should be reader-INDEPENDENT)`,
        );
    }
});
