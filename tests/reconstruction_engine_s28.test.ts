import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S28_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. A leading-slash suffix (`/catalog.py`) never also
// matches a sibling such as `/catalog_view.py` or `/test_catalog.py` — the char before `catalog.py`
// there is `_view`/`test_`, not `/` — so per-file lookups stay unambiguous.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// Ground-truth literals are sourced from the rendered executed-scenario files (the same canonical store
// S28_JSONL points at) instead of inlined as escaped strings; the engine reconstructs from the JSONL
// while these expected values come from the independent rendered files, so each `=== *_FINAL` stays a
// real cross-source check and the exact byte-length asserts pin the bytes. (Same pattern as S27.)
const S28_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s28-script-rename-scope";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S28_GT}/${relativePath}`, "utf8");
}
// The engine drops a single trailing newline at replay (splitLines), so the newline-joined revision
// text equals the rendered file with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}
const S28_CATALOG_FINAL = stripTrailingNewline(readGroundTruth("catalog.py"));
const S28_CATALOG_VIEW_FINAL = stripTrailingNewline(readGroundTruth("catalog_view.py"));
const S28_TEST_CATALOG_FINAL = stripTrailingNewline(readGroundTruth("tests/test_catalog.py"));
const S28_SCOPED_RENAME_FINAL = stripTrailingNewline(readGroundTruth("scoped_rename.py"));
const S28_SCOPED_RENAMES_CSV_FINAL = stripTrailingNewline(readGroundTruth("scoped_renames.csv"));

// catalog_view.py's POST-SCRIPT, PRE-`preview` backup (`a8b61336832f339e@v3`, 1521 raw bytes). This is
// NOT a rendered file — it is the intermediate state the engine must pick as the elided beacon's
// overwrite base (the latest `@v4` post-`preview` backup FAILS validation). Inlined so the hermetic
// reader never touches the real ~/.claude/file-history tree.
const S28_CATALOG_VIEW_V3 = "\"\"\"Human-readable rendering of catalog files.\n\nThis module is a thin presentation layer over :mod:`catalog`. It loads a\ncatalog from disk and formats its entries into a plain-text report suitable for\nprinting to a terminal or writing to a log.\n\"\"\"\n\nfrom __future__ import annotations\n\nimport catalog\n\n__all__ = [\"render\", \"render_entry\"]\n\n\ndef render_entry(entry):\n    \"\"\"Format a single normalized ``entry`` as one line of text.\n\n    :param entry: A normalized entry ``dict`` as produced by\n        :func:`catalog.load_catalog`.\n    :returns: A formatted, single-line ``str``.\n    \"\"\"\n    tags = \", \".join(entry.get(\"tags\", ())) or \"(none)\"\n    return f\"{entry['sku']:<12} {entry['name']:<24} ${entry['price']:>8.2f}  [{tags}]\"\n\n\ndef render(path):\n    \"\"\"Load the catalog at ``path`` and render it as a multi-line report.\n\n    :param path: Filesystem path to a catalog file.\n    :returns: A ``str`` containing one header line, one line per entry, and a\n        trailing summary line with the total value.\n    \"\"\"\n    entries = catalog.load_catalog(path)\n\n    lines = [f\"Catalog: {path}\", f\"{len(entries)} entries\", \"-\" * 60]\n    lines.extend(render_entry(entry) for entry in entries)\n    lines.append(\"-\" * 60)\n    lines.append(f\"Total value: ${catalog.total_value(entries):.2f}\")\n    return \"\\n\".join(lines)\n\n\nif __name__ == \"__main__\":\n    import sys\n\n    if len(sys.argv) != 2:\n        print(\"usage: python catalog_view.py <catalog-file>\", file=sys.stderr)\n        raise SystemExit(2)\n\n    print(render(sys.argv[1]))\n";

