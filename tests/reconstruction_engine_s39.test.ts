import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
} from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S39_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory | undefined {
    return histories.find((history) => history.target.toString().endsWith(suffix));
}
// The engine drops a single trailing newline at replay, so the newline-joined revision text equals the
// rendered file with its trailing newline stripped.
function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}
// The real on-disk file-history reader, built exactly as the CLI builds it.
function realReader(records: ReturnType<typeof loadRecords>): BackupReader {
    return createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
}

const S39_GT =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s39-git-baseline-seed";

// T1 — the characterization (with the real file-history reader, exactly the CLI's path). s39's transcript
// opens MID-STREAM with a single `orders.py` Edit (the `--excludeJSONL` respawn dropped the baseline session).
// The engine produces ONE surviving file history and NO rewound branches, with a 2-revision ladder: rev 0
// (29 lines) is the pre-edit baseline (`total`/`names`, no `count`) recovered from the file-history backup,
// and the tip (41 lines) adds documented `count` and is byte-identical to the rendered on-disk orders.py.
test("test_S39_orders_two_revision_ladder_tip_byte_locks", () => {
    const records = loadRecords(S39_JSONL);
    const result = reconstructBranches(records, realReader(records));
    assert.equal(result.rewound.length, 0, "linear scenario — no rewound branches");
    assert.equal(result.surviving.length, 1, "exactly one surviving file history (orders.py)");
    assert.notEqual(result.survivingTip, undefined);

    const orders = historyEndingWith(result.surviving, "/orders.py")!;
    assert.ok(orders, "orders.py history missing");
    assert.equal(orders.revisions.length, 2, "orders.py should have a 2-revision ladder");

    const rev0Text = finalTextOf(orders.revisions[0]!);
    assert.equal(rev0Text.split("\n").length, 29, "rev 0 (pre-edit baseline) should be 29 lines");
    assert.ok(rev0Text.includes("def total("));
    assert.ok(rev0Text.includes("def names("));
    assert.ok(!/\bdef count\(/.test(rev0Text), "rev 0 must NOT yet carry count()");

    const tipText = historyFinalText(orders);
    assert.equal(tipText.split("\n").length, 41, "tip should be the 41-line edited state");
    assert.ok(tipText.includes("def count(items):"), "tip must add documented count()");
    assert.equal(
        tipText,
        stripTrailingNewline(readFileSync(`${S39_GT}/orders.py`, "utf8")),
        "tip revision must byte-match the rendered on-disk orders.py",
    );
});

// T2 — reader-DEPENDENT. The single Edit carries no usable `toolUseResult.originalFile`, so WITHOUT a backup
// reader the engine cannot recover the 29-line pre-edit base: orders.py collapses to a single degraded
// 18-line revision. This is the inverse of T1's reader path and the headline characterization for s39 (it
// governs s40/s42 which build on this baseline).
test("test_S39_orders_reader_dependent_degrades_without_backup", () => {
    const surviving = reconstructBranches(loadRecords(S39_JSONL)).surviving;
    const orders = historyEndingWith(surviving, "/orders.py")!;
    assert.equal(orders.revisions.length, 1, "no-reader: single (degraded) revision");
    assert.equal(
        finalTextOf(orders.revisions[0]!).split("\n").length,
        18,
        "no-reader: orders.py degrades to 18 lines (no recovered base)",
    );
});

// T3 — rev 0 is recovered from a backup, not from an observed write. The transcript carries exactly ONE file
// event: the single Edit. No write / overwrite / userEdit event exists, which is precisely why the pre-edit
// base must come from the file-history backup. (Were a synthetic write injected, this count would be wrong.)
test("test_S39_single_edit_event_no_write", () => {
    const events = extractFileEvents(loadRecords(S39_JSONL));
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 1);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 0);
    assert.equal(events.filter((event) => event.kind === EventKind.overwrite).length, 0);
    assert.equal(events.filter((event) => event.kind === EventKind.userEdit).length, 0);
});

// T4 — no history is fabricated for tests/test_orders.py. It was written in the excluded baseline session and
// has no event in this transcript, so even WITH the real reader the engine must NOT surface it (with no event,
// a sidecar backup cannot legitimately reattach it to this transcript).
test("test_S39_no_history_for_test_orders", () => {
    const records = loadRecords(S39_JSONL);
    const result = reconstructBranches(records, realReader(records));
    assert.equal(
        historyEndingWith(result.surviving, "/tests/test_orders.py"),
        undefined,
        "tests/test_orders.py must not be reconstructed",
    );
});
