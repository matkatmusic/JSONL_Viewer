import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S30_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. The leading-slash suffixes keep `/pricing.py` from
// also matching `/tests/test_pricing.py` (the char before each basename is `/`, never a word char).
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}
// The engine drops a single trailing newline at replay (splitLines), so the newline-joined revision text
// equals the rendered file with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}

// Ground-truth literals for all FOUR rendered files come from the rendered executed-scenario store the
// same JSONL points at. The engine reconstructs from the JSONL while these expected values come from the
// independent rendered files, so each `=== *_FINAL` stays a real cross-source check. (Same pattern as
// S27/S28/S29 — but UNLIKE S29 there is NO ground-truth gap: every S30 file is rendered.)
const S30_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s30-script-rename-count-mismatch";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S30_GT}/${relativePath}`, "utf8");
}
const S30_PRICING_FINAL = stripTrailingNewline(readGroundTruth("pricing.py")); // 5863
const S30_TEST_FINAL = stripTrailingNewline(readGroundTruth("tests/test_pricing.py")); // 1035

// The two test_pricing.py backup versions the reader offers. `@v3` is the POST-rename file (byte-identical
// to the rendered ground truth) — it matches the elided beacon's visible `round_to_cents` window and is
// CHOSEN. `@v2` is the SAME-40-line PRE-rename version (the rename undone: `round_to_cents`→`round_price`),
// which fails the window's content-validation and must be REJECTED. Serving both makes T3 a genuine
// content-not-recency lock, not a key-existence check. Both keep `base_price` — `unit_price` exists in no
// backup at all.
const S30_TEST_V3 = readGroundTruth("tests/test_pricing.py");
const S30_TEST_V2 = S30_TEST_V3.replace(/\bround_to_cents\b/g, "round_price");

// Hermetic reader: serves only the two test_pricing.py backup versions by their file-history keys and `""`
// (rejected) for every other key — so content-validation, not key existence, drives the version choice.
// `pricing.py`, `count_renames.csv`, and `safe_rename.py` are reader-INDEPENDENT and never consult it.
const s30Reader: BackupReader = (name) => {
    const key = name.toString();
    if (key === "b1770edab554937c@v3") return S30_TEST_V3;
    if (key === "b1770edab554937c@v2") return S30_TEST_V2;
    return "";
};
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";

// §2 — one `python3 safe_rename.py` Bash run rewrites two files (the applied `round_price` rename) and
// forks nothing, so the engine yields one linear surviving set of all four files and zero rewound
// branches. Locks the branch shape and the full file set.
test("test_S30_linear_four_surviving_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S30_JSONL), s30Reader);
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 4);
    for (const suffix of [
        "/pricing.py",
        "/tests/test_pricing.py",
        "/count_renames.csv",
        "/safe_rename.py",
    ]) {
        assert.ok(
            branched.surviving.some((history) => history.target.toString().endsWith(suffix)),
            `missing ${suffix}`,
        );
    }
});

// THE HEADLINE LOCK: the count-guarded script APPLIED `round_price`→`round_to_cents` (count matched) but
// REFUSED `base_price`→`unit_price` (off-by-one `MISMATCH`). The engine adopts the post-script beacons, so
// the applied rename shows through both files while the refused rename is NEVER fabricated: every final
// keeps whole-word `base_price`, has zero whole-word `round_price`, carries `round_to_cents`, and contains
// no whole-word `unit_price`. Locks §1.2.
test("test_S30_refused_rename_never_fabricates_unit_price", () => {
    const surviving = reconstructBranches(loadRecords(S30_JSONL), s30Reader).surviving;
    for (const suffix of ["/pricing.py", "/tests/test_pricing.py"]) {
        const finalText = historyFinalText(historyEndingWith(surviving, suffix));
        assert.ok(/\bbase_price\b/.test(finalText), `${suffix} dropped base_price`);
        assert.ok(!/\bunit_price\b/.test(finalText), `${suffix} fabricated unit_price`);
        assert.ok(finalText.includes("round_to_cents"), `${suffix} missing round_to_cents`);
        assert.ok(!/\bround_price\b/.test(finalText), `${suffix} left whole-word round_price`);
    }
});