// Hermetic reader: returns the one inline backup (`catalog_view@v3`) and derives the other two backup
// versions the fix may pick from the rendered files (each byte-identical to its blob). The latest
// `catalog_view@v4` is the rendered final (it must be REJECTED by content-validation in favour of @v3);
// `test_catalog@v3` is the rendered test file (byte-identical, the complete terminal content). Any other
// blob (e.g. the `@v2` pre-script versions) returns "" so it is rejected by `backupMatchesBeacon`.
const s28Reader: BackupReader = (name) => {
    const blob = name.toString();
    if (blob === "a8b61336832f339e@v3") return S28_CATALOG_VIEW_V3;
    if (blob === "a8b61336832f339e@v4") return readGroundTruth("catalog_view.py");
    if (blob === "b50d0152214d341d@v3") return readGroundTruth("tests/test_catalog.py");
    return "";
};
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";

// §2.6 — one `python3 scoped_rename.py` run rewrites tracked sources; the run forks nothing, so the
// engine yields one linear surviving set and zero rewound branches. surviving.length === 6 = the five
// tracked files PLUS the stray `/tmp/cat.txt` cat-redirect side file. Assert the five real suffixes.
test("test_S28_linear_six_surviving_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S28_JSONL), s28Reader);
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 6);
    for (const suffix of [
        "/catalog.py",
        "/catalog_view.py",
        "/test_catalog.py",
        "/scoped_rename.py",
        "/scoped_renames.csv",
    ]) {
        assert.ok(
            branched.surviving.some((h) => h.target.toString().endsWith(suffix)),
            `missing ${suffix}`,
        );
    }
});

// catalog.py: its post-script `edited_text_file` beacon is COMPLETE (lines 1–198, no `...`), so the
// engine adopts it verbatim and the file reconstructs byte-identically with no reader and with a
// poisoned reader (reader-INDEPENDENT). The COMPLETE beacon already carries the scoped rename. Locks
// §2.3 (catalog) + §2.5.
test("test_S28_catalog_reader_independent_bytelock", () => {
    const without = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL)).surviving, "/catalog.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL), poison).surviving, "/catalog.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit, EventKind.edit, EventKind.userEdit,
    ]);
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    assert.ok(!historyFinalText(withPoison).includes("POISONED"));
    const finalText = historyFinalText(without);
    assert.equal(finalText.length, 6749);
    assert.equal(finalText, S28_CATALOG_FINAL);
    // The exported `load_all`->`load_catalog` (Y row, all files) and local `_norm`->`normalize_entry`
    // (N row, catalog.py only) renames are present; the terse names are gone.
    assert.ok(finalText.includes("def load_catalog"));
    assert.ok(finalText.includes("def normalize_entry"));
    assert.ok(!finalText.includes("def load_all("));
    assert.ok(!finalText.includes("def _norm("));
});

// scoped_rename.py (the rename driver) and scoped_renames.csv (the scope map) are pure writes — no
// script rewrites them — so both are reader-INDEPENDENT and byte-locked. The CSV body proves the scope
// columns: an exported `load_all,load_catalog,Y` row and a local `_norm,normalize_entry,N,catalog.py`
// row. Locks §2.3 (scoped_rename, csv) + §2.5.
test("test_S28_scoped_rename_and_csv_reader_independent", () => {
    const renameNo = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL)).surviving, "/scoped_rename.py");
    const renamePoison = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL), poison).surviving, "/scoped_rename.py");
    assert.deepEqual(renameNo.revisions.map((r) => r.kind), [EventKind.write]);
    assert.equal(historyFinalText(renameNo), historyFinalText(renamePoison));
    assert.equal(historyFinalText(renameNo).length, 1898);
    assert.equal(historyFinalText(renameNo), S28_SCOPED_RENAME_FINAL);

    const csvNo = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL)).surviving, "/scoped_renames.csv");
    const csvPoison = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL), poison).surviving, "/scoped_renames.csv");
    assert.deepEqual(csvNo.revisions.map((r) => r.kind), [EventKind.write]);
    assert.equal(historyFinalText(csvNo), historyFinalText(csvPoison));
    assert.equal(historyFinalText(csvNo).length, 83);
    assert.equal(historyFinalText(csvNo), S28_SCOPED_RENAMES_CSV_FINAL);
    assert.ok(historyFinalText(csvNo).includes("load_all,load_catalog,Y"));
    assert.ok(historyFinalText(csvNo).includes("_norm,normalize_entry,N,catalog.py"));
});

