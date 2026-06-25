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
import { S34_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. The leading-slash suffixes keep `/ledger.py`
// from also matching `/tests/test_ledger.py` (the char before each basename is `/`, never a word char).
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
// `readGroundTruth(...)` stays a real cross-source check. Same pattern as S30/S31/S32/S33 — every file rendered.
const S34_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s34-script-rename-driver-back-and-forth";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S34_GT}/${relativePath}`, "utf8");
}

// The real on-disk file-history reader, built exactly as the CLI builds it. S34 is reader-DEPENDENT: the
// step-9 trailing append on ledger.py and the step-7 append on renames.csv left NO `edited_text_file`
// beacon, so they are recovered only from file-history backups served through this reader.
function realReader(records: ReturnType<typeof loadRecords>): BackupReader {
    return createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
}

// The four touched files, paired (path-suffix → rendered-file relative path). The suffix's leading slash
// disambiguates `/ledger.py` from `/tests/test_ledger.py`.
const FILES = [
    { suffix: "/ledger.py", rel: "ledger.py" },
    { suffix: "/tests/test_ledger.py", rel: "tests/test_ledger.py" },
    { suffix: "/renames.csv", rel: "renames.csv" },
    { suffix: "/apply_renames.py", rel: "apply_renames.py" },
];

// The four whole-word renames the one `python3 apply_renames.py` Bash run applied (old → new). The last two
// pairs exist ONLY because the step-5 and step-7 manual CSV user-edits appended their rows before/around the
// driver write ("back and forth"). Assert ABSENCE of these OLD names as whole words (the new names recur in
// prose/docstrings — a prose hazard).
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["add_entry", "record_entry"], ["rm_entry", "remove_entry"],
    ["tot_debits", "total_debits"], ["tot_credits", "total_credits"],
];

// A reader serving only poison. The forward-validation guards (content-differs + first-hunk-splices-clean)
// must REJECT it: ledger.py falls back to 186 and renames.csv to 4, and no final text ever leaks "POISONED".
const poison: BackupReader = () => "POISONED\nPOISONED\n";

// T1 — ledger byte-lock (the crux / RED-before-fix). ledger.py reconstructs byte-identical to the
// independently-rendered ground truth (187 lines, final line `# names normalized via rename script`).
// That trailing line came from the step-9 NO-BEACON manual append: it landed on disk between the
// script-rename beacon and the later `report` Edit, OUTSIDE that edit's hunk window, so the existing
// hunk-context staleness test misses it. The out-of-window reseed recovers it from the file-history backup.
// MUST FAIL at HEAD (reconstructs 186, dropping the trailing line) until the engine fix lands.
test("test_S34_ledger_bytelock_out_of_window_reseed", () => {
    const records = loadRecords(S34_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/ledger.py"));
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("ledger.py")));
    assert.equal(finalText.split("\n").length, 187, "ledger.py should reconstruct to 187 lines");
    assert.ok(
        finalText.endsWith("# names normalized via rename script"),
        "ledger.py final line must be the step-9 NO-BEACON manual append",
    );
});

// T2 — reader-dependence + the RED state. With NO reader the out-of-window reseed cannot fire (it has no
// backup to recover the step-9 append from), so ledger.py reconstructs to 186 lines WITHOUT the trailing
// comment. This is what the engine produced before the fix, and it stays the no-reader behavior AFTER the
// fix (the fix runs only inside `seedStaleEditBases`, which the pipeline calls only when a reader is present)
// — so every pre-s34 reader-free scenario is byte-for-byte untouched.
test("test_S34_ledger_no_reader_is_short_186", () => {
    const surviving = reconstructBranches(loadRecords(S34_JSONL)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/ledger.py"));
    assert.equal(finalText.split("\n").length, 186, "ledger.py without a reader should be 186 lines");
    assert.ok(
        !finalText.includes("# names normalized via rename script"),
        "no-reader ledger.py must NOT carry the step-9 append (nothing to recover it from)",
    );
});

// T3 — renames.csv 3-revision ladder via the EXISTING S27 completeTruncatedBeacon (not the new fix). rev0
// is the `write` of header + 2 rows (3 lines); rev1 is the step-5 manual user-edit beacon (4 lines, no
// `tot_credits,total_credits`); rev2 is the step-7 NO-BEACON append completed from a file-history backup
// (5 lines, all four rows). apply_renames.py is byte-locked here too (single `write` revision). This proves
// renames.csv is fixed entirely by S27 — the s34 fix must not touch it.
test("test_S34_renames_csv_three_revisions_via_s27", () => {
    const records = loadRecords(S34_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    const csvHistory = historyEndingWith(surviving, "/renames.csv");
    assert.equal(csvHistory.revisions.length, 3, "renames.csv should have exactly 3 revisions");

    const rev1Text = finalTextOf(csvHistory.revisions[1]!);
    assert.equal(rev1Text.split("\n").length, 4, "renames.csv rev1 (step-5 beacon) should be 4 lines");
    assert.ok(!rev1Text.includes("tot_credits,total_credits"), "rev1 must NOT yet carry the step-7 row");

    const finalText = historyFinalText(csvHistory);
    assert.equal(finalText.split("\n").length, 5, "renames.csv final should be 5 lines");
    assert.ok(finalText.includes("add_entry,record_entry"), "final missing add_entry row");
    assert.ok(finalText.includes("rm_entry,remove_entry"), "final missing rm_entry row");
    assert.ok(finalText.includes("tot_debits,total_debits"), "final missing tot_debits row");
    assert.ok(finalText.includes("tot_credits,total_credits"), "final missing tot_credits row");
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("renames.csv")));

    const scriptHistory = historyEndingWith(surviving, "/apply_renames.py");
    assert.equal(scriptHistory.revisions.length, 1, "apply_renames.py should have exactly 1 revision");
    assert.equal(historyFinalText(scriptHistory), stripTrailingNewline(readGroundTruth("apply_renames.py")));
});

