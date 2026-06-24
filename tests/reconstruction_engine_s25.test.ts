import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S25_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. S25 uses a leading-slash suffix
// (`/geo_core.py`) so it never also matches a sibling such as `/test_geo_core.py`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// Whole-word checks: match the `def <name>(` headers, never bare substrings
// (`area` is a substring of `rectangle_area`, so a bare-substring check would phantom-match).
// Only area/perim/vol are renamed; diag/scale are NOT — do not assert their absence.
const TERSE_DEFS = ["def area(", "def perim(", "def vol("];
const RENAMED_DEFS = ["def rectangle_area(", "def rectangle_perimeter(", "def box_volume("];

// geo_report.py is reader-DEPENDENT: its beacon is an incomplete 77-line snapshot, while the
// post-script `totals` Edit's base is the true 95-line disk state, recovered from file-history
// backup a5675d5dd5201ac8@v4 (the m6 backup-seed). Hermetic backup map (mirrors m7), so the
// engine test never touches the real ~/.claude/file-history tree.
const S25_GEO_REPORT_BACKUP = "\"\"\"geo_report — build human-readable reports from geometry data.\n\nThis module sits on top of :mod:`geo_core` and turns a collection of shape\ndescriptions into a formatted text report. Each shape is summarized with its\nrectangle_area, perimeter, and volume.\n\nA \"shape\" is expected to be a mapping (dict) with the following keys:\n    name -- a label for the shape (optional, defaults to \"shape\")\n    w    -- width\n    h    -- height\n    d    -- depth (optional, defaults to 1 so volume still computes)\n\nExample:\n    >>> from geo_report import build_report\n    >>> shapes = [{\"name\": \"tile\", \"w\": 3, \"h\": 4, \"d\": 2}]\n    >>> print(build_report(shapes))  # doctest: +ELLIPSIS\n    Geometry Report\n    ...\n\"\"\"\n\nimport geo_core\n\n__all__ = [\"build_report\", \"summary_line\"]\n\n\ndef summary_line(shape):\n    \"\"\"Return a one-line summary string for a single shape.\n\n    The line reports the shape's rectangle_area and volume by calling\n    :func:`geo_core.rectangle_area` and :func:`geo_core.box_volume`.\n\n    Args:\n        shape: A mapping with ``w`` and ``h`` keys and an optional ``name`` and\n            ``d`` (depth, defaulting to 1).\n\n    Returns:\n        A one-line string such as ``\"tile: rectangle_area=12, volume=24\"``.\n    \"\"\"\n    name = shape.get(\"name\", \"shape\")\n    w = shape[\"w\"]\n    h = shape[\"h\"]\n    d = shape.get(\"d\", 1)\n    a = geo_core.rectangle_area(w, h)\n    v = geo_core.box_volume(w, h, d)\n    return f\"{name}: rectangle_area={a}, volume={v}\"\n\n\ndef build_report(shapes):\n    \"\"\"Build a text report summarizing a list of shapes.\n\n    For every shape this calls :func:`geo_core.rectangle_area`, :func:`geo_core.rectangle_perimeter`,\n    and :func:`geo_core.box_volume` and renders the results as aligned lines of text.\n\n    Args:\n        shapes: An iterable of mappings, each with ``w`` and ``h`` keys and an\n            optional ``name`` and ``d`` (depth, defaulting to 1).\n\n    Returns:\n        A multi-line string containing the report. If ``shapes`` is empty the\n        report still has a header and a note that there is nothing to show.\n    \"\"\"\n    lines = [\"Geometry Report\", \"=\" * 15, \"\"]\n\n    shapes = list(shapes)\n    if not shapes:\n        lines.append(\"(no shapes provided)\")\n        return \"\\n\".join(lines)\n\n    for shape in shapes:\n        name = shape.get(\"name\", \"shape\")\n        w = shape[\"w\"]\n        h = shape[\"h\"]\n        d = shape.get(\"d\", 1)\n\n        a = geo_core.rectangle_area(w, h)\n        p = geo_core.rectangle_perimeter(w, h)\n        v = geo_core.box_volume(w, h, d)\n\n        lines.append(f\"{name}:\")\n        lines.append(f\"    dimensions : {w} x {h} x {d}\")\n        lines.append(f\"    rectangle_area       : {a}\")\n        lines.append(f\"    perimeter  : {p}\")\n        lines.append(f\"    volume     : {v}\")\n        lines.append(\"\")\n\n    lines.append(f\"Total shapes: {len(shapes)}\")\n    return \"\\n\".join(lines)\n\n\nif __name__ == \"__main__\":\n    sample = [\n        {\"name\": \"tile\", \"w\": 3, \"h\": 4, \"d\": 2},\n        {\"name\": \"panel\", \"w\": 10, \"h\": 2},\n    ]\n    print(build_report(sample))\n";
const s25Reader: BackupReader = (name) =>
    name.toString() === "a5675d5dd5201ac8@v4" ? S25_GEO_REPORT_BACKUP : "";

