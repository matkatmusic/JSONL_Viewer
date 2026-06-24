import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S24_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix`. S24 uses a leading-slash suffix
// (`/order_utils.py`) so it never also matches `/test_order_utils.py`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// Whole-word terse-name check: match the `def <name>(` headers, NOT bare substrings
// (`apply_disc` is a substring of `apply_discount`, so a bare-substring check would
// report a phantom match in renamed content).
const TERSE_DEFS = ["def calc_tot(", "def fmt_money(", "def chk_stock(", "def mk_order(", "def apply_disc("];
const RENAMED_DEFS = [
    "def calculate_total(", "def format_currency(", "def check_stock(",
    "def build_order(", "def apply_discount(",
];

// S24 introduces no branch or rewind: a tracked file is rewritten by an external `python3`
// script run through the Bash tool. The script run forks nothing, so the engine yields exactly
// one surviving branch over the three touched files and zero rewound branches. Locks §2.6.
test("test_S24_linear_one_surviving_branch_three_files_no_rewound", () => {
    // Reconstruct the real S24 transcript WITHOUT a reader (S24 is reader-independent).
    const branched = reconstructBranches(loadRecords(S24_JSONL));
    // No rewound branch — the scenario is linear.
    assert.equal(branched.rewound.length, 0);
    // Exactly three surviving files.
    assert.equal(branched.surviving.length, 3);
    // The three touched files are present.
    for (const suffix of ["/order_utils.py", "/test_order_utils.py", "/rename_funcs.py"]) {
        assert.ok(branched.surviving.some((h) => h.target.toString().endsWith(suffix)));
    }
});

// THE CRUX: the script-driven rename has no Edit/Write record, yet it surfaces as the rev3
// `userEdit` carrying the renamed content — recovered from the `edited_text_file` beacon whose
// changeId is the attachment's message UUID (859347d2…). The rename boundary is exactly at rev3:
// rev2 is still terse, rev3 is fully renamed. Locks §2.3.
test("test_S24_order_utils_six_revisions_with_script_rename_as_userEdit_rev3", () => {
    // Reconstruct WITHOUT a reader and take order_utils.py (leading-slash suffix).
    const branched = reconstructBranches(loadRecords(S24_JSONL));
    const h = historyEndingWith(branched.surviving, "/order_utils.py");
    // Exactly six revisions, kinds write, edit, edit, userEdit, edit, edit.
    assert.equal(h.revisions.length, 6);
    assert.deepEqual(h.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit,
        EventKind.userEdit, EventKind.edit, EventKind.edit,
    ]);
    // rev3 is the beacon user-edit: 187 lines, the attachment's message-UUID changeId, fully renamed.
    const rev3 = h.revisions[3]!;
    assert.equal(rev3.kind, EventKind.userEdit);
    assert.equal(rev3.changeId.toString(), "859347d2-3413-439f-ba38-3ab7ee61474c");
    assert.equal(rev3.lines.length, 187);
    const rev3Text = finalTextOf(rev3);
    for (const def of RENAMED_DEFS) assert.ok(rev3Text.includes(def), `rev3 missing ${def}`);
    for (const def of TERSE_DEFS) assert.ok(!rev3Text.includes(def), `rev3 still has ${def}`);
    // rev2 (the last pre-rename edit) is still terse — the rename boundary is exactly at rev3.
    const rev2Text = finalTextOf(h.revisions[2]!);
    for (const def of TERSE_DEFS) assert.ok(rev2Text.includes(def), `rev2 missing ${def}`);
});

// The two opaque `python3 rename_funcs.py` Bash runs are NOT parsed as file ops (the m3
// contrast) and contribute zero file events. The rename is recovered ONLY from the beacon
// attachment, so extraction shows exactly one user-edit (859347d2), four Claude edits (D,E,H,I),
// three writes (B,C,F), and no append events. Locks §1.2 / §2.2.
test("test_S24_extractFileEvents_one_userEdit_no_events_from_opaque_python_runs", () => {
    // Extract every file event from the S24 transcript.
    const events = extractFileEvents(loadRecords(S24_JSONL));
    // Exactly one user-edit (the beacon), with the attachment's message-UUID changeId.
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 1);
    assert.equal(userEdits[0]!.changeId.toString().slice(0, 8), "859347d2");
    // Four Claude edits (D, E, H, I) and three writes (B order_utils, C test, F rename_funcs).
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 4);
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 3);
    // The opaque python runs contribute no append/overwrite events.
    assert.equal(events.filter((e) => e.kind === EventKind.append).length, 0);
});

// READER-INDEPENDENCE (the regression guard): S24 is HAS-BEACON, so the renamed content comes
// from the in-JSONL attachment snippet, never from file-history backups. Reconstructing with a
// deliberately POISONED reader yields a byte-identical order_utils.py history — proving the
// engine never consults the reader for S24. Locks §2.5 / §1.2.
test("test_S24_order_utils_identical_with_and_without_reader", () => {
    // A reader that returns garbage if (and only if) the engine ever calls it.
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S24_JSONL)).surviving, "/order_utils.py");
    const withR = historyEndingWith(reconstructBranches(loadRecords(S24_JSONL), poison).surviving, "/order_utils.py");
    // Same six revisions either way.
    assert.equal(without.revisions.length, 6);
    assert.equal(withR.revisions.length, 6);
    // Byte-identical final text, and no poison content leaked in.
    assert.equal(historyFinalText(without), historyFinalText(withR));
    assert.ok(!historyFinalText(withR).includes("POISONED"));
});

const S24_FINAL = "\"\"\"Order and billing helper utilities.\n\nThis module provides a small collection of helpers for building and\nsummarizing simple orders. An \"item\" is a dict with at least the keys\n``name``, ``price``, and ``qty`` (and optionally ``stock``). An \"order\"\nis a dict produced by :func:`build_order` that bundles a list of items with\na computed total.\n\nThe module is deliberately dependency-free so it can be dropped into any\nproject. Two module-level constants control billing behavior:\n\n* ``TAX_RATE`` -- the flat tax rate applied by :func:`tax`.\n* ``CURRENCY`` -- the ISO currency code reported in order summaries.\n\"\"\"\n\nTAX_RATE = 0.08\nCURRENCY = \"USD\"\n\n\ndef validate_items(items):\n    \"\"\"Validate that every item has the required billing keys.\n\n    Args:\n        items: An iterable of item dicts.\n\n    Returns:\n        ``True`` if all items contain both ``price`` and ``qty`` keys.\n\n    Raises:\n        ValueError: If any item is missing a ``price`` or ``qty`` key.\n    \"\"\"\n    for item in items:\n        if \"price\" not in item or \"qty\" not in item:\n            raise ValueError(\"item missing required 'price' or 'qty' key\")\n    return True\n\n\ndef calculate_total(items):\n    \"\"\"Sum ``price * qty`` across every item in ``items``.\n\n    Args:\n        items: An iterable of item dicts, each with ``price`` and ``qty``.\n\n    Returns:\n        The combined total as a float.\n    \"\"\"\n    total = 0.0\n    for item in items:\n        total += item[\"price\"] * item[\"qty\"]\n    return total\n\n\ndef format_currency(n):\n    \"\"\"Format a number as a ``$0.00``-style currency string.\n\n    Args:\n        n: A numeric amount.\n\n    Returns:\n        A string such as ``\"$12.50\"`` rounded to two decimal places.\n    \"\"\"\n    return \"${:.2f}\".format(n)\n\n\ndef check_stock(item, qty):\n    \"\"\"Report whether ``qty`` units of ``item`` are in stock.\n\n    Args:\n        item: An item dict containing a ``stock`` key.\n        qty: The desired quantity.\n\n    Returns:\n        ``True`` if ``qty`` is less than or equal to available stock.\n    \"\"\"\n    return qty <= item[\"stock\"]\n\n\ndef build_order(items):\n    \"\"\"Build an order dict from a list of items.\n\n    Args:\n        items: A list of item dicts.\n\n    Returns:\n        A dict with ``items``, ``count``, ``currency``, and ``total`` keys.\n    \"\"\"\n    return {\n        \"items\": list(items),\n        \"count\": len(items),\n        \"currency\": CURRENCY,\n        \"total\": calculate_total(items),\n    }\n\n\ndef apply_discount(total, pct):\n    \"\"\"Return ``total`` after applying a percentage discount.\n\n    Args:\n        total: The pre-discount amount.\n        pct: The discount percentage (e.g. ``10`` for 10% off).\n\n    Returns:\n        The discounted total as a float.\n    \"\"\"\n    return total * (1 - pct / 100.0)\n\n\ndef apply_loyalty(total, member):\n    \"\"\"Apply a loyalty discount and return the formatted result.\n\n    Members receive an extra 5% discount via :func:`apply_discount`;\n    non-members pay the full amount. The result is formatted with\n    :func:`format_currency`.\n\n    Args:\n        total: The pre-discount amount.\n        member: Truthy if the customer is a loyalty member.\n\n    Returns:\n        The (possibly discounted) total as a ``$0.00``-style string.\n    \"\"\"\n    discounted = apply_discount(total, 5) if member else total\n    return format_currency(discounted)\n\n\ndef tax(total):\n    \"\"\"Return the tax owed on ``total`` using :data:`TAX_RATE`.\n\n    Args:\n        total: The taxable amount.\n\n    Returns:\n        The tax amount as a float.\n    \"\"\"\n    return total * TAX_RATE\n\n\ndef parse_line(line):\n    \"\"\"Parse a ``\"name,price,qty\"`` line into an item dict.\n\n    Args:\n        line: A comma-separated string with three fields.\n\n    Returns:\n        An item dict with ``name`` (str), ``price`` (float), and\n        ``qty`` (int) keys.\n    \"\"\"\n    name, price, qty = line.split(\",\")\n    return {\n        \"name\": name.strip(),\n        \"price\": float(price),\n        \"qty\": int(qty),\n    }\n\n\ndef order_line(item):\n    \"\"\"Return a one-line string describing a single item.\n\n    The line shows the name, quantity, line total, and an in-stock\n    indicator, built using :func:`format_currency` and :func:`check_stock`.\n\n    Args:\n        item: An item dict with ``name``, ``price``, ``qty``, and\n            ``stock`` keys.\n\n    Returns:\n        A formatted one-line string for the item.\n    \"\"\"\n    line_total = item[\"price\"] * item[\"qty\"]\n    in_stock = \"in stock\" if check_stock(item, item[\"qty\"]) else \"out of stock\"\n    return \"{} x{} = {} ({})\".format(\n        item[\"name\"], item[\"qty\"], format_currency(line_total), in_stock\n    )\n\n\ndef summarize(order):\n    \"\"\"Build a multi-line text summary of an order.\n\n    The summary lists each line item, the subtotal, the tax, and the\n    grand total (subtotal plus tax), using :func:`calculate_total`,\n    :func:`format_currency`, and :func:`tax`.\n\n    Args:\n        order: An order dict as produced by :func:`build_order`.\n\n    Returns:\n        A multi-line string suitable for printing.\n    \"\"\"\n    items = order[\"items\"]\n    subtotal = calculate_total(items)\n    tax_amount = tax(subtotal)\n    grand_total = subtotal + tax_amount\n\n    lines = [\"Order summary ({}):\".format(order.get(\"currency\", CURRENCY))]\n    for item in items:\n        line_total = item[\"price\"] * item[\"qty\"]\n        lines.append(\n            \"  {} x{} = {}\".format(\n                item[\"name\"], item[\"qty\"], format_currency(line_total)\n            )\n        )\n    lines.append(\"Subtotal: {}\".format(format_currency(subtotal)))\n    lines.append(\"Tax: {}\".format(format_currency(tax_amount)))\n    lines.append(\"Total: {}\".format(format_currency(grand_total)))\n    return \"\\n\".join(lines)\n\n\ndef print_receipt(order):\n    \"\"\"Build and return a receipt string for an order.\n\n    The receipt lists each line item with its quantity and line total,\n    followed by the order total, using :func:`calculate_total` and\n    :func:`format_currency`.\n\n    Args:\n        order: An order dict as produced by :func:`build_order`.\n\n    Returns:\n        A multi-line receipt string suitable for printing.\n    \"\"\"\n    items = order[\"items\"]\n    total = calculate_total(items)\n\n    lines = [\"RECEIPT\", \"-------\"]\n    for item in items:\n        line_total = item[\"price\"] * item[\"qty\"]\n        lines.append(\n            \"{} x{}  {}\".format(\n                item[\"name\"], item[\"qty\"], format_currency(line_total)\n            )\n        )\n    lines.append(\"-------\")\n    lines.append(\"TOTAL  {}\".format(format_currency(total)))\n    return \"\\n\".join(lines)";

// FINAL byte-lock: the post-rename Edits H and I splice cleanly onto the renamed beacon base, so
// the file reconstructs byte-identically to the 234-line / 6478-char ground truth. The S19/S23
// stale-edit-base reseed stays INERT — a fired reseed would add a 7th revision and/or corrupt the
// text. Locks §2.4.
test("test_S24_order_utils_final_is_ground_truth_234_lines_no_reseed", () => {
    // Reconstruct WITHOUT a reader and take order_utils.py.
    const h = historyEndingWith(reconstructBranches(loadRecords(S24_JSONL)).surviving, "/order_utils.py");
    // Six revisions — a fired reseed would make this seven.
    assert.equal(h.revisions.length, 6);
    // The final text is byte-identical to the ground truth: 234 lines, 6478 chars.
    const finalText = historyFinalText(h);
    assert.equal(finalText.split("\n").length, 234);
    assert.equal(finalText.length, 6478);
    assert.equal(finalText, S24_FINAL);
    // The renamed headers are present and the terse ones are gone.
    for (const def of RENAMED_DEFS) assert.ok(finalText.includes(def));
    for (const def of TERSE_DEFS) assert.ok(!finalText.includes(def));
    // The post-rename additions H and I are present.
    assert.ok(finalText.includes("def print_receipt(order):"));
    assert.ok(finalText.includes("def apply_loyalty(total, member):"));
});
