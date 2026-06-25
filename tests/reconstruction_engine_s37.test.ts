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
import { S37_JSONL } from "./fixtures.ts";

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
// `readGroundTruth(...)` stays a real cross-source check. Same pattern as S34 — the worktree copy of the
// rendered files is byte-identical to this sibling store.
const S37_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s37-script-rename-driver-back-and-forth-mcp";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S37_GT}/${relativePath}`, "utf8");
}

// The real on-disk file-history reader, built exactly as the CLI builds it. s37 is MIXED reader-dependence:
// `test_ledger.py` (MCP-run beacon completion) and `renames.csv` (step-7 NO-BEACON append) recover only from
// file-history backups served through this reader; `ledger.py` and `apply_renames.py` reconstruct from
// beacons alone.
function realReader(records: ReturnType<typeof loadRecords>): BackupReader {
    return createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
}

// The four whole-word renames the one `apply_renames.py` MCP `ctx_execute` run applied (old → new). The last
// two pairs exist ONLY because the step-5 and step-7 manual CSV user-edits appended their rows ("back and
// forth"). Assert ABSENCE of these OLD names as whole words (the new names recur in prose/docstrings — a
// prose hazard). No new name contains an old name as a `\bold\b` match, so there is no substring trap.
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["add_entry", "record_entry"], ["rm_entry", "remove_entry"],
    ["tot_debits", "total_debits"], ["tot_credits", "total_credits"],
];

// A reader serving only poison. The S27/S28 forward-validation guards REJECT it for the three guarded files
// (test_ledger.py, renames.csv, apply_renames.py), so none of them ever leaks "POISONED". NOTE: ledger.py is
// deliberately NOT asserted under poison — see T6's comment (its rescue path accepts the poison backup, an
// out-of-scope latent guard gap).
const poison: BackupReader = () => "POISONED\nPOISONED\n";

// T1 — ledger byte-lock. With the real reader `ledger.py` reconstructs byte-identical to the independently
// rendered ground truth (151 lines, final line `# names normalized via rename script` from the step-9
// NO-BEACON append). ledger.py is reader-INDEPENDENT here (same 151 with or without a reader), but the lock
// uses the real reader so all four files come from one reconstruction.
test("test_S37_ledger_bytelock", () => {
    const records = loadRecords(S37_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/ledger.py"));
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("ledger.py")));
    assert.equal(finalText.split("\n").length, 151, "ledger.py should reconstruct to 151 lines");
    assert.ok(
        finalText.endsWith("# names normalized via rename script"),
        "ledger.py final line must be the step-9 NO-BEACON manual append",
    );
});

// T2 — MIXED reader-dependence (like S25/S35, NOT uniform like S34). With NO reader the two reader-DEPENDENT
// files degrade: `test_ledger.py` drops to 68 (the MCP-run beacon completion needs a backup) and `renames.csv`
// drops to 4 (the step-7 `tot_credits,total_credits` append needs a backup). The two reader-INDEPENDENT files
// are unchanged: `ledger.py` is still 151 with its trailing comment and `apply_renames.py` is still 66.
test("test_S37_mixed_reader_dependence", () => {
    const surviving = reconstructBranches(loadRecords(S37_JSONL)).surviving;

    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_ledger.py"));
    assert.equal(testText.split("\n").length, 68, "no-reader test_ledger.py should degrade to 68 lines");
    const csvText = historyFinalText(historyEndingWith(surviving, "/renames.csv"));
    assert.equal(csvText.split("\n").length, 4, "no-reader renames.csv should degrade to 4 lines");
    assert.ok(
        !csvText.includes("tot_credits,total_credits"),
        "no-reader renames.csv must drop the step-7 NO-BEACON row",
    );

    const ledgerText = historyFinalText(historyEndingWith(surviving, "/ledger.py"));
    assert.equal(ledgerText.split("\n").length, 151, "ledger.py is reader-INDEPENDENT (151 without a reader)");
    assert.ok(
        ledgerText.endsWith("# names normalized via rename script"),
        "no-reader ledger.py must still carry the step-9 trailing comment",
    );
    const applyText = historyFinalText(historyEndingWith(surviving, "/apply_renames.py"));
    assert.equal(applyText.split("\n").length, 66, "apply_renames.py is reader-INDEPENDENT (66 without a reader)");
});

// T3 — renames.csv 3-revision ladder via the EXISTING S27 completeTruncatedBeacon. rev0 is the `write` of
// header + 2 rows (3 lines); rev1 is the step-5 manual user-edit beacon (4 lines, no `tot_credits`,total_credits`);
// rev2 is the step-7 NO-BEACON append completed from a file-history backup (5 lines, all four rows).
// apply_renames.py is byte-locked here too (single `write` revision) including its PRECOMPILED two-line
// substitution form (NOT s34's inline form).
test("test_S37_renames_csv_three_revisions_via_s27", () => {
    const records = loadRecords(S37_JSONL);
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
    const scriptText = historyFinalText(scriptHistory);
    assert.equal(scriptText, stripTrailingNewline(readGroundTruth("apply_renames.py")));
    // PRECOMPILED two-line form (NOT s34's inline `re.sub(r"\b" + re.escape(old) + r"\b", new, text)`).
    assert.ok(scriptText.includes(String.raw`pattern = r"\b" + re.escape(old) + r"\b"`), "apply_renames missing precompiled pattern line");
    assert.ok(scriptText.includes(String.raw`text = re.sub(pattern, new, text)`), "apply_renames missing re.sub(pattern, …) line");
});