// T4 — rename applied, WHOLE-WORD. In final ledger.py every old terse name has zero whole-word occurrences
// and every new name is present. In final test_ledger.py the renamed import line is present and the terse
// old names are absent as whole words. Absence MUST be a `\bold\b` regex: the new names recur in ledger.py
// docstrings/prose, so a bare substring check on old names would be brittle.
test("test_S34_renames_whole_word", () => {
    const records = loadRecords(S34_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    const ledgerText = historyFinalText(historyEndingWith(surviving, "/ledger.py"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(`\\b${oldName}\\b`).test(ledgerText), `ledger still has whole-word ${oldName}`);
        assert.ok(ledgerText.includes(newName), `ledger missing new name ${newName}`);
    }
    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_ledger.py"));
    assert.ok(
        testText.includes("from ledger import record_entry, bal, remove_entry"),
        "test missing renamed import surface",
    );
    assert.ok(!/\badd_entry\b/.test(testText), "test still has whole-word add_entry");
    assert.ok(!/\brm_entry\b/.test(testText), "test still has whole-word rm_entry");
    assert.ok(!/\btot_debits\b/.test(testText), "test still has whole-word tot_debits");
    assert.ok(!/\btot_credits\b/.test(testText), "test still has whole-word tot_credits");
});

// T5 — edit-ordering crux. `report` was added AFTER the script run (a post-rename Edit replayed on top of
// the renamed beacon) and its body calls `record_entry` and `total_debits` — names that exist ONLY because
// the step-5/step-7 CSV user-edits appended their rows before the script applied them. `audit` was added
// BEFORE the run, so the script renamed its body in place (it now references `total_debits`/`total_credits`).
// Both defs reaching the renamed names proves the CSV edits flowed through the script; scoping each
// assertion to its own def block proves the ordering. The trailing step-9 comment survives underneath both.
test("test_S34_edit_ordering_report_on_renamed_audit_present", () => {
    const records = loadRecords(S34_JSONL);
    const ledgerText = historyFinalText(
        historyEndingWith(reconstructBranches(records, realReader(records)).surviving, "/ledger.py"),
    );
    const report = defBlock(ledgerText, "report");
    assert.ok(report.includes("record_entry"), "report does not call renamed record_entry");
    assert.ok(report.includes("total_debits"), "report does not call renamed total_debits");
    assert.ok(!/\badd_entry\b/.test(report), "report kept old whole-word add_entry");
    assert.ok(!/\btot_debits\b/.test(report), "report kept old whole-word tot_debits");

    const audit = defBlock(ledgerText, "audit");
    assert.ok(audit.includes("total_debits"), "audit body was not renamed to total_debits");
    assert.ok(audit.includes("total_credits"), "audit body was not renamed to total_credits");
    assert.ok(!/\btot_debits\b/.test(audit), "audit kept old whole-word tot_debits");
    assert.ok(!/\btot_credits\b/.test(audit), "audit kept old whole-word tot_credits");
});

// T6 — event multiset + reader-rejection of poison. The `python3 apply_renames.py` Bash run carries no
// Edit/Write record, so the rename surfaces ONLY as the two `edited_text_file` beacons. The raw stream
// carries exactly 4 writes, 2 Claude edits (both ledger.py — `audit` and `report`), 0 overwrites, and 4
// user-edits: `0ee68aad` (ledger prepend), `ba8ee917` (renames.csv step-5 beacon), `2a0d75ba` (ledger
// script beacon), `720ee20c` (test_ledger script beacon). The step-7 and step-9 appends left NO beacon, so
// they are NOT in the multiset. Then reconstruct with a POISON reader: the forward-validation guards reject
// it, so ledger.py falls back to 186 and renames.csv to 4, and no final text ever leaks "POISONED".
test("test_S34_event_multiset_and_reader_independence", () => {
    const events = extractFileEvents(loadRecords(S34_JSONL));
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 4);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 4);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["0ee68aad", "2a0d75ba", "720ee20c", "ba8ee917"],
    );

    const poisoned = reconstructBranches(loadRecords(S34_JSONL), poison).surviving;
    for (const { suffix } of FILES) {
        const poisonedText = historyFinalText(historyEndingWith(poisoned, suffix));
        assert.ok(!poisonedText.includes("POISONED"), `${suffix} leaked POISONED backup`);
    }
    const poisonedLedger = historyFinalText(historyEndingWith(poisoned, "/ledger.py"));
    assert.equal(poisonedLedger.split("\n").length, 186, "poison reader must not extend ledger.py past 186");
    const poisonedCsv = historyFinalText(historyEndingWith(poisoned, "/renames.csv"));
    assert.equal(poisonedCsv.split("\n").length, 4, "poison reader must not extend renames.csv past 4");
});