// CRUX A: tests/test_catalog.py is reader-DEPENDENT. Its TERMINAL `edited_text_file` beacon is
// MID-ELIDED (lines 1–9, `...`, 17–33, `...`, 39–102) — NOT a byte-prefix, so S27's
// completeTruncatedBeacon cannot fire. The fix (`completeElidedBeacons`) detects the elision from the
// snippet's line numbers and splices a synthetic `overwrite` from the content-validated backup
// `b50d0152214d341d@v3` (102 lines) so the terminal revision is the COMPLETE file. Locks §2.3
// (test_catalog) + §2.4.
test("test_S28_test_catalog_terminal_elided_beacon_overwrite", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL), s28Reader).surviving, "/test_catalog.py");
    assert.deepEqual(h.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.userEdit, EventKind.overwrite,
    ]);
    const rev1 = h.revisions[1]!; // the mid-elided beacon
    assert.equal(rev1.kind, EventKind.userEdit);
    assert.equal(rev1.changeId.toString(), "888a7d75-bed5-46ed-b706-6f0b77add2cd");
    assert.equal(rev1.lines.length, 92);
    const rev2 = h.revisions[2]!; // the injected complete backup
    assert.equal(rev2.kind, EventKind.overwrite);
    assert.equal(rev2.changeId.toString(), "b50d0152214d341d@v3");
    assert.equal(rev2.lines.length, 102);
    const finalText = historyFinalText(h);
    assert.equal(finalText.length, 2665);
    assert.equal(finalText, S28_TEST_CATALOG_FINAL);
    assert.ok(finalText.includes("catalog.load_catalog")); // the exported rename reached the test
    // No bare `...` elision separator survives — proof the windowed beacon was replaced, not adopted.
    assert.ok(!finalText.split("\n").some((line) => line === "..."));
});

// CRUX B: catalog_view.py is reader-DEPENDENT. Its NON-TERMINAL beacon is HEAD+TAIL-elided (only lines
// 11–41). `completeElidedBeacons` (the new code, running first) splices the content-validated
// `a8b61336832f339e@v3` (49 lines) overwrite right after the beacon, and the two `preview` Edits splice
// onto the COMPLETE post-script content. THE VERSION-SELECTION LOCK: the chosen base is `@v3`
// (post-script, pre-`preview`), NOT the latest `@v4` — `@v4`'s lines shifted by the `preview` insertion
// FAIL `backupMatchesBeacon`, exercised because s28Reader returns real content for @v4 too. NOTE
// (verified, deviation from plan §1.2/§9): this 2067 output is ALSO produced by the pre-existing
// seedStaleEditBases (s19/s23) as a fallback — the window renumbers the `preview` Edit's anchors so
// editBaseIsStale returns TRUE — so neutralizing beaconIsElided leaves THIS test green (only CRUX A
// isolates the new code). This test is the catalog_view byte/version-selection regression lock. Locks
// §2.3 (catalog_view) + §2.4.
test("test_S28_catalog_view_elided_beacon_overwrite_then_edits", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL), s28Reader).surviving, "/catalog_view.py");
    assert.deepEqual(h.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.userEdit, EventKind.overwrite, EventKind.edit, EventKind.edit, EventKind.edit,
    ]);
    const rev1 = h.revisions[1]!; // the head+tail-elided window
    assert.equal(rev1.kind, EventKind.userEdit);
    assert.equal(rev1.changeId.toString(), "c264b1e3-63bc-4399-8e95-1eba3737e69b");
    assert.equal(rev1.lines.length, 30);
    const rev2 = h.revisions[2]!; // the injected post-script base — @v3, NOT the latest @v4
    assert.equal(rev2.kind, EventKind.overwrite);
    assert.equal(rev2.changeId.toString(), "a8b61336832f339e@v3");
    assert.equal(rev2.lines.length, 49);
    const finalText = historyFinalText(h);
    assert.equal(finalText.length, 2067);
    assert.equal(finalText, S28_CATALOG_VIEW_FINAL);
    assert.ok(finalText.includes("def preview(")); // the post-script Edit replayed onto the real base
    assert.ok(finalText.includes("load_catalog"));
    assert.ok(!finalText.includes("load_all"));
});

