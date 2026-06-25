import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCli } from "../src/reconstruction_cli.ts";
import { S45_JSONL } from "./fixtures.ts";

// s45 is the first CODE-REWIND scenario after the git-baseline family. The transcript: Write `calc.py` (`add`) +
// `tests/test_calc.py`; Edit `calc.py` to add `subtract`; `Rewind: 2, code` abandons that edit and restores
// `calc.py` on disk; Edit `calc.py` to add `multiply`. Both code edits are Claude's. The rewind fork yields two
// branches: a REWOUND/abandoned branch (tip #836ea480) carrying `add`+`subtract`, and the SURVIVING branch (tip
// #c3457a61) carrying `add`+`multiply`. s45 is reader-DEPENDENT: the rewind restore is represented only by
// file-history backup snapshots (calc.py v4 = restored `add`-only before the `multiply` edit) — there is no
// explicit "revert to add" event. The bug this scenario fixed: the surviving `calc.py` final revision was a
// spurious `add`+`multiply`+`multiply` (40 lines) — the post-rewind `multiply` edit was replayed onto a base that
// already held `multiply`. Root cause was `completeElidedBeacons` (s28 stage) picking the LATEST backup matching
// the rewind-restore echo's `add`-tail window (v5 = `add+multiply`, taken AFTER the multiply edit) and splicing it
// before that edit. The fix bounds elided-beacon candidate backups to those taken at/before the next lineage event.
// The rendered ground-truth files sit in the same local executed dir S45_JSONL points at, so the byte-compares
// stay cross-source checks (engine-reconstructed tip vs independently rendered artifact).
const S45_GT =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s45-rewind-abandoned-branch";
function readGroundTruth(relativePath: string): string {
    return readFileSync(`${S45_GT}/${relativePath}`, "utf8");
}

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// (Verbatim from the S28–S44 CLI tests.)
function fileVerboseBlock(out: string, suffix: string): string {
    const lines = out.split("\n");
    const start = lines.findIndex((line) => line.startsWith("### ") && line.endsWith(suffix));
    assert.ok(start >= 0, `no verbose section for ${suffix}`);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index]!.startsWith("### ")) { end = index; break; }
    }
    return lines.slice(start, end).join("\n");
}

// Slice the LAST revision out of a file's verbose block (from its last `revision N  @` line to the block end).
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// Slice a SPECIFIC revision N out of a verbose block: from its `revision N  @` line to the next `revision `
// marker or block end. Lets each edit's state be checked independently.
function revisionSlice(block: string, revisionNumber: number): string {
    const marker = `revision ${revisionNumber}  @`;
    const start = block.indexOf(marker);
    assert.ok(start >= 0, `no revision ${revisionNumber} in block`);
    const nextMarker = block.indexOf("\nrevision ", start + marker.length);
    const end = nextMarker >= 0 ? nextMarker : block.length;
    return block.slice(start, end);
}

// Reverse the verbose renderer's `  N | ` line-number prefix on every numbered line of a revision slice and
// rejoin — yielding the reconstructed file body so it can be byte-compared to the rendered ground truth.
function stripLineNumberPrefixes(revisionSlice: string): string {
    return revisionSlice
        .split("\n")
        .filter((line) => /^ *\d+ \| /.test(line))
        .map((line) => line.replace(/^ *\d+ \| /, ""))
        .join("\n");
}

// The engine drops a single trailing newline at replay, so the reconstructed body equals the rendered file
// with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}

