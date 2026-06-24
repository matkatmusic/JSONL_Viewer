import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S25_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files (geo_core & geo_report both reach
// revision 6/7), so a per-file assertion never matches a sibling file's revision line.
function fileVerboseBlock(out: string, suffix: string): string {
    const lines = out.split("\n");
    const start = lines.findIndex((l) => l.startsWith("### ") && l.endsWith(suffix));
    assert.ok(start >= 0, `no verbose section for ${suffix}`);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i]!.startsWith("### ")) { end = i; break; }
    }
    return lines.slice(start, end).join("\n");
}

// The real CLI builds the real sidecar reader, so geo_report.py reconstructs correctly. The default
// conversationDAG renders the three `edited_text_file` beacons (one per file) as user-edit turns
// I/J/K sitting between the Claude edits; the run is linear (no rewind branch header). Locks §2.7.
test("test_S25_default_conversationDAG_shows_three_script_rename_user_edits", () => {
    const out = runCli([S25_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #6c99d0f7"));
    assert.ok(out.includes("  H  write      rename_geo.py     #01133d7F"));
    assert.ok(out.includes("  I  user-edit  geo_report.py     #dd04eabc"));
    assert.ok(out.includes("  J  user-edit  geo_core.py       #755a78dd"));
    assert.ok(out.includes("  K  user-edit  test_geo_core.py  #fcaacf80"));
    assert.ok(out.includes("  L  edit       geo_report.py     #01SEtJ2G"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The default fileDAG groups each file's events. The synthetic `overwrite` backup-seed is a
// revision, NOT a DAG node, so only the four real geo_report events appear under it. Locks §2.7.
test("test_S25_default_fileDAG_groups_each_file_events", () => {
    const out = runCli([S25_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "geo_core.py\n  B  write      #01THW3x6\n  E  edit       #01D1xvSR\n  F  edit       #01FUSAse\n  J  user-edit  #755a78dd\n  M  edit       #0187Nojk\n  N  edit       #01EFcMWD",
    ));
    assert.ok(out.includes(
        "geo_report.py\n  C  write      #019B3GDX\n  G  edit       #01TG3Gfc\n  I  user-edit  #dd04eabc\n  L  edit       #01SEtJ2G",
    ));
    assert.ok(out.includes("test_geo_core.py\n  D  write      #01JaqY5L\n  K  user-edit  #fcaacf80"));
    assert.ok(out.includes("rename_geo.py\n  H  write      #01133d7F"));
});

// list-branches: one surviving branch (tip #e3b43fcc) over the four files, no rewound branch.
// Locks §2.6 / §2.7.
test("test_S25_list_branches_single_surviving_four_files", () => {
    const out = runCli([S25_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #e3b43fcc"));
    for (const f of ["geo_core.py", "geo_report.py", "test_geo_core.py", "rename_geo.py"]) {
        assert.ok(out.includes(f), `missing ${f}`);
    }
    assert.ok(!out.includes("rewound"));
});

// verbose geo_core.py: exactly eight revisions (0..7). `--verbose` prints EVERY revision, and the
// terse pre-rename revisions (0..3) legitimately still contain `def area(` etc. — so the rename
// lock must be scoped to the FINAL revision (revision 7), which is fully renamed and carries the
// post-rename `bounding_box` addition rendered on the renamed base. Locks §2.7.
test("test_S25_verbose_geo_core_eight_revisions_renamed", () => {
    const block = fileVerboseBlock(runCli([S25_JSONL, "--surviving", "--verbose"]), "/geo_core.py");
    assert.ok(block.includes("revision 7  @"));
    assert.ok(!block.includes("revision 8"));            // exactly eight
    const finalRev = block.slice(block.indexOf("revision 7  @")); // final rendered revision only
    assert.ok(finalRev.includes("| def rectangle_area(") && finalRev.includes("| def box_volume("));
    assert.ok(finalRev.includes("| def bounding_box("));
    assert.ok(!finalRev.includes("| def area(") && !finalRev.includes("| def vol("));
});

// verbose geo_report.py: exactly seven revisions (0..6); the backup-seeded base lets the `totals`
// Edit render (120-line final); the renamed geo_core calls and `summary_line` are present; the
// terse `def` headers never appear (geo_report defines none of them). Locks §2.7.
test("test_S25_verbose_geo_report_seven_revisions_totals_renamed", () => {
    const block = fileVerboseBlock(runCli([S25_JSONL, "--surviving", "--verbose"]), "/geo_report.py");
    assert.ok(block.includes("revision 6  @"));
    assert.ok(!block.includes("revision 7"));            // exactly seven
    assert.ok(block.includes("(120 lines)"));            // final
    assert.ok(block.includes("| def totals("));
    assert.ok(block.includes("| def summary_line(") && block.includes("rectangle_area"));
    assert.ok(!block.includes("| def area(") && !block.includes("| def vol("));
});

// verbose tests/test_geo_core.py: exactly two revisions (0..1); the final references the renamed
// geo_core.rectangle_area, and no terse `def area(` header survives. Locks §2.7.
test("test_S25_verbose_test_geo_core_two_revisions_renamed", () => {
    const block = fileVerboseBlock(runCli([S25_JSONL, "--surviving", "--verbose"]), "/test_geo_core.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2"));            // exactly two
    assert.ok(block.includes("rectangle_area"));
    assert.ok(!/\| def area\(/.test(block));
});
