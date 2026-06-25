import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S29_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. Leading-slash suffixes keep `/pkg/a.py` from also
// matching a sibling such as `/pkg/vendor/c.py` — the char before each basename is `/`, never a word
// char — so per-file lookups stay unambiguous.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}
// The engine drops a single trailing newline at replay (splitLines), so the newline-joined revision text
// equals the rendered file with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}

// Ground-truth literals for the THREE rendered files come from the rendered executed-scenario store the
// same JSONL points at. The engine reconstructs from the JSONL while these expected values come from the
// independent rendered files, so each `=== *_FINAL` stays a real cross-source check. (Same pattern as
// S27/S28.) NOTE (S29 GROUND-TRUTH GAP): the `pkg/` subtree was NOT rendered to disk, so the `pkg/*`
// cruxes are locked against the inline backup blobs below instead.
const S29_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s29-script-rename-repo-walk";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S29_GT}/${relativePath}`, "utf8");
}
const S29_MAIN_FINAL = stripTrailingNewline(readGroundTruth("main.py")); // 1788
const S29_TEST_PKG_FINAL = stripTrailingNewline(readGroundTruth("tests/test_pkg.py")); // 1601
const S29_WALK_FINAL = stripTrailingNewline(readGroundTruth("walk_rename.py")); // 1530

