import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S26_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`. Leading-slash suffixes (`/billing.py`)
// never also match a sibling (`/test_billing.py`).
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// Whole-word checks: match `def <name>(` headers, never bare substrings.
// `apply_disc` is a substring of `apply_discount`, so a bare check would phantom-match — the trailing
// `(` is load-bearing. Only calc_tot/fmt_money/chk_stock/apply_disc are renamed; mk_order/validate/
// print_invoice are NOT — do not assert their absence.
const TERSE_DEFS = ["def calc_tot(", "def fmt_money(", "def chk_stock(", "def apply_disc("];
const RENAMED_DEFS = ["def calculate_total(", "def format_currency(", "def check_stock(", "def apply_discount("];

// Final ground-truth literals (captured byte-for-byte from
// scenarios/executed/s26-script-rename-csv-map/; trailing newline stripped to match the engine's
// newline-joined revision text). NO backup literal — S26 is fully reader-independent.
const S26_BILLING_FINAL = "\"\"\"Small billing module.\n\nProvides a handful of helpers for building and pricing simple orders:\n\n- ``calculate_total``   -- total an iterable of line items (price * qty each).\n- ``format_currency``  -- render a number as a ``\"$0.00\"`` string.\n- ``check_stock``  -- check whether a requested quantity is in stock.\n- ``apply_discount`` -- apply a percentage discount to a total.\n- ``mk_order``   -- assemble an order dict from line items.\n\nLine items are plain dicts. The fields used here are:\n\n    {\n        \"name\":  str,    # human-readable label (optional for pricing)\n        \"price\": number, # unit price\n        \"qty\":   int,    # quantity ordered\n        \"stock\": int,    # quantity available (used by check_stock)\n    }\n\nNothing here touches a database or a payment gateway; the functions are\npure and side-effect free so they are easy to test in isolation.\n\"\"\"\n\nfrom __future__ import annotations\n\nfrom typing import Any, Dict, Iterable, List, Mapping\n\n\n# Default rounding precision for money values, in decimal places.\n_MONEY_PRECISION = 2\n\n\ndef validate(items: Iterable[Mapping[str, Any]]) -> bool:\n    \"\"\"Ensure every line item carries a ``\"price\"`` key.\n\n    Args:\n        items: An iterable of line-item mappings to check.\n\n    Returns:\n        ``True`` when every item has a ``\"price\"`` key.\n\n    Raises:\n        ValueError: If any item is missing the ``\"price\"`` key.\n    \"\"\"\n    for index, item in enumerate(items):\n        if \"price\" not in item:\n            raise ValueError(f\"item at index {index} is missing a 'price' key\")\n    return True\n\n\ndef calculate_total(items: Iterable[Mapping[str, Any]]) -> float:\n    \"\"\"Sum ``price * qty`` across every line item.\n\n    Args:\n        items: An iterable of mappings, each carrying a ``\"price\"`` and a\n            ``\"qty\"`` key. Missing keys default to ``0`` so a partially\n            built item contributes nothing rather than raising.\n\n    Returns:\n        The combined total as a float. An empty iterable totals ``0.0``.\n    \"\"\"\n    total = 0.0\n    for item in items:\n        price = item.get(\"price\", 0)\n        qty = item.get(\"qty\", 0)\n        total += price * qty\n    return total\n\n\ndef format_currency(n: float) -> str:\n    \"\"\"Format a number as a ``\"$0.00\"`` style string.\n\n    The value is rounded to two decimal places and always shows both of\n    them. Negative amounts keep the sign in front of the dollar sign,\n    e.g. ``-1.5`` becomes ``\"$-1.50\"``.\n\n    Args:\n        n: The amount to format.\n\n    Returns:\n        A string such as ``\"$12.50\"`` or ``\"$0.00\"``.\n    \"\"\"\n    return \"$\" + format(round(float(n), _MONEY_PRECISION), \".2f\")\n\n\ndef check_stock(item: Mapping[str, Any], qty: int) -> bool:\n    \"\"\"Report whether ``qty`` units of ``item`` are available.\n\n    Args:\n        item: A mapping with a ``\"stock\"`` key giving the quantity on\n            hand. A missing ``\"stock\"`` key is treated as ``0``.\n        qty: The quantity the caller wants to order.\n\n    Returns:\n        ``True`` when ``qty`` is less than or equal to the item's stock,\n        ``False`` otherwise.\n    \"\"\"\n    stock = item.get(\"stock\", 0)\n    return qty <= stock\n\n\ndef apply_discount(total: float, pct: float) -> float:\n    \"\"\"Apply a percentage discount to a total.\n\n    Args:\n        total: The pre-discount amount.\n        pct: The discount percentage, expressed ``0``-``100`` (so ``10``\n            means \"10% off\"). Values outside that range are clamped so a\n            discount can never make the total negative or larger than the\n            original.\n\n    Returns:\n        The total after the discount, rounded to two decimal places.\n    \"\"\"\n    if pct < 0:\n        pct = 0\n    elif pct > 100:\n        pct = 100\n    discounted = total * (1 - pct / 100)\n    return round(discounted, _MONEY_PRECISION)\n\n\ndef mk_order(items: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:\n    \"\"\"Build an order dict from a collection of line items.\n\n    The returned order captures the line items alongside a computed\n    subtotal and a pre-formatted display total, so callers can render it\n    directly without re-running the pricing helpers.\n\n    Args:\n        items: An iterable of line-item mappings (see the module\n            docstring for the expected shape).\n\n    Returns:\n        A dict with these keys:\n\n            ``items``    -- the line items as a list.\n            ``count``    -- the number of distinct line items.\n            ``subtotal`` -- the numeric total from :func:`calculate_total`.\n            ``display``  -- the subtotal run through :func:`format_currency`.\n    \"\"\"\n    line_items: List[Mapping[str, Any]] = list(items)\n    subtotal = calculate_total(line_items)\n    return {\n        \"items\": line_items,\n        \"count\": len(line_items),\n        \"subtotal\": subtotal,\n        \"display\": format_currency(subtotal),\n    }\n\n\ndef print_invoice(order: Mapping[str, Any]) -> str:\n    \"\"\"Render an order as a human-readable invoice string.\n\n    Each line item is listed with its quantity, unit price, and line\n    total, followed by an overall total. The total is recomputed from the\n    order's items via :func:`calculate_total` and all money values are\n    rendered with :func:`format_currency`.\n\n    Args:\n        order: An order mapping as produced by :func:`mk_order`; only its\n            ``\"items\"`` key is required.\n\n    Returns:\n        A multi-line invoice string.\n    \"\"\"\n    items = list(order.get(\"items\", []))\n    lines = [\"Invoice\", \"-------\"]\n    for item in items:\n        name = item.get(\"name\", \"item\")\n        price = item.get(\"price\", 0)\n        qty = item.get(\"qty\", 0)\n        line_total = format_currency(price * qty)\n        lines.append(f\"{name} x{qty} @ {format_currency(price)} = {line_total}\")\n    lines.append(\"-------\")\n    lines.append(f\"Total: {format_currency(calculate_total(items))}\")\n    return \"\\n\".join(lines)";
const S26_TEST_FINAL = "\"\"\"Tests for the billing module's ``calculate_total`` and ``format_currency`` helpers.\"\"\"\n\nimport os\nimport sys\n\nimport pytest\n\nsys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), \"..\")))\n\nfrom billing import calculate_total, format_currency\n\n\ndef test_calc_tot_empty():\n    assert calculate_total([]) == 0.0\n\n\ndef test_calc_tot_single_item():\n    assert calculate_total([{\"price\": 2.5, \"qty\": 4}]) == 10.0\n\n\ndef test_calc_tot_multiple_items():\n    items = [\n        {\"price\": 1.0, \"qty\": 3},\n        {\"price\": 2.5, \"qty\": 2},\n        {\"price\": 10.0, \"qty\": 1},\n    ]\n    assert calculate_total(items) == 18.0\n\n\ndef test_calc_tot_missing_keys_default_to_zero():\n    assert calculate_total([{\"price\": 5.0}, {\"qty\": 3}, {}]) == 0.0\n\n\ndef test_fmt_money_zero():\n    assert format_currency(0) == \"$0.00\"\n\n\ndef test_fmt_money_whole_number():\n    assert format_currency(12) == \"$12.00\"\n\n\ndef test_fmt_money_rounds_to_two_places():\n    assert format_currency(1.005) == \"$1.00\" or format_currency(1.005) == \"$1.01\"\n    assert format_currency(2.349) == \"$2.35\"\n\n\ndef test_fmt_money_negative():\n    assert format_currency(-1.5) == \"$-1.50\"\n\n\n@pytest.mark.parametrize(\n    \"amount,expected\",\n    [\n        (0.1, \"$0.10\"),\n        (99.9, \"$99.90\"),\n        (1000, \"$1000.00\"),\n    ],\n)\ndef test_fmt_money_parametrized(amount, expected):\n    assert format_currency(amount) == expected";
const S26_RENAMES_CSV = "old,new\ncalc_tot,calculate_total\nfmt_money,format_currency\nchk_stock,check_stock\napply_disc,apply_discount";
const S26_APPLY_RENAMES = "\"\"\"Apply whole-word function renames from renames.csv to the billing sources.\"\"\"\n\nimport csv\nimport os\nimport re\n\nHERE = os.path.dirname(os.path.abspath(__file__))\nRENAMES_CSV = os.path.join(HERE, \"renames.csv\")\nTARGETS = [\n    os.path.join(HERE, \"billing.py\"),\n    os.path.join(HERE, \"tests\", \"test_billing.py\"),\n]\n\n\ndef load_mapping(csv_path):\n    \"\"\"Return a list of (old, new) pairs read from the renames CSV.\"\"\"\n    pairs = []\n    with open(csv_path, newline=\"\") as fh:\n        for row in csv.DictReader(fh):\n            pairs.append((row[\"old\"], row[\"new\"]))\n    return pairs\n\n\ndef apply_renames(text, pairs):\n    \"\"\"Apply each old->new pair as a whole-word substitution to text.\"\"\"\n    for old, new in pairs:\n        text = re.sub(r\"\\b\" + re.escape(old) + r\"\\b\", new, text)\n    return text\n\n\ndef main():\n    pairs = load_mapping(RENAMES_CSV)\n    for path in TARGETS:\n        with open(path) as fh:\n            original = fh.read()\n        updated = apply_renames(original, pairs)\n        with open(path, \"w\") as fh:\n            fh.write(updated)\n        print(f\"updated {path}\")\n\n\nif __name__ == \"__main__\":\n    main()";

// Test 1 — branch shape: linear, four files, no rewound. Locks §2.6.
test("test_S26_linear_one_surviving_branch_four_files_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S26_JSONL));
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 4);
    for (const suffix of ["/billing.py", "/test_billing.py", "/renames.csv", "/apply_renames.py"]) {
        assert.ok(branched.surviving.some((h) => h.target.toString().endsWith(suffix)), `missing ${suffix}`);
    }
});

// Test 2 — THE CRUX: billing.py 4-rev ladder, beacon user-edit at rev2 (149-line complete snapshot,
// renamed), the step-5 print_invoice Edit splices cleanly to the 177-line final; reader-INDEPENDENT,
// byte-locked. Locks §2.3 (billing) + §2.5.
test("test_S26_billing_four_revs_userEdit_rev2_clean_splice_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL)).surviving, "/billing.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL), poison).surviving, "/billing.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.userEdit, EventKind.edit,
    ]);
    const rev2 = without.revisions[2]!;
    assert.equal(rev2.kind, EventKind.userEdit);
    assert.equal(rev2.changeId.toString(), "298a585d-4536-4574-a388-66f477b3f2fa");
    assert.equal(rev2.lines.length, 149);                 // complete beacon snapshot
    const rev2Text = finalTextOf(rev2);
    for (const def of RENAMED_DEFS) assert.ok(rev2Text.includes(def), `rev2 missing ${def}`);
    for (const def of TERSE_DEFS) assert.ok(!rev2Text.includes(def), `rev2 still has ${def}`);
    // reader-independence + byte-lock
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    assert.ok(!historyFinalText(withPoison).includes("POISONED"));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 177);
    assert.equal(finalText.length, 5813);
    assert.equal(finalText, S26_BILLING_FINAL);
    assert.ok(finalText.includes("def print_invoice(")); // step-5 Edit replayed on the renamed beacon
});

// Test 3 — S26's SIGNATURE: billing.py has NO backup-seed `overwrite` (inverts S25). Despite the
// post-script Edit, the complete beacon means no `overwrite` revision is injected and the no-reader
// history equals the (poison) reader history — the reseed is INERT. Locks §2.4 / §2.5.
test("test_S26_billing_no_backup_seed_overwrite_inert_reseed", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL)).surviving, "/billing.py");
    const withReal = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL), poison).surviving, "/billing.py");
    assert.ok(!without.revisions.some((r) => r.kind === EventKind.overwrite), "unexpected overwrite reseed");
    assert.equal(without.revisions.length, 4);
    // no-reader history is byte-identical to the (poison) reader history → reseed never consulted a backup
    assert.deepEqual(without.revisions.map((r) => r.kind), withReal.revisions.map((r) => r.kind));
    assert.equal(historyFinalText(without), historyFinalText(withReal));
});

// Test 4 — tests/test_billing.py: 2-rev ladder, beacon user-edit, reader-INDEPENDENT, byte-locked.
// The rename lock uses the import line + call sites, NOT bare tokens: the whole-word rename correctly
// LEAVES terse substrings inside test METHOD names (test_calc_tot_empty, test_fmt_money_zero, …), so a
// bare `calc_tot` absence check would falsely fail. Locks §2.3 (test) + §2.5.
test("test_S26_test_billing_two_revs_userEdit_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL)).surviving, "/test_billing.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL), poison).surviving, "/test_billing.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    assert.equal(without.revisions[1]!.changeId.toString(), "507c3e6b-ad1e-4b61-bc1a-49358388e0e0");
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 60);
    assert.equal(finalText.length, 1394);
    assert.equal(finalText, S26_TEST_FINAL);
    // rename lock via the import + call sites (NOT bare tokens — method names keep terse substrings)
    assert.ok(finalText.includes("from billing import calculate_total, format_currency"));
    assert.ok(finalText.includes("calculate_total(") && finalText.includes("format_currency("));
    assert.ok(!finalText.includes("import calc_tot") && !finalText.includes("import fmt_money"));
    assert.ok(!/\bcalc_tot\(/.test(finalText) && !/\bfmt_money\(/.test(finalText)); // terse call forms gone
});

// Test 5 — driver files: renames.csv (the rename MAP) and apply_renames.py (the driver) — single
// Writes, byte-locked, reader-INDEPENDENT. The rename mapping lives in the tracked CSV the script
// READS (not hardcoded) — S26's distinguishing data file. Locks §2.3 (driver files).
test("test_S26_driver_files_renames_csv_and_apply_renames_single_writes_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const branched = reconstructBranches(loadRecords(S26_JSONL));
    const branchedPoison = reconstructBranches(loadRecords(S26_JSONL), poison);

    const csv = historyEndingWith(branched.surviving, "/renames.csv");
    assert.deepEqual(csv.revisions.map((r) => r.kind), [EventKind.write]);
    const csvText = historyFinalText(csv);
    assert.equal(csvText.split("\n").length, 5);
    assert.equal(csvText.length, 106);
    assert.equal(csvText, S26_RENAMES_CSV);
    for (const pair of [
        "old,new", "calc_tot,calculate_total", "fmt_money,format_currency",
        "chk_stock,check_stock", "apply_disc,apply_discount",
    ]) assert.ok(csvText.includes(pair), `csv missing ${pair}`);
    assert.equal(csvText, historyFinalText(historyEndingWith(branchedPoison.surviving, "/renames.csv")));

    const drv = historyEndingWith(branched.surviving, "/apply_renames.py");
    assert.deepEqual(drv.revisions.map((r) => r.kind), [EventKind.write]);
    const drvText = historyFinalText(drv);
    assert.equal(drvText.split("\n").length, 43);
    assert.equal(drvText.length, 1125);
    assert.equal(drvText, S26_APPLY_RENAMES);
    assert.ok(drvText.includes("renames.csv")); // reads the mapping from the CSV (not hardcoded)
    assert.equal(drvText, historyFinalText(historyEndingWith(branchedPoison.surviving, "/apply_renames.py")));
});

// Test 6 — extractFileEvents: two beacon user-edits, four writes, two edits, no events from the
// opaque python run. The rename is recovered ONLY from the two beacons (the m3 contrast); there is
// NO synthetic `overwrite` (the S25 contrast) and no `append`. Locks §2.2.
test("test_S26_extractFileEvents_two_userEdits_four_writes_two_edits", () => {
    const events = extractFileEvents(loadRecords(S26_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((e) => e.changeId.toString().slice(0, 8)).sort(),
        ["298a585d", "507c3e6b"],
    );
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 4);   // B,C,E,F
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 2);    // D,I
    assert.equal(events.filter((e) => e.kind === EventKind.overwrite).length, 0);
    assert.equal(events.filter((e) => e.kind === EventKind.append).length, 0);
});