// T4 — rename applied, WHOLE-WORD. In final ledger.py every old terse name has zero whole-word occurrences
// and every new name is present. In final test_ledger.py the renamed import line is present and the terse old
// names are absent as whole words. Absence MUST be a `\bold\b` regex: the new names recur in ledger.py
// docstrings/prose, so a bare substring check on old names would be brittle.
test("test_S37_renames_whole_word", () => {
    const records = loadRecords(S37_JSONL);
    const surviving = reconstructBranches(records, realReader(records)).surviving;
    const ledgerText = historyFinalText(historyEndingWith(surviving, "/ledger.py"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(String.raw`\b${oldName}\b`).test(ledgerText), `ledger still has whole-word ${oldName}`);
        assert.ok(ledgerText.includes(newName), `ledger missing new name ${newName}`);
    }
    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_ledger.py"));
    assert.ok(
        testText.includes("from ledger import record_entry, bal, remove_entry"),
        "test missing renamed import surface",
    );
    assert.ok(!/\badd_entry\b/.test(testText), "test still has whole-word add_entry");
    assert.ok(!/\brm_entry\b/.test(testText), "test still has whole-word rm_entry");
});

// T5 — edit-ordering crux. `report` was added AFTER the MCP run (a post-rename Edit replayed on top of the
// renamed beacon) and its body calls `record_entry` and `total_debits` — names that exist ONLY because the
// step-5/step-7 CSV user-edits appended their rows before the MCP run applied them. `audit` was added BEFORE
// the run, so the run renamed its body in place (it now references `total_debits`/`total_credits`). Both defs
// reaching the renamed names proves the CSV edits flowed through the MCP run; scoping each assertion to its
// own def block proves the ordering.
test("test_S37_edit_ordering_report_on_renamed_audit_present", () => {
    const records = loadRecords(S37_JSONL);
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

// T6 — MCP-run provenance + event multiset + PARTIAL poison rejection.
// (a) The rename ran through `ctx_execute`, so the fixture's assistant records carry
//     `attributionMcpServer`/`attributionMcpTool` — the keys S32's loadTranscript.ts allow-set admits. So
//     `loadRecords` must not throw, and the raw fixture must carry those MCP records (the keys are
//     allowed-but-not-typed, so read the raw JSONL — same approach as S36). Were S32's fix reverted,
//     loadRecords(S37_JSONL) would throw UnmodeledFieldError. The step-7 and step-9 appends left NO beacon, so
//     the userEdit multiset is the four beacon ids only.
// (b) Reconstruct with a POISON reader: the S27/S28 guards reject it for the three guarded files, so none of
//     test_ledger.py (68), renames.csv (4), apply_renames.py (66) leaks "POISONED". DELIBERATELY NOT asserted:
//     ledger.py under poison. ledger.py is reader-INDEPENDENT for real inputs (151 with or without a reader),
//     but its rescue path ACCEPTS a poison backup (collapses to 19, leaks "POISONED") — a latent robustness
//     gap in a rescue stage, out of scope for this char-lock, so it is characterized-by-omission here.
test("test_S37_event_multiset_and_poison_partial_rejection", () => {
    const records = loadRecords(S37_JSONL); // does not throw ⇒ S32's MCP-attribution allow-set is present
    const rawLines = readFileSync(S37_JSONL, "utf8").split("\n").filter((line) => line.length > 0);
    const mcpLines = rawLines.filter(
        (line) => line.includes('"attributionMcpTool":"ctx_execute"')
            && line.includes('"attributionMcpServer":"plugin:context-mode:context-mode"'),
    );
    assert.equal(mcpLines.length, 6, "fixture should carry 6 MCP-run (ctx_execute) assistant records");

    const events = extractFileEvents(records);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 4);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 4);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["22de8fa9", "9022d09a", "a4d3d115", "d6a766e2"],
    );

    const poisoned = reconstructBranches(records, poison).surviving;
    // Only the three guarded files; ledger.py is deliberately excluded (see comment above).
    const guarded = [
        { suffix: "/tests/test_ledger.py", lines: 68 },
        { suffix: "/renames.csv", lines: 4 },
        { suffix: "/apply_renames.py", lines: 66 },
    ];
    for (const { suffix, lines } of guarded) {
        const poisonedText = historyFinalText(historyEndingWith(poisoned, suffix));
        assert.ok(!poisonedText.includes("POISONED"), `${suffix} leaked POISONED backup`);
        assert.equal(poisonedText.split("\n").length, lines, `${suffix} poison fallback wrong line count`);
    }
});