// Inline backup blobs for the two `pkg/*` cruxes (no rendered ground truth exists for `pkg/`). Captured
// raw from `~/.claude/file-history/543492c4-1d45-47b7-a4a1-a2d14857161f` (plan §2.8). The `@v3`/`@v2`
// PRE-rename versions still say `helper` and must be REJECTED by content-validation; the `@v4`/`@v3`
// POST-rename versions say `compute_value` and are the CHOSEN overwrite bases. Inlined so the hermetic
// reader never touches the real file-history tree.
const S29_A_V3 = "\"\"\"pkg.a — a small data-loading module.\n\nThis module is responsible for turning raw text into normalized rows of\nvalues. The public surface is intentionally tiny:\n\n* :func:`helper`     — normalize a single raw value.\n* :func:`load_rows`  — split text into lines and normalize every cell.\n* :func:`count_rows` — count the number of loaded rows.\n* :func:`first_row`  — fetch the first row, or ``None`` when empty.\n\nThe module deliberately defines a ``helper`` function so it can be compared\nagainst the ``helper`` defined in :mod:`pkg.b` and :mod:`pkg.vendor.c`.\n\"\"\"\n\nfrom __future__ import annotations\n\n# The delimiter used to separate cells within a single line of input.\nCELL_DELIMITER = \",\"\n\n\ndef helper(x):\n    \"\"\"Normalize a single raw value.\n\n    For strings this strips surrounding whitespace and lowercases the\n    result so that values compare equal regardless of casing or padding.\n    Non-string values are returned unchanged.\n\n    Args:\n        x: The raw value to normalize. May be any type.\n\n    Returns:\n        The normalized value. Strings are stripped and lowercased; all\n        other types are passed through untouched.\n\n    Examples:\n        >>> helper(\"  Hello \")\n        'hello'\n        >>> helper(42)\n        42\n    \"\"\"\n    if isinstance(x, str):\n        return x.strip().lower()\n    return x\n\n\ndef preprocess(x):\n    \"\"\"Preprocess a single raw value by normalizing it.\n\n    This is a thin convenience wrapper around :func:`helper`, provided so\n    callers can express intent (\"preprocess this value\") without depending\n    on the normalization helper directly.\n\n    Args:\n        x: The raw value to preprocess. May be any type.\n\n    Returns:\n        The normalized value, as returned by :func:`helper`.\n\n    Examples:\n        >>> preprocess(\"  Hello \")\n        'hello'\n        >>> preprocess(42)\n        42\n    \"\"\"\n    return helper(x)\n\n\ndef load_rows(text):\n    \"\"\"Split ``text`` into rows and normalize each cell.\n\n    The input is split on newlines into lines, and every line is split on\n    :data:`CELL_DELIMITER` into cells. Each cell is passed through\n    :func:`helper` so the returned rows are fully normalized. Blank lines\n    are skipped so they do not produce spurious empty rows.\n\n    Args:\n        text: The raw multi-line text to load.\n\n    Returns:\n        A list of rows, where each row is a list of normalized cells.\n\n    Examples:\n        >>> load_rows(\"A, B\\\\nC, D\")\n        [['a', 'b'], ['c', 'd']]\n    \"\"\"\n    rows = []\n    for line in text.splitlines():\n        if not line.strip():\n            continue\n        cells = line.split(CELL_DELIMITER)\n        rows.append([helper(cell) for cell in cells])\n    return rows\n\n\ndef count_rows(rows):\n    \"\"\"Return the number of rows.\n\n    Args:\n        rows: A sequence of rows, typically produced by :func:`load_rows`.\n\n    Returns:\n        The number of rows as an integer.\n\n    Examples:\n        >>> count_rows([['a'], ['b']])\n        2\n    \"\"\"\n    return len(rows)\n\n\ndef first_row(rows):\n    \"\"\"Return the first row, or ``None`` when there are none.\n\n    Args:\n        rows: A sequence of rows, typically produced by :func:`load_rows`.\n\n    Returns:\n        The first row, or ``None`` if ``rows`` is empty.\n\n    Examples:\n        >>> first_row([['a'], ['b']])\n        ['a']\n        >>> first_row([]) is None\n        True\n    \"\"\"\n    if not rows:\n        return None\n    return rows[0]\n";
const S29_A_V4 = "\"\"\"pkg.a — a small data-loading module.\n\nThis module is responsible for turning raw text into normalized rows of\nvalues. The public surface is intentionally tiny:\n\n* :func:`compute_value`     — normalize a single raw value.\n* :func:`load_rows`  — split text into lines and normalize every cell.\n* :func:`count_rows` — count the number of loaded rows.\n* :func:`first_row`  — fetch the first row, or ``None`` when empty.\n\nThe module deliberately defines a ``compute_value`` function so it can be compared\nagainst the ``compute_value`` defined in :mod:`pkg.b` and :mod:`pkg.vendor.c`.\n\"\"\"\n\nfrom __future__ import annotations\n\n# The delimiter used to separate cells within a single line of input.\nCELL_DELIMITER = \",\"\n\n\ndef compute_value(x):\n    \"\"\"Normalize a single raw value.\n\n    For strings this strips surrounding whitespace and lowercases the\n    result so that values compare equal regardless of casing or padding.\n    Non-string values are returned unchanged.\n\n    Args:\n        x: The raw value to normalize. May be any type.\n\n    Returns:\n        The normalized value. Strings are stripped and lowercased; all\n        other types are passed through untouched.\n\n    Examples:\n        >>> compute_value(\"  Hello \")\n        'hello'\n        >>> compute_value(42)\n        42\n    \"\"\"\n    if isinstance(x, str):\n        return x.strip().lower()\n    return x\n\n\ndef preprocess(x):\n    \"\"\"Preprocess a single raw value by normalizing it.\n\n    This is a thin convenience wrapper around :func:`compute_value`, provided so\n    callers can express intent (\"preprocess this value\") without depending\n    on the normalization compute_value directly.\n\n    Args:\n        x: The raw value to preprocess. May be any type.\n\n    Returns:\n        The normalized value, as returned by :func:`compute_value`.\n\n    Examples:\n        >>> preprocess(\"  Hello \")\n        'hello'\n        >>> preprocess(42)\n        42\n    \"\"\"\n    return compute_value(x)\n\n\ndef load_rows(text):\n    \"\"\"Split ``text`` into rows and normalize each cell.\n\n    The input is split on newlines into lines, and every line is split on\n    :data:`CELL_DELIMITER` into cells. Each cell is passed through\n    :func:`compute_value` so the returned rows are fully normalized. Blank lines\n    are skipped so they do not produce spurious empty rows.\n\n    Args:\n        text: The raw multi-line text to load.\n\n    Returns:\n        A list of rows, where each row is a list of normalized cells.\n\n    Examples:\n        >>> load_rows(\"A, B\\\\nC, D\")\n        [['a', 'b'], ['c', 'd']]\n    \"\"\"\n    rows = []\n    for line in text.splitlines():\n        if not line.strip():\n            continue\n        cells = line.split(CELL_DELIMITER)\n        rows.append([compute_value(cell) for cell in cells])\n    return rows\n\n\ndef count_rows(rows):\n    \"\"\"Return the number of rows.\n\n    Args:\n        rows: A sequence of rows, typically produced by :func:`load_rows`.\n\n    Returns:\n        The number of rows as an integer.\n\n    Examples:\n        >>> count_rows([['a'], ['b']])\n        2\n    \"\"\"\n    return len(rows)\n\n\ndef first_row(rows):\n    \"\"\"Return the first row, or ``None`` when there are none.\n\n    Args:\n        rows: A sequence of rows, typically produced by :func:`load_rows`.\n\n    Returns:\n        The first row, or ``None`` if ``rows`` is empty.\n\n    Examples:\n        >>> first_row([['a'], ['b']])\n        ['a']\n        >>> first_row([]) is None\n        True\n    \"\"\"\n    if not rows:\n        return None\n    return rows[0]\n";
const S29_B_V2 = "\"\"\"pkg.b — a small reporting module.\n\nThis module turns normalized rows (as produced by :mod:`pkg.a`) into a\nhuman-readable report. Like its sibling, it defines its own ``helper``\nfunction, but here ``helper`` formats values *for display* rather than\nnormalizing them for storage.\n\nPublic surface:\n\n* :func:`helper` — format a single value for display.\n* :func:`render` — build a multi-line report body from rows.\n* :func:`header` — build a header line from column names.\n* :func:`footer` — build a one-line summary from a row count.\n\"\"\"\n\nfrom __future__ import annotations\n\n# The string used to separate columns when rendering a line.\nCOLUMN_SEPARATOR = \" | \"\n\n\ndef helper(x):\n    \"\"\"Format a single value for display.\n\n    The value is coerced to a string and title-cased, which gives report\n    cells a consistent, readable appearance regardless of the original\n    casing.\n\n    Args:\n        x: The value to format. May be any type.\n\n    Returns:\n        A title-cased string representation of ``x``.\n\n    Examples:\n        >>> helper(\"hello world\")\n        'Hello World'\n        >>> helper(42)\n        '42'\n    \"\"\"\n    return str(x).title()\n\n\ndef render(rows):\n    \"\"\"Build a report body by formatting every value in ``rows``.\n\n    Each row is rendered as a single line whose cells are formatted with\n    :func:`helper` and joined by :data:`COLUMN_SEPARATOR`. Rows are joined\n    with newlines to form the final report body.\n\n    Args:\n        rows: A sequence of rows, where each row is a sequence of values.\n\n    Returns:\n        A multi-line string containing the formatted report body.\n\n    Examples:\n        >>> render([[\"a\", \"b\"], [\"c\", \"d\"]])\n        'A | B\\\\nC | D'\n    \"\"\"\n    lines = []\n    for row in rows:\n        formatted = [helper(value) for value in row]\n        lines.append(COLUMN_SEPARATOR.join(formatted))\n    return \"\\n\".join(lines)\n\n\ndef header(cols):\n    \"\"\"Build a header line from a sequence of column names.\n\n    Each column name is formatted with :func:`helper` and the results are\n    joined with :data:`COLUMN_SEPARATOR`, matching the layout used by\n    :func:`render`.\n\n    Args:\n        cols: A sequence of column names.\n\n    Returns:\n        A single formatted header line.\n\n    Examples:\n        >>> header([\"name\", \"age\"])\n        'Name | Age'\n    \"\"\"\n    return COLUMN_SEPARATOR.join(helper(col) for col in cols)\n\n\ndef footer(n):\n    \"\"\"Return a one-line summary for a report containing ``n`` rows.\n\n    Args:\n        n: The number of rows in the report.\n\n    Returns:\n        A one-line human-readable summary string.\n\n    Examples:\n        >>> footer(3)\n        'Total rows: 3'\n    \"\"\"\n    return \"Total rows: {}\".format(n)\n";
const S29_B_V3 = "\"\"\"pkg.b — a small reporting module.\n\nThis module turns normalized rows (as produced by :mod:`pkg.a`) into a\nhuman-readable report. Like its sibling, it defines its own ``compute_value``\nfunction, but here ``compute_value`` formats values *for display* rather than\nnormalizing them for storage.\n\nPublic surface:\n\n* :func:`compute_value` — format a single value for display.\n* :func:`render` — build a multi-line report body from rows.\n* :func:`header` — build a header line from column names.\n* :func:`footer` — build a one-line summary from a row count.\n\"\"\"\n\nfrom __future__ import annotations\n\n# The string used to separate columns when rendering a line.\nCOLUMN_SEPARATOR = \" | \"\n\n\ndef compute_value(x):\n    \"\"\"Format a single value for display.\n\n    The value is coerced to a string and title-cased, which gives report\n    cells a consistent, readable appearance regardless of the original\n    casing.\n\n    Args:\n        x: The value to format. May be any type.\n\n    Returns:\n        A title-cased string representation of ``x``.\n\n    Examples:\n        >>> compute_value(\"hello world\")\n        'Hello World'\n        >>> compute_value(42)\n        '42'\n    \"\"\"\n    return str(x).title()\n\n\ndef render(rows):\n    \"\"\"Build a report body by formatting every value in ``rows``.\n\n    Each row is rendered as a single line whose cells are formatted with\n    :func:`compute_value` and joined by :data:`COLUMN_SEPARATOR`. Rows are joined\n    with newlines to form the final report body.\n\n    Args:\n        rows: A sequence of rows, where each row is a sequence of values.\n\n    Returns:\n        A multi-line string containing the formatted report body.\n\n    Examples:\n        >>> render([[\"a\", \"b\"], [\"c\", \"d\"]])\n        'A | B\\\\nC | D'\n    \"\"\"\n    lines = []\n    for row in rows:\n        formatted = [compute_value(value) for value in row]\n        lines.append(COLUMN_SEPARATOR.join(formatted))\n    return \"\\n\".join(lines)\n\n\ndef header(cols):\n    \"\"\"Build a header line from a sequence of column names.\n\n    Each column name is formatted with :func:`compute_value` and the results are\n    joined with :data:`COLUMN_SEPARATOR`, matching the layout used by\n    :func:`render`.\n\n    Args:\n        cols: A sequence of column names.\n\n    Returns:\n        A single formatted header line.\n\n    Examples:\n        >>> header([\"name\", \"age\"])\n        'Name | Age'\n    \"\"\"\n    return COLUMN_SEPARATOR.join(compute_value(col) for col in cols)\n\n\ndef footer(n):\n    \"\"\"Return a one-line summary for a report containing ``n`` rows.\n\n    Args:\n        n: The number of rows in the report.\n\n    Returns:\n        A one-line human-readable summary string.\n\n    Examples:\n        >>> footer(3)\n        'Total rows: 3'\n    \"\"\"\n    return \"Total rows: {}\".format(n)\n";