// CRUX (S28): tests/test_pricing.py's ELIDED beacon (lines 1–40 with a bare `...` eliding 19–20) is
// completed by `completeElidedBeacons` from a content-validated backup. THE VERSION LOCK: the chosen
// overwrite base is `b1770edab554937c@v3` (post-rename, `round_to_cents`), NOT the SAME-40-line `@v2`
// (pre-rename, `round_price`) the reader also serves — content-validation, not recency, picks the version.
// (Mutation: neutralize completeElidedBeacons → this test RED, §9.) Locks §2.3 + §2.4.
test("test_S30_elided_test_beacon_completed_version_selected_by_content", () => {
    const testPricing = historyEndingWith(
        reconstructBranches(loadRecords(S30_JSONL), s30Reader).surviving,
        "/tests/test_pricing.py",
    );
    assert.deepEqual(testPricing.revisions.map((revision) => revision.kind), [
        EventKind.write,
        EventKind.userEdit,
        EventKind.overwrite,
    ]);
    const overwrite = testPricing.revisions[testPricing.revisions.length - 1]!;
    assert.equal(overwrite.kind, EventKind.overwrite);
    assert.equal(overwrite.changeId.toString(), "b1770edab554937c@v3"); // chosen over the same-40-line @v2
    assert.equal(overwrite.lines.length, 40);
    const finalText = historyFinalText(testPricing);
    assert.equal(finalText.length, 1035);
    assert.equal(finalText, S30_TEST_FINAL);
    assert.ok(finalText.includes("round_to_cents"));
    assert.ok(/\bbase_price\b/.test(finalText));
    assert.ok(!/\bround_price\b/.test(finalText));
    assert.ok(!finalText.split("\n").some((line) => line === "..."));
});

// S28 reader-dependence guard: WITHOUT a reader no backup is available, so the elided beacon is adopted
// verbatim — tests/test_pricing.py keeps its 2-rev no-overwrite ladder, the windowed `...` survives, and
// the final is 977 bytes (WRONG, never fabricated). With a poison reader no candidate validates, so still
// no overwrite and no "POISONED" leak. Locks §2.5 (reader-dependence + clean poison matrix).
test("test_S30_elided_test_beacon_without_reader_is_wrong", () => {
    const noReader = historyEndingWith(
        reconstructBranches(loadRecords(S30_JSONL)).surviving,
        "/tests/test_pricing.py",
    );
    assert.deepEqual(noReader.revisions.map((revision) => revision.kind), [
        EventKind.write,
        EventKind.userEdit,
    ]);
    assert.equal(historyFinalText(noReader).length, 977);
    assert.notEqual(historyFinalText(noReader), S30_TEST_FINAL);
    assert.ok(historyFinalText(noReader).split("\n").some((line) => line === "...")); // window survives

    const poisoned = historyEndingWith(
        reconstructBranches(loadRecords(S30_JSONL), poison).surviving,
        "/tests/test_pricing.py",
    );
    assert.ok(!poisoned.revisions.some((revision) => revision.kind === EventKind.overwrite));
    assert.equal(historyFinalText(poisoned).length, 977);
    assert.ok(!historyFinalText(poisoned).includes("POISONED"));
});

// pricing.py is reader-INDEPENDENT: a COMPLETE 155-line beacon followed by the downstream `receipt` Edit
// needs no backup. Reconstruct three ways — real reader, WITHOUT reader, poison reader — and assert all
// three final texts are byte-identical, equal the rendered ground truth (5863), carry the applied rename
// plus `receipt`, never the refused `unit_price` or whole-word `round_price`, and never leak "POISONED".
// (Proves Probe C: `seedStaleEditBases` is inert here.) Locks §2.3 (pricing.py) + §2.5 + §2.6.
test("test_S30_pricing_complete_beacon_reader_independent_bytelock", () => {
    const real = historyEndingWith(reconstructBranches(loadRecords(S30_JSONL), s30Reader).surviving, "/pricing.py");
    const without = historyEndingWith(reconstructBranches(loadRecords(S30_JSONL)).surviving, "/pricing.py");
    const poisoned = historyEndingWith(reconstructBranches(loadRecords(S30_JSONL), poison).surviving, "/pricing.py");
    assert.deepEqual(real.revisions.map((revision) => revision.kind), [
        EventKind.write,
        EventKind.edit,
        EventKind.edit,
        EventKind.userEdit,
        EventKind.edit,
    ]);
    const finalText = historyFinalText(real);
    assert.equal(historyFinalText(without), finalText); // reader-independent
    assert.equal(historyFinalText(poisoned), finalText);
    assert.equal(finalText.length, 5863);
    assert.equal(finalText, S30_PRICING_FINAL);
    assert.ok(finalText.includes("round_to_cents"));
    assert.ok(/\bbase_price\b/.test(finalText));
    assert.ok(finalText.includes("def receipt(")); // the post-rename Edit replays off the complete beacon
    assert.ok(!/\bround_price\b/.test(finalText));
    assert.ok(!/\bunit_price\b/.test(finalText));
    assert.ok(!finalText.split("\n").some((line) => line === "..."));
    assert.ok(!finalText.includes("POISONED"));
});

// The rename surfaces ONLY as the two `edited_text_file` beacons (the `python3` Bash command is never
// parsed). The synthetic `overwrite` the fix injects is a REVISION, not an extracted event — so the raw
// stream carries exactly two user-edit beacons, ZERO overwrites, four writes, three edits. §2.7.
test("test_S30_extractFileEvents_two_userEdits_no_overwrite_events", () => {
    const events = extractFileEvents(loadRecords(S30_JSONL));
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)).sort(),
        ["388074da", "9a1c303d"],
    );
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 4);
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 3);
});