// Final ground-truth literals (trailing newline stripped to match the engine's newline-joined
// revision text). Injected byte-for-byte from scenarios/executed/s25-script-rename-multi-file/.
const S25_GEO_CORE_FINAL = "\"\"\"geo_core — a small, dependency-free geometry module.\n\nThis module collects a handful of terse helper functions for working with\nsimple rectangular and box-shaped geometry. Every function operates on plain\nnumbers (ints or floats) and returns plain numbers (or tuples of numbers), so\nthe module has no external dependencies and is trivial to test.\n\nConventions used throughout:\n    w  -- width  of a shape\n    h  -- height of a shape\n    d  -- depth  of a shape (third dimension, used by volume)\n    k  -- a scalar multiplier used when scaling\n\nThe names are intentionally short (\"rectangle_area\", \"rectangle_perimeter\", \"box_volume\", \"diag\", \"scale\")\nbecause they read well at call sites, e.g. ``geo_core.rectangle_area(3, 4)``. Each\nfunction is documented individually below.\n\nExample:\n    >>> import geo_core\n    >>> geo_core.rectangle_area(3, 4)\n    12\n    >>> geo_core.rectangle_perimeter(3, 4)\n    14\n    >>> geo_core.box_volume(2, 3, 4)\n    24\n    >>> geo_core.diag(3, 4)\n    5.0\n    >>> geo_core.scale(3, 4, 2)\n    (6, 8)\n\"\"\"\n\nfrom math import sqrt\n\n__all__ = [\"rectangle_area\", \"rectangle_perimeter\", \"box_volume\", \"diag\", \"scale\", \"midpoint\", \"bounding_box\"]\n\n\ndef rectangle_area(w, h):\n    \"\"\"Return the rectangle_area of a rectangle.\n\n    The rectangle_area of a rectangle is simply its width multiplied by its height.\n\n    Args:\n        w: The width of the rectangle.\n        h: The height of the rectangle.\n\n    Returns:\n        The product ``w * h``.\n\n    Example:\n        >>> rectangle_area(3, 4)\n        12\n    \"\"\"\n    return w * h\n\n\ndef rectangle_perimeter(w, h):\n    \"\"\"Return the perimeter of a rectangle.\n\n    The perimeter is the total distance around the rectangle, which is twice\n    the sum of the width and the height.\n\n    Args:\n        w: The width of the rectangle.\n        h: The height of the rectangle.\n\n    Returns:\n        The value ``2 * (w + h)``.\n\n    Example:\n        >>> rectangle_perimeter(3, 4)\n        14\n    \"\"\"\n    return 2 * (w + h)\n\n\ndef box_volume(w, h, d):\n    \"\"\"Return the volume of a rectangular box (cuboid).\n\n    The volume is the product of the three edge lengths: width, height, and\n    depth.\n\n    Args:\n        w: The width of the box.\n        h: The height of the box.\n        d: The depth of the box.\n\n    Returns:\n        The product ``w * h * d``.\n\n    Example:\n        >>> box_volume(2, 3, 4)\n        24\n    \"\"\"\n    return w * h * d\n\n\ndef diag(w, h):\n    \"\"\"Return the diagonal length of a rectangle.\n\n    The diagonal of a rectangle forms the hypotenuse of a right triangle whose\n    legs are the width and the height, so its length follows the Pythagorean\n    theorem: ``sqrt(w**2 + h**2)``.\n\n    Args:\n        w: The width of the rectangle.\n        h: The height of the rectangle.\n\n    Returns:\n        The diagonal length as a float.\n\n    Example:\n        >>> diag(3, 4)\n        5.0\n    \"\"\"\n    return sqrt(w * w + h * h)\n\n\ndef scale(w, h, k):\n    \"\"\"Return a rectangle's dimensions scaled by a factor.\n\n    Both the width and the height are multiplied by the same scalar ``k``. The\n    aspect ratio of the rectangle is therefore preserved.\n\n    Args:\n        w: The width of the rectangle.\n        h: The height of the rectangle.\n        k: The scalar multiplier to apply to both dimensions.\n\n    Returns:\n        A ``(scaled_width, scaled_height)`` tuple equal to ``(w * k, h * k)``.\n\n    Example:\n        >>> scale(3, 4, 2)\n        (6, 8)\n    \"\"\"\n    return (w * k, h * k)\n\n\ndef midpoint(x1, y1, x2, y2):\n    \"\"\"Return the midpoint between two points.\n\n    The midpoint of the segment joining ``(x1, y1)`` and ``(x2, y2)`` is the\n    component-wise average of the two endpoints.\n\n    Args:\n        x1: The x coordinate of the first point.\n        y1: The y coordinate of the first point.\n        x2: The x coordinate of the second point.\n        y2: The y coordinate of the second point.\n\n    Returns:\n        A ``(mid_x, mid_y)`` tuple equal to\n        ``((x1 + x2) / 2, (y1 + y2) / 2)``.\n\n    Example:\n        >>> midpoint(0, 0, 4, 6)\n        (2.0, 3.0)\n    \"\"\"\n    return ((x1 + x2) / 2, (y1 + y2) / 2)\n\n\ndef bounding_box(points):\n    \"\"\"Return the axis-aligned bounding box of a set of points.\n\n    The bounding box is the smallest axis-aligned rectangle that contains every\n    point, described by its minimum and maximum coordinates.\n\n    Args:\n        points: A non-empty iterable of ``(x, y)`` coordinate pairs.\n\n    Returns:\n        A ``(min_x, min_y, max_x, max_y)`` tuple.\n\n    Raises:\n        ValueError: If ``points`` is empty.\n\n    Example:\n        >>> bounding_box([(1, 2), (4, 0), (3, 5)])\n        (1, 0, 4, 5)\n    \"\"\"\n    points = list(points)\n    if not points:\n        raise ValueError(\"bounding_box requires at least one point\")\n    xs = [x for x, _ in points]\n    ys = [y for _, y in points]\n    return (min(xs), min(ys), max(xs), max(ys))\n\n\nif __name__ == \"__main__\":\n    # A tiny self-check that runs when the module is executed directly.\n    # It is not a substitute for the unit tests under tests/.\n    print(\"rectangle_area(3, 4)   =\", rectangle_area(3, 4))\n    print(\"rectangle_perimeter(3, 4)  =\", rectangle_perimeter(3, 4))\n    print(\"box_volume(2, 3, 4) =\", box_volume(2, 3, 4))\n    print(\"diag(3, 4)   =\", diag(3, 4))\n    print(\"scale(3,4,2) =\", scale(3, 4, 2))";
const S25_GEO_REPORT_FINAL = "\"\"\"geo_report — build human-readable reports from geometry data.\n\nThis module sits on top of :mod:`geo_core` and turns a collection of shape\ndescriptions into a formatted text report. Each shape is summarized with its\nrectangle_area, perimeter, and volume.\n\nA \"shape\" is expected to be a mapping (dict) with the following keys:\n    name -- a label for the shape (optional, defaults to \"shape\")\n    w    -- width\n    h    -- height\n    d    -- depth (optional, defaults to 1 so volume still computes)\n\nExample:\n    >>> from geo_report import build_report\n    >>> shapes = [{\"name\": \"tile\", \"w\": 3, \"h\": 4, \"d\": 2}]\n    >>> print(build_report(shapes))  # doctest: +ELLIPSIS\n    Geometry Report\n    ...\n\"\"\"\n\nimport geo_core\n\n__all__ = [\"build_report\", \"summary_line\", \"totals\"]\n\n\ndef totals(shapes):\n    \"\"\"Sum the area and volume across a collection of shapes.\n\n    Iterates over the shapes, calling :func:`geo_core.rectangle_area` and\n    :func:`geo_core.box_volume` for each, and accumulates the results.\n\n    Args:\n        shapes: An iterable of mappings, each with ``w`` and ``h`` keys and an\n            optional ``d`` (depth, defaulting to 1).\n\n    Returns:\n        A ``(total_area, total_volume)`` tuple. For an empty iterable this is\n        ``(0, 0)``.\n    \"\"\"\n    total_area = 0\n    total_volume = 0\n    for shape in shapes:\n        w = shape[\"w\"]\n        h = shape[\"h\"]\n        d = shape.get(\"d\", 1)\n        total_area += geo_core.rectangle_area(w, h)\n        total_volume += geo_core.box_volume(w, h, d)\n    return (total_area, total_volume)\n\n\ndef summary_line(shape):\n    \"\"\"Return a one-line summary string for a single shape.\n\n    The line reports the shape's rectangle_area and volume by calling\n    :func:`geo_core.rectangle_area` and :func:`geo_core.box_volume`.\n\n    Args:\n        shape: A mapping with ``w`` and ``h`` keys and an optional ``name`` and\n            ``d`` (depth, defaulting to 1).\n\n    Returns:\n        A one-line string such as ``\"tile: rectangle_area=12, volume=24\"``.\n    \"\"\"\n    name = shape.get(\"name\", \"shape\")\n    w = shape[\"w\"]\n    h = shape[\"h\"]\n    d = shape.get(\"d\", 1)\n    a = geo_core.rectangle_area(w, h)\n    v = geo_core.box_volume(w, h, d)\n    return f\"{name}: rectangle_area={a}, volume={v}\"\n\n\ndef build_report(shapes):\n    \"\"\"Build a text report summarizing a list of shapes.\n\n    For every shape this calls :func:`geo_core.rectangle_area`, :func:`geo_core.rectangle_perimeter`,\n    and :func:`geo_core.box_volume` and renders the results as aligned lines of text.\n\n    Args:\n        shapes: An iterable of mappings, each with ``w`` and ``h`` keys and an\n            optional ``name`` and ``d`` (depth, defaulting to 1).\n\n    Returns:\n        A multi-line string containing the report. If ``shapes`` is empty the\n        report still has a header and a note that there is nothing to show.\n    \"\"\"\n    lines = [\"Geometry Report\", \"=\" * 15, \"\"]\n\n    shapes = list(shapes)\n    if not shapes:\n        lines.append(\"(no shapes provided)\")\n        return \"\\n\".join(lines)\n\n    for shape in shapes:\n        name = shape.get(\"name\", \"shape\")\n        w = shape[\"w\"]\n        h = shape[\"h\"]\n        d = shape.get(\"d\", 1)\n\n        a = geo_core.rectangle_area(w, h)\n        p = geo_core.rectangle_perimeter(w, h)\n        v = geo_core.box_volume(w, h, d)\n\n        lines.append(f\"{name}:\")\n        lines.append(f\"    dimensions : {w} x {h} x {d}\")\n        lines.append(f\"    rectangle_area       : {a}\")\n        lines.append(f\"    perimeter  : {p}\")\n        lines.append(f\"    volume     : {v}\")\n        lines.append(\"\")\n\n    lines.append(f\"Total shapes: {len(shapes)}\")\n    return \"\\n\".join(lines)\n\n\nif __name__ == \"__main__\":\n    sample = [\n        {\"name\": \"tile\", \"w\": 3, \"h\": 4, \"d\": 2},\n        {\"name\": \"panel\", \"w\": 10, \"h\": 2},\n    ]\n    print(build_report(sample))";
const S25_TEST_FINAL = "\"\"\"Unit tests for geo_core.rectangle_area and geo_core.rectangle_perimeter.\"\"\"\n\nimport os\nimport sys\nimport unittest\n\n# Make the project root importable when tests are run from any directory.\nsys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))\n\nimport geo_core\n\n\nclass TestArea(unittest.TestCase):\n    def test_basic(self):\n        self.assertEqual(geo_core.rectangle_area(3, 4), 12)\n\n    def test_square(self):\n        self.assertEqual(geo_core.rectangle_area(5, 5), 25)\n\n    def test_zero(self):\n        self.assertEqual(geo_core.rectangle_area(0, 7), 0)\n\n    def test_float(self):\n        self.assertAlmostEqual(geo_core.rectangle_area(2.5, 4), 10.0)\n\n\nclass TestPerim(unittest.TestCase):\n    def test_basic(self):\n        self.assertEqual(geo_core.rectangle_perimeter(3, 4), 14)\n\n    def test_square(self):\n        self.assertEqual(geo_core.rectangle_perimeter(5, 5), 20)\n\n    def test_zero(self):\n        self.assertEqual(geo_core.rectangle_perimeter(0, 7), 14)\n\n    def test_float(self):\n        self.assertAlmostEqual(geo_core.rectangle_perimeter(2.5, 4), 13.0)\n\n\nif __name__ == \"__main__\":\n    unittest.main()";

