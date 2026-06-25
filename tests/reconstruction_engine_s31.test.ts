import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S31_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. The leading-slash suffixes keep `/textutil.py` from
// also matching `/tests/test_textutil.py` (the char before each basename is `/`, never `_`/a word char).
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

// Ground-truth literals for all FOUR rendered files come from the rendered executed-scenario store the
// same JSONL points at. The engine reconstructs from the JSONL while these expected values come from the
// independent rendered files, so each `=== readGroundTruth(...)` stays a real cross-source check. Same
// pattern as S27/S28/S29/S30 — and like S30 (UNLIKE S29) there is NO ground-truth gap: every file rendered.
const S31_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s31-script-rename-many-rows";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S31_GT}/${relativePath}`, "utf8");
}

// The four touched files, paired (path-suffix → rendered-file relative path). The suffix's leading slash
// disambiguates `/textutil.py` from `/tests/test_textutil.py`.
const FILES = [
    { suffix: "/textutil.py", rel: "textutil.py" },
    { suffix: "/tests/test_textutil.py", rel: "tests/test_textutil.py" },
    { suffix: "/many_renames.csv", rel: "many_renames.csv" },
    { suffix: "/bulk_rename.py", rel: "bulk_rename.py" },
];

// The twelve whole-word renames the one `python3 bulk_rename.py` run applied (old → new).
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["cap", "capitalize"], ["low", "lowercase"], ["up", "uppercase"], ["rev", "reverse"],
    ["trim", "trim_whitespace"], ["pad", "pad_right"], ["cnt", "count"], ["idx", "index_of"],
    ["rep", "replace"], ["splt", "split"], ["joi", "join"], ["slug", "slugify"],
];

// A reader that must NEVER be consulted: every byte S31 reconstructs comes from the JSONL beacons, so
// serving poison and seeing it never surface proves the clean poison matrix (reader-independence).
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";

// T1 — THE HEADLINE LOCK: one `python3 bulk_rename.py` run applied all twelve whole-word renames across
// textutil.py and tests/test_textutil.py; bracketed by a pre-script Edit (`normalize`) and a post-script
// Edit (`headline`). Reconstruct from the JSONL and assert all FOUR files are byte-identical to the
// independently-rendered ground truth. This single lock covers the entire many-row rename + both edits.
test("test_S31_four_file_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S31_JSONL)).surviving;
    assert.equal(surviving.length, 4);
    for (const { suffix, rel } of FILES) {
        const finalText = historyFinalText(historyEndingWith(surviving, suffix));
        assert.equal(finalText, stripTrailingNewline(readGroundTruth(rel)), `${rel} not byte-identical`);
    }
});

// T2 — revision ladders: textutil.py is the only multi-revision file (write → `normalize` edit → rename
// beacon user-edit → `headline` edit), test_textutil.py is write → rename beacon user-edit, and the CSV /
// script are single writes. No rewinds — one linear surviving set, zero rewound branches.
test("test_S31_revision_ladders_linear_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S31_JSONL));
    assert.equal(branched.rewound.length, 0);
    const expectations = [
        { suffix: "/textutil.py", kinds: [EventKind.write, EventKind.edit, EventKind.userEdit, EventKind.edit], lines: 218 },
        { suffix: "/tests/test_textutil.py", kinds: [EventKind.write, EventKind.userEdit], lines: 71 },
        { suffix: "/many_renames.csv", kinds: [EventKind.write], lines: 13 },
        { suffix: "/bulk_rename.py", kinds: [EventKind.write], lines: 54 },
    ];
    for (const { suffix, kinds, lines } of expectations) {
        const history = historyEndingWith(branched.surviving, suffix);
        assert.deepEqual(history.revisions.map((revision) => revision.kind), kinds, `${suffix} kinds`);
        assert.equal(historyFinalText(history).split("\n").length, lines, `${suffix} final line count`);
    }
});

