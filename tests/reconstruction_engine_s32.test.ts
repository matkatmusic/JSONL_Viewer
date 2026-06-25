import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S32_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. The leading-slash suffixes keep `/config_utils.py`
// from also matching `/tests/test_config_utils.py` (the char before each basename is `/`, never a word char).
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
// `readGroundTruth(...)` stays a real cross-source check. Same pattern as S30/S31 — every file rendered.
const S32_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s32-script-rename-mcp-exec";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S32_GT}/${relativePath}`, "utf8");
}

// The three touched files, paired (path-suffix → rendered-file relative path). The suffix's leading slash
// disambiguates `/config_utils.py` from `/tests/test_config_utils.py`.
const FILES = [
    { suffix: "/config_utils.py", rel: "config_utils.py" },
    { suffix: "/tests/test_config_utils.py", rel: "tests/test_config_utils.py" },
    { suffix: "/rename_config.py", rel: "rename_config.py" },
];

// The three whole-word renames the one MCP `ctx_execute` (`python3 rename_config.py`) run applied (old → new).
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["get_val", "get_value"], ["set_val", "set_value"], ["del_val", "delete_value"],
];

// A reader that must NEVER be consulted: every byte S32 reconstructs comes from the JSONL beacons (HAS-BEACON),
// so serving poison and seeing it never surface proves reader-independence (clean poison matrix).
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";

// T1 — config byte-lock. The MCP-sandbox rename (get_val/set_val/del_val → get_value/set_value/delete_value)
// plus the pre-script `get_or_default` and post-script `apply_overrides` edits reconstruct to a file
// byte-identical to the independently-rendered ground truth. Reconstruct with NO BackupReader (reader-
// independent — this absence is itself the assertion).
test("test_S32_config_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S32_JSONL)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/config_utils.py"));
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("config_utils.py")));
});

// T2 — test-file byte-lock. tests/test_config_utils.py reconstructs byte-identical to its rendered ground
// truth (it was rewritten ONLY by the MCP run — a single `edited_text_file` beacon, no bridging Edit).
test("test_S32_test_file_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S32_JSONL)).surviving;
    const finalText = historyFinalText(historyEndingWith(surviving, "/tests/test_config_utils.py"));
    assert.equal(finalText, stripTrailingNewline(readGroundTruth("tests/test_config_utils.py")));
});

// T3 — revision ladders (live-verified): config_utils.py has 11 revisions (write → edits building
// get_or_default → the MCP-run user-edit beacon → edits adding apply_overrides), test_config_utils.py has 2
// (write → MCP-run user-edit beacon), rename_config.py has 1 (write). One linear surviving set, zero rewound.
test("test_S32_revision_ladders_linear_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S32_JSONL));
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 3);
    const expectations = [
        { suffix: "/config_utils.py", revs: 11, lines: 260 },
        { suffix: "/tests/test_config_utils.py", revs: 2, lines: 87 },
        { suffix: "/rename_config.py", revs: 1, lines: 62 },
    ];
    for (const { suffix, revs, lines } of expectations) {
        const history = historyEndingWith(branched.surviving, suffix);
        assert.equal(history.revisions.length, revs, `${suffix} revision count`);
        assert.equal(historyFinalText(history).split("\n").length, lines, `${suffix} final line count`);
    }
});