// One `python3 rename_geo.py` Bash run rewrites THREE tracked files at once; the run forks
// nothing, so the engine yields one surviving branch over the four touched files (the three
// renamed files plus the driver script) and zero rewound branches. Locks §2.6.
test("test_S25_linear_one_surviving_branch_four_files_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S25_JSONL), s25Reader);
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 4);
    for (const suffix of ["/geo_core.py", "/geo_report.py", "/test_geo_core.py", "/rename_geo.py"]) {
        assert.ok(branched.surviving.some((h) => h.target.toString().endsWith(suffix)), `missing ${suffix}`);
    }
});

// geo_core.py: the script rename surfaces as the rev4 `userEdit` (changeId 755a78dd…, the
// beacon attachment's message UUID), fully renamed. The beacon is a complete 169-line snapshot,
// so the later Edits M and N splice cleanly onto it and the file reconstructs byte-identically
// with no reader and with a poisoned reader. Locks §2.3 (geo_core) + §2.5.
test("test_S25_geo_core_eight_revs_userEdit_rev4_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL)).surviving, "/geo_core.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL), poison).surviving, "/geo_core.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit, EventKind.edit,
        EventKind.userEdit, EventKind.edit, EventKind.edit, EventKind.edit,
    ]);
    const rev4 = without.revisions[4]!;
    assert.equal(rev4.kind, EventKind.userEdit);
    assert.equal(rev4.changeId.toString(), "755a78dd-6b12-48db-969e-d41c2a97bd3a");
    const rev4Text = finalTextOf(rev4);
    for (const def of RENAMED_DEFS) assert.ok(rev4Text.includes(def), `rev4 missing ${def}`);
    for (const def of TERSE_DEFS) assert.ok(!rev4Text.includes(def), `rev4 still has ${def}`);
    // reader-independence + byte-lock
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    assert.ok(!historyFinalText(withPoison).includes("POISONED"));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 196);
    assert.equal(finalText.length, 5263);
    assert.equal(finalText, S25_GEO_CORE_FINAL);
    assert.ok(finalText.includes("def bounding_box(")); // N replayed on renamed base
});