// Count the `def multiply(` definitions in a revision slice — the sharp expression of the duplicate-insertion bug.
function countMultiplyDefs(revisionSlice: string): number {
    return (revisionSlice.match(/\bdef multiply\(/g) ?? []).length;
}

// C1 — the default view prints BOTH DAGs. s45's transcript forks at the rewind prompt: the conversationDAG shows
// the lone prompt A (the rewind point) splitting into a REWOUND branch (tip #836ea480) carrying the abandoned
// `subtract` edit D and a SURVIVING branch (tip #c3457a61) carrying the restore echo E then the `multiply` edit F.
// The fileDAG shows calc.py's full four-event ladder (B write → D edit → E user-edit → F edit) and test_calc.py's
// lone write C.
test("test_S45_default_conversationDAG_shows_rewind_fork", () => {
    const out = runCli([S45_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #d205e794   (rewind point)"));
    // rewound branch — the abandoned subtract edit.
    assert.ok(out.includes("branch rewound (rewound; tip #836ea480; rewind @ #d205e794)"));
    assert.ok(out.includes("D  edit       calc.py  #01JquFb6"));
    // surviving branch — restore echo then multiply edit.
    assert.ok(out.includes("branch surviving (surviving; tip #c3457a61)"));
    assert.ok(out.includes(
        "   E  user-edit  calc.py  #294c26cb\n" +
        "   F  edit       calc.py  #01WvVsu6",
    ));
    // fileDAG — calc.py's four events and test_calc.py's lone write.
    assert.ok(out.includes(
        "calc.py\n" +
        "  B  write      #01ULxQoJ\n" +
        "  D  edit       #01JquFb6\n" +
        "  E  user-edit  #294c26cb\n" +
        "  F  edit       #01WvVsu6",
    ));
    assert.ok(out.includes(
        "test_calc.py\n" +
        "  C  write      #01XyPyNZ",
    ));
});

// C2 — two branches. The surviving branch (tip #c3457a61) lists BOTH files (calc.py, test_calc.py); the rewound
// branch (tip #836ea480, rewind @ #d205e794) lists calc.py alone (test_calc.py was written before the fork).
test("test_S45_list_branches_surviving_and_rewound", () => {
    const out = runCli([S45_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #c3457a61"));
    assert.ok(out.includes("rewound    tip #836ea480  rewind @ #d205e794"));
    // surviving lists both files; rewound lists calc.py.
    const survivingLine = out.split("\n").find((line) => line.includes("surviving  tip #c3457a61"))!;
    assert.ok(survivingLine.includes("calc.py"));
    assert.ok(survivingLine.includes("test_calc.py"));
    const rewoundLine = out.split("\n").find((line) => line.includes("rewound    tip #836ea480"))!;
    assert.ok(rewoundLine.includes("calc.py"));
    assert.ok(!rewoundLine.includes("test_calc.py"));
});

// C3 — the rewound/abandoned branch reconstructs `calc.py` as exactly `add` then `add`+`subtract` (the abandoned
// edit), 2 revisions, and its tip byte-matches the rendered abandoned-branch snapshot. This branch is already
// correct and must stay so.
test("test_S45_rewound_branch_calc_is_add_then_subtract", () => {
    const block = fileVerboseBlock(runCli([S45_JSONL, "--branch", "836ea480", "--verbose"]), "/calc.py");
    for (const revisionNumber of [0, 1]) {
        assert.ok(block.includes(`revision ${revisionNumber}  @`), `missing revision ${revisionNumber}`);
    }
    assert.ok(!block.includes("revision 2  @"), "rewound calc.py must stop at revision 1 (add+subtract)");
    for (const lineCount of ["(14 lines)", "(27 lines)"]) {
        assert.ok(block.includes(lineCount), `missing ${lineCount}`);
    }
    const finalRevision = finalRevisionSlice(block);
    assert.ok(/\bdef add\(/.test(finalRevision), "rewound tip has add()");
    assert.ok(/\bdef subtract\(/.test(finalRevision), "rewound tip has subtract()");
    assert.ok(!/\bdef multiply\(/.test(finalRevision), "rewound tip must NOT have multiply()");
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth(".abandoned_branches/abandoned-branch-1/calc.py")),
        "rewound calc.py tip must byte-match the rendered abandoned-branch snapshot",
    );
});

// C4 — test_calc.py is written once (C) and never edited again, so it reconstructs as a single revision that
// byte-matches the rendered on-disk tests/test_calc.py. It is the same on both branches; the surviving view shows it.
test("test_S45_test_calc_py_reconstructs_add_tests", () => {
    const block = fileVerboseBlock(runCli([S45_JSONL, "--surviving", "--verbose"]), "/test_calc.py");
    assert.ok(block.includes("revision 0  @"), "test_calc.py has a revision 0");
    assert.ok(!block.includes("revision 1  @"), "test_calc.py must be a single revision");
    assert.equal(
        stripLineNumberPrefixes(finalRevisionSlice(block)),
        stripTrailingNewline(readGroundTruth("tests/test_calc.py")),
        "test_calc.py must byte-match the rendered on-disk file",
    );
});

// R1 (RED before the fix) — the surviving `calc.py` FINAL revision must contain exactly ONE `def multiply(`. Before
// the fix the final revision is the 40-line `add`+`multiply`+`multiply` duplicate (two definitions); this is the
// sharp, minimal expression of the bug.
test("test_S45_surviving_calc_has_no_duplicated_multiply", () => {
    const block = fileVerboseBlock(runCli([S45_JSONL, "--surviving", "--verbose"]), "/calc.py");
    const finalRevision = finalRevisionSlice(block);
    assert.equal(
        countMultiplyDefs(finalRevision),
        1,
        "surviving calc.py tip must define multiply() exactly once (no fabricated duplicate)",
    );
});

// R2 (RED before the fix) — the surviving `calc.py` tip must byte-match the rendered on-disk calc.py (`add`+
// `multiply`, 27 lines). Before the fix the tip is the 40-line duplicate, so this fails on a byte mismatch.
test("test_S45_surviving_calc_tip_byte_matches_on_disk", () => {
    const block = fileVerboseBlock(runCli([S45_JSONL, "--surviving", "--verbose"]), "/calc.py");
    const finalRevision = finalRevisionSlice(block);
    assert.ok(/\bdef add\(/.test(finalRevision), "surviving tip has add()");
    assert.ok(/\bdef multiply\(/.test(finalRevision), "surviving tip has multiply()");
    assert.ok(!/\bdef subtract\(/.test(finalRevision), "surviving tip must NOT have the abandoned subtract()");
    assert.equal(
        stripLineNumberPrefixes(finalRevision),
        stripTrailingNewline(readGroundTruth("calc.py")),
        "surviving calc.py tip must byte-match the rendered on-disk file",
    );
});

// R3 (RED before the fix) — the corrected surviving `calc.py` ladder has EXACTLY four revisions and NO revision
// fabricates a second multiply: rev 0 `add` (14 lines, the Write) → rev 1 the restore-echo partial tail (8 lines,
// EXPECTED, cf s40) → rev 2 the rewind-restored `add` (14 lines, the bounded elided-beacon seed = backup v4) →
// rev 3 the tip `add`+`multiply` (27 lines, the F edit). Before the fix a fifth state (the 40-line duplicate) was
// produced and printed last; pinning the count + per-revision multiply count guards against its return.
test("test_S45_surviving_calc_ladder_revision_count", () => {
    const block = fileVerboseBlock(runCli([S45_JSONL, "--surviving", "--verbose"]), "/calc.py");
    for (const revisionNumber of [0, 1, 2, 3]) {
        assert.ok(block.includes(`revision ${revisionNumber}  @`), `missing revision ${revisionNumber}`);
    }
    assert.ok(!block.includes("revision 4  @"), "surviving calc.py must stop at revision 3 (the tip)");
    for (const lineCount of ["(14 lines)", "(8 lines)", "(27 lines)"]) {
        assert.ok(block.includes(lineCount), `missing ${lineCount}`);
    }
    // No revision may carry two `multiply` definitions (the fabricated duplicate).
    for (const revisionNumber of [0, 1, 2, 3]) {
        assert.ok(
            countMultiplyDefs(revisionSlice(block, revisionNumber)) <= 1,
            `revision ${revisionNumber} must not duplicate multiply()`,
        );
    }
});