// Hermetic reader: serves the chosen version of each truncated file from the rendered file
// (byte-identical modulo trailing newline, the S27/S28 pattern), the four inline blobs for the two
// `pkg/*` cruxes, and `""` (rejected) for every other key — so content-validation, not key existence,
// drives the version choice.
const s29Reader: BackupReader = (name) => {
    const blob = name.toString();
    if (blob === "75e112d1b7c35b86@v3") return readGroundTruth("main.py");
    if (blob === "d7f33f1259aa3a18@v3") return readGroundTruth("tests/test_pkg.py");
    if (blob === "e13888a28cfa9bd5@v2") return readGroundTruth("walk_rename.py");
    if (blob === "38dbed748662c3cb@v3") return S29_A_V3;
    if (blob === "38dbed748662c3cb@v4") return S29_A_V4;
    if (blob === "e5663c2564dcb2d1@v2") return S29_B_V2;
    if (blob === "e5663c2564dcb2d1@v3") return S29_B_V3;
    return "";
};
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";

// §2 — one `python3 walk_rename.py` run rewrites the package via an os.walk, forking nothing, so the
// engine yields one linear surviving set of all eight `.py` files and zero rewound branches. Locks the
// branch shape and the full file set (incl. the two skipped vendor controls).
test("test_S29_linear_eight_surviving_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S29_JSONL), s29Reader);
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 8);
    for (const suffix of [
        "/pkg/__init__.py",
        "/pkg/a.py",
        "/pkg/b.py",
        "/pkg/vendor/__init__.py",
        "/pkg/vendor/c.py",
        "/main.py",
        "/tests/test_pkg.py",
        "/walk_rename.py",
    ]) {
        assert.ok(
            branched.surviving.some((h) => h.target.toString().endsWith(suffix)),
            `missing ${suffix}`,
        );
    }
});