// Reader-dependence guard: WITHOUT a reader, no backup is available, so the fix injects nothing and both
// elided beacons are adopted verbatim — `tests/test_catalog.py` stays 2 revs / 2393 bytes and
// `catalog_view.py` stays 5 revs / 1538 bytes, both DIVERGING from ground truth. Locks §2.5.
test("test_S28_two_files_without_reader_are_wrong_no_overwrite", () => {
    const testCatalog = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL)).surviving, "/test_catalog.py");
    assert.deepEqual(testCatalog.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    assert.equal(historyFinalText(testCatalog).length, 2393);
    assert.notEqual(historyFinalText(testCatalog), S28_TEST_CATALOG_FINAL);

    const catalogView = historyEndingWith(reconstructBranches(loadRecords(S28_JSONL)).surviving, "/catalog_view.py");
    assert.deepEqual(catalogView.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.userEdit, EventKind.edit, EventKind.edit, EventKind.edit,
    ]);
    assert.equal(historyFinalText(catalogView).length, 1538);
    assert.notEqual(historyFinalText(catalogView), S28_CATALOG_VIEW_FINAL);
});

// Poison guard for the NEW code: `completeElidedBeacons` injects an overwrite ONLY when a backup
// version reproduces every visible beacon line. With a poison reader every candidate fails
// `backupMatchesBeacon`, so the TERMINAL elided beacon (`tests/test_catalog.py` — the file governed
// SOLELY by completeElidedBeacons) gets no overwrite and no "POISONED" leaks: it keeps its 2-rev
// no-reader ladder. (catalog_view.py is intentionally NOT asserted here: with a poison reader it is
// governed by the pre-existing seedStaleEditBases s19/s23 path, which DOES inject the poison content —
// that is established prior-scenario behaviour against a degenerate test-only reader, not what S28's
// fix introduces. catalog_view's real-reader correctness is locked by CRUX B.) Locks §2.5 (the
// poison/never-fabricate property of completeElidedBeacons).
test("test_S28_poison_reader_does_not_inject_garbage", () => {
    const surviving = reconstructBranches(loadRecords(S28_JSONL), poison).surviving;
    const testCatalog = historyEndingWith(surviving, "/test_catalog.py");
    assert.deepEqual(testCatalog.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    assert.ok(!testCatalog.revisions.some((r) => r.kind === EventKind.overwrite));
    assert.equal(historyFinalText(testCatalog).length, 2393);
    assert.ok(!historyFinalText(testCatalog).includes("POISONED"));
});

// The rename surfaces ONLY as the three `edited_text_file` beacons (the `python3` Bash command is never
// parsed). The synthetic overwrite the fix injects is a REVISION, not an extracted event — so it never
// appears in extractFileEvents. The raw events carry exactly the three user-edit beacons and exactly
// ONE overwrite, and that overwrite targets the stray `/tmp/cat.txt` cat-redirect side file — NOT any
// of the renamed sources — proving no synthetic seed leaked into the event stream / graphs. Locks §2.2
// + §2.4.
test("test_S28_extractFileEvents_three_userEdits_seed_stays_synthetic", () => {
    const events = extractFileEvents(loadRecords(S28_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((e) => e.changeId.toString().slice(0, 8)).sort(),
        ["888a7d75", "9d5b50af", "c264b1e3"],
    );
    const overwrites = events.filter((e) => e.kind === EventKind.overwrite);
    assert.equal(overwrites.length, 1); // the /tmp/cat.txt cat-redirect, not a renamed source
    assert.ok(overwrites[0]!.target.toString().endsWith("/cat.txt"));
    assert.ok(
        !overwrites.some((e) =>
            ["catalog.py", "catalog_view.py", "test_catalog.py"].some((f) => e.target.toString().endsWith(f)),
        ),
    );
});