// T3 — all twelve renames applied, WHOLE-WORD: in final textutil.py every old name has zero whole-word
// occurrences EXCEPT `\bslug\b`, which legitimately appears twice (English prose in `headline`'s docstring,
// written post-rename — NOT a missed rename). Every new name is present. Bare `includes()` would wrongly
// flag `cap` inside `capitalize`, so absence MUST be `\bold\b` regex.
test("test_S31_twelve_renames_whole_word", () => {
    const finalText = historyFinalText(
        historyEndingWith(reconstructBranches(loadRecords(S31_JSONL)).surviving, "/textutil.py"),
    );
    for (const [oldName, newName] of RENAMES) {
        const expected = oldName === "slug" ? 2 : 0;
        const matches = finalText.match(new RegExp(`\\b${oldName}\\b`, "g")) ?? [];
        assert.equal(matches.length, expected, `whole-word \\b${oldName}\\b count`);
        assert.ok(finalText.includes(newName), `missing new name ${newName}`);
    }
});

// T4 — edit-ordering crux. `normalize` was added BEFORE the run (its body referenced the old `trim`/`low`)
// → the script renamed its body → final `normalize` docstring references `trim_whitespace`/`lowercase`.
// `headline` was added AFTER the run → it references the NEW `capitalize`/`slugify` and replays on top of
// the renamed beacon (rev 3). Scoping each assertion to its own def block proves the ordering, not mere
// co-presence. Whole-word old names are absent INSIDE `normalize` (its body was rewritten by the script).
test("test_S31_edit_ordering_normalize_renamed_headline_on_beacon", () => {
    const finalText = historyFinalText(
        historyEndingWith(reconstructBranches(loadRecords(S31_JSONL)).surviving, "/textutil.py"),
    );
    const normalize = defBlock(finalText, "normalize");
    assert.ok(normalize.includes("trim_whitespace"), "normalize body not renamed to trim_whitespace");
    assert.ok(normalize.includes("lowercase"), "normalize body not renamed to lowercase");
    assert.ok(!/\btrim\b/.test(normalize) && !/\blow\b/.test(normalize), "normalize kept an old whole-word name");

    const headline = defBlock(finalText, "headline");
    assert.ok(headline.includes("capitalize"), "headline does not reference new name capitalize");
    assert.ok(headline.includes("slugify"), "headline does not reference new name slugify");
});

// T5 — reader-independence / clean poison matrix. Both beacons are COMPLETE full-file user-edits, so no
// rescue stage (completeTruncatedBeacon S27 / completeElidedBeacons S28 / seedStaleEditBases S19) needs a
// backup. Reconstruct WITHOUT a reader and with a POISON reader; assert all four final texts equal the
// no-arg results byte-for-byte and never leak "POISONED".
test("test_S31_reader_independent_bytelock", () => {
    const base = reconstructBranches(loadRecords(S31_JSONL)).surviving;
    const poisoned = reconstructBranches(loadRecords(S31_JSONL), poison).surviving;
    for (const { suffix } of FILES) {
        const baseText = historyFinalText(historyEndingWith(base, suffix));
        const poisonedText = historyFinalText(historyEndingWith(poisoned, suffix));
        assert.equal(poisonedText, baseText, `${suffix} differs under poison reader`);
        assert.ok(!poisonedText.includes("POISONED"), `${suffix} leaked POISONED backup`);
    }
});

// T6 — extractFileEvents multiset. The rename surfaces ONLY as the two `edited_text_file` beacons (the
// `python3` Bash command is never parsed), so the raw stream carries exactly 4 writes (textutil,
// test_textutil, csv, script), 2 edits (`normalize`, `headline` — both on textutil.py), 2 user-edit
// beacons, and ZERO overwrites (no rescue stage injects a synthetic overwrite here). NOTE: 2 edits, not 3 —
// re-verified live against the engine; the only edits are textutil.py's two bracketing Claude edits.
test("test_S31_extractFileEvents_multiset", () => {
    const events = extractFileEvents(loadRecords(S31_JSONL));
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 4);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["590f882d", "98ce2cbf"],
    );
});