// THE HEADLINE LOCK: the `pkg/vendor/*` files were SKIPPED by the walk, so they get NO beacon and the
// engine keeps their original `write` revision. They are reader-INDEPENDENT (identical with no reader and
// with a poison reader), still read `helper`, never `compute_value`, and never carry fabricated content.
// Locks §2.3 (both vendor files) + §2.5.
test("test_S29_vendor_control_reader_independent_keeps_helper", () => {
    const cNo = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL)).surviving, "/pkg/vendor/c.py");
    const cPoison = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL), poison).surviving, "/pkg/vendor/c.py");
    assert.deepEqual(cNo.revisions.map((r) => r.kind), [EventKind.write]);
    assert.equal(historyFinalText(cNo), historyFinalText(cPoison)); // reader-independent
    assert.equal(historyFinalText(cNo).length, 2031);
    assert.ok(historyFinalText(cNo).includes("def helper("));
    assert.ok(!historyFinalText(cNo).includes("compute_value")); // the control was never renamed
    assert.ok(!historyFinalText(cNo).includes("POISONED"));

    const initNo = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL)).surviving, "/pkg/vendor/__init__.py");
    const initPoison = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL), poison).surviving, "/pkg/vendor/__init__.py");
    assert.deepEqual(initNo.revisions.map((r) => r.kind), [EventKind.write]);
    assert.equal(historyFinalText(initNo), historyFinalText(initPoison));
    assert.equal(historyFinalText(initNo).length, 289);
    assert.ok(historyFinalText(initNo).includes("helper"));
    assert.ok(!historyFinalText(initNo).includes("compute_value"));
});

