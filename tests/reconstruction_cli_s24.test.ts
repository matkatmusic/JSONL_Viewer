import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S24_JSONL } from "./fixtures.ts";

// S24's conversationDAG is linear (no rewind). The script-driven rename surfaces as the user-edit
// turn G (#859347d2) sitting between the Claude edits — the same disk-echo path S15 uses, here
// triggered by a `python3` script rather than a human/IDE edit. Locks §2.7.
test("test_S24_default_conversationDAG_shows_script_rename_as_user_edit_turn", () => {
    const out = runCli([S24_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #d4147463"));
    assert.ok(out.includes("  B  write      order_utils.py       #01FaKcvA"));
    assert.ok(out.includes("  E  edit       order_utils.py       #0135G5yN"));
    assert.ok(out.includes("  F  write      rename_funcs.py      #01VJfcDh"));
    assert.ok(out.includes("  G  user-edit  order_utils.py       #859347d2"));
    assert.ok(out.includes("  H  edit       order_utils.py       #01RbGtzf"));
    // Linear — no rewind branch header is rendered.
    assert.ok(!out.includes("branch "));
});

// The fileDAG groups order_utils.py's six events (B/D/E/G/H/I), including the beacon user-edit G,
// and shows rename_funcs.py's lone write F. Locks §2.7.
test("test_S24_default_fileDAG_groups_order_utils_six_events", () => {
    const out = runCli([S24_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "order_utils.py\n  B  write      #01FaKcvA\n  D  edit       #01SZaQbN\n  E  edit       #0135G5yN\n  G  user-edit  #859347d2\n  H  edit       #01RbGtzf\n  I  edit       #01R5ouKe",
    ));
    assert.ok(out.includes("rename_funcs.py\n  F  write      #01VJfcDh"));
});

// One surviving branch over the three files, no rewound branch — the linear shape (§2.6).
test("test_S24_list_branches_single_surviving_three_files", () => {
    const out = runCli([S24_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #fba814f7"));
    assert.ok(out.includes("order_utils.py"));
    assert.ok(out.includes("rename_funcs.py"));
    assert.ok(!out.includes("rewound"));
});

// The verbose surviving view renders exactly six revisions for order_utils.py (no spurious 7th
// from a fired reseed); the renamed `def` headers are rendered. NOTE: verbose prints EVERY
// revision, so the terse headers legitimately appear in the early (pre-rename) revision blocks —
// the "terse gone" lock belongs to the final revision-5 block (see the next test). Locks §2.7.
test("test_S24_surviving_verbose_six_revisions_rename_visible", () => {
    const out = runCli([S24_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 5  "));
    // Exactly six revisions — a fired reseed would render a seventh.
    assert.ok(!out.includes("revision 6"));
    assert.ok(out.includes("revision 5  @") && out.includes("(234 lines)"));
    // The renamed headers are rendered in the verbose dump.
    assert.ok(out.includes("| def calculate_total(items):"));
    assert.ok(out.includes("| def build_order(items):"));
});

// Isolate the final rendered revision block for order_utils.py: from its unique "revision 5  @"
// header up to the next file section ("### ").
function finalRevisionBlock(out: string): string {
    const start = out.indexOf("revision 5  @");
    const after = out.slice(start);
    const nextSection = after.indexOf("\n### ");
    return nextSection >= 0 ? after.slice(0, nextSection) : after;
}

// The FINAL rendered revision shows the post-rename additions (print_receipt, apply_loyalty) built
// on the renamed helpers — proving H/I replayed on the renamed base — and NO terse header survives
// in that final block. (Scoped to revision 5; earlier revisions still carry the terse names.)
test("test_S24_surviving_verbose_final_has_renamed_print_receipt_and_apply_loyalty", () => {
    const out = runCli([S24_JSONL, "--surviving", "--verbose"]);
    const finalBlock = finalRevisionBlock(out);
    assert.ok(finalBlock.includes("| def print_receipt(order):"));
    assert.ok(finalBlock.includes("| def apply_loyalty(total, member):"));
    assert.ok(finalBlock.includes("| def apply_discount(total, pct):"));
    assert.ok(finalBlock.includes("| def calculate_total(items):"));
    assert.ok(finalBlock.includes("| def build_order(items):"));
    for (const terse of ["| def calc_tot(", "| def fmt_money(", "| def chk_stock(", "| def mk_order(", "| def apply_disc("]) {
        assert.ok(!finalBlock.includes(terse), `terse header leaked into final block: ${terse}`);
    }
});