// tests/test_geo_core.py: the purest single-beacon file (write → beacon, no later edits). The
// rename surfaces as the rev1 `userEdit` (changeId fcaacf80…); the complete 42-line beacon makes
// it reader-INDEPENDENT and byte-locked. Locks §2.3 (test) + §2.5.
test("test_S25_test_geo_core_two_revs_userEdit_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL)).surviving, "/test_geo_core.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL), poison).surviving, "/test_geo_core.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    assert.equal(without.revisions[1]!.changeId.toString(), "fcaacf80-7df6-4625-820b-25520527a7a3");
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 42);
    assert.equal(finalText.length, 1145);
    assert.equal(finalText, S25_TEST_FINAL);
    assert.ok(finalText.includes("rectangle_area") && !/\bdef area\(/.test(finalText));
});

// THE CRUX: geo_report.py is reader-DEPENDENT. Its beacon (rev3) is an incomplete 77-line
// snapshot, but the post-script `totals` Edit (step 5) was computed against the true 95-line disk
// state. So the m6 backup-seed fires: a synthetic `overwrite` revision keyed a5675d5dd5201ac8@v4
// (the 95-line disk base) is injected at rev4, then the `totals` Edit replays cleanly onto it →
// the 120-line final. This is S25's reason for existing. Locks §2.3 (geo_report) + §2.4.
test("test_S25_geo_report_seven_revs_backup_seed_overwrite_then_totals", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL), s25Reader).surviving, "/geo_report.py");
    assert.deepEqual(h.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit,
        EventKind.userEdit, EventKind.overwrite, EventKind.edit, EventKind.edit,
    ]);
    const rev3 = h.revisions[3]!; // incomplete beacon
    assert.equal(rev3.kind, EventKind.userEdit);
    assert.equal(rev3.changeId.toString(), "dd04eabc-2a17-4bc9-bad9-f24de83736bd");
    assert.equal(rev3.lines.length, 77);
    const rev4 = h.revisions[4]!; // m6 backup-seed
    assert.equal(rev4.kind, EventKind.overwrite);
    assert.equal(rev4.changeId.toString(), "a5675d5dd5201ac8@v4");
    assert.equal(rev4.lines.length, 95);
    const finalText = historyFinalText(h);
    assert.equal(finalText.split("\n").length, 120);
    assert.equal(finalText.length, 3810);
    assert.equal(finalText, S25_GEO_REPORT_FINAL);
    assert.ok(finalText.includes("def totals("));        // step-5 Edit replayed on the reseeded base
    // geo_report CALLS the renamed geo_core functions (it does not DEFINE them, so the
    // `def <name>(` headers live in geo_core.py, not here). A bare-word terse check is unsafe:
    // the post-rename `totals` docstring contains the English word "area". So lock the rename via
    // the call sites — renamed call forms present, terse call forms gone.
    for (const call of [".rectangle_area(", ".rectangle_perimeter(", ".box_volume("]) {
        assert.ok(finalText.includes(call), `geo_report missing renamed call ${call}`);
    }
    for (const call of [".area(", ".perim(", ".vol("]) {
        assert.ok(!finalText.includes(call), `geo_report still calls terse ${call}`);
    }
});