// CRUX S27: the three TRUNCATED beacons (main.py 1–40 of 71, tests/test_pkg.py 1–34 of 51,
// walk_rename.py 1–9 of 51) are completed by `completeTruncatedBeacon` from each file's content-validated
// backup. Each ladder ends in a synthetic `overwrite` whose changeId is the chosen backup version, and
// the final text matches the rendered ground truth byte-for-byte. (Mutation: neutralize
// completeTruncatedBeacon → this test RED, §9.) Locks §2.3 (main/test_pkg/walk) + §2.4.
test("test_S29_three_truncated_beacons_completed_bytelock", () => {
    const surviving = reconstructBranches(loadRecords(S29_JSONL), s29Reader).surviving;

    const main = historyEndingWith(surviving, "/main.py");
    assert.deepEqual(main.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit, EventKind.edit, EventKind.userEdit, EventKind.overwrite,
    ]);
    assert.equal(main.revisions[main.revisions.length - 1]!.changeId.toString(), "75e112d1b7c35b86@v3");
    assert.equal(historyFinalText(main).length, 1788);
    assert.equal(historyFinalText(main), S29_MAIN_FINAL);
    assert.ok(!historyFinalText(main).split("\n").some((line) => line === "..."));

    const testPkg = historyEndingWith(surviving, "/tests/test_pkg.py");
    assert.deepEqual(testPkg.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit, EventKind.edit, EventKind.userEdit, EventKind.overwrite,
    ]);
    assert.equal(testPkg.revisions[testPkg.revisions.length - 1]!.changeId.toString(), "d7f33f1259aa3a18@v3");
    assert.equal(historyFinalText(testPkg).length, 1601);
    assert.equal(historyFinalText(testPkg), S29_TEST_PKG_FINAL);
    assert.ok(!historyFinalText(testPkg).split("\n").some((line) => line === "..."));

    const walk = historyEndingWith(surviving, "/walk_rename.py");
    assert.deepEqual(walk.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.userEdit, EventKind.overwrite,
    ]);
    assert.equal(walk.revisions[walk.revisions.length - 1]!.changeId.toString(), "e13888a28cfa9bd5@v2");
    assert.equal(historyFinalText(walk).length, 1530);
    assert.equal(historyFinalText(walk), S29_WALK_FINAL);
    assert.ok(!historyFinalText(walk).split("\n").some((line) => line === "..."));
    // The self-modifying walk renamed its own string literals: the final must say compute_value and have
    // no bare `helper` token left.
    assert.ok(historyFinalText(walk).includes("compute_value"));
    assert.ok(!/\bhelper\b/.test(historyFinalText(walk)));
});