// T4 — rename applied, WHOLE-WORD. In final config_utils.py every old name has zero whole-word occurrences and
// every new name is present. In final test_config_utils.py the renamed import line is present and the terse
// old names are absent as whole words. Bare `includes()` would wrongly flag `get_val` inside the kept def
// name `test_get_val_flat_key`, so absence MUST be a `\bold\b` regex (see T5 kept-name control).
test("test_S32_renames_whole_word", () => {
    const surviving = reconstructBranches(loadRecords(S32_JSONL)).surviving;
    const configText = historyFinalText(historyEndingWith(surviving, "/config_utils.py"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(!new RegExp(`\\b${oldName}\\b`).test(configText), `config still has whole-word ${oldName}`);
        assert.ok(configText.includes(newName), `config missing new name ${newName}`);
    }
    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_config_utils.py"));
    assert.ok(testText.includes("from config_utils import get_value, set_value"), "test missing renamed import");
    assert.ok(!/\bget_val\b/.test(testText), "test still has whole-word get_val");
    assert.ok(!/\bset_val\b/.test(testText), "test still has whole-word set_val");
});

// T5 — kept-name control. The rename was whole-word, NOT a blanket substring replace: the test file keeps the
// `_`-bounded function names `test_get_val_flat_key` / `test_set_val_overwrites_existing` verbatim (their
// `get_val`/`set_val` are not whole-word matches). Their survival proves the script renamed only whole words.
test("test_S32_kept_function_names_control", () => {
    const surviving = reconstructBranches(loadRecords(S32_JSONL)).surviving;
    const testText = historyFinalText(historyEndingWith(surviving, "/tests/test_config_utils.py"));
    assert.ok(testText.includes("def test_get_val_flat_key("), "lost kept name test_get_val_flat_key");
    assert.ok(testText.includes("def test_set_val_overwrites_existing("), "lost kept name test_set_val_overwrites_existing");
});

// T6 — edit-ordering crux. `get_or_default` was added BEFORE the MCP run (its body called the old `get_val`) →
// the script rewrote its body → final `get_or_default` references `get_value`, with no whole-word old name.
// `apply_overrides` was added AFTER the run (a post-rename Edit replayed on top of the renamed beacon) → it
// references the NEW `get_value`/`set_value`. Scoping each assertion to its own def block proves the ordering,
// not mere co-presence anywhere in the file.
test("test_S32_edit_ordering_get_or_default_renamed_apply_overrides_on_beacon", () => {
    const configText = historyFinalText(
        historyEndingWith(reconstructBranches(loadRecords(S32_JSONL)).surviving, "/config_utils.py"),
    );
    const getOrDefault = defBlock(configText, "get_or_default");
    assert.ok(getOrDefault.includes("get_value"), "get_or_default body not renamed to get_value");
    assert.ok(!/\bget_val\b/.test(getOrDefault), "get_or_default kept old whole-word get_val");

    const applyOverrides = defBlock(configText, "apply_overrides");
    assert.ok(applyOverrides.includes("get_value"), "apply_overrides does not reference new name get_value");
    assert.ok(applyOverrides.includes("set_value"), "apply_overrides does not reference new name set_value");
});

// T7 — HAS-BEACON / extractFileEvents multiset (live-verified). The MCP `ctx_execute` run is never parsed as a
// file event (it carries no Edit/Write record); the rename surfaces ONLY as the two `edited_text_file` beacons.
// The raw stream carries exactly 3 writes (config, test, rename_config), 6 Claude edits (all on config_utils.py
// — the get_or_default build-up and the apply_overrides build-up), 2 user-edit beacons (one per renamed file),
// and ZERO overwrites (no rescue stage injects a synthetic overwrite). Re-verified live (S28/S31 lesson).
test("test_S32_extractFileEvents_multiset_has_beacon", () => {
    const events = extractFileEvents(loadRecords(S32_JSONL));
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 3);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 6);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["c7922fde", "d9cbc214"],
    );
});

// T8 — reader-independence / clean poison matrix. Both renamed files are HAS-BEACON (complete `edited_text_file`
// snapshots), so no rescue stage (completeTruncatedBeacon S27 / completeElidedBeacons S28 / seedStaleEditBases
// S19) needs a backup. Reconstruct WITHOUT a reader and with a POISON reader; assert all final texts equal the
// no-arg results byte-for-byte and never leak "POISONED".
test("test_S32_reader_independent_bytelock", () => {
    const base = reconstructBranches(loadRecords(S32_JSONL)).surviving;
    const poisoned = reconstructBranches(loadRecords(S32_JSONL), poison).surviving;
    for (const { suffix } of FILES) {
        const baseText = historyFinalText(historyEndingWith(base, suffix));
        const poisonedText = historyFinalText(historyEndingWith(poisoned, suffix));
        assert.equal(poisonedText, baseText, `${suffix} differs under poison reader`);
        assert.ok(!poisonedText.includes("POISONED"), `${suffix} leaked POISONED backup`);
    }
});