// geo_report.py's reader-dependence is load-bearing: WITHOUT a backup the reseed cannot fire, so
// the history has 6 revisions (no `overwrite`) and the final diverges from ground truth. This
// proves the @v4 backup is essential — the contrast with S24, where the file was reader-
// independent. Locks §2.5.
test("test_S25_geo_report_without_reader_is_wrong_no_overwrite_six_revs", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL)).surviving, "/geo_report.py");
    assert.equal(h.revisions.length, 6);
    assert.ok(!h.revisions.some((r) => r.kind === EventKind.overwrite));
    assert.notEqual(historyFinalText(h), S25_GEO_REPORT_FINAL); // truncated without the backup
});

// The rename is recovered ONLY from the three `edited_text_file` beacons (one per file), not from
// parsing the opaque `python3` Bash command (the m3 contrast). The synthetic `overwrite` reseed is
// a REVISION, not an extracted event, so it does not appear here. Locks §2.2.
test("test_S25_extractFileEvents_three_userEdits_four_writes_six_edits", () => {
    const events = extractFileEvents(loadRecords(S25_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((e) => e.changeId.toString().slice(0, 8)).sort(),
        ["755a78dd", "dd04eabc", "fcaacf80"],
    );
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 4);   // B,C,D,H
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 6);    // E,F,G,L,M,N
    assert.equal(events.filter((e) => e.kind === EventKind.overwrite).length, 0); // reseed is synthetic
    assert.equal(events.filter((e) => e.kind === EventKind.append).length, 0);
});