// Reader-dependence guard for the S27 truncated files: WITHOUT a reader no backup is available, so each
// truncated beacon is adopted verbatim and every file DIVERGES from ground truth (1140 / 1127 / 290).
// Locks §2.5.
test("test_S29_truncated_files_without_reader_are_wrong", () => {
    const surviving = reconstructBranches(loadRecords(S29_JSONL)).surviving;
    const main = historyEndingWith(surviving, "/main.py");
    assert.equal(historyFinalText(main).length, 1140);
    assert.notEqual(historyFinalText(main), S29_MAIN_FINAL);
    const testPkg = historyEndingWith(surviving, "/tests/test_pkg.py");
    assert.equal(historyFinalText(testPkg).length, 1127);
    assert.notEqual(historyFinalText(testPkg), S29_TEST_PKG_FINAL);
    const walk = historyEndingWith(surviving, "/walk_rename.py");
    assert.equal(historyFinalText(walk).length, 290);
    assert.notEqual(historyFinalText(walk), S29_WALK_FINAL);
});

// CRUX S28 + version-selection: pkg/a.py's ELIDED beacon (lines 1–99 + `...` of 128) is completed by
// `completeElidedBeacons`. THE VERSION LOCK: the chosen overwrite base is `38dbed748662c3cb@v4`
// (post-rename, compute_value), NOT the SAME-128-line `@v3` (pre-rename, helper) that the reader also
// serves — content-validation, not recency, picks the version. (Mutation: neutralize
// completeElidedBeacons → this test RED, §9.) Locks §2.3 (a.py) + §2.4.
test("test_S29_elided_beacon_completed_version_selected_by_content", () => {
    const a = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL), s29Reader).surviving, "/pkg/a.py");
    assert.deepEqual(a.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.userEdit, EventKind.overwrite,
    ]);
    const overwrite = a.revisions[a.revisions.length - 1]!;
    assert.equal(overwrite.kind, EventKind.overwrite);
    assert.equal(overwrite.changeId.toString(), "38dbed748662c3cb@v4"); // chosen over the 128L @v3
    assert.equal(overwrite.lines.length, 128);
    const finalText = historyFinalText(a);
    assert.equal(finalText.length, 3460);
    assert.equal(finalText, stripTrailingNewline(S29_A_V4));
    assert.ok(finalText.includes("def preprocess(")); // the pre-rename Edit survives into the final
    assert.ok(finalText.includes("compute_value"));
    assert.ok(!/\bhelper\b/.test(finalText)); // the rename reached every occurrence
    assert.ok(!finalText.split("\n").some((line) => line === "..."));
});

// S28 never-fabricate guard for the elided path: WITHOUT a reader pkg/a.py keeps its 3-rev no-overwrite
// ladder, the windowed `...` survives, length 2881 (WRONG, never fabricated). With a poison reader no
// candidate validates, so still no overwrite and no "POISONED" leaks. (pkg/b.py is NOT asserted under
// poison — §2.5: its pre-existing seedStaleEditBases path leaks poison, prior-scenario behaviour.) §2.5.
test("test_S29_elided_without_reader_and_poison_never_fabricate", () => {
    const aNo = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL)).surviving, "/pkg/a.py");
    assert.deepEqual(aNo.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.userEdit,
    ]);
    assert.equal(historyFinalText(aNo).length, 2881);
    assert.ok(historyFinalText(aNo).split("\n").some((line) => line === "...")); // the window survives

    const aPoison = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL), poison).surviving, "/pkg/a.py");
    assert.ok(!aPoison.revisions.some((r) => r.kind === EventKind.overwrite));
    assert.equal(historyFinalText(aPoison).length, 2881);
    assert.ok(!historyFinalText(aPoison).includes("POISONED"));
});

// pkg/b.py integration: a TRUNCATED beacon (1–93 of 101) seeds the synthetic overwrite
// `e5663c2564dcb2d1@v3` (post-rename, 101L; chosen over the same-101-line `@v2`), and the POST-rename
// `pipeline` Edit replays on top. Proves a truncated beacon + a later Edit compose. §2.3 (b.py) + §2.4.
test("test_S29_truncated_then_pipeline_edit_b_py", () => {
    const b = historyEndingWith(reconstructBranches(loadRecords(S29_JSONL), s29Reader).surviving, "/pkg/b.py");
    assert.deepEqual(b.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.userEdit, EventKind.overwrite, EventKind.edit,
    ]);
    const overwrite = b.revisions[2]!;
    assert.equal(overwrite.kind, EventKind.overwrite);
    assert.equal(overwrite.changeId.toString(), "e5663c2564dcb2d1@v3"); // chosen over the 101L @v2
    assert.equal(overwrite.lines.length, 101);
    const finalText = historyFinalText(b);
    assert.equal(finalText.length, 3330);
    assert.ok(finalText.includes("def pipeline(")); // the post-rename Edit replayed onto the real base
    assert.ok(finalText.includes("compute_value"));
    assert.ok(!/\bhelper\b/.test(finalText));
});

// The rename surfaces ONLY as the six `edited_text_file` beacons (the `python3` Bash command is never
// parsed). Every synthetic `overwrite` the fix injects is a REVISION, not an extracted event — so the
// raw stream carries exactly six user-edit beacons, ZERO overwrites, eight writes, four edits. §2.6.
test("test_S29_extractFileEvents_six_userEdits_no_overwrite_events", () => {
    const events = extractFileEvents(loadRecords(S29_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 6);
    assert.deepEqual(
        userEdits.map((e) => e.changeId.toString().slice(0, 8)).sort(),
        ["1527f907", "1e9f8dd1", "4c52c762", "b27e66ab", "d16b6b3b", "e30c1bc6"],
    );
    assert.equal(events.filter((e) => e.kind === EventKind.overwrite).length, 0);
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 8);
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 4);
});
